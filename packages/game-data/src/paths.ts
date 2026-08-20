import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Walk up from `startDir` looking for the monorepo root (marked by
 * pnpm-workspace.yaml). Falls back to `startDir` if no marker is found --
 * that only happens if this package is ever moved outside the workspace.
 */
function findRepoRoot(startDir: string): string {
  let dir = startDir;
  while (true) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return startDir;
    dir = parent;
  }
}

// This file lives at packages/game-data/src/paths.ts (or dist/paths.js once
// built) -- either way, walking up from here reaches the repo root.
const REPO_ROOT = findRepoRoot(__dirname);

/**
 * Resolve the directory RePoE game data is read from: `POE_AI_REPOE_DIR` if
 * set, otherwise `<repo root>/repoe-data`. Read fresh on every call (not
 * memoized) so tests can override the env var per-case.
 */
export function resolveDataDir(): string {
  return process.env.POE_AI_REPOE_DIR ?? join(REPO_ROOT, 'repoe-data');
}

/** Thrown by loaders when the resolved data directory doesn't have the requested file. */
export class RepoeDataNotFoundError extends Error {
  constructor(dataDir: string, filename: string) {
    super(
      `RePoE game data file "${filename}" not found in ${dataDir}. ` +
        'Run `pnpm download-repoe` to download it (or set POE_AI_REPOE_DIR to a directory that has it).'
    );
    this.name = 'RepoeDataNotFoundError';
  }
}
