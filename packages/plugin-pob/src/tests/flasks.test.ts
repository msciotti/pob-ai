/**
 * Flask Tests
 *
 * Tests flask equipment and their effects on build stats.
 * Flasks use the same item API as other equipment.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initializeRuntime, loadTestBuild } from './test-utils.js';
import type { LuaJITRuntime } from '../runtime/luajit-runtime.js';

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

describe('Flasks', () => {
  let runtime: LuaJITRuntime;

  beforeAll(async () => {
    runtime = await initializeRuntime();
  });

  afterAll(async () => {
    await runtime.destroy();
  });

  it('Equipping diamond flask increases crit chance', async () => {
    await loadTestBuild(runtime);

    await runtime.addSocketGroup('Test', [{ name: 'Fireball' }]);

    let stats = await runtime.getBuildStats();
    const baseCrit = stats['CritChance'] || 0;

    await runtime.equipItem(DIAMOND_FLASK, 'Flask 1');
    await runtime.setConfig('conditionUsingFlask', true);
    await runtime.activateFlask('Flask 1');

    stats = await runtime.getBuildStats();
    const critWithFlask = stats['CritChance'] || 0;

    expect(critWithFlask).toBeGreaterThan(baseCrit);
    console.log(`   Crit chance: ${baseCrit}% → ${critWithFlask}%`);
  });

  it('Granite flask increases armour rating', async () => {
    await loadTestBuild(runtime);

    const ARMOUR_ITEM = `Rarity: NORMAL
Plate Vest
Armour: 100
Requires Level 8`;
    await runtime.equipItem(ARMOUR_ITEM, 'Body Armour');

    let stats = await runtime.getBuildStats();
    const baseArmour = stats['Armour'] || 0;

    await runtime.equipItem(GRANITE_FLASK, 'Flask 2');
    await runtime.setConfig('conditionUsingFlask', true);
    await runtime.activateFlask('Flask 2');

    stats = await runtime.getBuildStats();
    const armourWithFlask = stats['Armour'] || 0;

    expect(armourWithFlask).toBeGreaterThan(baseArmour + 1000);
    console.log(`   Armour: ${baseArmour} → ${armourWithFlask} (+${armourWithFlask - baseArmour})`);
  });

  it('Multiple flasks can be equipped simultaneously', async () => {
    await loadTestBuild(runtime);

    await runtime.equipItem(DIAMOND_FLASK, 'Flask 1');
    await runtime.equipItem(GRANITE_FLASK, 'Flask 2');

    const items = await runtime.getEquippedItems();
    const flasks = items.filter(i => i.slot.startsWith('Flask'));

    expect(flasks).toHaveLength(2);
    console.log(`   Multiple flasks equipped: ${flasks.length} flasks`);
  });

  it('Removing flask removes its bonuses', async () => {
    await loadTestBuild(runtime);

    const ARMOUR_ITEM = `Rarity: NORMAL
Plate Vest
Armour: 100
Requires Level 8`;
    await runtime.equipItem(ARMOUR_ITEM, 'Body Armour');
    await runtime.equipItem(GRANITE_FLASK, 'Flask 1');
    await runtime.setConfig('conditionUsingFlask', true);
    await runtime.activateFlask('Flask 1');

    let stats = await runtime.getBuildStats();
    const armourWith = stats['Armour'] || 0;

    await runtime.unequipItem('Flask 1');

    stats = await runtime.getBuildStats();
    const armourWithout = stats['Armour'] || 0;

    expect(armourWithout).toBeLessThan(armourWith - 1000);
    console.log(`   Armour with flask: ${armourWith}, after removal: ${armourWithout}`);
  });

  it('Deactivating flask removes its effects', async () => {
    await loadTestBuild(runtime);

    const ARMOUR_ITEM = `Rarity: NORMAL
Plate Vest
Armour: 100
Requires Level 8`;
    await runtime.equipItem(ARMOUR_ITEM, 'Body Armour');
    await runtime.equipItem(GRANITE_FLASK, 'Flask 1');
    await runtime.setConfig('conditionUsingFlask', true);
    await runtime.activateFlask('Flask 1');

    let stats = await runtime.getBuildStats();
    const armourActivated = stats['Armour'] || 0;

    await runtime.activateFlask('Flask 1', false);

    stats = await runtime.getBuildStats();
    const armourDeactivated = stats['Armour'] || 0;

    expect(armourDeactivated).toBeLessThan(armourActivated - 1000);
    console.log(`   Armour: ${armourActivated} (active) → ${armourDeactivated} (inactive)`);
  });

  it('Cannot activate non-flask item', async () => {
    await loadTestBuild(runtime);

    const ARMOUR_ITEM = `Rarity: NORMAL
Plate Vest
Armour: 100
Requires Level 8`;
    await runtime.equipItem(ARMOUR_ITEM, 'Body Armour');

    await expect(runtime.activateFlask('Body Armour')).rejects.toThrow('not a flask');
    console.log(`   Correctly rejected activation of non-flask item`);
  });

  it('Cannot activate empty flask slot', async () => {
    await loadTestBuild(runtime);

    await expect(runtime.activateFlask('Flask 1')).rejects.toThrow('No item equipped');
    console.log(`   Correctly rejected activation of empty flask slot`);
  });
});
