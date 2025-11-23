/**
 * Test utilities and shared types
 */
import { LuaJITRuntime } from '../pob/luajit-runtime.js';
import { loadConfig } from '../config/index.js';
import { getPobPath } from '../pob/detector.js';

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
 * Initialize PoB runtime for testing
 */
export async function initializeRuntime(): Promise<LuaJITRuntime> {
  const config = await loadConfig();
  const pobPath = await getPobPath(config.pobPath);
  const runtime = new LuaJITRuntime(pobPath);
  await runtime.initialize();
  return runtime;
}

/**
 * Load test build from file
 * Creates a fresh build for each test to ensure isolation
 */
export async function loadTestBuild(runtime: LuaJITRuntime): Promise<void> {
  const { readFile } = await import('fs/promises');
  const { fileURLToPath } = await import('url');
  const { dirname, join } = await import('path');

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  const buildPath = join(__dirname, '..', '..', 'test-data', 'sample-build.txt');
  const buildXML = await readFile(buildPath, 'utf-8');
  // Pass false for preserveState to create a fresh build each time
  await runtime.loadBuildFromXML(buildXML, 'Test Build', false);
}

/**
 * Assert helper for tests
 */
export function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

/**
 * Assert equal helper
 */
export function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(
      message || `Expected ${expected}, but got ${actual}`
    );
  }
}
