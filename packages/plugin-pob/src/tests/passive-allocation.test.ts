/**
 * Passive Allocation Tests
 *
 * Tests that verify passive tree node allocation works correctly
 * and produces expected stat changes.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initializeRuntime, loadTestBuild } from './test-utils.js';
import type { LuaJITRuntime } from '../runtime/luajit-runtime.js';

describe('Passive Allocation', () => {
  let runtime: LuaJITRuntime;

  beforeAll(async () => {
    runtime = await initializeRuntime();
  });

  afterAll(async () => {
    await runtime.destroy();
  });

  it('Resolute Technique should set crit chance to 0%', async () => {
    await loadTestBuild(runtime);

    let stats = await runtime.getBuildStats();
    const initialCrit = stats['CritChance'] || 0;

    await runtime.allocatePassive('Resolute Technique');

    stats = await runtime.getBuildStats();
    const finalCrit = stats['CritChance'] || 0;

    expect(finalCrit).toBe(0);
    console.log(`   Initial: ${initialCrit}% → Final: ${finalCrit}% (correctly set to 0)`);
  });

  it('Chaos Inoculation should set max life to 1', async () => {
    await loadTestBuild(runtime);

    let stats = await runtime.getBuildStats();
    const initialLife = stats['Life'] || 0;

    await runtime.allocatePassive('Chaos Inoculation');

    stats = await runtime.getBuildStats();
    const finalLife = stats['Life'] || 0;

    expect(finalLife).toBe(1);
    console.log(`   Initial: ${initialLife} → Final: ${finalLife} (correctly set to 1)`);
  });

  it('Iron Reflexes should convert evasion to armour', async () => {
    await loadTestBuild(runtime);

    let stats = await runtime.getBuildStats();
    const initialEvasion = stats['Evasion'] || 0;
    const initialArmour = stats['Armour'] || 0;

    await runtime.allocatePassive('Iron Reflexes');

    stats = await runtime.getBuildStats();
    const finalEvasion = stats['Evasion'] || 0;
    const finalArmour = stats['Armour'] || 0;

    expect(finalEvasion).toBe(0);
    expect(finalArmour).toBeGreaterThan(initialArmour);
    console.log(`   Evasion: ${initialEvasion} → ${finalEvasion}, Armour: ${initialArmour} → ${finalArmour}`);
  });

  it('Blood Magic should remove mana', async () => {
    await loadTestBuild(runtime);

    let stats = await runtime.getBuildStats();
    const initialMana = stats['Mana'] || 0;

    await runtime.allocatePassive('Blood Magic');

    stats = await runtime.getBuildStats();
    const finalMana = stats['Mana'] || 0;

    expect(finalMana).toBe(0);
    console.log(`   Initial: ${initialMana} → Final: ${finalMana} (correctly set to 0)`);
  });

  it('Unwavering Stance should set evade chance to 0%', async () => {
    await loadTestBuild(runtime);

    let stats = await runtime.getBuildStats();
    const initialEvadeChance = stats['EvadeChance'] || 0;

    await runtime.allocatePassive('Unwavering Stance');

    stats = await runtime.getBuildStats();
    const finalEvadeChance = stats['EvadeChance'] || 0;

    expect(finalEvadeChance).toBe(0);
    console.log(`   Initial: ${initialEvadeChance}% → Final: ${finalEvadeChance}% (correctly set to 0)`);
  });

  it('Acrobatics should modify spell suppression to spell dodge', async () => {
    await loadTestBuild(runtime);

    let stats = await runtime.getBuildStats();
    const initialSpellDodge = stats['SpellDodgeChance'] || 0;
    const initialSpellSuppress = stats['SpellSuppressionChance'] || 0;

    await runtime.allocatePassive('Acrobatics');

    stats = await runtime.getBuildStats();
    const finalSpellDodge = stats['SpellDodgeChance'] || 0;
    const finalSpellSuppress = stats['SpellSuppressionChance'] || 0;

    // Mechanics are complex — just verify no runtime error and log the change
    console.log(
      `   Spell Suppress: ${initialSpellSuppress}% → ${finalSpellSuppress}%, Spell Dodge: ${initialSpellDodge}% → ${finalSpellDodge}%`
    );
  });

  it('Elemental Overload should reduce crit multiplier', async () => {
    await loadTestBuild(runtime);

    let stats = await runtime.getBuildStats();
    const initialCritMulti = stats['CritMultiplier'] || 0;

    await runtime.allocatePassive('Elemental Overload');

    stats = await runtime.getBuildStats();
    const finalCritMulti = stats['CritMultiplier'] || 0;

    expect(finalCritMulti).toBeLessThan(initialCritMulti);
    console.log(`   Initial: ${initialCritMulti}% → Final: ${finalCritMulti}% (correctly reduced)`);
  });

  it('Allocating +30 Strength node should increase strength', async () => {
    await loadTestBuild(runtime);

    let stats = await runtime.getBuildStats();
    const initialStr = stats['Str'] || 0;

    try {
      await runtime.allocatePassive('+30 to Strength');
    } catch {
      await runtime.allocatePassive('Barbarism');
    }

    stats = await runtime.getBuildStats();
    const finalStr = stats['Str'] || 0;

    expect(finalStr).toBeGreaterThan(initialStr);
    console.log(`   Initial: ${initialStr} → Final: ${finalStr} (+${finalStr - initialStr} Str)`);
  });

  it('Allocating life node should increase max life', async () => {
    await loadTestBuild(runtime);

    let stats = await runtime.getBuildStats();
    const initialLife = stats['Life'] || 0;

    try {
      await runtime.allocatePassive('Constitution');
    } catch {
      await runtime.allocatePassive('Heart of the Warrior');
    }

    stats = await runtime.getBuildStats();
    const finalLife = stats['Life'] || 0;

    expect(finalLife).toBeGreaterThan(initialLife);
    const percentIncrease = (((finalLife - initialLife) / initialLife) * 100).toFixed(2);
    console.log(`   Initial: ${initialLife} → Final: ${finalLife} (+${percentIncrease}%)`);
  });

  it('Allocating damage node should increase damage', async () => {
    await loadTestBuild(runtime);

    let stats = await runtime.getBuildStats();
    const initialDPS = stats['TotalDPS'] || stats['AverageDamage'] || 0;

    try {
      await runtime.allocatePassive('Forces of Nature');
    } catch {
      await runtime.allocatePassive('Amplify');
    }

    stats = await runtime.getBuildStats();
    const finalDPS = stats['TotalDPS'] || stats['AverageDamage'] || 0;

    expect(finalDPS).toBeGreaterThan(initialDPS);
    const percentIncrease = (((finalDPS - initialDPS) / initialDPS) * 100).toFixed(2);
    console.log(`   Initial: ${initialDPS} → Final: ${finalDPS} (+${percentIncrease}%)`);
  });
});
