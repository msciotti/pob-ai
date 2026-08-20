/**
 * Tool-handler tests for deallocate_passive and list_allocated_nodes, using a mocked
 * ctx.pobRuntime — no LuaJIT dependency. See deallocate-passive.test.ts for the
 * runtime-level (real LuaJIT) coverage of the underlying methods.
 */
import { describe, it, expect, vi } from 'vitest';
import type { PluginContext } from '@poe-ai/core';
import { TtlCache } from '@poe-ai/core';
import { deallocatePassiveTool } from '../tools/deallocate-passive.js';
import { listAllocatedNodesTool } from '../tools/list-allocated-nodes.js';

function makeCtx(pobRuntime?: unknown): PluginContext {
  return {
    pobRuntime,
    http: { get: vi.fn(), post: vi.fn() },
    cache: new TtlCache(),
    leagueState: { currentLeague: 'Standard', patchVersion: '3.29.0', hardcore: false, ssf: false },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('deallocate_passive (mocked ctx)', () => {
  it('returns isError with a clear message when plugin-pob is not loaded', async () => {
    const result = await deallocatePassiveTool.handler({ nodeName: 'Resolute Technique' }, makeCtx(undefined));
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('PoB plugin not loaded');
  });

  it('deallocates and returns a before/after stat diff for known key stats', async () => {
    const runtime = {
      getBuildStats: vi
        .fn()
        .mockResolvedValueOnce({ Life: 1000, TotalDPS: 500 }) // before
        .mockResolvedValueOnce({ Life: 900, TotalDPS: 500 }), // after
      deallocatePassive: vi.fn().mockResolvedValue({ success: true, message: 'Deallocated: Constitution' }),
    };

    const result = await deallocatePassiveTool.handler({ nodeName: 'Constitution' }, makeCtx(runtime));

    expect(result.isError).toBeUndefined();
    const output = JSON.parse(result.content[0].text);
    expect(output.success).toBe(true);
    expect(output.nodeName).toBe('Constitution');
    expect(output.statChanges.Life).toEqual({ before: 1000, after: 900, delta: -100 });
    expect(output.statChanges.TotalDPS).toEqual({ before: 500, after: 500, delta: 0 });
    expect(runtime.deallocatePassive).toHaveBeenCalledWith('Constitution');
  });

  it('reports the "already deallocated" message from the runtime as success', async () => {
    const runtime = {
      getBuildStats: vi.fn().mockResolvedValue({}),
      deallocatePassive: vi
        .fn()
        .mockResolvedValue({ success: true, message: 'Already deallocated: Constitution' }),
    };

    const result = await deallocatePassiveTool.handler({ nodeName: 'Constitution' }, makeCtx(runtime));

    expect(result.isError).toBeUndefined();
    const output = JSON.parse(result.content[0].text);
    expect(output.message).toContain('Already deallocated');
  });

  it('returns isError when the runtime throws (e.g. unknown node name)', async () => {
    const runtime = {
      getBuildStats: vi.fn().mockResolvedValue({}),
      deallocatePassive: vi.fn().mockRejectedValue(new Error('Passive not found: Nope')),
    };

    const result = await deallocatePassiveTool.handler({ nodeName: 'Nope' }, makeCtx(runtime));

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Passive not found: Nope');
  });
});

describe('list_allocated_nodes (mocked ctx)', () => {
  it('returns isError with a clear message when plugin-pob is not loaded', async () => {
    const result = await listAllocatedNodesTool.handler({}, makeCtx(undefined));
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('PoB plugin not loaded');
  });

  it('lists allocated nodes, separating keystones and notables', async () => {
    const runtime = {
      getAllocatedNodes: vi.fn().mockResolvedValue([
        { id: '1', name: 'Constitution', type: 'Notable', isKeystone: false, isNotable: true },
        { id: '2', name: 'Resolute Technique', type: 'Keystone', isKeystone: true, isNotable: false },
        { id: '3', name: 'Some Small Node', type: 'Normal', isKeystone: false, isNotable: false },
      ]),
    };

    const result = await listAllocatedNodesTool.handler({}, makeCtx(runtime));

    expect(result.isError).toBeUndefined();
    const output = JSON.parse(result.content[0].text);
    expect(output.count).toBe(3);
    expect(output.keystones).toEqual(['Resolute Technique']);
    expect(output.notables).toEqual(['Constitution']);
    expect(output.nodes).toHaveLength(3);
  });

  it('returns isError when the runtime call fails (e.g. no build loaded)', async () => {
    const runtime = { getAllocatedNodes: vi.fn().mockRejectedValue(new Error('Build not initialized')) };

    const result = await listAllocatedNodesTool.handler({}, makeCtx(runtime));

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Build not initialized');
  });
});
