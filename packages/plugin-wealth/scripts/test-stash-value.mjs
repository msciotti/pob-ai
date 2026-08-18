#!/usr/bin/env node
/**
 * Quick smoke test for the wealth tracker against a live PoE account.
 * Usage: node scripts/test-stash-value.mjs [league]
 * Requires: node scripts/oauth-login.mjs (run once to authenticate)
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const league = process.argv[2] ?? 'Standard';
const TOKEN_PATH = join(homedir(), '.config', 'poe-ai', 'tokens.json');

const POE_API_BASE = 'https://api.pathofexile.com/stash';
const NINJA_ITEM = 'https://poe.ninja/api/data/itemoverview';
const NINJA_CURRENCY = 'https://poe.ninja/api/data/currencyoverview';

// ── Load token ───────────────────────────────────────────────────────────────

async function loadToken() {
  try {
    const raw = await readFile(TOKEN_PATH, 'utf-8');
    return JSON.parse(raw).access_token;
  } catch {
    console.error('❌ No OAuth token found.');
    console.error('   Run: node packages/plugin-wealth/scripts/oauth-login.mjs');
    process.exit(1);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function fetchJson(url, params = {}, token) {
  const qs = new URLSearchParams(params).toString();
  const fullUrl = qs ? `${url}?${qs}` : url;
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(fullUrl, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '(no body)');
    throw new Error(`HTTP ${res.status} from ${fullUrl}\n  Body: ${body.slice(0, 500)}`);
  }
  return res.json();
}

function buildMapName(item) {
  const tierProp = item.properties?.find(p => p.name === 'Map Tier');
  if (!tierProp) return null;
  const tier = tierProp.values[0]?.[0];
  if (!tier) return null;
  const mods = item.explicitMods ?? [];
  let prefix = '';
  if (mods.some(m => m.toLowerCase().includes('blight-ravaged'))) prefix = 'Blight-Ravaged ';
  else if (mods.some(m => m.toLowerCase().includes('blighted'))) prefix = 'Blighted ';
  return `${prefix}${item.typeLine} T${tier}`;
}

function uniqueName(item) {
  return item.name.replace(/<<set:[^>]+>>/g, '').trim();
}

// ── Fetch ninja prices ───────────────────────────────────────────────────────

async function loadPrices() {
  console.log('📊 Loading poe.ninja prices...');
  const categories = [
    ['Currency',        NINJA_CURRENCY],
    ['Fragment',        NINJA_CURRENCY],
    ['Map',             NINJA_ITEM],
    ['DivinationCard',  NINJA_ITEM],
    ['SkillGem',        NINJA_ITEM],
    ['UniqueWeapon',    NINJA_ITEM],
    ['UniqueArmour',    NINJA_ITEM],
    ['UniqueAccessory', NINJA_ITEM],
    ['UniqueJewel',     NINJA_ITEM],
    ['UniqueFlask',     NINJA_ITEM],
  ];

  const prices = {};
  for (const [cat, url] of categories) {
    try {
      const data = await fetchJson(url, { league, type: cat });
      prices[cat] = new Map((data.lines ?? []).map(l => [l.name.toLowerCase(), l.chaosValue]));
      console.log(`  ${cat}: ${prices[cat].size} entries`);
    } catch (e) {
      console.warn(`  ${cat}: failed (${e.message})`);
      prices[cat] = new Map();
    }
  }
  return prices;
}

// ── Price a single item ──────────────────────────────────────────────────────

function priceItem(item, prices) {
  const ext = item.extended?.category;

  if (item.frameType === 4 || ext === 'gems') {
    const v = prices['SkillGem']?.get(item.typeLine.toLowerCase());
    return v ? { chaos: v, category: 'SkillGem' } : null;
  }
  if (ext === 'currency') {
    const v = prices['Currency']?.get(item.typeLine.toLowerCase());
    return v ? { chaos: v * (item.stackSize ?? 1), category: 'Currency' } : null;
  }
  if (ext === 'cards') {
    const v = prices['DivinationCard']?.get(item.typeLine.toLowerCase());
    return v ? { chaos: v, category: 'DivinationCard' } : null;
  }
  if (ext === 'maps') {
    const name = buildMapName(item);
    if (!name) return null;
    const v = prices['Map']?.get(name.toLowerCase());
    return v ? { chaos: v, category: 'Map' } : null;
  }
  if (ext === 'fragment') {
    const v = prices['Fragment']?.get(item.typeLine.toLowerCase());
    return v ? { chaos: v * (item.stackSize ?? 1), category: 'Fragment' } : null;
  }
  if (item.frameType === 3) {
    const name = uniqueName(item).toLowerCase();
    for (const cat of ['UniqueWeapon','UniqueArmour','UniqueAccessory','UniqueJewel','UniqueFlask']) {
      const v = prices[cat]?.get(name);
      if (v) return { chaos: v, category: cat };
    }
    return null;
  }
  return null;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔍 Checking stash in ${league}\n`);

  const token = await loadToken();

  // 1. Fetch tab list
  let tabData;
  try {
    tabData = await fetchJson(`${POE_API_BASE}/${encodeURIComponent(league)}`, {}, token);
  } catch (e) {
    console.error(`❌ Failed to fetch tab list: ${e.message}`);
    process.exit(1);
  }

  const tabs = tabData.stashes ?? [];
  console.log(`📦 Stash tabs: ${tabs.length}`);
  if (tabs.length === 0) {
    console.log('\n⚠️  No stash tabs found.');
    return;
  }

  tabs.forEach(t => console.log(`   [${t.index}] ${t.name} (${t.type})`));
  console.log();

  // 2. Load prices
  const prices = await loadPrices();
  const divinePrice = prices['Currency']?.get('divine orb') ?? 1;
  console.log(`\n💎 Divine Orb = ${divinePrice}c\n`);

  // 3. Fetch and price items from each tab (cap at 10 for the test)
  const testTabs = tabs.slice(0, 10);
  const byCategory = {};
  let totalChaos = 0;
  let unpriced = 0;

  for (const tab of testTabs) {
    process.stdout.write(`  Fetching tab "${tab.name}"... `);
    try {
      const data = await fetchJson(
        `${POE_API_BASE}/${encodeURIComponent(league)}/${tab.id}`,
        {},
        token
      );
      const items = data.stash?.items ?? [];
      let tabChaos = 0;

      for (const item of items) {
        const priced = priceItem(item, prices);
        if (!priced) { unpriced++; continue; }
        byCategory[priced.category] = (byCategory[priced.category] ?? 0) + priced.chaos;
        totalChaos += priced.chaos;
        tabChaos += priced.chaos;
      }

      console.log(`${items.length} items, ~${tabChaos.toFixed(0)}c`);
    } catch (e) {
      console.log(`failed (${e.message})`);
    }

    await new Promise(r => setTimeout(r, 1200));
  }

  // 4. Print summary
  console.log('\n═══════════════════════════════════════');
  console.log(`💰 WEALTH SUMMARY — ${league}`);
  console.log('═══════════════════════════════════════');
  console.log(`Total: ${totalChaos.toFixed(0)}c / ${(totalChaos / divinePrice).toFixed(1)} div`);
  console.log(`Unpriced items: ${unpriced}\n`);

  const sorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
  for (const [cat, chaos] of sorted) {
    const div = (chaos / divinePrice).toFixed(1);
    const bar = '█'.repeat(Math.min(30, Math.round(chaos / totalChaos * 30)));
    console.log(`  ${cat.padEnd(18)} ${chaos.toFixed(0).padStart(8)}c  ${div.padStart(6)} div  ${bar}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
