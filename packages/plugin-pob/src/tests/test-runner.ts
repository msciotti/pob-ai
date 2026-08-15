/**
 * Test Runner for @poe-ai/plugin-pob
 *
 * Orchestrates all test suites and provides formatted output.
 * Requires LuaJIT to be available — set POB_PATH env var or ensure
 * Path of Building is installed at a standard location.
 */
import { TestSuite, TestResult, initializeRuntime } from './test-utils.js';
import { passiveAllocationTests } from './passive-allocation.test.js';
import { itemEquipTests } from './item-equip.test.js';
import { skillGemTests } from './skill-gems.test.js';
import { flaskTests } from './flasks.test.js';
import { jewelTests } from './jewels.test.js';
import { characterConfigTests } from './character-config.test.js';
import { configurationTests } from './configuration.test.js';

const TEST_SUITES: TestSuite[] = [
  passiveAllocationTests,
  itemEquipTests,
  skillGemTests,
  flaskTests,
  jewelTests,
  characterConfigTests,
  configurationTests,
];

async function runTests() {
  console.log('=== @poe-ai/plugin-pob Integration Tests ===\n');

  console.log('Initializing PoB runtime...');
  const runtime = await initializeRuntime();
  console.log('Runtime initialized\n');

  const results: TestResult[] = [];
  let totalTests = 0;
  let passedTests = 0;

  for (const suite of TEST_SUITES) {
    if (suite.tests.length === 0) {
      console.log(`\n${suite.name}: (no tests yet)\n`);
      continue;
    }

    console.log(`\n${suite.name}:\n`);

    for (const test of suite.tests) {
      totalTests++;
      const startTime = Date.now();

      try {
        console.log(`   Running: ${test.name}`);
        await test.run(runtime);
        const duration = Date.now() - startTime;

        results.push({ suite: suite.name, test: test.name, passed: true, duration });
        passedTests++;
        console.log(`   PASSED (${duration}ms)\n`);
      } catch (error) {
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);

        results.push({
          suite: suite.name,
          test: test.name,
          passed: false,
          error: errorMessage,
          duration,
        });

        console.log(`   FAILED (${duration}ms)`);
        console.log(`   Error: ${errorMessage}\n`);
      }
    }
  }

  // Cleanup
  console.log('\nCleaning up runtime...');
  await runtime.destroy();
  console.log('Cleanup complete\n');

  // Summary
  console.log('=== Test Summary ===');
  console.log(`Total: ${totalTests} tests`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${totalTests - passedTests}`);

  process.exit(passedTests === totalTests ? 0 : 1);
}

runTests().catch((error) => {
  console.error('\nFatal error running tests:', error);
  process.exit(1);
});
