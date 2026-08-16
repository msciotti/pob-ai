import { describe, it, expect, vi, beforeEach } from 'vitest';
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

describe('get_meta_builds tool', () => {
  it('defaults league to ctx.leagueState.currentLeague when omitted', async () => {
    const ctx = makeCtx('Settlers of Kalguur');
    const httpGet = ctx.http.get as ReturnType<typeof vi.fn>;
    httpGet.mockResolvedValue({ lines: [] });

    await getMetaBuildsTool.handler({ skill: 'Fireball' }, ctx);

    expect(httpGet).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        params: expect.objectContaining({ overview: 'Settlers of Kalguur' }),
      })
    );
  });

  it('uses provided league when specified', async () => {
    const ctx = makeCtx('Standard');
    const httpGet = ctx.http.get as ReturnType<typeof vi.fn>;
    httpGet.mockResolvedValue({ lines: [] });

    await getMetaBuildsTool.handler({ skill: 'Fireball', league: 'Hardcore' }, ctx);

    expect(httpGet).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        params: expect.objectContaining({ overview: 'Hardcore' }),
      })
    );
  });

  it('returns isError when no builds found for skill', async () => {
    const ctx = makeCtx();
    (ctx.http.get as ReturnType<typeof vi.fn>).mockResolvedValue({ lines: [] });

    const result = await getMetaBuildsTool.handler({ skill: 'ObscureSkill' }, ctx);

    expect(result.isError).toBe(true);
    const text = result.content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('ObscureSkill');
  });

  it('returns successful JSON text when builds are found', async () => {
    const ctx = makeCtx();
    const build = {
      mainSkill: 'Fireball',
      class: 'Elementalist',
      life: 3000,
      energyShield: 5000,
      dps: 1_000_000,
      activeGems: ['Fireball', 'Greater Multiple Projectiles'],
      items: [],
      keystonePassives: [],
    };
    (ctx.http.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      lines: Array.from({ length: 10 }, () => build),
    });

    const result = await getMetaBuildsTool.handler({ skill: 'Fireball' }, ctx);

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.sampleSize).toBe(10);
    expect(parsed.skill).toBe('Fireball');
  });

  it('returns isError when HTTP throws', async () => {
    const ctx = makeCtx();
    (ctx.http.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

    const result = await getMetaBuildsTool.handler({ skill: 'Fireball' }, ctx);

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toContain('Network error');
  });
});
