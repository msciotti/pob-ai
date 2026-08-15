#!/usr/bin/env node

/**
 * Download Path of Building source as a fallback for local installations
 * Runs during npm/pnpm install (postinstall hook)
 */

import { createWriteStream, existsSync } from 'fs';
import { mkdir, rm } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { pipeline } from 'stream/promises';
import { createGunzip } from 'zlib';
import { extract } from 'tar';
import https from 'https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const POB_DATA_DIR = join(__dirname, '..', 'pob-data');
const POB_REPO = 'PathOfBuildingCommunity/PathOfBuilding';
const POB_BRANCH = 'master'; // Could also use a specific release tag

console.log('📦 Downloading Path of Building source...');

/**
 * Download file from URL
 */
function download(url) {
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

async function main() {
  try {
    // Clean up existing data directory
    if (existsSync(POB_DATA_DIR)) {
      console.log('   Removing existing PoB data...');
      await rm(POB_DATA_DIR, { recursive: true, force: true });
    }

    // Create data directory
    await mkdir(POB_DATA_DIR, { recursive: true });

    // Download tarball from GitHub
    const url = `https://github.com/${POB_REPO}/archive/refs/heads/${POB_BRANCH}.tar.gz`;
    console.log(`   Downloading from ${url}...`);

    const response = await download(url);

    // Extract directly to pob-data directory
    // The tarball contains a root folder like "PathOfBuilding-master", we need to strip it
    await pipeline(
      response,
      createGunzip(),
      extract({
        cwd: POB_DATA_DIR,
        strip: 1, // Strip the root folder from the archive
      })
    );

    console.log(`✅ Path of Building downloaded to ${POB_DATA_DIR}`);
    console.log('   This will be used as a fallback if local PoB installation is not found.');
  } catch (error) {
    console.warn('⚠️  Failed to download Path of Building (this is optional):');
    console.warn(`   ${error.message}`);
    console.warn(
      '   You can still use pob-mcp by installing Path of Building locally or configuring the path.'
    );
    // Don't exit with error - this is a non-critical fallback
  }
}

main();
