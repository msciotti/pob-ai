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

describe('NinjaClient — endpoint selection and field mapping', () => {
  it('Currency category uses currencyoverview URL', async () => {
    const ctx = makeCtx();
    const httpGet = ctx.http.get as ReturnType<typeof vi.fn>;
    httpGet.mockResolvedValue({ lines: [{ name: 'Divine Orb', chaosValue: 200, divineValue: 1, listingCount: 500 }] });

    const client = new NinjaClient(ctx);
    await client.getItemPrice('Divine Orb', 'Currency', 'Standard');

    expect(httpGet).toHaveBeenCalledWith(
      expect.stringContaining('currencyoverview'),
      expect.any(Object)
    );
  });

  it('Fragment category uses currencyoverview URL', async () => {
    const ctx = makeCtx();
    const httpGet = ctx.http.get as ReturnType<typeof vi.fn>;
    httpGet.mockResolvedValue({ lines: [{ name: 'Sacrifice at Midnight', chaosValue: 5, divineValue: 0, listingCount: 200 }] });

    const client = new NinjaClient(ctx);
    await client.getItemPrice('Sacrifice at Midnight', 'Fragment', 'Standard');

    expect(httpGet).toHaveBeenCalledWith(
      expect.stringContaining('currencyoverview'),
      expect.any(Object)
    );
  });

  it('UniqueArmour uses itemoverview URL', async () => {
    const ctx = makeCtx();
    const httpGet = ctx.http.get as ReturnType<typeof vi.fn>;
    httpGet.mockResolvedValue({ lines: [{ name: "Kaom's Heart", chaosValue: 50, divineValue: 0.3, listingCount: 100 }] });

    const client = new NinjaClient(ctx);
    await client.getItemPrice("Kaom's Heart", 'UniqueArmour', 'Standard');

    expect(httpGet).toHaveBeenCalledWith(
      expect.stringContaining('itemoverview'),
      expect.any(Object)
    );
  });

  it('uses count field when listingCount is absent', async () => {
    const ctx = makeCtx();
    (ctx.http.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      lines: [{ name: 'Divine Orb', chaosValue: 200, count: 42 }],
    });

    const client = new NinjaClient(ctx);
    const result = await client.getItemPrice('Divine Orb', 'Currency', 'Standard');

    expect(result).not.toBeNull();
    expect(result!.listingCount).toBe(42);
  });

  it('divineValue defaults to 0 when absent', async () => {
    const ctx = makeCtx();
    (ctx.http.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      lines: [{ name: 'Divine Orb', chaosValue: 200, listingCount: 10 }],
    });

    const client = new NinjaClient(ctx);
    const result = await client.getItemPrice('Divine Orb', 'Currency', 'Standard');

    expect(result).not.toBeNull();
    expect(result!.divineValue).toBe(0);
  });
});
