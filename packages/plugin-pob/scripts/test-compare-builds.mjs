/**
 * Quick integration test for compare_builds using two real PoB codes fetched from pobb.in.
 * Run: node scripts/test-compare-builds.mjs
 */
import { LuaJITRuntime } from '../dist/runtime/luajit-runtime.js';
import { getPobPath } from '../dist/runtime/detector.js';

async function fetchPobBinCode(slug) {
  const url = `https://pobb.in/${slug}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'poe-ai/1.0 (+https://github.com/msciotti/pob-ai)' },
  });
  if (!res.ok) throw new Error(`pobb.in returned HTTP ${res.status} for ${slug}`);
  const html = await res.text();
  const match = html.match(/buildcode"\s+readonly="">\s*([a-zA-Z0-9+/=_-]{50,})/);
  if (!match) throw new Error(`Could not find build code on pobb.in page for "${slug}"`);
  return match[1].trim();
}

async function main() {
  const SLUG_A = 'Ec2_12puq1Wd';  // user's build
  const SLUG_B = 'wxmNeyNu83Do';  // comparison build

  console.log('Fetching build codes from pobb.in...');
  const [CODE_A, CODE_B] = await Promise.all([
    fetchPobBinCode(SLUG_A),
    fetchPobBinCode(SLUG_B),
  ]);
  console.log(`Build A code length: ${CODE_A.length}`);
  console.log(`Build B code length: ${CODE_B.length}\n`);

  console.log('Initializing PoB runtime...');
  const pobPath = await getPobPath(process.env['POB_PATH']);
  const runtime = new LuaJITRuntime({ pobPath });
  await runtime.initialize();
  console.log('Runtime ready\n');

  try {
    // Step 1: Load build A as the primary
    console.log('Loading Build A (primary)...');
    await runtime.importFromCode(CODE_A, 'Build A');
    console.log('Build A loaded\n');

    // Step 2: Get Build A stats first (before compare replaces it)
    const statsA = await runtime.getBuildStats();
    console.log('Build A key stats:');
    for (const key of ['Life', 'EnergyShield', 'TotalDPS', 'Armour', 'Evasion', 'FireResist', 'ColdResist', 'LightningResist', 'ChaosResist']) {
      if (statsA[key] != null) console.log(`  ${key}: ${statsA[key]}`);
    }
    console.log();

    // Step 3: Compare against Build B (this loads B and replaces A)
    console.log('Comparing against Build B...');
    const { primary, compare } = await runtime.compareBuilds(CODE_B, 'Build B');

    // ── Stats ──
    console.log('\n=== Stat Comparison (Build A → Build B) ===\n');
    const TRACKED = [
      { key: 'TotalDPS',                 label: 'Total DPS' },
      { key: 'AverageDamage',            label: 'Average Hit' },
      { key: 'CritChance',               label: 'Crit Chance (%)' },
      { key: 'CritMultiplier',           label: 'Crit Multi (%)' },
      { key: 'HitChance',                label: 'Hit Chance (%)' },
      { key: 'Life',                     label: 'Life' },
      { key: 'EnergyShield',             label: 'Energy Shield' },
      { key: 'Ward',                     label: 'Ward' },
      { key: 'PhysicalMaximumHitTaken',  label: 'Max Phys Hit' },
      { key: 'FireMaximumHitTaken',      label: 'Max Fire Hit' },
      { key: 'ColdMaximumHitTaken',      label: 'Max Cold Hit' },
      { key: 'LightningMaximumHitTaken', label: 'Max Lightning Hit' },
      { key: 'ChaosMaximumHitTaken',     label: 'Max Chaos Hit' },
      { key: 'PhysicalDamageReduction',  label: 'Phys Reduction (%)' },
      { key: 'EvadeChance',              label: 'Evade Chance (%)' },
      { key: 'BlockChance',              label: 'Block Chance (%)' },
      { key: 'SpellBlockChance',         label: 'Spell Block (%)' },
      { key: 'FireResist',               label: 'Fire Resist (%)' },
      { key: 'ColdResist',               label: 'Cold Resist (%)' },
      { key: 'LightningResist',          label: 'Lightning Resist (%)' },
      { key: 'ChaosResist',              label: 'Chaos Resist (%)' },
      { key: 'NetLifeRegen',             label: 'Life Regen/s' },
      { key: 'EnergyShieldRegen',        label: 'ES Regen/s' },
    ];
    for (const { key, label } of TRACKED) {
      const a = primary.stats[key] ?? 0;
      const b = compare.stats[key] ?? 0;
      if (a === 0 && b === 0) continue;
      const delta = b - a;
      const pct = a !== 0 ? `${delta >= 0 ? '+' : ''}${((delta / Math.abs(a)) * 100).toFixed(1)}%` : 'N/A';
      const sign = delta >= 0 ? '+' : '';
      console.log(`  ${label.padEnd(24)} A: ${String(Math.round(a)).padStart(10)}   B: ${String(Math.round(b)).padStart(10)}   Δ: ${(sign + Math.round(delta)).padStart(10)}  (${pct})`);
    }

    // ── Keystones ──
    const aKS = new Set(primary.keystones);
    const bKS = new Set(compare.keystones);
    const onlyA_KS = primary.keystones.filter(k => !bKS.has(k));
    const onlyB_KS = compare.keystones.filter(k => !aKS.has(k));
    const shared_KS = primary.keystones.filter(k => bKS.has(k));
    console.log('\n=== Keystones ===\n');
    if (shared_KS.length) console.log(`  Shared:       ${shared_KS.join(', ')}`);
    if (onlyA_KS.length)  console.log(`  Only A:       ${onlyA_KS.join(', ')}`);
    if (onlyB_KS.length)  console.log(`  Only B:       ${onlyB_KS.join(', ')}`);
    if (!shared_KS.length && !onlyA_KS.length && !onlyB_KS.length) console.log('  (none)');

    // ── Notable differences ──
    const aN = new Set(primary.notables);
    const bN = new Set(compare.notables);
    const onlyA_N = primary.notables.filter(n => !bN.has(n));
    const onlyB_N = compare.notables.filter(n => !aN.has(n));
    console.log('\n=== Notable Differences ===\n');
    if (onlyA_N.length)  console.log(`  Only A (${onlyA_N.length}): ${onlyA_N.join(', ')}`);
    if (onlyB_N.length)  console.log(`  Only B (${onlyB_N.length}): ${onlyB_N.join(', ')}`);
    if (!onlyA_N.length && !onlyB_N.length) console.log('  (identical notables)');

    // ── Unique items ──
    const aU = Object.fromEntries(primary.uniqueItems.map(u => [u.slot, u.name]));
    const bU = Object.fromEntries(compare.uniqueItems.map(u => [u.slot, u.name]));
    const allSlots = [...new Set([...Object.keys(aU), ...Object.keys(bU)])].sort();
    console.log('\n=== Unique Items ===\n');
    for (const slot of allSlots) {
      const av = aU[slot] ?? '(none)';
      const bv = bU[slot] ?? '(none)';
      const mark = av === bv ? '=' : '≠';
      console.log(`  ${mark} ${slot.padEnd(18)} A: ${av.padEnd(30)} B: ${bv}`);
    }

    // ── Main skill ──
    console.log('\n=== Main Skill ===\n');
    if (primary.mainSkill) {
      console.log(`  A: "${primary.mainSkill.label}" ${primary.mainSkill.slot ? `[${primary.mainSkill.slot}]` : ''}`);
      for (const g of primary.mainSkill.gems) {
        console.log(`       ${g.enabled ? '✓' : '✗'} ${g.name} L${g.level} Q${g.quality}`);
      }
    }
    if (compare.mainSkill) {
      console.log(`  B: "${compare.mainSkill.label}" ${compare.mainSkill.slot ? `[${compare.mainSkill.slot}]` : ''}`);
      for (const g of compare.mainSkill.gems) {
        console.log(`       ${g.enabled ? '✓' : '✗'} ${g.name} L${g.level} Q${g.quality}`);
      }
    }

  } finally {
    await runtime.destroy();
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
