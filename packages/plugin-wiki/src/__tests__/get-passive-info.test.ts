import { describe, it, expect, vi } from 'vitest';
import type { PluginContext } from '@poe-ai/core';
import { TtlCache } from '@poe-ai/core';
import { getPassiveInfoTool } from '../tools/get-passive-info.js';

function makeCtx(overrides: Partial<PluginContext> = {}): PluginContext {
  return {
    http: { get: vi.fn(), post: vi.fn() },
    cache: new TtlCache(),
    leagueState: { currentLeague: 'Standard', patchVersion: '3.29.0', hardcore: false, ssf: false },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const FAKE_PAGE_RESPONSE = {
  query: {
    pages: {
      '123': {
        pageid: 123,
        title: 'Resolute Technique',
        extract: 'Never deal critical strikes. Your hits can never be Evaded.',
      },
    },
  },
};

describe('get_passive_info', () => {
  it('omits the allocation line entirely when plugin-pob is not loaded', async () => {
    const ctx = makeCtx();
    (ctx.http.get as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_PAGE_RESPONSE);

    const result = await getPassiveInfoTool.handler({ passiveName: 'Resolute Technique' }, ctx);

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('Resolute Technique');
    expect(result.content[0].text).not.toContain('Allocated in current build');
  });

  it('reports "Allocated in current build: Yes" when the loaded build has the node allocated', async () => {
    const runtime = { getNodeInfo: vi.fn().mockResolvedValue({ allocated: true }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = makeCtx({ pobRuntime: runtime as any });
    (ctx.http.get as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_PAGE_RESPONSE);

    const result = await getPassiveInfoTool.handler({ passiveName: 'Resolute Technique' }, ctx);

    expect(result.content[0].text).toContain('**Allocated in current build:** Yes');
    expect(runtime.getNodeInfo).toHaveBeenCalledWith('Resolute Technique');
  });

  it('reports "Allocated in current build: No" when the node exists but is not allocated', async () => {
    const runtime = { getNodeInfo: vi.fn().mockResolvedValue({ allocated: false }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = makeCtx({ pobRuntime: runtime as any });
    (ctx.http.get as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_PAGE_RESPONSE);

    const result = await getPassiveInfoTool.handler({ passiveName: 'Resolute Technique' }, ctx);

    expect(result.content[0].text).toContain('**Allocated in current build:** No');
  });

  it('omits the allocation line (rather than erroring) when no build is loaded', async () => {
    const runtime = { getNodeInfo: vi.fn().mockRejectedValue(new Error('Build not initialized')) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = makeCtx({ pobRuntime: runtime as any });
    (ctx.http.get as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_PAGE_RESPONSE);

    const result = await getPassiveInfoTool.handler({ passiveName: 'Resolute Technique' }, ctx);

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).not.toContain('Allocated in current build');
  });
});
