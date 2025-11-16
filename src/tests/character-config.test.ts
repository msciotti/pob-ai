/**
 * Character Configuration Tests
 *
 * Tests character-level configuration including level, class,
 * ascendancy, bandit rewards, and pantheon selection.
 */
import { TestSuite } from './test-utils.js';
import { loadTestBuild } from './test-utils.js';

export const characterConfigTests: TestSuite = {
  name: 'Character Configuration',
  tests: [
    {
      name: 'Changing character level should be reflected',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        await runtime.setCharacterLevel(50);
        let level = await runtime.getCharacterLevel();

        if (level !== 50) {
          throw new Error(`Expected level 50, got ${level}`);
        }

        await runtime.setCharacterLevel(90);
        level = await runtime.getCharacterLevel();

        if (level !== 90) {
          throw new Error(`Expected level 90, got ${level}`);
        }

        console.log(`   ✓ Character level: 50 → 90`);
      },
    },

    {
      name: 'Changing character class changes base stats',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        // Marauder has high base strength
        await runtime.setCharacterClass('MARAUDER');
        let className = await runtime.getCharacterClass();
        let stats = await runtime.getBuildStats();
        const marauderStr = stats['Str'] || 0;

        if (className !== 'Marauder') {
          throw new Error(`Expected class 'Marauder', got '${className}'`);
        }

        // Witch has low base strength, high int
        await runtime.setCharacterClass('WITCH');
        className = await runtime.getCharacterClass();
        stats = await runtime.getBuildStats();
        const witchStr = stats['Str'] || 0;
        const witchInt = stats['Int'] || 0;

        if (className !== 'Witch') {
          throw new Error(`Expected class 'Witch', got '${className}'`);
        }

        if (witchStr >= marauderStr) {
          throw new Error(
            `Expected Witch to have lower Str than Marauder. Marauder: ${marauderStr}, Witch: ${witchStr}`
          );
        }

        console.log(
          `   ✓ Marauder Str: ${marauderStr}, Witch Str: ${witchStr}, Witch Int: ${witchInt}`
        );
      },
    },

    {
      name: 'Setting ascendancy can be retrieved',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        await runtime.setCharacterClass('MARAUDER');
        await runtime.setAscendancy('Juggernaut');

        const ascend = await runtime.getAscendancy();
        if (ascend !== 'Juggernaut') {
          throw new Error(`Expected Juggernaut, got ${ascend}`);
        }

        console.log(`   ✓ Ascendancy set to: ${ascend}`);
      },
    },

    {
      name: 'Bandit choice can be set',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        // Kill all bandits
        await runtime.setBandit('None');

        // Help Alira
        await runtime.setBandit('Alira');

        // Just verify no errors were thrown
        console.log(`   ✓ Bandit set: None → Alira`);
      },
    },

    {
      name: 'Pantheon choices can be set',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        // Set pantheons
        await runtime.setPantheon('Soul of Lunaris', 'Soul of Gruthkul');

        // Just verify no errors were thrown
        console.log(`   ✓ Pantheon set: Lunaris (major), Gruthkul (minor)`);
      },
    },
  ],
};
