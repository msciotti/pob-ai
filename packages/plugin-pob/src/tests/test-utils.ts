/**
 * Test utilities shared across all plugin-pob vitest suites.
 */
import { LuaJITRuntime } from '../runtime/luajit-runtime.js';
import { getPobPath } from '../runtime/detector.js';

/**
 * Initialize PoB runtime for testing.
 * Uses the same detection logic as the plugin itself.
 */
export async function initializeRuntime(): Promise<LuaJITRuntime> {
  // Honour POB_PATH env var for CI / local override
  const pobPath = await getPobPath(process.env['POB_PATH']);
  const runtime = new LuaJITRuntime({ pobPath });
  await runtime.initialize();
  return runtime;
}

/**
 * Load the shared test build from test-data/.
 * Creates a fresh build (preserveState: false) to ensure test isolation.
 * Call this at the start of every test that exercises runtime state.
 */
export async function loadTestBuild(runtime: LuaJITRuntime): Promise<void> {
  const { readFile } = await import('fs/promises');
  const { fileURLToPath } = await import('url');
  const { dirname, join } = await import('path');

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  // test-data lives at the repo root.
  // From dist/tests/ → ../../../../test-data/ (4 levels up)
  // From src/tests/  → ../../../../test-data/ (4 levels up, same result)
  const buildPath = join(__dirname, '..', '..', '..', '..', 'test-data', 'sample-build.txt');
  const buildXML = await readFile(buildPath, 'utf-8');
  await runtime.loadBuildFromXML(buildXML, 'Test Build');
}
