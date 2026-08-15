/**
 * Flask Tests
 *
 * Tests flask equipment and their effects on build stats.
 * Flasks use the same item API as other equipment.
 */
import { TestSuite } from './test-utils.js';
import { loadTestBuild } from './test-utils.js';

const DIAMOND_FLASK = `Rarity: MAGIC
Diamond Flask of the Order
Requires Level 27
+35% to Critical Strike Chance
15% increased Attack Speed during Flask effect
15% increased Cast Speed during Flask effect`;

const GRANITE_FLASK = `Rarity: MAGIC
Granite Flask of Iron Skin
Requires Level 27
+3000 to Armour
25% increased Armour during Flask effect`;

export const flaskTests: TestSuite = {
  name: 'Flasks',
  tests: [
    {
      name: 'Equipping diamond flask increases crit chance',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        // Add a skill to enable crit chance calculations
        await runtime.addSocketGroup('Test', [{ name: 'Fireball' }]);

        // Get base crit
        let stats = await runtime.getBuildStats();
        const baseCrit = stats['CritChance'] || 0;

        // Equip diamond flask
        await runtime.equipItem(DIAMOND_FLASK, 'Flask 1');

        // Enable "using flask" condition
        await runtime.setConfig('conditionUsingFlask', true);

        // Activate the flask
        await runtime.activateFlask('Flask 1');

        stats = await runtime.getBuildStats();
        const critWithFlask = stats['CritChance'] || 0;

        // Diamond flask should increase crit chance
        if (critWithFlask <= baseCrit) {
          throw new Error(
            `Expected diamond flask to increase crit. Base: ${baseCrit}%, With flask: ${critWithFlask}%`
          );
        }

        console.log(`   ✓ Crit chance: ${baseCrit}% → ${critWithFlask}%`);
      },
    },

    {
      name: 'Granite flask increases armour rating',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        // Equip some armour first so there's something for granite flask to boost
        const ARMOUR_ITEM = `Rarity: NORMAL
Plate Vest
Armour: 100
Requires Level 8`;
        await runtime.equipItem(ARMOUR_ITEM, 'Body Armour');

        let stats = await runtime.getBuildStats();
        const baseArmour = stats['Armour'] || 0;

        // Equip granite flask
        await runtime.equipItem(GRANITE_FLASK, 'Flask 2');

        // Enable "using flask" condition
        await runtime.setConfig('conditionUsingFlask', true);

        // Activate the flask
        await runtime.activateFlask('Flask 2');

        stats = await runtime.getBuildStats();
        const armourWithFlask = stats['Armour'] || 0;

        // Should gain significant armour
        if (armourWithFlask <= baseArmour + 1000) {
          throw new Error(
            `Expected granite flask to add significant armour. Base: ${baseArmour}, With flask: ${armourWithFlask}`
          );
        }

        console.log(`   ✓ Armour: ${baseArmour} → ${armourWithFlask} (+${armourWithFlask - baseArmour})`);
      },
    },

    {
      name: 'Multiple flasks can be equipped simultaneously',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        // Equip multiple flasks
        await runtime.equipItem(DIAMOND_FLASK, 'Flask 1');
        await runtime.equipItem(GRANITE_FLASK, 'Flask 2');

        const items = await runtime.getEquippedItems();
        const flasks = items.filter(i => i.slot.startsWith('Flask'));

        if (flasks.length !== 2) {
          throw new Error(`Expected 2 flasks, got ${flasks.length}`);
        }

        console.log(`   ✓ Multiple flasks equipped: ${flasks.length} flasks`);
      },
    },

    {
      name: 'Removing flask removes its bonuses',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        // Equip some armour first
        const ARMOUR_ITEM = `Rarity: NORMAL
Plate Vest
Armour: 100
Requires Level 8`;
        await runtime.equipItem(ARMOUR_ITEM, 'Body Armour');

        // Equip granite flask
        await runtime.equipItem(GRANITE_FLASK, 'Flask 1');

        // Enable "using flask" condition
        await runtime.setConfig('conditionUsingFlask', true);

        // Activate the flask
        await runtime.activateFlask('Flask 1');

        let stats = await runtime.getBuildStats();
        const armourWith = stats['Armour'] || 0;

        // Remove flask
        await runtime.unequipItem('Flask 1');

        stats = await runtime.getBuildStats();
        const armourWithout = stats['Armour'] || 0;

        // Armour should drop significantly
        if (armourWithout >= armourWith - 1000) {
          throw new Error(
            `Expected armour to drop after removing flask. With: ${armourWith}, Without: ${armourWithout}`
          );
        }

        console.log(`   ✓ Armour with flask: ${armourWith}, after removal: ${armourWithout}`);
      },
    },

    {
      name: 'Deactivating flask removes its effects',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        // Equip some armour first
        const ARMOUR_ITEM = `Rarity: NORMAL
Plate Vest
Armour: 100
Requires Level 8`;
        await runtime.equipItem(ARMOUR_ITEM, 'Body Armour');

        // Equip and activate granite flask
        await runtime.equipItem(GRANITE_FLASK, 'Flask 1');
        await runtime.setConfig('conditionUsingFlask', true);
        await runtime.activateFlask('Flask 1');

        let stats = await runtime.getBuildStats();
        const armourActivated = stats['Armour'] || 0;

        // Deactivate the flask
        await runtime.activateFlask('Flask 1', false);

        stats = await runtime.getBuildStats();
        const armourDeactivated = stats['Armour'] || 0;

        // Armour should drop significantly after deactivation
        if (armourDeactivated >= armourActivated - 1000) {
          throw new Error(
            `Expected armour to drop after deactivating flask. Activated: ${armourActivated}, Deactivated: ${armourDeactivated}`
          );
        }

        console.log(`   ✓ Armour: ${armourActivated} (active) → ${armourDeactivated} (inactive)`);
      },
    },

    {
      name: 'Cannot activate non-flask item',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        // Equip a non-flask item
        const ARMOUR_ITEM = `Rarity: NORMAL
Plate Vest
Armour: 100
Requires Level 8`;
        await runtime.equipItem(ARMOUR_ITEM, 'Body Armour');

        // Try to activate the body armour as if it were a flask
        try {
          await runtime.activateFlask('Body Armour');
          throw new Error('Expected activateFlask to throw error for non-flask item');
        } catch (error: any) {
          if (!error.message.includes('not a flask')) {
            throw new Error(`Expected "not a flask" error, got: ${error.message}`);
          }
        }

        console.log(`   ✓ Correctly rejected activation of non-flask item`);
      },
    },

    {
      name: 'Cannot activate empty flask slot',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        // Try to activate an empty flask slot
        try {
          await runtime.activateFlask('Flask 1');
          throw new Error('Expected activateFlask to throw error for empty slot');
        } catch (error: any) {
          if (!error.message.includes('No item equipped')) {
            throw new Error(`Expected "No item equipped" error, got: ${error.message}`);
          }
        }

        console.log(`   ✓ Correctly rejected activation of empty flask slot`);
      },
    },
  ],
};
