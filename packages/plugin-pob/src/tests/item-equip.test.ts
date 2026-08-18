/**
 * Item Equipment Tests
 *
 * Tests that verify equipping items works correctly
 * and produces expected stat changes.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initializeRuntime, loadTestBuild } from './test-utils.js';
import type { LuaJITRuntime } from '../runtime/luajit-runtime.js';

describe('Item Equipment', () => {
  let runtime: LuaJITRuntime;

  beforeAll(async () => {
    runtime = await initializeRuntime();
  });

  afterAll(async () => {
    await runtime.destroy();
  });

  it("Equipping Kaom's Heart should add +1000 life", async () => {
    await loadTestBuild(runtime);

    let stats = await runtime.getBuildStats();
    const initialLife = stats['Life'] || 0;

    const kaomsHeart = `Kaom's Heart
Glorious Plate
Unique
Has no Sockets
+1000 to maximum Life`;

    await runtime.equipItem(kaomsHeart, 'Body Armour');

    stats = await runtime.getBuildStats();
    const finalLife = stats['Life'] || 0;

    const lifeGain = finalLife - initialLife;
    expect(lifeGain).toBeGreaterThanOrEqual(900);
    expect(lifeGain).toBeLessThanOrEqual(1100);
    console.log(`   Life: ${initialLife} → ${finalLife} (+${lifeGain})`);
  });

  it('Equipping Abyssus should increase crit multiplier', async () => {
    await loadTestBuild(runtime);

    let stats = await runtime.getBuildStats();
    const initialCritMulti = stats['CritMultiplier'] || 1.5;

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

    stats = await runtime.getBuildStats();
    const finalCritMulti = stats['CritMultiplier'] || 1.5;

    expect(finalCritMulti).toBeGreaterThan(initialCritMulti);
    const multiIncrease = finalCritMulti - initialCritMulti;
    console.log(
      `   Crit Multi: ${initialCritMulti.toFixed(2)}% → ${finalCritMulti.toFixed(2)}% (+${multiIncrease.toFixed(2)}%)`
    );
  });

  it("Equipping Shavronne's Wrappings should add energy shield", async () => {
    await loadTestBuild(runtime);

    let stats = await runtime.getBuildStats();
    const initialES = stats['EnergyShield'] || 0;

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

    stats = await runtime.getBuildStats();
    const finalES = stats['EnergyShield'] || 0;

    expect(finalES).toBeGreaterThan(initialES);
    console.log(`   Energy Shield: ${initialES} → ${finalES} (+${finalES - initialES})`);
  });

  it('Equipping armor should increase armour rating', async () => {
    await loadTestBuild(runtime);

    let stats = await runtime.getBuildStats();
    const initialArmour = stats['Armour'] || 0;

    const chestArmour = `Rare Plate
Glorious Plate
Rare
Armour: 500
+(80-100) to maximum Life
(120-150)% increased Armour`;

    await runtime.equipItem(chestArmour, 'Body Armour');

    stats = await runtime.getBuildStats();
    const finalArmour = stats['Armour'] || 0;

    expect(finalArmour).toBeGreaterThan(initialArmour);
    console.log(`   Armour: ${initialArmour} → ${finalArmour} (+${finalArmour - initialArmour})`);
  });

  it('Equipping a ring should apply its modifiers', async () => {
    await loadTestBuild(runtime);

    let stats = await runtime.getBuildStats();
    const initialLife = stats['Life'] || 0;

    const ring = `Life Ring
Gold Ring
Rare
Rarity: Rare
+(60-80) to maximum Life
+(20-30)% to Fire Resistance`;

    await runtime.equipItem(ring, 'Ring 1');

    stats = await runtime.getBuildStats();
    const finalLife = stats['Life'] || 0;

    expect(finalLife).toBeGreaterThan(initialLife);
    console.log(`   Life from ring: ${initialLife} → ${finalLife} (+${finalLife - initialLife})`);
  });

  it('Unequipping an item should remove its bonuses', async () => {
    await loadTestBuild(runtime);

    const kaomsHeart = `Kaom's Heart
Glorious Plate
Unique
Has no Sockets
+1000 to maximum Life`;

    await runtime.equipItem(kaomsHeart, 'Body Armour');

    let stats = await runtime.getBuildStats();
    const lifeWithKaoms = stats['Life'] || 0;

    await runtime.unequipItem('Body Armour');

    stats = await runtime.getBuildStats();
    const lifeAfterUnequip = stats['Life'] || 0;

    const lifeLost = lifeWithKaoms - lifeAfterUnequip;
    expect(lifeLost).toBeGreaterThanOrEqual(900);
    expect(lifeLost).toBeLessThanOrEqual(1100);
    console.log(`   Unequip: ${lifeWithKaoms} → ${lifeAfterUnequip} (-${lifeLost} life)`);
  });
});
