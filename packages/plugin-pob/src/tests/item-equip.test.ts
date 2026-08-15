/**
 * Item Equipment Tests
 *
 * Tests that verify equipping items works correctly
 * and produces expected stat changes.
 */
import { TestSuite } from './test-utils.js';
import { loadTestBuild } from './test-utils.js';

export const itemEquipTests: TestSuite = {
  name: 'Item Equipment',
  tests: [
    {
      name: "Equipping Kaom's Heart should add +1000 life",
      run: async (runtime) => {
        await loadTestBuild(runtime);

        // Get initial life
        let stats = await runtime.getBuildStats();
        const initialLife = stats['Life'] || 0;

        // Equip Kaom's Heart
        const kaomsHeart = `Kaom's Heart
Glorious Plate
Unique
Has no Sockets
+1000 to maximum Life`;

        await runtime.equipItem(kaomsHeart, 'Body Armour');

        // Get final life
        stats = await runtime.getBuildStats();
        const finalLife = stats['Life'] || 0;

        // Verify life increased by approximately 1000 (accounting for % increases from tree)
        const lifeGain = finalLife - initialLife;
        if (lifeGain < 900 || lifeGain > 1100) {
          throw new Error(
            `Expected life gain around 1000, but got ${lifeGain} (${initialLife} → ${finalLife})`
          );
        }

        console.log(`   ✓ Life: ${initialLife} → ${finalLife} (+${lifeGain})`);
      },
    },

    {
      name: "Equipping Abyssus should increase crit multiplier",
      run: async (runtime) => {
        await loadTestBuild(runtime);

        // Get initial crit multiplier
        let stats = await runtime.getBuildStats();
        const initialCritMulti = stats['CritMultiplier'] || 1.5;

        // Equip Abyssus
        const abyssus = `Abyssus
Ezomyte Burgonet
Unique
Requires Level 60, 138 Str
Adds 40 to 60 Physical Damage to Attacks
+(20-25) to all Attributes
+(100-125)% to Melee Critical Strike Multiplier
(100-120)% increased Armour
(40-50)% increased Physical Damage taken`;

        await runtime.equipItem(abyssus, 'Helmet');

        // Get final crit multiplier
        stats = await runtime.getBuildStats();
        const finalCritMulti = stats['CritMultiplier'] || 1.5;

        // Verify crit multi increased
        if (finalCritMulti <= initialCritMulti) {
          throw new Error(
            `Expected crit multiplier to increase. Initial: ${initialCritMulti}%, Final: ${finalCritMulti}%`
          );
        }

        const multiIncrease = finalCritMulti - initialCritMulti;
        console.log(
          `   ✓ Crit Multi: ${initialCritMulti.toFixed(2)}% → ${finalCritMulti.toFixed(2)}% (+${multiIncrease.toFixed(2)}%)`
        );
      },
    },

    {
      name: "Equipping Shavronne's Wrappings should add energy shield",
      run: async (runtime) => {
        await loadTestBuild(runtime);

        // Get initial energy shield
        let stats = await runtime.getBuildStats();
        const initialES = stats['EnergyShield'] || 0;

        // Equip Shavronne's Wrappings
        const shavronnes = `Shavronne's Wrappings
Occultist's Vestment
Unique
Implicits: 1
(3-10)% increased Spell Damage
(100-150)% increased Energy Shield
10% faster start of Energy Shield Recharge
+(30-40)% to Lightning Resistance
Reflects 1 to 250 Lightning Damage to Melee Attackers
Chaos Damage does not bypass Energy Shield`;

        await runtime.equipItem(shavronnes, 'Body Armour');

        // Get final energy shield
        stats = await runtime.getBuildStats();
        const finalES = stats['EnergyShield'] || 0;

        // Verify ES increased
        if (finalES <= initialES) {
          throw new Error(
            `Expected energy shield to increase. Initial: ${initialES}, Final: ${finalES}`
          );
        }

        console.log(`   ✓ Energy Shield: ${initialES} → ${finalES} (+${finalES - initialES})`);
      },
    },

    {
      name: 'Equipping armor should increase armour rating',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        // Get initial armour
        let stats = await runtime.getBuildStats();
        const initialArmour = stats['Armour'] || 0;

        // Equip a simple rare chest with armour
        const chestArmour = `Rare Plate
Glorious Plate
Rare
Armour: 500
+(80-100) to maximum Life
(120-150)% increased Armour`;

        await runtime.equipItem(chestArmour, 'Body Armour');

        // Get final armour
        stats = await runtime.getBuildStats();
        const finalArmour = stats['Armour'] || 0;

        // Verify armour increased
        if (finalArmour <= initialArmour) {
          throw new Error(
            `Expected armour to increase. Initial: ${initialArmour}, Final: ${finalArmour}`
          );
        }

        console.log(`   ✓ Armour: ${initialArmour} → ${finalArmour} (+${finalArmour - initialArmour})`);
      },
    },

    {
      name: 'Equipping a ring should apply its modifiers',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        // Get initial life
        let stats = await runtime.getBuildStats();
        const initialLife = stats['Life'] || 0;

        // Equip a ring with life
        const ring = `Life Ring
Gold Ring
Rare
Rarity: Rare
+(60-80) to maximum Life
+(20-30)% to Fire Resistance`;

        await runtime.equipItem(ring, 'Ring 1');

        // Get final life
        stats = await runtime.getBuildStats();
        const finalLife = stats['Life'] || 0;

        // Verify life increased
        if (finalLife <= initialLife) {
          throw new Error(
            `Expected life to increase from ring. Initial: ${initialLife}, Final: ${finalLife}`
          );
        }

        console.log(`   ✓ Life from ring: ${initialLife} → ${finalLife} (+${finalLife - initialLife})`);
      },
    },

    {
      name: 'Unequipping an item should remove its bonuses',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        // Equip Kaom's Heart first
        const kaomsHeart = `Kaom's Heart
Glorious Plate
Unique
Has no Sockets
+1000 to maximum Life`;

        await runtime.equipItem(kaomsHeart, 'Body Armour');

        let stats = await runtime.getBuildStats();
        const lifeWithKaoms = stats['Life'] || 0;

        // Unequip it
        await runtime.unequipItem('Body Armour');

        stats = await runtime.getBuildStats();
        const lifeAfterUnequip = stats['Life'] || 0;

        // Verify life decreased significantly
        const lifeLost = lifeWithKaoms - lifeAfterUnequip;
        if (lifeLost < 900 || lifeLost > 1100) {
          throw new Error(
            `Expected to lose ~1000 life after unequipping Kaom's. Lost: ${lifeLost}`
          );
        }

        console.log(
          `   ✓ Unequip: ${lifeWithKaoms} → ${lifeAfterUnequip} (-${lifeLost} life)`
        );
      },
    },
  ],
};
