/**
 * Skill Gem Tests
 *
 * Tests that verify changing skill gems works correctly
 * and produces expected stat changes.
 */
import { TestSuite } from './test-utils.js';
import { loadTestBuild } from './test-utils.js';

export const skillGemTests: TestSuite = {
  name: 'Skill Gems',
  tests: [
    {
      name: 'Adding a skill gem should enable DPS calculations',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        // Get initial DPS (should be minimal with no skills)
        let stats = await runtime.getBuildStats();
        const initialDPS = stats['TotalDPS'] || 0;

        // Add Fireball skill
        await runtime.addSocketGroup('Fireball', [{ name: 'Fireball', level: 20, quality: 0 }]);

        // Get final DPS
        stats = await runtime.getBuildStats();
        const finalDPS = stats['TotalDPS'] || 0;

        // Verify DPS increased significantly
        if (finalDPS <= initialDPS * 10) {
          throw new Error(
            `Expected DPS to increase significantly. Initial: ${initialDPS}, Final: ${finalDPS}`
          );
        }

        console.log(`   ✓ DPS: ${initialDPS.toFixed(2)} → ${finalDPS.toFixed(2)} (${((finalDPS / initialDPS - 1) * 100).toFixed(0)}x increase)`);
      },
    },

    {
      name: 'Adding support gems should modify skill damage',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        // Add Fireball alone
        await runtime.addSocketGroup('Fireball Only', [{ name: 'Fireball', level: 20, quality: 0 }]);

        let stats = await runtime.getBuildStats();
        const dpsWithoutSupport = stats['TotalDPS'] || 0;

        // Clear and add Fireball with GMP
        await runtime.clearSocketGroups();
        await runtime.addSocketGroup('Fireball + GMP', [
          { name: 'Fireball', level: 20, quality: 0 },
          { name: 'Greater Multiple Projectiles', level: 20, quality: 0 },
        ]);

        stats = await runtime.getBuildStats();
        const dpsWithGMP = stats['TotalDPS'] || 0;

        // GMP should reduce single-target DPS but provide more projectiles
        // The stat should change (could increase or decrease depending on how PoB calculates)
        if (dpsWithGMP === dpsWithoutSupport) {
          throw new Error(
            `Expected DPS to change with GMP support. Without: ${dpsWithoutSupport}, With: ${dpsWithGMP}`
          );
        }

        console.log(
          `   ✓ DPS without support: ${dpsWithoutSupport.toFixed(2)}, with GMP: ${dpsWithGMP.toFixed(2)}`
        );
      },
    },

    {
      name: 'Gem level should affect skill damage',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        // Add level 1 Fireball
        await runtime.addSocketGroup('Fireball L1', [{ name: 'Fireball', level: 1, quality: 0 }]);

        let stats = await runtime.getBuildStats();
        const dpsLevel1 = stats['TotalDPS'] || 0;

        // Clear and add level 20 Fireball
        await runtime.clearSocketGroups();
        await runtime.addSocketGroup('Fireball L20', [{ name: 'Fireball', level: 20, quality: 0 }]);

        stats = await runtime.getBuildStats();
        const dpsLevel20 = stats['TotalDPS'] || 0;

        // Level 20 should do significantly more damage than level 1
        if (dpsLevel20 <= dpsLevel1 * 2) {
          throw new Error(
            `Expected level 20 to do significantly more damage. L1: ${dpsLevel1}, L20: ${dpsLevel20}`
          );
        }

        const increase = ((dpsLevel20 / dpsLevel1 - 1) * 100).toFixed(0);
        console.log(`   ✓ DPS L1: ${dpsLevel1.toFixed(2)}, L20: ${dpsLevel20.toFixed(2)} (+${increase}%)`);
      },
    },

    {
      name: 'Gem quality can be set on gems',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        // Add gems with different quality levels
        await runtime.addSocketGroup('Quality Test', [
          { name: 'Fireball', level: 20, quality: 0 },
        ]);

        let groups = await runtime.getSocketGroups();
        if (groups[0].gems[0].quality !== 0) {
          throw new Error(`Expected quality 0, got ${groups[0].gems[0].quality}`);
        }

        // Change to 20% quality
        await runtime.clearSocketGroups();
        await runtime.addSocketGroup('Quality Test 20', [
          { name: 'Fireball', level: 20, quality: 20 },
        ]);

        groups = await runtime.getSocketGroups();
        if (groups[0].gems[0].quality !== 20) {
          throw new Error(`Expected quality 20, got ${groups[0].gems[0].quality}`);
        }

        console.log(`   ✓ Gem quality correctly set: 0% and 20%`);
      },
    },

    {
      name: 'Multiple support gems should stack effects',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        // Add Fireball with one support
        await runtime.addSocketGroup('1 Support', [
          { name: 'Fireball', level: 20, quality: 0 },
          { name: 'Greater Multiple Projectiles', level: 20, quality: 0 },
        ]);

        let stats = await runtime.getBuildStats();
        const dpsOneSupport = stats['TotalDPS'] || 0;

        // Clear and add Fireball with multiple supports
        await runtime.clearSocketGroups();
        await runtime.addSocketGroup('Multiple Supports', [
          { name: 'Fireball', level: 20, quality: 0 },
          { name: 'Greater Multiple Projectiles', level: 20, quality: 0 },
          { name: 'Spell Echo', level: 20, quality: 0 },
          { name: 'Elemental Focus', level: 20, quality: 0 },
        ]);

        stats = await runtime.getBuildStats();
        const dpsMultiSupport = stats['TotalDPS'] || 0;

        // Multiple supports should change DPS (usually increase, but not always)
        if (dpsMultiSupport === dpsOneSupport) {
          throw new Error(
            `Expected DPS to change with more supports. 1 support: ${dpsOneSupport}, 3 supports: ${dpsMultiSupport}`
          );
        }

        console.log(
          `   ✓ DPS 1 support: ${dpsOneSupport.toFixed(2)}, 3 supports: ${dpsMultiSupport.toFixed(2)}`
        );
      },
    },

    {
      name: 'Clearing socket groups should reset DPS',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        // Add skill
        await runtime.addSocketGroup('Fireball', [{ name: 'Fireball', level: 20, quality: 0 }]);

        let stats = await runtime.getBuildStats();
        const dpsWithSkill = stats['TotalDPS'] || 0;

        // Clear all skills
        await runtime.clearSocketGroups();

        stats = await runtime.getBuildStats();
        const dpsAfterClear = stats['TotalDPS'] || 0;

        // DPS should return to very low levels
        if (dpsAfterClear >= dpsWithSkill / 10) {
          throw new Error(
            `Expected DPS to drop significantly after clearing. With skill: ${dpsWithSkill}, After clear: ${dpsAfterClear}`
          );
        }

        console.log(`   ✓ DPS with skill: ${dpsWithSkill.toFixed(2)}, after clear: ${dpsAfterClear.toFixed(2)}`);
      },
    },
  ],
};
