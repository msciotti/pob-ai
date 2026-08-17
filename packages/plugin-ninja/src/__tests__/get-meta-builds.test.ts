import { describe, it, expect, vi } from 'vitest';
import { getMetaBuildsTool } from '../tools/get-meta-builds.js';
import { TtlCache } from '@poe-ai/core';
import type { PluginContext } from '@poe-ai/core';

function makeCtx(league = 'Standard'): PluginContext {
  return {
    http: { get: vi.fn(), post: vi.fn() },
    cache: new TtlCache(),
    leagueState: { currentLeague: league, patchVersion: '3.26.0', hardcore: false, ssf: false },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  } as any;
}

// The poe.ninja builds API moved in August 2026 and is not yet supported.
// get_meta_builds always returns isError until the new API format is decoded.
describe('get_meta_builds tool', () => {
  it('returns isError with a message about the unavailable API', async () => {
    const ctx = makeCtx();

    const result = await getMetaBuildsTool.handler({ skill: 'Fireball' }, ctx);

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/poe\.ninja builds API/i);
  });

  it('does not call the HTTP client', async () => {
    const ctx = makeCtx();
    const httpGet = ctx.http.get as ReturnType<typeof vi.fn>;

    await getMetaBuildsTool.handler({ skill: 'Boneshatter', league: 'Standard' }, ctx);

    expect(httpGet).not.toHaveBeenCalled();
  });

  it('returns isError regardless of league parameter', async () => {
    const ctx = makeCtx('Hardcore');

    const result = await getMetaBuildsTool.handler({ skill: 'Fireball', league: 'Hardcore' }, ctx);

    expect(result.isError).toBe(true);
  });

  it('returns isError regardless of ascendancy parameter', async () => {
    const ctx = makeCtx();

    const result = await getMetaBuildsTool.handler(
      { skill: 'Boneshatter', ascendancy: 'Juggernaut' },
      ctx
    );

    expect(result.isError).toBe(true);
  });
});
