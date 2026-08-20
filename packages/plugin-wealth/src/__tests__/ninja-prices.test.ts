import { describe, it, expect, vi } from 'vitest';
import { NinjaPriceCache } from '../ninja-prices.js';
import type { PluginContext } from '@poe-ai/core';

const INDEX_STATE = {
  economyLeagues: [
    { name: 'Settlers', url: 'settlers', displayName: 'Settlers' },
    { name: 'Standard', url: 'standard', displayName: 'Standard' },
  ],
  oldEconomyLeagues: [],
  snapshotVersions: [
    { url: 'settlers', type: 'exp', version: 'v-settlers-1' },
    { url: 'standard', type: 'exp', version: 'v-standard-1' },
  ],
};

function makeCtx(): PluginContext {
  const store = new Map<string, unknown>();
  return {
    http: {
      get: vi.fn(),
      post: vi.fn(),
    },
    cache: {
      get: vi.fn((key: string) => store.get(key)),
      set: vi.fn((key: string, value: unknown) => { store.set(key, value); }),
      delete: vi.fn((key: string) => { store.delete(key); }),
      clear: vi.fn(() => { store.clear(); }),
    },
    leagueState: {
      currentLeague: 'Settlers',
      patchVersion: '3.26.0',
      hardcore: false,
      ssf: false,
    },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  } as unknown as PluginContext;
}

/** Wires ctx.http.get to route by URL substring, mimicking the real endpoint set. */
function mockHttp(ctx: PluginContext, handlers: Record<string, (opts: any) => any>) {
  const httpGet = ctx.http.get as ReturnType<typeof vi.fn>;
  httpGet.mockImplementation((url: string, opts: any) => {
    for (const [substr, handler] of Object.entries(handlers)) {
      if (url.includes(substr)) return Promise.resolve(handler(opts));
    }
    throw new Error(`Unmocked URL: ${url}`);
  });
  return httpGet;
}

describe('NinjaPriceCache', () => {
  describe('getPriceMap — currency categories', () => {
    it('calls the currency/overview URL for Currency category', async () => {
      const ctx = makeCtx();
      const httpGet = mockHttp(ctx, {
        'index-state': () => INDEX_STATE,
        'currency/overview': () => ({ lines: [] }),
      });
      const cache = new NinjaPriceCache(ctx);
      await cache.getPriceMap('Currency', 'Settlers');

      expect(httpGet).toHaveBeenCalledWith(
        expect.stringContaining('/poe1/api/economy/stash/v-settlers-1/currency/overview'),
        expect.objectContaining({ params: expect.objectContaining({ type: 'Currency', league: 'Settlers' }) })
      );
    });

    it('calls the currency/overview URL for Fragment category', async () => {
      const ctx = makeCtx();
      const httpGet = mockHttp(ctx, {
        'index-state': () => INDEX_STATE,
        'currency/overview': () => ({ lines: [] }),
      });
      const cache = new NinjaPriceCache(ctx);
      await cache.getPriceMap('Fragment', 'Settlers');

      expect(httpGet).toHaveBeenCalledWith(expect.stringContaining('currency/overview'), expect.anything());
    });

    it('maps currencyTypeName and chaosEquivalent to NinjaPriceLine shape', async () => {
      const ctx = makeCtx();
      mockHttp(ctx, {
        'index-state': () => INDEX_STATE,
        'currency/overview': () => ({
          lines: [
            { currencyTypeName: 'Divine Orb', chaosEquivalent: 200, receive: { listing_count: 500 } },
            { currencyTypeName: 'Chaos Orb', chaosEquivalent: 1 },
          ],
        }),
      });
      const cache = new NinjaPriceCache(ctx);
      const map = await cache.getPriceMap('Currency', 'Settlers');

      expect(map.get('divine orb')).toMatchObject({ name: 'Divine Orb', chaosValue: 200 });
      expect(map.get('chaos orb')).toMatchObject({ name: 'Chaos Orb', chaosValue: 1 });
    });

    it('uses case-insensitive keys', async () => {
      const ctx = makeCtx();
      mockHttp(ctx, {
        'index-state': () => INDEX_STATE,
        'currency/overview': () => ({
          lines: [{ currencyTypeName: 'Orb of Alteration', chaosEquivalent: 0.5 }],
        }),
      });
      const cache = new NinjaPriceCache(ctx);
      const map = await cache.getPriceMap('Currency', 'Settlers');

      expect(map.get('orb of alteration')).toBeDefined();
    });

    it('derives divineValue from the Divine Orb line in the same response', async () => {
      const ctx = makeCtx();
      mockHttp(ctx, {
        'index-state': () => INDEX_STATE,
        'currency/overview': () => ({
          lines: [
            { currencyTypeName: 'Divine Orb', chaosEquivalent: 200 },
            { currencyTypeName: 'Chaos Orb', chaosEquivalent: 1 },
          ],
        }),
      });
      const cache = new NinjaPriceCache(ctx);
      const map = await cache.getPriceMap('Currency', 'Settlers');

      expect(map.get('chaos orb')?.divineValue).toBeCloseTo(1 / 200);
    });
  });

  describe('getPriceMap — item categories', () => {
    it('calls the item/overview URL for UniqueWeapon category', async () => {
      const ctx = makeCtx();
      const httpGet = mockHttp(ctx, {
        'index-state': () => INDEX_STATE,
        'item/overview': () => ({ lines: [] }),
      });
      const cache = new NinjaPriceCache(ctx);
      await cache.getPriceMap('UniqueWeapon', 'Settlers');

      expect(httpGet).toHaveBeenCalledWith(
        expect.stringContaining('item/overview'),
        expect.objectContaining({ params: expect.objectContaining({ type: 'UniqueWeapon' }) })
      );
    });

    it('maps name and chaosValue correctly for item lines', async () => {
      const ctx = makeCtx();
      mockHttp(ctx, {
        'index-state': () => INDEX_STATE,
        'item/overview': () => ({
          lines: [
            { name: "Kaom's Heart", chaosValue: 5000, divineValue: 25 },
            { name: 'Shavrone\'s Wrappings', chaosValue: 3200 },
          ],
        }),
      });
      const cache = new NinjaPriceCache(ctx);
      const map = await cache.getPriceMap('UniqueArmour', 'Settlers');

      expect(map.get("kaom's heart")).toMatchObject({ name: "Kaom's Heart", chaosValue: 5000, divineValue: 25 });
    });

    it('preserves variant field on item lines', async () => {
      const ctx = makeCtx();
      mockHttp(ctx, {
        'index-state': () => INDEX_STATE,
        'item/overview': () => ({
          lines: [{ name: 'Empower Support', chaosValue: 150, variant: '20/20' }],
        }),
      });
      const cache = new NinjaPriceCache(ctx);
      const map = await cache.getPriceMap('SkillGem', 'Settlers');

      expect(map.get('empower support')?.variant).toBe('20/20');
    });
  });

  describe('getPriceMap — DivinationCard (exchange/overview)', () => {
    it('joins lines and items by id via the exchange endpoint', async () => {
      const ctx = makeCtx();
      const httpGet = mockHttp(ctx, {
        'index-state': () => INDEX_STATE,
        'economy/exchange/': () => ({
          core: { rates: { divine: 0.005 } },
          items: [{ id: 'the-doctor', name: 'The Doctor' }],
          lines: [{ id: 'the-doctor', primaryValue: 4000 }],
        }),
      });
      const cache = new NinjaPriceCache(ctx);
      const map = await cache.getPriceMap('DivinationCard', 'Settlers');

      expect(map.get('the doctor')).toMatchObject({ name: 'The Doctor', chaosValue: 4000 });
      expect(httpGet).toHaveBeenCalledWith(expect.stringContaining('economy/exchange/'), expect.any(Object));
    });
  });

  describe('league resolution', () => {
    it('throws a clear error for an unknown league', async () => {
      const ctx = makeCtx();
      mockHttp(ctx, { 'index-state': () => INDEX_STATE });
      const cache = new NinjaPriceCache(ctx);

      await expect(cache.getPriceMap('Currency', 'Nonexistent League')).rejects.toThrow(
        /not a league poe\.ninja tracks/
      );
    });
  });

  describe('caching', () => {
    it('returns cached result and skips second HTTP call', async () => {
      const ctx = makeCtx();
      const httpGet = mockHttp(ctx, {
        'index-state': () => INDEX_STATE,
        'currency/overview': () => ({ lines: [] }),
      });
      const cache = new NinjaPriceCache(ctx);

      await cache.getPriceMap('Currency', 'Settlers');
      await cache.getPriceMap('Currency', 'Settlers');

      const currencyCalls = httpGet.mock.calls.filter((c: any[]) => c[0].includes('currency/overview'));
      expect(currencyCalls).toHaveLength(1);
    });

    it('uses separate cache keys for different leagues', async () => {
      const ctx = makeCtx();
      const httpGet = mockHttp(ctx, {
        'index-state': () => INDEX_STATE,
        'currency/overview': () => ({ lines: [] }),
      });
      const cache = new NinjaPriceCache(ctx);

      await cache.getPriceMap('Currency', 'Settlers');
      await cache.getPriceMap('Currency', 'Standard');

      const currencyCalls = httpGet.mock.calls.filter((c: any[]) => c[0].includes('currency/overview'));
      expect(currencyCalls).toHaveLength(2);
    });

    it('uses separate cache keys for different categories', async () => {
      const ctx = makeCtx();
      const httpGet = mockHttp(ctx, {
        'index-state': () => INDEX_STATE,
        'currency/overview': () => ({ lines: [] }),
      });
      const cache = new NinjaPriceCache(ctx);

      await cache.getPriceMap('Currency', 'Settlers');
      await cache.getPriceMap('Fragment', 'Settlers');

      const currencyCalls = httpGet.mock.calls.filter((c: any[]) => c[0].includes('currency/overview'));
      expect(currencyCalls).toHaveLength(2);
    });

    it('includes patchVersion in cache key', async () => {
      const ctx = makeCtx();
      mockHttp(ctx, {
        'index-state': () => INDEX_STATE,
        'currency/overview': () => ({ lines: [] }),
      });
      const cache = new NinjaPriceCache(ctx);
      await cache.getPriceMap('Currency', 'Settlers');

      const cacheSetCall = (ctx.cache.set as ReturnType<typeof vi.fn>).mock.calls.find((c: any[]) =>
        c[0].startsWith('wealth:ninja:3.26.0:')
      );
      expect(cacheSetCall).toBeDefined();
    });

    it('caches index-state so two lookups in different leagues only fetch it once', async () => {
      const ctx = makeCtx();
      const httpGet = mockHttp(ctx, {
        'index-state': () => INDEX_STATE,
        'currency/overview': () => ({ lines: [] }),
      });
      const cache = new NinjaPriceCache(ctx);

      await cache.getPriceMap('Currency', 'Settlers');
      await cache.getPriceMap('Currency', 'Standard');

      const indexStateCalls = httpGet.mock.calls.filter((c: any[]) => c[0].includes('index-state'));
      expect(indexStateCalls).toHaveLength(1);
    });
  });

  describe('getDivinePrice', () => {
    it('returns divine orb chaos equivalent', async () => {
      const ctx = makeCtx();
      mockHttp(ctx, {
        'index-state': () => INDEX_STATE,
        'currency/overview': () => ({ lines: [{ currencyTypeName: 'Divine Orb', chaosEquivalent: 200 }] }),
      });
      const cache = new NinjaPriceCache(ctx);

      expect(await cache.getDivinePrice('Settlers')).toBe(200);
    });

    it('returns 1 when divine orb is not in the price list', async () => {
      const ctx = makeCtx();
      mockHttp(ctx, {
        'index-state': () => INDEX_STATE,
        'currency/overview': () => ({ lines: [] }),
      });
      const cache = new NinjaPriceCache(ctx);

      expect(await cache.getDivinePrice('Settlers')).toBe(1);
    });

    it('propagates errors (callers are responsible for graceful degradation)', async () => {
      const ctx = makeCtx();
      (ctx.http.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('poe.ninja is down'));
      const cache = new NinjaPriceCache(ctx);

      await expect(cache.getDivinePrice('Settlers')).rejects.toThrow('poe.ninja is down');
    });
  });
});

describe('NinjaPriceCache — stale snapshot version retry', () => {
  function notFoundError(): Error {
    const err = new Error('Request failed with status code 404') as Error & {
      response: { status: number };
    };
    err.response = { status: 404 };
    return err;
  }

  it('invalidates cached index-state and retries once when the economy call 404s on a stale version', async () => {
    const ctx = makeCtx();
    let indexStateCalls = 0;
    const httpGet = ctx.http.get as ReturnType<typeof vi.fn>;
    httpGet.mockImplementation((url: string) => {
      if (url.includes('index-state')) {
        indexStateCalls++;
        const version = indexStateCalls === 1 ? 'v-standard-stale' : 'v-standard-fresh';
        return Promise.resolve({
          economyLeagues: [{ name: 'Standard', url: 'standard', displayName: 'Standard' }],
          oldEconomyLeagues: [],
          snapshotVersions: [{ url: 'standard', type: 'exp', version }],
        });
      }
      if (url.includes('currency/overview')) {
        if (url.includes('v-standard-stale')) throw notFoundError();
        return Promise.resolve({
          lines: [{ currencyTypeName: 'Divine Orb', chaosEquivalent: 200, receive: { listing_count: 50 } }],
        });
      }
      throw new Error(`Unmocked URL: ${url}`);
    });

    const cache = new NinjaPriceCache(ctx);
    const map = await cache.getPriceMap('Currency', 'Standard');

    expect(map.get('divine orb')?.chaosValue).toBe(200);
    expect(indexStateCalls).toBe(2); // initial + retry after invalidating cached index-state
    const currencyCalls = httpGet.mock.calls.filter((c: any[]) => c[0].includes('currency/overview'));
    expect(currencyCalls).toHaveLength(2);
    expect(currencyCalls[1][0]).toContain('v-standard-fresh');
  });

  it('does not retry more than once — a second 404 on the fresh version propagates', async () => {
    const ctx = makeCtx();
    const httpGet = ctx.http.get as ReturnType<typeof vi.fn>;
    httpGet.mockImplementation((url: string) => {
      if (url.includes('index-state')) {
        return Promise.resolve({
          economyLeagues: [{ name: 'Standard', url: 'standard', displayName: 'Standard' }],
          oldEconomyLeagues: [],
          snapshotVersions: [{ url: 'standard', type: 'exp', version: 'v-always-stale' }],
        });
      }
      if (url.includes('currency/overview')) throw notFoundError();
      throw new Error(`Unmocked URL: ${url}`);
    });

    const cache = new NinjaPriceCache(ctx);
    await expect(cache.getPriceMap('Currency', 'Standard')).rejects.toThrow();

    const currencyCalls = httpGet.mock.calls.filter((c: any[]) => c[0].includes('currency/overview'));
    expect(currencyCalls).toHaveLength(2); // initial attempt + exactly one retry
  });

  it('does not retry on non-404 errors (e.g. timeouts) — propagates immediately', async () => {
    const ctx = makeCtx();
    const httpGet = ctx.http.get as ReturnType<typeof vi.fn>;
    httpGet.mockImplementation((url: string) => {
      if (url.includes('index-state')) {
        return Promise.resolve({
          economyLeagues: [{ name: 'Standard', url: 'standard', displayName: 'Standard' }],
          oldEconomyLeagues: [],
          snapshotVersions: [{ url: 'standard', type: 'exp', version: 'v-standard-1' }],
        });
      }
      if (url.includes('currency/overview')) throw new Error('socket hang up');
      throw new Error(`Unmocked URL: ${url}`);
    });

    const cache = new NinjaPriceCache(ctx);
    await expect(cache.getPriceMap('Currency', 'Standard')).rejects.toThrow('socket hang up');

    const currencyCalls = httpGet.mock.calls.filter((c: any[]) => c[0].includes('currency/overview'));
    expect(currencyCalls).toHaveLength(1); // no retry for non-404 failures
  });
});

describe('NinjaPriceCache — resolved-league cache keys', () => {
  it('shares one cache entry/HTTP call regardless of the caller-supplied league casing', async () => {
    const ctx = makeCtx();
    const httpGet = mockHttp(ctx, {
      'index-state': () => INDEX_STATE,
      'currency/overview': () => ({ lines: [] }),
    });

    const cache = new NinjaPriceCache(ctx);
    await cache.getPriceMap('Currency', 'standard'); // lowercase
    await cache.getPriceMap('Currency', 'Standard'); // canonical

    const currencyCalls = httpGet.mock.calls.filter((c: any[]) => c[0].includes('currency/overview'));
    expect(currencyCalls).toHaveLength(1);
  });

  it('sends the resolved displayName as the league query param even when called with a differently-cased name', async () => {
    const ctx = makeCtx();
    const httpGet = mockHttp(ctx, {
      'index-state': () => INDEX_STATE,
      'currency/overview': () => ({ lines: [] }),
    });

    const cache = new NinjaPriceCache(ctx);
    await cache.getPriceMap('Currency', 'STANDARD');

    expect(httpGet).toHaveBeenCalledWith(
      expect.stringContaining('currency/overview'),
      expect.objectContaining({ params: expect.objectContaining({ league: 'Standard' }) })
    );
  });
});

describe('NinjaPriceCache — User-Agent header', () => {
  it('sends the poe-ai User-Agent on every economy/index-state request', async () => {
    const ctx = makeCtx();
    const httpGet = mockHttp(ctx, {
      'index-state': () => INDEX_STATE,
      'currency/overview': () => ({ lines: [] }),
    });

    const cache = new NinjaPriceCache(ctx);
    await cache.getPriceMap('Currency', 'Standard');

    for (const call of httpGet.mock.calls) {
      expect(call[1]).toEqual(
        expect.objectContaining({ headers: { 'User-Agent': 'poe-ai/1.0 (github.com/msciotti/poe-ai)' } })
      );
    }
  });
});
