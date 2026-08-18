import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NinjaPriceCache } from '../ninja-prices.js';
import type { PluginContext } from '@poe-ai/core';

const ITEM_URL = 'https://poe.ninja/poe1/api/economy/stash/current/item/overview';
const CURRENCY_URL = 'https://poe.ninja/poe1/api/economy/stash/current/currency/overview';

function makeCtx(httpGetImpl?: (url: string, opts: unknown) => unknown): PluginContext {
  const store = new Map<string, unknown>();
  return {
    http: {
      get: vi.fn().mockImplementation(httpGetImpl ?? (() => ({ lines: [] }))),
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

describe('NinjaPriceCache', () => {
  describe('getPriceMap — currency categories', () => {
    it('calls the currency URL for Currency category', async () => {
      const ctx = makeCtx(() => ({ lines: [] }));
      const cache = new NinjaPriceCache(ctx);
      await cache.getPriceMap('Currency', 'Settlers');

      expect(ctx.http.get).toHaveBeenCalledWith(
        CURRENCY_URL,
        expect.objectContaining({ params: expect.objectContaining({ type: 'Currency' }) })
      );
    });

    it('calls the currency URL for Fragment category', async () => {
      const ctx = makeCtx(() => ({ lines: [] }));
      const cache = new NinjaPriceCache(ctx);
      await cache.getPriceMap('Fragment', 'Settlers');

      expect(ctx.http.get).toHaveBeenCalledWith(CURRENCY_URL, expect.anything());
    });

    it('maps currencyTypeName and chaosEquivalent to NinjaPriceLine shape', async () => {
      const ctx = makeCtx(() => ({
        lines: [
          { currencyTypeName: 'Divine Orb', chaosEquivalent: 200, listingCount: 500 },
          { currencyTypeName: 'Chaos Orb', chaosEquivalent: 1 },
        ],
      }));
      const cache = new NinjaPriceCache(ctx);
      const map = await cache.getPriceMap('Currency', 'Settlers');

      expect(map.get('divine orb')).toMatchObject({ name: 'Divine Orb', chaosValue: 200 });
      expect(map.get('chaos orb')).toMatchObject({ name: 'Chaos Orb', chaosValue: 1 });
    });

    it('uses case-insensitive keys', async () => {
      const ctx = makeCtx(() => ({
        lines: [{ currencyTypeName: 'Orb of Alteration', chaosEquivalent: 0.5 }],
      }));
      const cache = new NinjaPriceCache(ctx);
      const map = await cache.getPriceMap('Currency', 'Settlers');

      expect(map.get('orb of alteration')).toBeDefined();
    });
  });

  describe('getPriceMap — item categories', () => {
    it('calls the item URL for UniqueWeapon category', async () => {
      const ctx = makeCtx(() => ({ lines: [] }));
      const cache = new NinjaPriceCache(ctx);
      await cache.getPriceMap('UniqueWeapon', 'Settlers');

      expect(ctx.http.get).toHaveBeenCalledWith(
        ITEM_URL,
        expect.objectContaining({ params: expect.objectContaining({ type: 'UniqueWeapon' }) })
      );
    });

    it('maps name and chaosValue correctly for item lines', async () => {
      const ctx = makeCtx(() => ({
        lines: [
          { name: "Kaom's Heart", chaosValue: 5000, divineValue: 25 },
          { name: 'Shavrone\'s Wrappings', chaosValue: 3200 },
        ],
      }));
      const cache = new NinjaPriceCache(ctx);
      const map = await cache.getPriceMap('UniqueArmour', 'Settlers');

      expect(map.get("kaom's heart")).toMatchObject({ name: "Kaom's Heart", chaosValue: 5000, divineValue: 25 });
    });

    it('preserves variant field on item lines', async () => {
      const ctx = makeCtx(() => ({
        lines: [{ name: 'Empower Support', chaosValue: 150, variant: '20/20' }],
      }));
      const cache = new NinjaPriceCache(ctx);
      const map = await cache.getPriceMap('SkillGem', 'Settlers');

      expect(map.get('empower support')?.variant).toBe('20/20');
    });
  });

  describe('caching', () => {
    it('returns cached result and skips second HTTP call', async () => {
      const ctx = makeCtx(() => ({ lines: [] }));
      const cache = new NinjaPriceCache(ctx);

      await cache.getPriceMap('Currency', 'Settlers');
      await cache.getPriceMap('Currency', 'Settlers');

      expect(ctx.http.get).toHaveBeenCalledTimes(1);
    });

    it('uses separate cache keys for different leagues', async () => {
      const ctx = makeCtx(() => ({ lines: [] }));
      const cache = new NinjaPriceCache(ctx);

      await cache.getPriceMap('Currency', 'Settlers');
      await cache.getPriceMap('Currency', 'Standard');

      expect(ctx.http.get).toHaveBeenCalledTimes(2);
    });

    it('uses separate cache keys for different categories', async () => {
      const ctx = makeCtx(() => ({ lines: [] }));
      const cache = new NinjaPriceCache(ctx);

      await cache.getPriceMap('Currency', 'Settlers');
      await cache.getPriceMap('Fragment', 'Settlers');

      expect(ctx.http.get).toHaveBeenCalledTimes(2);
    });

    it('includes patchVersion in cache key', async () => {
      const ctx = makeCtx(() => ({ lines: [] }));
      const cache = new NinjaPriceCache(ctx);
      await cache.getPriceMap('Currency', 'Settlers');

      const cacheSetCall = (ctx.cache.set as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(cacheSetCall[0]).toContain('3.26.0');
    });
  });

  describe('getDivinePrice', () => {
    it('returns divine orb chaos equivalent', async () => {
      const ctx = makeCtx(() => ({
        lines: [{ currencyTypeName: 'Divine Orb', chaosEquivalent: 200 }],
      }));
      const cache = new NinjaPriceCache(ctx);

      expect(await cache.getDivinePrice('Settlers')).toBe(200);
    });

    it('returns 1 when divine orb is not in the price list', async () => {
      const ctx = makeCtx(() => ({ lines: [] }));
      const cache = new NinjaPriceCache(ctx);

      expect(await cache.getDivinePrice('Settlers')).toBe(1);
    });
  });
});
