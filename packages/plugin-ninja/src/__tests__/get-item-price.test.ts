import { describe, it, expect, vi } from 'vitest';
import { getItemPriceTool } from '../tools/get-item-price.js';
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

const INDEX_STATE = {
  economyLeagues: [
    { name: 'Standard', url: 'standard', displayName: 'Standard' },
    { name: 'Settlers of Kalguur', url: 'settlers', displayName: 'Settlers of Kalguur' },
    { name: 'Hardcore', url: 'hardcore', displayName: 'Hardcore' },
  ],
  oldEconomyLeagues: [],
  snapshotVersions: [
    { url: 'standard', type: 'exp', name: 'Standard', version: 'v-standard-1', snapshotName: 'standard', overviewType: 0 },
    { url: 'settlers', type: 'exp', name: 'Settlers of Kalguur', version: 'v-settlers-1', snapshotName: 'settlers', overviewType: 0 },
    { url: 'hardcore', type: 'exp', name: 'Hardcore', version: 'v-hardcore-1', snapshotName: 'hardcore', overviewType: 0 },
  ],
};

/** Wires ctx.http.get to route by URL suffix, mimicking the real endpoint set. */
function mockHttp(ctx: PluginContext, handlers: Record<string, (opts: any) => any>) {
  const httpGet = ctx.http.get as ReturnType<typeof vi.fn>;
  httpGet.mockImplementation((url: string, opts: any) => {
    for (const [suffix, handler] of Object.entries(handlers)) {
      if (url.includes(suffix)) {
        return Promise.resolve(handler(opts));
      }
    }
    throw new Error(`Unmocked URL: ${url}`);
  });
  return httpGet;
}

describe('get_item_price tool', () => {
  it('returns item price when item is found', async () => {
    const ctx = makeCtx();
    mockHttp(ctx, {
      'index-state': () => INDEX_STATE,
      'item/overview': () => ({
        lines: [{ name: "Kaom's Heart", chaosValue: 50, divineValue: 0.3, listingCount: 100 }],
      }),
    });

    const result = await getItemPriceTool.handler(
      { itemName: "Kaom's Heart", category: 'UniqueArmour' },
      ctx
    );

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.name).toBe("Kaom's Heart");
    expect(parsed.chaosValue).toBe(50);
    expect(parsed.category).toBe('UniqueArmour');
  });

  it('defaults to current league when league is not provided', async () => {
    const ctx = makeCtx('Settlers of Kalguur');
    const httpGet = mockHttp(ctx, {
      'index-state': () => INDEX_STATE,
      'currency/overview': () => ({ lines: [] }),
    });

    await getItemPriceTool.handler({ itemName: 'Divine Orb', category: 'Currency' }, ctx);

    expect(httpGet).toHaveBeenCalledWith(
      expect.stringContaining('currency/overview'),
      expect.objectContaining({
        params: expect.objectContaining({ league: 'Settlers of Kalguur' }),
      })
    );
  });

  it('returns isError when item is not found', async () => {
    const ctx = makeCtx();
    mockHttp(ctx, {
      'index-state': () => INDEX_STATE,
      'item/overview': () => ({ lines: [] }),
    });

    const result = await getItemPriceTool.handler(
      { itemName: 'Nonexistent Item', category: 'UniqueWeapon' },
      ctx
    );

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Nonexistent Item');
  });

  it('auto-detects category when none is provided, finding item in UniqueArmour', async () => {
    const ctx = makeCtx();
    mockHttp(ctx, {
      'index-state': () => INDEX_STATE,
      'item/overview': (opts: any) => {
        if (opts?.params?.type === 'UniqueArmour') {
          return { lines: [{ name: "Kaom's Heart", chaosValue: 50, divineValue: 0.3, listingCount: 100 }] };
        }
        return { lines: [] };
      },
      'currency/overview': () => ({ lines: [] }),
      'economy/exchange/': () => ({ core: { items: [], rates: {}, primary: 'chaos' }, items: [], lines: [] }),
    });

    const result = await getItemPriceTool.handler({ itemName: "Kaom's Heart" }, ctx);

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.category).toBe('UniqueArmour');
  });

  it('returns isError when item not found in any category during auto-detect', async () => {
    const ctx = makeCtx();
    mockHttp(ctx, {
      'index-state': () => INDEX_STATE,
      'item/overview': () => ({ lines: [] }),
      'currency/overview': () => ({ lines: [] }),
      'economy/exchange/': () => ({ core: { items: [], rates: {}, primary: 'chaos' }, items: [], lines: [] }),
    });

    const result = await getItemPriceTool.handler({ itemName: 'Ghost Item' }, ctx);

    expect(result.isError).toBe(true);
  });

  it('returns isError when HTTP throws', async () => {
    const ctx = makeCtx();
    const httpGet = ctx.http.get as ReturnType<typeof vi.fn>;
    httpGet.mockRejectedValue(new Error('Timeout'));

    const result = await getItemPriceTool.handler(
      { itemName: 'Divine Orb', category: 'Currency' },
      ctx
    );

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toContain('Timeout');
  });

  it('returns isError with a clear message when the league is unknown to poe.ninja', async () => {
    const ctx = makeCtx();
    mockHttp(ctx, { 'index-state': () => INDEX_STATE });

    const result = await getItemPriceTool.handler(
      { itemName: 'X', category: 'Currency', league: 'Some Made Up League' },
      ctx
    );

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toContain('Some Made Up League');
  });

  it('explicit league param overrides ctx.leagueState', async () => {
    const ctx = makeCtx('Standard');
    const httpGet = mockHttp(ctx, {
      'index-state': () => INDEX_STATE,
      'currency/overview': () => ({ lines: [] }),
    });

    await getItemPriceTool.handler(
      { itemName: 'X', category: 'Currency', league: 'Hardcore' },
      ctx
    );

    expect(httpGet).toHaveBeenCalledWith(
      expect.stringContaining('currency/overview'),
      expect.objectContaining({
        params: expect.objectContaining({ league: 'Hardcore' }),
      })
    );
  });

  it('result includes valid ISO dataAsOf timestamp', async () => {
    const ctx = makeCtx();
    mockHttp(ctx, {
      'index-state': () => INDEX_STATE,
      'item/overview': () => ({
        lines: [{ name: "Kaom's Heart", chaosValue: 50, divineValue: 0.3, listingCount: 100 }],
      }),
    });

    const result = await getItemPriceTool.handler(
      { itemName: "Kaom's Heart", category: 'UniqueArmour' },
      ctx
    );

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(new Date(parsed.dataAsOf).toISOString()).toBe(parsed.dataAsOf);
  });
});
