/**
 * Filesystem locations of the BUILT artifacts these e2e tests drive. Everything
 * here points at `dist/`, never `src/` — these tests exercise the real, compiled
 * server the way a real MCP client would run it (`pnpm -r build` must run first;
 * see the package README / CI job).
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// This file lives at <pkg>/src/helpers/paths.ts (or <pkg>/dist/helpers/paths.js
// once built) — either way it's two directories below the package root.
const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO_ROOT = join(PACKAGE_ROOT, '..', '..');

export const CORE_DIST_DIR = join(REPO_ROOT, 'packages', 'core', 'dist');
export const MAIN_HTTP_JS = join(CORE_DIST_DIR, 'main.js');
export const MAIN_STDIO_JS = join(CORE_DIST_DIR, 'main-stdio.js');

export const FIXTURE_PLUGIN_JS = join(PACKAGE_ROOT, 'dist', 'fixture-plugin', 'index.js');
