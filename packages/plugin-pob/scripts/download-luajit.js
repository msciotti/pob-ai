#!/usr/bin/env node

/**
 * Download and build LuaJIT from source
 * Builds a local copy so no system dependencies are needed
 * Runs during npm/pnpm install (postinstall hook)
 */

import { createWriteStream, existsSync, chmodSync } from 'fs';
import { mkdir, rm } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { pipeline } from 'stream/promises';
import { createGunzip } from 'zlib';
import https from 'https';
import { platform } from 'os';
import { execSync } from 'child_process';
import { extract } from 'tar';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LUAJIT_DIR = join(__dirname, '..', 'pob-data', 'luajit');
const LUAJIT_BIN = join(LUAJIT_DIR, 'src', platform() === 'win32' ? 'luajit.exe' : 'luajit');

// LuaJIT version to download - using v2.1 branch (stable)
const LUAJIT_BRANCH = 'v2.1';
const LUAJIT_URL = `https://github.com/LuaJIT/LuaJIT/archive/refs/heads/${LUAJIT_BRANCH}.tar.gz`;

/**
 * The pob-bridge.lua/HeadlessWrapper.lua stack requires FFI (bridge's zlib
 * Inflate override, JSON/base64 plumbing) and `goto`/labels (the bridge's
 * main dispatch loop). Both have been present in every LuaJIT 2.x release
 * for a decade -- there's no meaningful minimum-version constraint beyond
 * "is actually LuaJIT" (plain Lua interpreters, including one named `lua5.1`
 * symlinked to `luajit` by mistake, lack FFI entirely). So the compatibility
 * check just confirms `require("ffi")` succeeds, rather than parsing a
 * version number against some cutoff that doesn't exist in practice.
 */
const FFI_CHECK_MARKER = 'POE_AI_LUAJIT_FFI_OK';

/**
 * Looks for a usable system LuaJIT on PATH (as installed by e.g.
 * `apt install luajit` or `brew install luajit`) so the source build --
 * which needs make/gcc and takes real time -- can be skipped entirely.
 * Returns `{ path, version }` if one is found and has working FFI, else null.
 * `exec` is injectable for testing.
 */
export function detectSystemLuajit(candidates = ['luajit'], exec = execSync) {
  for (const candidate of candidates) {
    try {
      const version = exec(`"${candidate}" -v`, { encoding: 'utf-8', stdio: 'pipe' }).trim();
      exec(`"${candidate}" -e "assert(require('ffi')); print('${FFI_CHECK_MARKER}')"`, {
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      return { path: candidate, version };
    } catch {
      // Not found, not executable, or lacks FFI — try the next candidate.
      continue;
    }
  }
  return null;
}

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

// Only run for real when executed directly (`node download-luajit.js`), not
// when imported by a test (see download-pob.js for the same pattern).
const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  console.log('📦 Setting up LuaJIT...');
  console.log(`   Platform: ${platform()}`);

  // Check if already built
  if (existsSync(LUAJIT_BIN)) {
    console.log('✅ LuaJIT already built');
    try {
      const version = execSync(`"${LUAJIT_BIN}" -v`, { encoding: 'utf-8', stdio: 'pipe' });
      console.log(`   ${version.trim()}`);
    } catch (e) {
      // Ignore version check errors
    }
    process.exit(0);
  }

  // Prefer a system-installed LuaJIT (apt/brew) over building from source --
  // no compiler needed, and this is the documented droplet path. Some
  // distros/package managers expose a versioned binary name instead of (or
  // alongside) the bare `luajit` symlink.
  const systemLuajit = detectSystemLuajit(['luajit', 'luajit-2.1', 'luajit2.1']);
  if (systemLuajit) {
    console.log(`✅ Using system LuaJIT: ${systemLuajit.path}`);
    console.log(`   ${systemLuajit.version}`);
    console.log('   (found on PATH with working FFI — skipping source build)');
    process.exit(0);
  }

  console.log('   No usable system LuaJIT found on PATH — will build from source.');
  console.log('   Tip: `apt install luajit` (Debian/Ubuntu) or `brew install luajit` (macOS) skips this step entirely.');

  // Check if we can build (need make/gcc/msvc)
  try {
    if (platform() === 'win32') {
      // Windows needs Visual Studio or MinGW
      console.log('⚠️  Building LuaJIT on Windows requires Visual Studio or MinGW');
      console.log('');
      console.log('Please install LuaJIT manually:');
      console.log('  Download from: https://luajit.org/download.html');
      console.log('  Or use: choco install luajit');
      process.exit(1);
    } else {
      // Unix: check for make and gcc/clang
      execSync('which make', { stdio: 'pipe' });
      execSync('which gcc || which clang', { stdio: 'pipe', shell: true });
    }
  } catch (e) {
    console.log('⚠️  Build tools not found (need make and gcc/clang)');
    console.log('');
    console.log('Please install build tools:');
    if (platform() === 'darwin') {
      console.log('  macOS: xcode-select --install');
    } else {
      console.log('  Ubuntu: sudo apt install build-essential');
      console.log('  Fedora: sudo dnf groupinstall "Development Tools"');
    }
    console.log('');
    console.log('Or install LuaJIT via package manager:');
    if (platform() === 'darwin') {
      console.log('  brew install luajit');
    } else {
      console.log('  sudo apt install luajit  # Ubuntu');
      console.log('  sudo dnf install luajit  # Fedora');
    }
    process.exit(1);
  }

  console.log('⬇️  Downloading LuaJIT source...');

  // Clean up old directory
  if (existsSync(LUAJIT_DIR)) {
    await rm(LUAJIT_DIR, { recursive: true, force: true });
  }

  await mkdir(LUAJIT_DIR, { recursive: true });

  // Download and extract
  const response = await download(LUAJIT_URL);
  await pipeline(
    response,
    createGunzip(),
    extract({ cwd: LUAJIT_DIR, strip: 1 })
  );

  console.log('🔨 Building LuaJIT (this takes ~10 seconds)...');

  try {
    // Build LuaJIT
    const buildEnv = { ...process.env };

    // macOS requires MACOSX_DEPLOYMENT_TARGET
    if (platform() === 'darwin') {
      buildEnv.MACOSX_DEPLOYMENT_TARGET = '10.14';
    }

    execSync('make', {
      cwd: LUAJIT_DIR,
      stdio: 'inherit',
      env: buildEnv,
    });

    // Make binary executable
    chmodSync(LUAJIT_BIN, 0o755);

    console.log('✅ LuaJIT built successfully!');
    console.log(`   Binary: ${LUAJIT_BIN}`);

    // Test it
    const version = execSync(`"${LUAJIT_BIN}" -v`, { encoding: 'utf-8' });
    console.log(`   ${version.trim()}`);
  } catch (error) {
    console.error('❌ Failed to build LuaJIT:', error.message);
    console.log('');
    console.log('Please install LuaJIT manually:');
    if (platform() === 'darwin') {
      console.log('  brew install luajit');
    } else {
      console.log('  sudo apt install luajit  # Ubuntu');
      console.log('  sudo dnf install luajit  # Fedora');
    }
    process.exit(1);
  }
}
