#!/usr/bin/env node

/**
 * Download Path of Building source as a fallback for local installations
 * Runs during npm/pnpm install (postinstall hook)
 */

import { existsSync } from 'fs';
import { mkdir, readdir, rm, writeFile } from 'fs/promises';
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

// TreeData/ ships one ~15-30MB folder (tree.lua + images) per historical patch
// (2.6 through the current one) -- ~550MB total. A headless build load only
// ever needs the current patch's tree unless someone loads a build saved on an
// old patch (Classes/TreeTab.lua resolves each <Spec treeVersion="..."> to
// TreeData/<version>/tree.lua; PoB does NOT auto-convert old trees to latest --
// that's a manual, UI-only action never exercised by this bridge). Prune
// everything else; POE_AI_ALL_TREES=1 restores it all for that case, and
// luajit-runtime.ts's tree-version-guard gives a clear error instead of the
// Lua crash that missing tree data would otherwise produce.
const TREE_DATA_RELATIVE = ['src', 'TreeData'];

// TreeData/3_19/Assets.lua is a shared asset-name mapping that every tree
// version load depends on unconditionally (Classes/PassiveTree.lua:
// `if not self.assets then self.assets = LoadModule("TreeData/3_19/Assets.lua") end`,
// only true because modern tree.lua payloads carry no "assets" field of their
// own) -- it is not itself version-specific data, so it survives pruning even
// though the rest of the 3_19 folder (images, unused in headless mode) does not.
const ASSET_ANCHOR_VERSION = '3_19';
const ASSET_ANCHOR_FILE = 'Assets.lua';

// TreeData/legion/tree-legion.lua is loaded unconditionally by every
// PassiveTree construction (Classes/PassiveTree.lua), regardless of tree
// version -- keep the whole (small, ~1MB) folder.
const ALWAYS_KEEP_TREE_DIRS = ['legion'];

// Top-level entries in the PoB tarball the headless LuaJIT bridge never
// reads: PoB's own repo/CI plumbing (docs, its Busted spec/test suite, GitHub
// Actions config, packaging scripts) plus a stale 2016-2021 Windows GUI
// distribution zip that duplicates -- with years-old content -- what's
// already unpacked under runtime/.
const UNNEEDED_TOP_LEVEL = [
  'docs',
  'spec',
  'tests',
  '.github',
  'CHANGELOG.md',
  'changelog.txt',
  'CONTRIBUTING.md',
  'RELEASE.md',
  'Dockerfile',
  'docker-compose.yml',
  'fix_ascendancy_positions.py',
  'update_manifest.py',
  '.gitattributes',
  '.gitignore',
  '.editorconfig',
  '.busted',
  'runtime-win32.zip',
];

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

    // Best-effort: a pruning failure shouldn't undo an otherwise-successful
    // download, so these are caught and logged rather than propagated.
    try {
      await pruneUnneededArtifacts(dataDir);
      await pruneTreeData(dataDir);
    } catch (pruneError) {
      console.warn(`⚠️  Failed to prune pob-data (non-fatal): ${pruneError.message}`);
    }

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

/**
 * Highest "<major>_<minor>" prefix among TreeData directory names (ignoring
 * non-numeric ones like "legion"). Returns null if none match.
 */
function latestPatchPrefix(dirNames) {
  let best = null;
  for (const name of dirNames) {
    const match = name.match(/^(\d+)_(\d+)/);
    if (!match) continue;
    const major = Number(match[1]);
    const minor = Number(match[2]);
    if (!best || major > best.major || (major === best.major && minor > best.minor)) {
      best = { major, minor, prefix: `${match[1]}_${match[2]}` };
    }
  }
  return best?.prefix ?? null;
}

/**
 * Deletes every file in `dirPath` except `keepFileName`. Used to reduce
 * TreeData/3_19 to just its shared Assets.lua when 3_19 isn't itself in the
 * kept-version set.
 */
async function reduceDirToFile(dirPath, keepFileName) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.name !== keepFileName)
      .map((entry) => rm(join(dirPath, entry.name), { recursive: true, force: true }))
  );
}

/**
 * Prunes TreeData/ down to the current patch's version(s) plus the
 * unconditional dependencies documented above. No-op (besides logging) if
 * POE_AI_ALL_TREES=1 is set, or if TreeData isn't present.
 */
export async function pruneTreeData(dataDir = POB_DATA_DIR, { allTrees } = {}) {
  const shouldKeepAll = allTrees ?? process.env.POE_AI_ALL_TREES === '1';
  const treeDataDir = join(dataDir, ...TREE_DATA_RELATIVE);

  if (!existsSync(treeDataDir)) {
    return { kept: [], removed: [] };
  }

  if (shouldKeepAll) {
    console.log('   POE_AI_ALL_TREES=1 — keeping every historical passive tree version.');
    return { kept: null, removed: [] };
  }

  const entries = await readdir(treeDataDir, { withFileTypes: true });
  const versionDirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

  const latest = latestPatchPrefix(versionDirs);
  const keep = new Set(ALWAYS_KEEP_TREE_DIRS);
  if (latest) {
    for (const name of versionDirs) {
      if (name === latest || name.startsWith(`${latest}_`)) keep.add(name);
    }
  }

  const removed = [];
  for (const name of versionDirs) {
    if (keep.has(name)) continue;

    if (name === ASSET_ANCHOR_VERSION) {
      await reduceDirToFile(join(treeDataDir, name), ASSET_ANCHOR_FILE);
      continue;
    }

    await rm(join(treeDataDir, name), { recursive: true, force: true });
    removed.push(name);
  }

  const keptDescription = [...keep].sort().join(', ') || '(none)';
  console.log(
    `   Pruned ${removed.length} historical passive tree version(s) from TreeData ` +
      `(kept: ${keptDescription}, plus ${ASSET_ANCHOR_VERSION}/${ASSET_ANCHOR_FILE}).`
  );
  console.log('   Set POE_AI_ALL_TREES=1 and re-run this script to restore every historical version.');

  return { kept: [...keep], removed };
}

/**
 * Deletes runtime/*.dll, runtime/*.exe, and runtime/SimpleGraphic/ (the full
 * Windows GUI renderer -- SimpleGraphic.dll, "Path of Building.exe",
 * fonts/textures). HeadlessWrapper.lua's image/render calls (NewImageHandle,
 * RenderInit, DrawImage, ...) are no-ops and nothing in the headless bridge
 * loads these binaries, so they're dead weight on every platform, not just
 * non-Windows -- only runtime/lua/ (dkjson, base64, sha1, xml.lua) is needed.
 */
async function pruneRuntimeDir(dataDir) {
  const runtimeDir = join(dataDir, 'runtime');
  if (!existsSync(runtimeDir)) return;

  const entries = await readdir(runtimeDir, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.name !== 'lua')
      .filter((entry) => /\.(dll|exe)$/i.test(entry.name) || entry.name === 'SimpleGraphic')
      .map((entry) => rm(join(runtimeDir, entry.name), { recursive: true, force: true }))
  );
}

/**
 * Removes the top-level docs/spec/tests/CI-plumbing and the stale
 * runtime-win32.zip (see UNNEEDED_TOP_LEVEL), plus the GUI-only parts of
 * runtime/. Best-effort — logged, not fatal, since a failure here shouldn't
 * undo an otherwise-successful download.
 */
export async function pruneUnneededArtifacts(dataDir = POB_DATA_DIR) {
  await Promise.all(
    UNNEEDED_TOP_LEVEL.map((name) => rm(join(dataDir, name), { recursive: true, force: true }))
  );
  await pruneRuntimeDir(dataDir);
}

// Only run for real when executed directly (`node download-pob.js`), not when
// imported by a test.
const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  downloadPob();
}
