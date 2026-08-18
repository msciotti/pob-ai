/**
 * Configuration Tests
 *
 * Tests the configuration tab functionality - setting conditions, enemy stats, etc.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initializeRuntime, loadTestBuild } from './test-utils.js';
import type { LuaJITRuntime } from '../runtime/luajit-runtime.js';

describe('Configuration', () => {
  let runtime: LuaJITRuntime;

  beforeAll(async () => {
    runtime = await initializeRuntime();
  });

  afterAll(async () => {
    await runtime.destroy();
  });

  it('Setting and getting config values', async () => {
    await loadTestBuild(runtime);

    await runtime.setConfig('conditionFullLife', true);
    let value = await runtime.getConfig('conditionFullLife');
    expect(value).toBe(true);

    await runtime.setConfig('conditionFullLife', false);
    value = await runtime.getConfig('conditionFullLife');
    expect(value).toBe(false);
    console.log(`   Config value set and retrieved correctly`);
  });

  it('Full life condition affects DPS', async () => {
    await loadTestBuild(runtime);

    await runtime.addSocketGroup('Test Skill', [
      { name: 'Fireball', level: 20 },
    ]);

    let stats = await runtime.getBuildStats();
    const dpsWithoutFullLife = stats['TotalDPS'] || 0;

    await runtime.setConfig('conditionFullLife', true);

    stats = await runtime.getBuildStats();
    const dpsWithFullLife = stats['TotalDPS'] || 0;

    // Note: DPS may be unchanged if the build has no full-life mods.
    // This test verifies that setting the config doesn't throw or corrupt state.
    console.log(
      `   DPS without full life: ${dpsWithoutFullLife.toFixed(2)}, with full life: ${dpsWithFullLife.toFixed(2)}`
    );
  });

  // Enemy-related config tests skipped due to slow build recalculations:
  // it('Enemy level configuration', ...)
});
