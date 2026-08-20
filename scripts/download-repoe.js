#!/usr/bin/env node

/**
 * Download RePoE game data (JSON exports of the game's .dat files) for
 * @poe-ai/game-data to load locally, replacing website scraping with
 * authoritative, patch-versioned data.
 *
 * Source: repoe-fork/repoe-fork.github.io. Its aggregate *.min.json files
 * (mods.min.json, fossils.min.json, etc.) are served at the root of the
 * GitHub Pages site, https://repoe-fork.github.io/ -- per-class split files
 * (e.g. data/base_items/NecropolisPack.json) 404 there, so we stick to the
 * aggregates. Those aggregates are a Pages build artifact and aren't
 * committed to git, so they can't be fetched by commit SHA -- but
 * version.txt *is* committed, so we pin to a SHA for that file and use it as
 * a reproducibility check against whatever the live site currently serves.
 *
 * Run manually via `pnpm download-repoe` (not wired into postinstall --
 * this is ~25MB and only needed by plugins that depend on @poe-ai/game-data).
 */

import { createWriteStream, existsSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pipeline } from 'stream/promises';
import https from 'https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPOE_DATA_DIR = join(__dirname, '..', 'repoe-data');
const STAMP_FILE = join(REPOE_DATA_DIR, '.repoe-stamp.json');

const REPOE_REPO = 'repoe-fork/repoe-fork.github.io';
// Pinned to the commit that produced the currently-deployed repoe-fork.github.io
// Pages site, resolved once via:
//   GET /repos/repoe-fork/repoe-fork.github.io/deployments
// (the `sha` of the most recent `github-pages` deployment -- this is the exact
// source commit GitHub Pages built from, confirmed against version.txt = 3.29.3.1.4).
// The Pages site rebuilds automatically as the game patches, so this pin is a
// point-in-time snapshot -- bump it (like a version bump) when refreshing.
const REPOE_PIN_SHA = '512c21b9990f4fe2f5d51528ec4d32fe1f7fac1a';

const PAGES_BASE = 'https://repoe-fork.github.io';
const RAW_BASE = `https://raw.githubusercontent.com/${REPOE_REPO}/${REPOE_PIN_SHA}`;

// Minified aggregate files served at the Pages root.
const FILES = [
  'version.txt',
  'mods.min.json',
  'mod_types.min.json',
  'tags.min.json',
  'fossils.min.json',
  'essences.min.json',
  'crafting_bench_options.min.json',
  'base_items.min.json',
  'item_classes.min.json',
];

const force = process.argv.includes('--force');

/**
 * Download from a URL, following redirects.
 */
function download(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          download(response.headers.location).then(resolve).catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
          return;
        }

        resolve(response);
      })
      .on('error', reject);
  });
}

async function downloadText(url) {
  const response = await download(url);
  const chunks = [];
  for await (const chunk of response) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf-8');
}

async function downloadToFile(url, destPath) {
  const response = await download(url);
  await pipeline(response, createWriteStream(destPath));
}

async function readStamp() {
  if (!existsSync(STAMP_FILE)) return null;
  try {
    return JSON.parse(await readFile(STAMP_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

async function main() {
  const stamp = await readStamp();
  const alreadyDownloaded = existsSync(join(REPOE_DATA_DIR, 'mods.min.json'));

  if (!force && stamp?.sha === REPOE_PIN_SHA && alreadyDownloaded) {
    console.log(
      `✅ RePoE data already present for pin ${REPOE_PIN_SHA.slice(0, 7)} (patch ${stamp.version}). Use --force to refresh.`
    );
    return;
  }

  console.log('📦 Downloading RePoE game data...');
  await mkdir(REPOE_DATA_DIR, { recursive: true });

  // version.txt is committed to git, so fetch it by pinned SHA -- this is the
  // one truly reproducible reference point we have for the whole pin.
  const pinnedVersion = (await downloadText(`${RAW_BASE}/version.txt`)).trim();

  for (const file of FILES) {
    console.log(`   Downloading ${file}...`);
    await downloadToFile(`${PAGES_BASE}/${file}`, join(REPOE_DATA_DIR, file));
  }

  const liveVersion = (await readFile(join(REPOE_DATA_DIR, 'version.txt'), 'utf-8')).trim();
  if (liveVersion !== pinnedVersion) {
    console.warn(
      `⚠️  Live repoe-fork data (patch ${liveVersion}) has moved past the pinned commit ` +
        `${REPOE_PIN_SHA.slice(0, 7)} (patch ${pinnedVersion}). Data downloaded successfully, ` +
        `but consider bumping REPOE_PIN_SHA in scripts/download-repoe.js to match.`
    );
  }

  await writeFile(
    STAMP_FILE,
    JSON.stringify(
      { sha: REPOE_PIN_SHA, version: liveVersion, downloadedAt: new Date().toISOString() },
      null,
      2
    )
  );

  console.log(`✅ RePoE game data (patch ${liveVersion}) downloaded to ${REPOE_DATA_DIR}`);
}

main().catch((error) => {
  console.error('❌ Failed to download RePoE game data:');
  console.error(`   ${error.message}`);
  console.error('   @poe-ai/game-data requires this data -- re-run `pnpm download-repoe` once resolved.');
  process.exit(1);
});
