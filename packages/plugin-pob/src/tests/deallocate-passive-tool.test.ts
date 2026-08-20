/**
 * deallocate_passive tool-level regression test -- mirrors
 * allocate-passive-tool.test.ts (issue #64 / harmonization pass).
 *
 * deallocate_passive used to compute its before/after diff against the same
 * fixed KEY_BUILD_STATS subset allocate_passive did before #66, so it had
 * the identical gap: CritChance recovering when Resolute Technique is
 * deallocated never showed up. Now both tools share computeStatChanges().
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initializeRuntime, loadTestBuild } from './test-utils.js';
import { deallocatePassiveTool } from '../tools/deallocate-passive.js';
import type { LuaJITRuntime } from '../runtime/luajit-runtime.js';
import type { PluginContext } from '@poe-ai/core';

function makeCtx(runtime: LuaJITRuntime): PluginContext {
  return {
    pobRuntime: runtime,
    http: { get: async () => { throw new Error('not used'); }, post: async () => { throw new Error('not used'); } },
    cache: { get: () => undefined, set: () => {}, delete: () => {}, clear: () => {} },
    leagueState: { currentLeague: 'Standard', patchVersion: '3.26.0', hardcore: false, ssf: false },
    logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  };
}

describe('deallocate_passive tool — stat diff', () => {
  let runtime: LuaJITRuntime;

  beforeAll(async () => {
    runtime = await initializeRuntime();
  });

  afterAll(async () => {
    await runtime.destroy();
  });

  it('includes CritChance recovering in the diff when deallocating Resolute Technique', async () => {
    await loadTestBuild(runtime);

    // Same setup as the allocate-side test: the shared test build has no
    // weapon equipped (0% crit chance already), so equip one with real crit
    // chance, then allocate Resolute Technique to zero it out first -- the
    // deallocation should show that crit chance coming back.
    const dagger = `Test Dagger
Ambusher
Rare
Quality: +20%
Physical Damage: 10-20
Critical Strike Chance: 6.00%
Attacks per Second: 1.5`;
    await runtime.equipItem(dagger, 'Weapon 1');
    await runtime.allocatePassive('Resolute Technique', true);

    const statsWithRT = await runtime.getBuildStats();
    expect(statsWithRT['CritChance'] || 0).toBe(0);

    const ctx = makeCtx(runtime);
    const result = await deallocatePassiveTool.handler({ nodeName: 'Resolute Technique' }, ctx);

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.statChanges).toHaveProperty('CritChance');
    expect(parsed.statChanges.CritChance.before).toBe(0);
    expect(parsed.statChanges.CritChance.after).toBeGreaterThan(0);
    expect(parsed.statChanges.CritChance.delta).toBeGreaterThan(0);

    console.log(`   CritChance diff: ${JSON.stringify(parsed.statChanges.CritChance)}`);
  });

  it('the diff is capped at a sane size and stays valid JSON for a normal deallocation', async () => {
    await loadTestBuild(runtime);

    // Node availability from the test build's tree position varies by
    // pathing, same fallback pattern used elsewhere in this suite.
    let allocatedNode = 'Constitution';
    try {
      await runtime.allocatePassive(allocatedNode, true);
    } catch {
      allocatedNode = 'Heart of the Warrior';
      await runtime.allocatePassive(allocatedNode, true);
    }

    const ctx = makeCtx(runtime);
    const result = await deallocatePassiveTool.handler({ nodeName: allocatedNode }, ctx);

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    const changedStats = Object.keys(parsed.statChanges);
    expect(changedStats.length).toBeGreaterThan(0);
    expect(changedStats.length).toBeLessThanOrEqual(25);
    for (const stat of changedStats) {
      const { before, after, delta } = parsed.statChanges[stat];
      expect(typeof before).toBe('number');
      expect(typeof after).toBe('number');
      expect(delta).toBeCloseTo(after - before);
    }
  });
});
