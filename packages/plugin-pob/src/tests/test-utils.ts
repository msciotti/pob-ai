/**
 * Test utilities and shared types
 */
import { LuaJITRuntime } from '../runtime/luajit-runtime.js';
import { getPobPath } from '../runtime/detector.js';

export interface TestCase {
  name: string;
  run: (runtime: LuaJITRuntime) => Promise<void>;
}

export interface TestSuite {
  name: string;
  tests: TestCase[];
}

export interface TestResult {
  suite: string;
  test: string;
  passed: boolean;
  error?: string;
  duration: number;
}

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
 */
export async function loadTestBuild(runtime: LuaJITRuntime): Promise<void> {
  const { readFile } = await import('fs/promises');
  const { fileURLToPath } = await import('url');
  const { dirname, join } = await import('path');

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  // test-data lives at the repo root: packages/plugin-pob/dist/tests/ → ../../../../test-data/
  const buildPath = join(__dirname, '..', '..', '..', '..', 'test-data', 'sample-build.txt');
  const buildXML = await readFile(buildPath, 'utf-8');
  await runtime.loadBuildFromXML(buildXML, 'Test Build');
}

export function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message || `Expected ${String(expected)}, but got ${String(actual)}`);
  }
}
