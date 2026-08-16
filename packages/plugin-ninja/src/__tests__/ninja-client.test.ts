import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NinjaClient } from '../ninja-client.js';
import { TtlCache } from '@poe-ai/core';
import type { PluginContext } from '@poe-ai/core';
import type { RawNinjaBuildEntry } from '../types.js';

function makeCtx(patchVersion = '3.26.0'): PluginContext {
  return {
    http: { get: vi.fn(), post: vi.fn() },
    cache: new TtlCache(),
    leagueState: { currentLeague: 'Standard', patchVersion, hardcore: false, ssf: false },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  } as any;
}

function makeBuildEntry(overrides: Partial<RawNinjaBuildEntry> = {}): RawNinjaBuildEntry {
  return {
    name: 'SomeChar',
    level: 95,
    class: 'Juggernaut',
    mainSkill: 'Boneshatter',
    life: 5000,
    dps: 2_000_000,
    activeGems: ['Boneshatter', 'Melee Physical Damage', 'Brutality', 'Pulverise'],
    items: ['Kaom\'s Heart'],
    keystonePassives: ['Iron Reflexes'],
    ...overrides,
  };
}

describe('NinjaClient.getBuildsForSkill', () => {
  it('returns MetaBuildData with correct sampleSize', async () => {
    const ctx = makeCtx();
    const builds = Array.from({ length: 10 }, () => makeBuildEntry());
    (ctx.http.get as ReturnType<typeof vi.fn>).mockResolvedValue({ lines: builds });

    const client = new NinjaClient(ctx);
    const result = await client.getBuildsForSkill('Boneshatter', null, 'Standard');

    expect(result.sampleSize).toBe(10);
    expect(result.skill).toBe('Boneshatter');
    expect(result.league).toBe('Standard');
  });

  it('caches result so second call does not hit HTTP', async () => {
    const ctx = makeCtx();
    const httpGet = ctx.http.get as ReturnType<typeof vi.fn>;
    httpGet.mockResolvedValue({ lines: [makeBuildEntry()] });

    const client = new NinjaClient(ctx);
    await client.getBuildsForSkill('Boneshatter', null, 'Standard');
    await client.getBuildsForSkill('Boneshatter', null, 'Standard');

    expect(httpGet).toHaveBeenCalledTimes(1);
  });

  it('busts cache on different patchVersion', async () => {
    const sharedCache = new TtlCache();
    const ctxA = makeCtx('3.25.0');
    ctxA.cache = sharedCache;
    const ctxB = makeCtx('3.26.0');
    ctxB.cache = sharedCache;

    const mockGet = vi.fn().mockResolvedValue({ lines: [makeBuildEntry()] });
    ctxA.http = { get: mockGet, post: vi.fn() } as any;
    ctxB.http = { get: mockGet, post: vi.fn() } as any;

    await new NinjaClient(ctxA).getBuildsForSkill('Boneshatter', null, 'Standard');
    await new NinjaClient(ctxB).getBuildsForSkill('Boneshatter', null, 'Standard');

    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('correctly computes gem usage percentage', async () => {
    const ctx = makeCtx();
    // 10 builds: 7 use "Conc Effect", 3 use only base gems
    const builds = [
      ...Array.from({ length: 7 }, () =>
        makeBuildEntry({ activeGems: ['Boneshatter', 'Concentrated Effect', 'Brutality'] })
      ),
      ...Array.from({ length: 3 }, () =>
        makeBuildEntry({ activeGems: ['Boneshatter', 'Brutality'] })
      ),
    ];
    (ctx.http.get as ReturnType<typeof vi.fn>).mockResolvedValue({ lines: builds });

    const client = new NinjaClient(ctx);
    const result = await client.getBuildsForSkill('Boneshatter', null, 'Standard');

    const concEffect = result.topSupportGems.find((g) => g.name === 'Concentrated Effect');
    expect(concEffect).toBeDefined();
    expect(concEffect!.usagePercent).toBe(70);

    const brutality = result.topSupportGems.find((g) => g.name === 'Brutality');
    expect(brutality!.usagePercent).toBe(100);
  });

  it('excludes the main skill from gem usage', async () => {
    const ctx = makeCtx();
    const builds = [makeBuildEntry({ activeGems: ['Boneshatter', 'Melee Physical Damage'] })];
    (ctx.http.get as ReturnType<typeof vi.fn>).mockResolvedValue({ lines: builds });

    const client = new NinjaClient(ctx);
    const result = await client.getBuildsForSkill('Boneshatter', null, 'Standard');

    const mainSkillEntry = result.topSupportGems.find((g) =>
      g.name.toLowerCase() === 'boneshatter'
    );
    expect(mainSkillEntry).toBeUndefined();
  });

  it('correctly computes DPS stat range', async () => {
    const ctx = makeCtx();
    const builds = [
      makeBuildEntry({ dps: 1_000_000 }),
      makeBuildEntry({ dps: 2_000_000 }),
      makeBuildEntry({ dps: 3_000_000 }),
    ];
    (ctx.http.get as ReturnType<typeof vi.fn>).mockResolvedValue({ lines: builds });

    const client = new NinjaClient(ctx);
    const result = await client.getBuildsForSkill('Boneshatter', null, 'Standard');

    expect(result.dpsRange.min).toBe(1_000_000);
    expect(result.dpsRange.median).toBe(2_000_000);
    expect(result.dpsRange.max).toBe(3_000_000);
  });

  it('filters by ascendancy when enough builds are available', async () => {
    const ctx = makeCtx();
    const builds = [
      ...Array.from({ length: 8 }, () => makeBuildEntry({ class: 'Juggernaut', dps: 3_000_000 })),
      ...Array.from({ length: 5 }, () => makeBuildEntry({ class: 'Berserker', dps: 5_000_000 })),
    ];
    (ctx.http.get as ReturnType<typeof vi.fn>).mockResolvedValue({ lines: builds });

    const client = new NinjaClient(ctx);
    const result = await client.getBuildsForSkill('Boneshatter', 'Juggernaut', 'Standard');

    expect(result.sampleSize).toBe(8);
    expect(result.dpsRange.max).toBe(3_000_000);
  });

  it('falls back to all builds when ascendancy has too few samples', async () => {
    const ctx = makeCtx();
    const builds = [
      ...Array.from({ length: 20 }, () => makeBuildEntry({ class: 'Juggernaut' })),
      ...Array.from({ length: 3 }, () => makeBuildEntry({ class: 'Berserker' })),
    ];
    (ctx.http.get as ReturnType<typeof vi.fn>).mockResolvedValue({ lines: builds });

    const client = new NinjaClient(ctx);
    // Berserker has only 3 — should fall back to all 23
    const result = await client.getBuildsForSkill('Boneshatter', 'Berserker', 'Standard');

    expect(result.sampleSize).toBe(23);
    expect(ctx.logger.warn).toHaveBeenCalled();
  });

  it('returns empty result (not error) when skill has no builds', async () => {
    const ctx = makeCtx();
    (ctx.http.get as ReturnType<typeof vi.fn>).mockResolvedValue({ lines: [] });

    const client = new NinjaClient(ctx);
    const result = await client.getBuildsForSkill('ObscureSkill', null, 'Standard');

    expect(result.sampleSize).toBe(0);
    expect(result.topSupportGems).toHaveLength(0);
  });

  it('caches with the correct TTL (1 hour)', async () => {
    const ctx = makeCtx();
    const cacheSpy = vi.spyOn(ctx.cache, 'set');
    (ctx.http.get as ReturnType<typeof vi.fn>).mockResolvedValue({ lines: [makeBuildEntry()] });

    const client = new NinjaClient(ctx);
    await client.getBuildsForSkill('Boneshatter', null, 'Standard');

    expect(cacheSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      60 * 60 * 1000
    );
  });

  it('passes correct params to the HTTP client', async () => {
    const ctx = makeCtx();
    const httpGet = ctx.http.get as ReturnType<typeof vi.fn>;
    httpGet.mockResolvedValue({ lines: [] });

    const client = new NinjaClient(ctx);
    await client.getBuildsForSkill('Fireball', null, 'Settlers of Kalguur');

    expect(httpGet).toHaveBeenCalledWith(
      'https://poe.ninja/api/data/builds',
      expect.objectContaining({
        params: expect.objectContaining({
          overview: 'Settlers of Kalguur',
          type: 'exp',
          language: 'en',
        }),
        timeoutMs: 30_000,
      })
    );
  });
});

describe('NinjaClient.getItemPrice', () => {
  it('returns ItemPrice for a known item', async () => {
    const ctx = makeCtx();
    (ctx.http.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      lines: [
        { name: "Kaom's Heart", chaosValue: 50, divineValue: 0.3, listingCount: 100 },
      ],
    });

    const client = new NinjaClient(ctx);
    const result = await client.getItemPrice("Kaom's Heart", 'UniqueArmour', 'Standard');

    expect(result).not.toBeNull();
    expect(result!.name).toBe("Kaom's Heart");
    expect(result!.chaosValue).toBe(50);
    expect(result!.category).toBe('UniqueArmour');
  });

  it('returns null when item is not in category', async () => {
    const ctx = makeCtx();
    (ctx.http.get as ReturnType<typeof vi.fn>).mockResolvedValue({ lines: [] });

    const client = new NinjaClient(ctx);
    const result = await client.getItemPrice('Missing Item', 'UniqueWeapon', 'Standard');

    expect(result).toBeNull();
  });

  it('uses case-insensitive name matching', async () => {
    const ctx = makeCtx();
    (ctx.http.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      lines: [{ name: "Kaom's Heart", chaosValue: 50, divineValue: 0.3, listingCount: 100 }],
    });

    const client = new NinjaClient(ctx);
    const result = await client.getItemPrice("kaom's heart", 'UniqueArmour', 'Standard');

    expect(result).not.toBeNull();
    expect(result!.name).toBe("Kaom's Heart");
  });

  it('caches economy lines with 15-minute TTL', async () => {
    const ctx = makeCtx();
    const cacheSpy = vi.spyOn(ctx.cache, 'set');
    (ctx.http.get as ReturnType<typeof vi.fn>).mockResolvedValue({ lines: [] });

    const client = new NinjaClient(ctx);
    await client.getItemPrice('Test', 'UniqueWeapon', 'Standard');

    expect(cacheSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      15 * 60 * 1000
    );
  });

  it('caches the whole category so two same-category lookups only hit HTTP once', async () => {
    const ctx = makeCtx();
    const httpGet = ctx.http.get as ReturnType<typeof vi.fn>;
    httpGet.mockResolvedValue({
      lines: [
        { name: 'Item A', chaosValue: 10, divineValue: 0, listingCount: 5 },
        { name: 'Item B', chaosValue: 20, divineValue: 0, listingCount: 8 },
      ],
    });

    const client = new NinjaClient(ctx);
    await client.getItemPrice('Item A', 'UniqueWeapon', 'Standard');
    await client.getItemPrice('Item B', 'UniqueWeapon', 'Standard');

    expect(httpGet).toHaveBeenCalledTimes(1);
  });

  it('auto-detects category when none provided', async () => {
    const ctx = makeCtx();
    const httpGet = ctx.http.get as ReturnType<typeof vi.fn>;
    // Return empty for all categories except UniqueArmour
    httpGet.mockImplementation((_url: string, opts: any) => {
      if (opts?.params?.type === 'UniqueArmour') {
        return Promise.resolve({
          lines: [{ name: "Kaom's Heart", chaosValue: 50, divineValue: 0.3, listingCount: 100 }],
        });
      }
      return Promise.resolve({ lines: [] });
    });

    const client = new NinjaClient(ctx);
    const result = await client.getItemPrice("Kaom's Heart", undefined, 'Standard');

    expect(result).not.toBeNull();
    expect(result!.category).toBe('UniqueArmour');
  });

  it('returns null when item is not found in any category during auto-detect', async () => {
    const ctx = makeCtx();
    (ctx.http.get as ReturnType<typeof vi.fn>).mockResolvedValue({ lines: [] });

    const client = new NinjaClient(ctx);
    const result = await client.getItemPrice('Nonexistent Item', undefined, 'Standard');

    expect(result).toBeNull();
  });
});
