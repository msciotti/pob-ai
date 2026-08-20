/**
 * Skill Gem Tests
 *
 * Tests that verify changing skill gems works correctly
 * and produces expected stat changes.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initializeRuntime, loadTestBuild } from './test-utils.js';
import type { LuaJITRuntime } from '../runtime/luajit-runtime.js';

describe('Skill Gems', () => {
  let runtime: LuaJITRuntime;

  beforeAll(async () => {
    runtime = await initializeRuntime();
  });

  afterAll(async () => {
    await runtime.destroy();
  });

  it('Adding a skill gem should enable DPS calculations', async () => {
    await loadTestBuild(runtime);

    let stats = await runtime.getBuildStats();
    const initialDPS = stats['TotalDPS'] || 0;

    await runtime.addSocketGroup('Fireball', [{ name: 'Fireball', level: 20, quality: 0 }]);

    stats = await runtime.getBuildStats();
    const finalDPS = stats['TotalDPS'] || 0;

    expect(finalDPS).toBeGreaterThan(initialDPS * 10);
    console.log(
      `   DPS: ${initialDPS.toFixed(2)} → ${finalDPS.toFixed(2)} (${((finalDPS / initialDPS - 1) * 100).toFixed(0)}x increase)`
    );
  });

  it('Adding support gems should modify skill damage', async () => {
    await loadTestBuild(runtime);

    await runtime.addSocketGroup('Fireball Only', [{ name: 'Fireball', level: 20, quality: 0 }]);

    let stats = await runtime.getBuildStats();
    const dpsWithoutSupport = stats['TotalDPS'] || 0;

    await runtime.clearSocketGroups();
    await runtime.addSocketGroup('Fireball + GMP', [
      { name: 'Fireball', level: 20, quality: 0 },
      { name: 'Greater Multiple Projectiles', level: 20, quality: 0 },
    ]);

    stats = await runtime.getBuildStats();
    const dpsWithGMP = stats['TotalDPS'] || 0;

    // GMP changes single-target DPS (could increase or decrease)
    expect(dpsWithGMP).not.toBe(dpsWithoutSupport);
    console.log(
      `   DPS without support: ${dpsWithoutSupport.toFixed(2)}, with GMP: ${dpsWithGMP.toFixed(2)}`
    );
  });

  it('Gem level should affect skill damage', async () => {
    await loadTestBuild(runtime);

    await runtime.addSocketGroup('Fireball L1', [{ name: 'Fireball', level: 1, quality: 0 }]);

    let stats = await runtime.getBuildStats();
    const dpsLevel1 = stats['TotalDPS'] || 0;

    await runtime.clearSocketGroups();
    await runtime.addSocketGroup('Fireball L20', [{ name: 'Fireball', level: 20, quality: 0 }]);

    stats = await runtime.getBuildStats();
    const dpsLevel20 = stats['TotalDPS'] || 0;

    expect(dpsLevel20).toBeGreaterThan(dpsLevel1 * 2);
    const increase = ((dpsLevel20 / dpsLevel1 - 1) * 100).toFixed(0);
    console.log(`   DPS L1: ${dpsLevel1.toFixed(2)}, L20: ${dpsLevel20.toFixed(2)} (+${increase}%)`);
  });

  it('Gem quality can be set on gems', async () => {
    await loadTestBuild(runtime);

    await runtime.addSocketGroup('Quality Test', [
      { name: 'Fireball', level: 20, quality: 0 },
    ]);

    let groups = await runtime.getSocketGroups();
    expect(groups[0].gems[0].quality).toBe(0);

    await runtime.clearSocketGroups();
    await runtime.addSocketGroup('Quality Test 20', [
      { name: 'Fireball', level: 20, quality: 20 },
    ]);

    groups = await runtime.getSocketGroups();
    expect(groups[0].gems[0].quality).toBe(20);
    console.log(`   Gem quality correctly set: 0% and 20%`);
  });

  it('Multiple support gems should stack effects', async () => {
    await loadTestBuild(runtime);

    await runtime.addSocketGroup('1 Support', [
      { name: 'Fireball', level: 20, quality: 0 },
      { name: 'Greater Multiple Projectiles', level: 20, quality: 0 },
    ]);

    let stats = await runtime.getBuildStats();
    const dpsOneSupport = stats['TotalDPS'] || 0;

    await runtime.clearSocketGroups();
    await runtime.addSocketGroup('Multiple Supports', [
      { name: 'Fireball', level: 20, quality: 0 },
      { name: 'Greater Multiple Projectiles', level: 20, quality: 0 },
      { name: 'Spell Echo', level: 20, quality: 0 },
      { name: 'Elemental Focus', level: 20, quality: 0 },
    ]);

    stats = await runtime.getBuildStats();
    const dpsMultiSupport = stats['TotalDPS'] || 0;

    expect(dpsMultiSupport).not.toBe(dpsOneSupport);
    console.log(
      `   DPS 1 support: ${dpsOneSupport.toFixed(2)}, 3 supports: ${dpsMultiSupport.toFixed(2)}`
    );
  });

  it('getSocketGroups reports gem tags and support flag correctly', async () => {
    await loadTestBuild(runtime);

    await runtime.addSocketGroup('Tagged Test', [
      { name: 'Fireball', level: 20, quality: 0 },
      { name: 'Elemental Focus', level: 20, quality: 0 },
    ]);

    const groups = await runtime.getSocketGroups();
    const [activeGem, supportGem] = groups[0].gems;

    // Active skill: not a support, tagged fire/spell (Gems.lua's tags table for Fireball).
    expect(activeGem.name).toBe('Fireball');
    expect(activeGem.support).toBe(false);
    expect(activeGem.tags?.fire).toBe(true);
    expect(activeGem.tags?.spell).toBe(true);

    // Support gem: flagged as a support, tagged accordingly — not an active/damage skill.
    expect(supportGem.name).toBe('Elemental Focus');
    expect(supportGem.support).toBe(true);
    expect(supportGem.tags?.support).toBe(true);

    console.log(
      `   Fireball: support=${activeGem.support}, tags=${JSON.stringify(activeGem.tags)}; ` +
        `Elemental Focus: support=${supportGem.support}, tags=${JSON.stringify(supportGem.tags)}`
    );
  });

  it('Clearing socket groups should reset DPS', async () => {
    await loadTestBuild(runtime);

    await runtime.addSocketGroup('Fireball', [{ name: 'Fireball', level: 20, quality: 0 }]);

    let stats = await runtime.getBuildStats();
    const dpsWithSkill = stats['TotalDPS'] || 0;

    await runtime.clearSocketGroups();

    stats = await runtime.getBuildStats();
    const dpsAfterClear = stats['TotalDPS'] || 0;

    expect(dpsAfterClear).toBeLessThan(dpsWithSkill / 10);
    console.log(
      `   DPS with skill: ${dpsWithSkill.toFixed(2)}, after clear: ${dpsAfterClear.toFixed(2)}`
    );
  });
});
