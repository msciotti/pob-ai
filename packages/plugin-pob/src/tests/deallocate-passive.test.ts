/**
 * Deallocate Passive / Allocated Nodes Tests
 *
 * Runtime-level tests for deallocatePassive() (backs the deallocate_passive tool) and
 * getAllocatedNodes() (backs the list_allocated_nodes tool), mirroring the style of
 * passive-allocation.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initializeRuntime, loadTestBuild } from './test-utils.js';
import type { LuaJITRuntime } from '../runtime/luajit-runtime.js';

describe('Deallocate Passive', () => {
  let runtime: LuaJITRuntime;

  beforeAll(async () => {
    runtime = await initializeRuntime();
  });

  afterAll(async () => {
    await runtime.destroy();
  });

  it('deallocating Resolute Technique restores crit chance', async () => {
    await loadTestBuild(runtime);

    let stats = await runtime.getBuildStats();
    const initialCrit = stats['CritChance'] || 0;

    await runtime.allocatePassive('Resolute Technique');
    stats = await runtime.getBuildStats();
    expect(stats['CritChance'] || 0).toBe(0);

    await runtime.deallocatePassive('Resolute Technique');
    stats = await runtime.getBuildStats();
    const finalCrit = stats['CritChance'] || 0;

    expect(finalCrit).toBe(initialCrit);
    console.log(`   Crit: 0% (allocated) → ${finalCrit}% (deallocated, matches initial ${initialCrit}%)`);
  });

  it('deallocating a node removes it from getAllocatedNodes and getNodeInfo', async () => {
    await loadTestBuild(runtime);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rt = runtime as any;

    await runtime.allocatePassive('Chaos Inoculation');
    let nodes: Array<{ name: string; isKeystone: boolean }> = await rt.getAllocatedNodes();
    expect(nodes.some((n) => n.name === 'Chaos Inoculation')).toBe(true);

    let info = await rt.getNodeInfo('Chaos Inoculation');
    expect(info.allocated).toBe(true);
    expect(info.isKeystone).toBe(true);

    await runtime.deallocatePassive('Chaos Inoculation');
    nodes = await rt.getAllocatedNodes();
    expect(nodes.some((n) => n.name === 'Chaos Inoculation')).toBe(false);

    info = await rt.getNodeInfo('Chaos Inoculation');
    expect(info.allocated).toBe(false);
  });

  it('deallocating an upstream notable cascades to a keystone reachable only through it', async () => {
    await loadTestBuild(runtime);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rt = runtime as any;

    // Verified empirically against the shared test build: allocating the "Resolute
    // Technique" keystone auto-paths through the "Shaper" notable, which is this
    // build's sole connector to that branch of the tree — nothing else needs it. This
    // is the highest-risk path for deallocate_passive: DeallocNode() must cascade to
    // every node that becomes unreachable, not just the node named in the request.
    await runtime.allocatePassive('Resolute Technique', true);

    let nodes: Array<{ name: string }> = await rt.getAllocatedNodes();
    expect(nodes.some((n) => n.name === 'Shaper')).toBe(true);
    expect(nodes.some((n) => n.name === 'Resolute Technique')).toBe(true);
    const countWithFullChain = nodes.length;

    await runtime.deallocatePassive('Shaper');

    nodes = await rt.getAllocatedNodes();
    expect(nodes.some((n) => n.name === 'Shaper')).toBe(false);
    // The real regression to guard against: only asserting the target node (Shaper) is
    // gone would miss a broken/partial cascade. Resolute Technique was only reachable
    // through Shaper, so it must be gone too — not just still-orphaned-but-allocated.
    expect(nodes.some((n) => n.name === 'Resolute Technique')).toBe(false);
    expect(nodes.length).toBeLessThan(countWithFullChain);

    const rtInfo = await rt.getNodeInfo('Resolute Technique');
    expect(rtInfo.allocated).toBe(false);
    console.log(`   Allocated nodes: ${countWithFullChain} (full chain) → ${nodes.length} (after cascade)`);
  });

  it('deallocating an already-deallocated node is idempotent, not an error', async () => {
    await loadTestBuild(runtime);

    const result = await runtime.deallocatePassive('Chaos Inoculation');
    expect(result.success).toBe(true);
    expect(result.message.toLowerCase()).toContain('already deallocated');
  });

  it('deallocating an unknown node name throws', async () => {
    await loadTestBuild(runtime);

    await expect(runtime.deallocatePassive('Definitely Not A Real Passive Node')).rejects.toThrow(
      /not found/i
    );
  });
});
