/**
 * allocate_passive tool-level regression test (issue #64).
 *
 * The before/after stat diff used to only check a fixed subset of stats
 * (KEY_BUILD_STATS), so CritChance -- Resolute Technique's headline effect --
 * never showed up. This exercises the actual tool handler (not just the
 * runtime) against a real PoB build to confirm the diff now surfaces it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initializeRuntime, loadTestBuild } from './test-utils.js';
import { allocatePassiveTool } from '../tools/allocate-passive.js';
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

describe('allocate_passive tool — stat diff', () => {
  let runtime: LuaJITRuntime;

  beforeAll(async () => {
    runtime = await initializeRuntime();
  });

  afterAll(async () => {
    await runtime.destroy();
  });

  it('includes CritChance in the diff when allocating Resolute Technique', async () => {
    await loadTestBuild(runtime);

    // The shared test build has no weapon equipped, so it already has 0%
    // crit chance -- Resolute Technique would have nothing to change. Equip
    // a weapon with real crit chance first so the effect is observable,
    // same pattern as item-equip.test.ts.
    const dagger = `Test Dagger
Ambusher
Rare
Quality: +20%
Physical Damage: 10-20
Critical Strike Chance: 6.00%
Attacks per Second: 1.5`;
    await runtime.equipItem(dagger, 'Weapon 1');

    const ctx = makeCtx(runtime);

    const result = await allocatePassiveTool.handler(
      { nodeName: 'Resolute Technique', autoPath: true },
      ctx
    );

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.statChanges).toHaveProperty('CritChance');
    expect(parsed.statChanges.CritChance.after).toBe(0);
    expect(parsed.statChanges.CritChance.delta).toBeLessThan(0);

    console.log(`   CritChance diff: ${JSON.stringify(parsed.statChanges.CritChance)}`);
  });

  it('the diff is capped at a sane size and stays valid JSON for a normal allocation', async () => {
    await loadTestBuild(runtime);
    const ctx = makeCtx(runtime);

    // Node availability from the test build's tree position varies by
    // pathing, same fallback pattern used in passive-allocation.test.ts.
    let result = await allocatePassiveTool.handler({ nodeName: 'Constitution', autoPath: true }, ctx);
    if (result.isError) {
      result = await allocatePassiveTool.handler({ nodeName: 'Heart of the Warrior', autoPath: true }, ctx);
    }

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
