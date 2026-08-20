import { describe, it, expect, vi } from 'vitest';
import { NinjaClient } from '../ninja-client.js';
import { TtlCache } from '@poe-ai/core';
import type { PluginContext } from '@poe-ai/core';

function makeCtx(patchVersion = '3.26.0'): PluginContext {
  return {
    http: { get: vi.fn(), post: vi.fn() },
    cache: new TtlCache(),
    leagueState: { currentLeague: 'Standard', patchVersion, hardcore: false, ssf: false },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  } as any;
}

const INDEX_STATE = {
  economyLeagues: [
    { name: 'Standard', url: 'standard', displayName: 'Standard' },
    { name: 'Settlers of Kalguur', url: 'settlers', displayName: 'Settlers of Kalguur' },
  ],
  oldEconomyLeagues: [],
  snapshotVersions: [
    { url: 'standard', type: 'exp', name: 'Standard', version: 'v-standard-1', snapshotName: 'standard', overviewType: 0 },
    { url: 'settlers', type: 'exp', name: 'Settlers of Kalguur', version: 'v-settlers-1', snapshotName: 'settlers', overviewType: 0 },
  ],
};

/** Wires ctx.http.get to route by URL suffix, mimicking the real endpoint set. */
function mockHttp(ctx: PluginContext, handlers: Record<string, (opts: any) => any>) {
  const httpGet = ctx.http.get as ReturnType<typeof vi.fn>;
  httpGet.mockImplementation((url: string, opts: any) => {
    for (const [suffix, handler] of Object.entries(handlers)) {
      if (url.endsWith(suffix) || url.includes(suffix)) {
        return Promise.resolve(handler(opts));
      }
    }
    throw new Error(`Unmocked URL: ${url}`);
  });
  return httpGet;
}

describe('NinjaClient — league/version resolution', () => {
  it('resolves league display name to a snapshot version via index-state', async () => {
    const ctx = makeCtx();
    const httpGet = mockHttp(ctx, {
      '/poe1/api/data/index-state': () => INDEX_STATE,
      '/currency/overview': () => ({
        lines: [{ currencyTypeName: 'Divine Orb', chaosEquivalent: 200, receive: { listing_count: 50 } }],
      }),
    });

    const client = new NinjaClient(ctx);
    await client.getItemPrice('Divine Orb', 'Currency', 'Standard');

    expect(httpGet).toHaveBeenCalledWith(
      expect.stringContaining('/poe1/api/economy/stash/v-standard-1/currency/overview'),
      expect.objectContaining({ params: { type: 'Currency', league: 'Standard' } })
    );
  });

  it('throws a clear error for a league poe.ninja does not track', async () => {
    const ctx = makeCtx();
    mockHttp(ctx, { '/poe1/api/data/index-state': () => INDEX_STATE });

    const client = new NinjaClient(ctx);
    await expect(client.getItemPrice('Divine Orb', 'Currency', 'Nonexistent League')).rejects.toThrow(
      /not a league poe\.ninja tracks/
    );
  });

  it('caches index-state so two lookups in different leagues only fetch it once', async () => {
    const ctx = makeCtx();
    const httpGet = mockHttp(ctx, {
      '/poe1/api/data/index-state': () => INDEX_STATE,
      '/currency/overview': () => ({ lines: [] }),
    });

    const client = new NinjaClient(ctx);
    await client.getItemPrice('X', 'Currency', 'Standard');
    await client.getItemPrice('X', 'Currency', 'Settlers of Kalguur');

    const indexStateCalls = httpGet.mock.calls.filter((call: any[]) => call[0].includes('index-state'));
    expect(indexStateCalls).toHaveLength(1);
  });
});

describe('NinjaClient — currency/overview (Currency, Fragment)', () => {
  it('maps chaosEquivalent to chaosValue and derives divineValue from Divine Orb', async () => {
    const ctx = makeCtx();
    mockHttp(ctx, {
      '/poe1/api/data/index-state': () => INDEX_STATE,
      '/currency/overview': () => ({
        lines: [
          { currencyTypeName: 'Divine Orb', chaosEquivalent: 200, receive: { listing_count: 50 } },
          { currencyTypeName: 'Chaos Orb', chaosEquivalent: 1, receive: { listing_count: 999 } },
        ],
      }),
    });

    const client = new NinjaClient(ctx);
    const divine = await client.getItemPrice('Divine Orb', 'Currency', 'Standard');
    const chaos = await client.getItemPrice('Chaos Orb', 'Currency', 'Standard');

    expect(divine!.chaosValue).toBe(200);
    expect(divine!.divineValue).toBe(1); // self-ratio
    expect(chaos!.chaosValue).toBe(1);
    expect(chaos!.divineValue).toBeCloseTo(1 / 200);
    expect(divine!.listingCount).toBe(50);
  });

  it('Fragment lookups fetch Currency lines separately to get the Divine Orb rate', async () => {
    const ctx = makeCtx();
    const httpGet = mockHttp(ctx, {
      '/poe1/api/data/index-state': () => INDEX_STATE,
      '/currency/overview': (opts: any) => {
        if (opts.params.type === 'Currency') {
          return { lines: [{ currencyTypeName: 'Divine Orb', chaosEquivalent: 200, receive: { listing_count: 50 } }] };
        }
        return { lines: [{ currencyTypeName: "Sacrifice at Midnight", chaosEquivalent: 5, receive: { listing_count: 20 } }] };
      },
    });

    const client = new NinjaClient(ctx);
    const result = await client.getItemPrice('Sacrifice at Midnight', 'Fragment', 'Standard');

    expect(result!.chaosValue).toBe(5);
    expect(result!.divineValue).toBeCloseTo(5 / 200);
    expect(httpGet).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ params: { type: 'Currency', league: 'Standard' } })
    );
    expect(httpGet).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ params: { type: 'Fragment', league: 'Standard' } })
    );
  });
});

describe('NinjaClient — item/overview (uniques, maps, skill gems)', () => {
  it('passes chaosValue/divineValue/listingCount through directly', async () => {
    const ctx = makeCtx();
    mockHttp(ctx, {
      '/poe1/api/data/index-state': () => INDEX_STATE,
      '/item/overview': () => ({
        lines: [{ name: "Kaom's Heart", chaosValue: 50, divineValue: 0.25, listingCount: 100 }],
      }),
    });

    const client = new NinjaClient(ctx);
    const result = await client.getItemPrice("Kaom's Heart", 'UniqueArmour', 'Standard');

    expect(result).not.toBeNull();
    expect(result!.name).toBe("Kaom's Heart");
    expect(result!.chaosValue).toBe(50);
    expect(result!.divineValue).toBe(0.25);
    expect(result!.listingCount).toBe(100);
  });

  it('falls back to count when listingCount is absent', async () => {
    const ctx = makeCtx();
    mockHttp(ctx, {
      '/poe1/api/data/index-state': () => INDEX_STATE,
      '/item/overview': () => ({ lines: [{ name: 'Some Gem', chaosValue: 3, count: 42 }] }),
    });

    const client = new NinjaClient(ctx);
    const result = await client.getItemPrice('Some Gem', 'SkillGem', 'Standard');

    expect(result!.listingCount).toBe(42);
    expect(result!.divineValue).toBe(0);
  });

  it('returns null when item is not found', async () => {
    const ctx = makeCtx();
    mockHttp(ctx, {
      '/poe1/api/data/index-state': () => INDEX_STATE,
      '/item/overview': () => ({ lines: [] }),
    });

    const client = new NinjaClient(ctx);
    const result = await client.getItemPrice('Missing Item', 'UniqueWeapon', 'Standard');

    expect(result).toBeNull();
  });

  it('uses case-insensitive name matching', async () => {
    const ctx = makeCtx();
    mockHttp(ctx, {
      '/poe1/api/data/index-state': () => INDEX_STATE,
      '/item/overview': () => ({ lines: [{ name: "Kaom's Heart", chaosValue: 50, listingCount: 100 }] }),
    });

    const client = new NinjaClient(ctx);
    const result = await client.getItemPrice("kaom's heart", 'UniqueArmour', 'Standard');

    expect(result).not.toBeNull();
    expect(result!.name).toBe("Kaom's Heart");
  });

  it('caches economy lines with 15-minute TTL', async () => {
    const ctx = makeCtx();
    mockHttp(ctx, {
      '/poe1/api/data/index-state': () => INDEX_STATE,
      '/item/overview': () => ({ lines: [] }),
    });
    const cacheSpy = vi.spyOn(ctx.cache, 'set');

    const client = new NinjaClient(ctx);
    await client.getItemPrice('Test', 'UniqueWeapon', 'Standard');

    expect(cacheSpy).toHaveBeenCalledWith(
      expect.stringContaining('ninja:economy:'),
      expect.any(Array),
      15 * 60 * 1000
    );
  });

  it('caches the whole category so two same-category lookups only hit HTTP once', async () => {
    const ctx = makeCtx();
    const httpGet = mockHttp(ctx, {
      '/poe1/api/data/index-state': () => INDEX_STATE,
      '/item/overview': () => ({
        lines: [
          { name: 'Item A', chaosValue: 10, listingCount: 5 },
          { name: 'Item B', chaosValue: 20, listingCount: 8 },
        ],
      }),
    });

    const client = new NinjaClient(ctx);
    await client.getItemPrice('Item A', 'UniqueWeapon', 'Standard');
    await client.getItemPrice('Item B', 'UniqueWeapon', 'Standard');

    const itemOverviewCalls = httpGet.mock.calls.filter((call: any[]) => call[0].includes('item/overview'));
    expect(itemOverviewCalls).toHaveLength(1);
  });

  it('auto-detects category when none provided', async () => {
    const ctx = makeCtx();
    mockHttp(ctx, {
      '/poe1/api/data/index-state': () => INDEX_STATE,
      '/item/overview': (opts: any) => {
        if (opts.params.type === 'UniqueArmour') {
          return { lines: [{ name: "Kaom's Heart", chaosValue: 50, listingCount: 100 }] };
        }
        return { lines: [] };
      },
      '/currency/overview': () => ({ lines: [] }),
      'economy/exchange/': () => ({ core: { items: [], rates: {}, primary: 'chaos' }, items: [], lines: [] }),
    });

    const client = new NinjaClient(ctx);
    const result = await client.getItemPrice("Kaom's Heart", undefined, 'Standard');

    expect(result).not.toBeNull();
    expect(result!.category).toBe('UniqueArmour');
  });

  it('returns null when item is not found in any category during auto-detect', async () => {
    const ctx = makeCtx();
    mockHttp(ctx, {
      '/poe1/api/data/index-state': () => INDEX_STATE,
      '/item/overview': () => ({ lines: [] }),
      '/currency/overview': () => ({ lines: [] }),
      'economy/exchange/': () => ({ core: { items: [], rates: {}, primary: 'chaos' }, items: [], lines: [] }),
    });

    const client = new NinjaClient(ctx);
    const result = await client.getItemPrice('Nonexistent Item', undefined, 'Standard');

    expect(result).toBeNull();
  });
});

describe('NinjaClient — exchange/overview (DivinationCard)', () => {
  it('joins lines and items by id, derives divineValue from core.rates.divine', async () => {
    const ctx = makeCtx();
    mockHttp(ctx, {
      '/poe1/api/data/index-state': () => INDEX_STATE,
      'economy/exchange/': () => ({
        core: { items: [], rates: { divine: 0.005 }, primary: 'chaos', secondary: 'divine' },
        items: [{ id: 'abandoned-wealth', name: 'Abandoned Wealth', category: 'Cards' }],
        lines: [{ id: 'abandoned-wealth', primaryValue: 20 }],
      }),
    });

    const client = new NinjaClient(ctx);
    const result = await client.getItemPrice('Abandoned Wealth', 'DivinationCard', 'Standard');

    expect(result).not.toBeNull();
    expect(result!.chaosValue).toBe(20);
    expect(result!.divineValue).toBeCloseTo(0.1);
    // Known gap: the exchange endpoint doesn't expose a listing count.
    expect(result!.listingCount).toBe(0);
  });

  it('skips lines with no matching item entry', async () => {
    const ctx = makeCtx();
    mockHttp(ctx, {
      '/poe1/api/data/index-state': () => INDEX_STATE,
      'economy/exchange/': () => ({
        core: { items: [], rates: {}, primary: 'chaos' },
        items: [],
        lines: [{ id: 'orphan-line', primaryValue: 20 }],
      }),
    });

    const client = new NinjaClient(ctx);
    const result = await client.getItemPrice('Anything', 'DivinationCard', 'Standard');

    expect(result).toBeNull();
  });
});

describe('NinjaClient — endpoint selection', () => {
  it('Currency category uses currency/overview URL', async () => {
    const ctx = makeCtx();
    const httpGet = mockHttp(ctx, {
      '/poe1/api/data/index-state': () => INDEX_STATE,
      '/currency/overview': () => ({ lines: [{ currencyTypeName: 'Divine Orb', chaosEquivalent: 200, receive: { listing_count: 500 } }] }),
    });

    const client = new NinjaClient(ctx);
    await client.getItemPrice('Divine Orb', 'Currency', 'Standard');

    expect(httpGet).toHaveBeenCalledWith(expect.stringContaining('currency/overview'), expect.any(Object));
  });

  it('UniqueArmour category uses item/overview URL', async () => {
    const ctx = makeCtx();
    const httpGet = mockHttp(ctx, {
      '/poe1/api/data/index-state': () => INDEX_STATE,
      '/item/overview': () => ({ lines: [{ name: "Kaom's Heart", chaosValue: 50, listingCount: 100 }] }),
    });

    const client = new NinjaClient(ctx);
    await client.getItemPrice("Kaom's Heart", 'UniqueArmour', 'Standard');

    expect(httpGet).toHaveBeenCalledWith(expect.stringContaining('item/overview'), expect.any(Object));
  });

  it('DivinationCard category uses exchange/overview URL', async () => {
    const ctx = makeCtx();
    const httpGet = mockHttp(ctx, {
      '/poe1/api/data/index-state': () => INDEX_STATE,
      'economy/exchange/': () => ({
        core: { items: [], rates: {}, primary: 'chaos' },
        items: [{ id: 'x', name: 'X', category: 'Cards' }],
        lines: [{ id: 'x', primaryValue: 1 }],
      }),
    });

    const client = new NinjaClient(ctx);
    await client.getItemPrice('X', 'DivinationCard', 'Standard');

    expect(httpGet).toHaveBeenCalledWith(expect.stringContaining('economy/exchange/'), expect.any(Object));
  });
});
