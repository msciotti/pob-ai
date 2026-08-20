import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// This file lives at packages/game-data/src/paths.ts (or dist/paths.js once
// built) -- either way, one level up is this package's own root, where
// scripts/download-repoe.js's DEFAULT_REPOE_DATA_DIR (join(__dirname, '..',
// 'repoe-data') relative to *its* location, packages/game-data/scripts/)
// resolves to the same directory. Deliberately package-relative rather than
// searching for the monorepo root (e.g. via pnpm-workspace.yaml) -- that
// marker doesn't exist in a real standalone `npm install @poe-ai/game-data`,
// only inside this repo's own workspace checkout.
const PACKAGE_ROOT = join(__dirname, '..');

/**
 * Resolve the directory RePoE game data is read from: `POE_AI_REPOE_DIR` if
 * set, otherwise `<package root>/repoe-data`. Read fresh on every call (not
 * memoized) so tests can override the env var per-case.
 */
export function resolveDataDir(): string {
  return process.env.POE_AI_REPOE_DIR ?? join(PACKAGE_ROOT, 'repoe-data');
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
