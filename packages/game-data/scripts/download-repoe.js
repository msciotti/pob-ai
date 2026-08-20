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
 * NOTE: this only detects drift in version.txt -- the aggregates themselves
 * could in principle be redeployed mid-download without version.txt
 * changing (a mid-deploy race). Accepted risk, not guarded against here.
 *
 * Everything is downloaded into a temp directory first and validated (valid
 * JSON, no partial/garbage responses) before being atomically swapped in for
 * the real data dir -- a run that dies partway through never leaves the real
 * data dir in a mixed old/new-version state, and the freshness stamp is
 * written inside that same temp dir so it can never describe data that
 * didn't fully land.
 *
 * Run manually via `pnpm --filter @poe-ai/game-data download-repoe` (not
 * wired into postinstall -- this is ~25MB and only needed by plugins that
 * depend on @poe-ai/game-data; `poe-ai init` runs it automatically when
 * @poe-ai/plugin-crafting is one of the enabled plugins).
 *
 * The core logic is exported as `runDownload` (with injectable fetchers and
 * data dir) so it can be exercised in tests without hitting the network --
 * see packages/game-data's test suite for a regression test covering the
 * interrupted-refresh bug this atomic-swap design fixes.
 */

import { createWriteStream, existsSync } from 'fs';
import { mkdir, readFile, rename, rm, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { pipeline } from 'stream/promises';
import https from 'https';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REPOE_DATA_DIR = join(__dirname, '..', 'repoe-data');
const STAMP_FILENAME = '.repoe-stamp.json';

const REPOE_REPO = 'repoe-fork/repoe-fork.github.io';
// Pinned to the commit that produced the currently-deployed repoe-fork.github.io
// Pages site, resolved once via:
//   GET /repos/repoe-fork/repoe-fork.github.io/deployments
// (the `sha` of the most recent `github-pages` deployment -- this is the exact
// source commit GitHub Pages built from, confirmed against version.txt = 3.29.3.1.4).
// The Pages site rebuilds automatically as the game patches, so this pin is a
// point-in-time snapshot -- bump it (like a version bump) when refreshing.
export const REPOE_PIN_SHA = '512c21b9990f4fe2f5d51528ec4d32fe1f7fac1a';

export const DEFAULT_PAGES_BASE = 'https://repoe-fork.github.io';
export const DEFAULT_RAW_BASE = `https://raw.githubusercontent.com/${REPOE_REPO}/${REPOE_PIN_SHA}`;

// Network inactivity timeout -- resets on any data received, so it guards
// against a stalled/hung connection, not total transfer time.
const REQUEST_TIMEOUT_MS = 30_000;

// Minified aggregate files served at the Pages root.
export const JSON_FILES = [
  'mods.min.json',
  'mod_types.min.json',
  'tags.min.json',
  'fossils.min.json',
  'essences.min.json',
  'crafting_bench_options.min.json',
  'base_items.min.json',
  'item_classes.min.json',
];
export const FILES = ['version.txt', ...JSON_FILES];

/**
 * Download from a URL, following redirects, with a socket inactivity timeout.
 */
function httpsDownload(url) {
  return new Promise((resolve, reject) => {
    const request = https
      .get(url, { timeout: REQUEST_TIMEOUT_MS }, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          httpsDownload(response.headers.location).then(resolve).catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
          return;
        }

        resolve(response);
      })
      .on('timeout', () => {
        request.destroy(new Error(`Timed out downloading ${url} (no data for ${REQUEST_TIMEOUT_MS}ms)`));
      })
      .on('error', reject);
  });
}

async function defaultFetchText(url) {
  const response = await httpsDownload(url);
  const chunks = [];
  for await (const chunk of response) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf-8');
}

async function defaultFetchToFile(url, destPath) {
  const response = await httpsDownload(url);
  await pipeline(response, createWriteStream(destPath));
}

/** Parse a downloaded JSON file to catch e.g. an HTML error page saved as .json. */
async function assertValidJson(filePath, filename) {
  const raw = await readFile(filePath, 'utf-8');
  try {
    JSON.parse(raw);
  } catch (err) {
    const preview = raw.slice(0, 120).replace(/\s+/g, ' ').trim();
    throw new Error(
      `Downloaded ${filename} is not valid JSON (${err.message}). ` +
        `First bytes: ${JSON.stringify(preview)} -- the server likely returned an error page.`
    );
  }
}

async function readStamp(dataDir) {
  const stampPath = join(dataDir, STAMP_FILENAME);
  if (!existsSync(stampPath)) return null;
  try {
    return JSON.parse(await readFile(stampPath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Download and validate RePoE data, atomically swapping it into `dataDir`.
 *
 * `fetchText`/`fetchToFile` and the base URLs are all overridable so tests
 * can exercise the full swap/validation/interruption behaviour without any
 * real network access.
 */
export async function runDownload({
  dataDir = DEFAULT_REPOE_DATA_DIR,
  force = false,
  fetchText = defaultFetchText,
  fetchToFile = defaultFetchToFile,
  pagesBase = DEFAULT_PAGES_BASE,
  rawBase = DEFAULT_RAW_BASE,
  pinSha = REPOE_PIN_SHA,
  log = console.log,
  warn = console.warn,
} = {}) {
  const tmpDataDir = `${dataDir}.tmp-${process.pid}`;

  const stamp = await readStamp(dataDir);
  const alreadyDownloaded = FILES.every((file) => existsSync(join(dataDir, file)));

  if (!force && stamp?.sha === pinSha && alreadyDownloaded) {
    log(`✅ RePoE data already present for pin ${pinSha.slice(0, 7)} (patch ${stamp.version}). Use --force to refresh.`);
    return { updated: false, version: stamp.version };
  }

  log('📦 Downloading RePoE game data...');
  await rm(tmpDataDir, { recursive: true, force: true });
  await mkdir(tmpDataDir, { recursive: true });

  try {
    // version.txt is committed to git, so fetch it by pinned SHA -- this is the
    // one truly reproducible reference point we have for the whole pin.
    const pinnedVersion = (await fetchText(`${rawBase}/version.txt`)).trim();

    for (const file of FILES) {
      log(`   Downloading ${file}...`);
      const destPath = join(tmpDataDir, file);
      await fetchToFile(`${pagesBase}/${file}`, destPath);
      if (JSON_FILES.includes(file)) {
        await assertValidJson(destPath, file);
      }
    }

    const liveVersion = (await readFile(join(tmpDataDir, 'version.txt'), 'utf-8')).trim();
    if (!liveVersion) {
      throw new Error('Downloaded version.txt is empty.');
    }
    if (liveVersion !== pinnedVersion) {
      warn(
        `⚠️  Live repoe-fork data (patch ${liveVersion}) has moved past the pinned commit ` +
          `${pinSha.slice(0, 7)} (patch ${pinnedVersion}). Data downloaded successfully, ` +
          `but consider bumping REPOE_PIN_SHA in packages/game-data/scripts/download-repoe.js to match.`
      );
    }

    // Write the stamp inside the temp dir so it moves atomically with the
    // data it describes -- it can never end up pointing at a directory that
    // doesn't match, even if this process is killed right after the rename.
    await writeFile(
      join(tmpDataDir, STAMP_FILENAME),
      JSON.stringify({ sha: pinSha, version: liveVersion, downloadedAt: new Date().toISOString() }, null, 2)
    );

    // Swap the fully-validated temp dir in for the real one. Not fully atomic
    // (a crash between the rm and the rename would leave no data dir at all),
    // but that fails loudly and safely -- loaders throw a clear "run pnpm
    // download-repoe" error -- rather than silently serving mixed-version data.
    await rm(dataDir, { recursive: true, force: true });
    await rename(tmpDataDir, dataDir);

    log(`✅ RePoE game data (patch ${liveVersion}) downloaded to ${dataDir}`);
    return { updated: true, version: liveVersion };
  } finally {
    await rm(tmpDataDir, { recursive: true, force: true });
  }
}

const isMainModule = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  runDownload({ force: process.argv.includes('--force') }).catch((error) => {
    console.error('❌ Failed to download RePoE game data:');
    console.error(`   ${error.message}`);
    console.error('   @poe-ai/game-data requires this data -- re-run `pnpm download-repoe` once resolved.');
    process.exit(1);
  });
}
