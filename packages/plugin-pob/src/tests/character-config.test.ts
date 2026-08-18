/**
 * Character Configuration Tests
 *
 * Tests character-level configuration including level, class,
 * ascendancy, bandit rewards, and pantheon selection.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initializeRuntime, loadTestBuild } from './test-utils.js';
import type { LuaJITRuntime } from '../runtime/luajit-runtime.js';

describe('Character Configuration', () => {
  let runtime: LuaJITRuntime;

  beforeAll(async () => {
    runtime = await initializeRuntime();
  });

  afterAll(async () => {
    await runtime.destroy();
  });

  it('Changing character level should be reflected', async () => {
    await loadTestBuild(runtime);

    await runtime.setCharacterLevel(50);
    let level = await runtime.getCharacterLevel();
    expect(level).toBe(50);

    await runtime.setCharacterLevel(90);
    level = await runtime.getCharacterLevel();
    expect(level).toBe(90);
    console.log(`   Character level: 50 → 90`);
  });

  it('Changing character class changes base stats', async () => {
    await loadTestBuild(runtime);

    await runtime.setCharacterClass('MARAUDER');
    let className = await runtime.getCharacterClass();
    let stats = await runtime.getBuildStats();
    const marauderStr = stats['Str'] || 0;

    expect(className).toBe('Marauder');

    await runtime.setCharacterClass('WITCH');
    className = await runtime.getCharacterClass();
    stats = await runtime.getBuildStats();
    const witchStr = stats['Str'] || 0;
    const witchInt = stats['Int'] || 0;

    expect(className).toBe('Witch');
    expect(witchStr).toBeLessThan(marauderStr);
    console.log(`   Marauder Str: ${marauderStr}, Witch Str: ${witchStr}, Witch Int: ${witchInt}`);
  });

  it('Setting ascendancy can be retrieved', async () => {
    await loadTestBuild(runtime);

    await runtime.setCharacterClass('MARAUDER');
    await runtime.setAscendancy('Juggernaut');

    const ascend = await runtime.getAscendancy();
    expect(ascend).toBe('Juggernaut');
    console.log(`   Ascendancy set to: ${ascend}`);
  });

  it('Bandit choice can be set', async () => {
    await loadTestBuild(runtime);

    await runtime.setBandit('None');
    await runtime.setBandit('Alira');

    // No error thrown means success
    console.log(`   Bandit set: None → Alira`);
  });

  it('Pantheon choices can be set', async () => {
    await loadTestBuild(runtime);

    await runtime.setPantheon('Soul of Lunaris', 'Soul of Gruthkul');

    // No error thrown means success
    console.log(`   Pantheon set: Lunaris (major), Gruthkul (minor)`);
  });
});
