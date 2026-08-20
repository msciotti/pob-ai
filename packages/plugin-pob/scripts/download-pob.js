#!/usr/bin/env node

/**
 * Download Path of Building source as a fallback for local installations
 * Runs during npm/pnpm install (postinstall hook)
 */

import { existsSync } from 'fs';
import { mkdir, rm, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { pipeline } from 'stream/promises';
import { createGunzip } from 'zlib';
import { extract } from 'tar';
import https from 'https';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const POB_DATA_DIR = join(__dirname, '..', 'pob-data');
const POB_REPO = 'PathOfBuildingCommunity/PathOfBuilding';
const POB_BRANCH = 'master'; // Could also use a specific release tag

/**
 * Path to the "download fully completed" sentinel, written as the LAST step after a
 * successful download+extract. Deliberately NOT one of the extracted PoB files
 * themselves (e.g. src/HeadlessWrapper.lua) — those land partway through
 * extraction, so an interrupted download (network drop, CI cancel, disk full) could
 * leave one on disk while the rest of the tree is missing. Checking against one of
 * them would then permanently — and silently — treat a corrupt, incomplete download
 * as "already present" (locally forever, and in CI an actions/cache would keep
 * restoring that same corrupt state).
 */
export function downloadCompleteMarkerPath(dataDir = POB_DATA_DIR) {
  return join(dataDir, '.download-complete');
}

/**
 * Download file from URL
 */
export function download(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // Follow redirect
          download(response.headers.location).then(resolve).catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: ${response.statusCode}`));
          return;
        }

        resolve(response);
      })
      .on('error', reject);
  });
}

/**
 * Core download+extract logic. `fetchTarball`/`extractTarball` are injectable so
 * this can be exercised without hitting the real network or a real tar archive —
 * see download-pob.test.js.
 */
export async function downloadPob({
  dataDir = POB_DATA_DIR,
  fetchTarball = () => download(`https://github.com/${POB_REPO}/archive/refs/heads/${POB_BRANCH}.tar.gz`),
  extractTarball = (response, cwd) =>
    pipeline(
      response,
      createGunzip(),
      extract({
        cwd,
        strip: 1, // Strip the root folder ("PathOfBuilding-master") from the archive
      })
    ),
} = {}) {
  console.log('📦 Downloading Path of Building source...');

  const marker = downloadCompleteMarkerPath(dataDir);

  // Already downloaded (e.g. restored from actions/cache, or a prior local install)
  // — skip re-fetching entirely. Without this check, every `pnpm install` wiped and
  // re-downloaded PoB from scratch (and, since that wipe also removed the sibling
  // luajit/ directory this script's sibling script builds into, forced a full
  // LuaJIT rebuild too), making any pob-data cache a no-op.
  if (existsSync(marker)) {
    console.log(`✅ Path of Building source already present at ${dataDir} — skipping download`);
    return { skipped: true };
  }

  try {
    // Clean up any partial/stale data directory before a fresh download.
    if (existsSync(dataDir)) {
      console.log('   Removing incomplete PoB data...');
      await rm(dataDir, { recursive: true, force: true });
    }

    // Create data directory
    await mkdir(dataDir, { recursive: true });

    console.log(`   Downloading from ${POB_REPO}#${POB_BRANCH}...`);
    const response = await fetchTarball();

    // Extract directly to pob-data directory
    await extractTarball(response, dataDir);

    // Only written once extraction has fully succeeded — see downloadCompleteMarkerPath.
    await writeFile(marker, `${new Date().toISOString()}\n`);

    console.log(`✅ Path of Building downloaded to ${dataDir}`);
    console.log('   This will be used as a fallback if local PoB installation is not found.');
    return { skipped: false };
  } catch (error) {
    console.warn('⚠️  Failed to download Path of Building (this is optional):');
    console.warn(`   ${error.message}`);
    console.warn(
      '   You can still use pob-mcp by installing Path of Building locally or configuring the path.'
    );
    // Don't exit with error - this is a non-critical fallback
    return { skipped: false, error };
  }
}

// Only run for real when executed directly (`node download-pob.js`), not when
// imported by a test.
const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  downloadPob();
}
