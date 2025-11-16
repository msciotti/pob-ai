/**
 * Passive Allocation Tests
 *
 * Tests that verify passive tree node allocation works correctly
 * and produces expected stat changes.
 */
import { TestSuite } from './test-utils.js';
import { assertEqual, loadTestBuild } from './test-utils.js';

export const passiveAllocationTests: TestSuite = {
  name: 'Passive Allocation',
  tests: [
    {
      name: 'Resolute Technique should set crit chance to 0%',
      run: async (runtime) => {
        // Load test build
        await loadTestBuild(runtime);

        // Get initial crit chance
        let stats = await runtime.getBuildStats();
        const initialCrit = stats['CritChance'] || 0;

        // Allocate Resolute Technique
        await runtime.allocatePassive('Resolute Technique');

        // Get final crit chance
        stats = await runtime.getBuildStats();
        const finalCrit = stats['CritChance'] || 0;

        // Verify crit is now 0
        assertEqual(
          finalCrit,
          0,
          `Expected crit chance to be 0% after Resolute Technique, but got ${finalCrit}%`
        );

        console.log(
          `   ✓ Initial: ${initialCrit}% → Final: ${finalCrit}% (correctly set to 0)`
        );
      },
    },

    // TODO: Add more passive allocation tests
    // Examples:
    // - "Allocating +30 Str node should increase strength"
    // - "Allocating life node should increase max life"
    // - "Allocating damage node should increase DPS"
  ],
};
