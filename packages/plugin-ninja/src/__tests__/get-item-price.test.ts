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

describe('get_item_price tool', () => {
  it('returns item price when item is found', async () => {
    const ctx = makeCtx();
    (ctx.http.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      lines: [
        { name: "Kaom's Heart", chaosValue: 50, divineValue: 0.3, listingCount: 100 },
      ],
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
    const httpGet = ctx.http.get as ReturnType<typeof vi.fn>;
    httpGet.mockResolvedValue({ lines: [] });

    await getItemPriceTool.handler({ itemName: 'Divine Orb', category: 'Currency' }, ctx);

    expect(httpGet).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        params: expect.objectContaining({ league: 'Settlers of Kalguur' }),
      })
    );
  });

  it('returns isError when item is not found', async () => {
    const ctx = makeCtx();
    (ctx.http.get as ReturnType<typeof vi.fn>).mockResolvedValue({ lines: [] });

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
    const httpGet = ctx.http.get as ReturnType<typeof vi.fn>;
    httpGet.mockImplementation((_url: string, opts: any) => {
      if (opts?.params?.type === 'UniqueArmour') {
        return Promise.resolve({
          lines: [{ name: "Kaom's Heart", chaosValue: 50, divineValue: 0.3, listingCount: 100 }],
        });
      }
      return Promise.resolve({ lines: [] });
    });

    const result = await getItemPriceTool.handler({ itemName: "Kaom's Heart" }, ctx);

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.category).toBe('UniqueArmour');
  });

  it('returns isError when item not found in any category during auto-detect', async () => {
    const ctx = makeCtx();
    (ctx.http.get as ReturnType<typeof vi.fn>).mockResolvedValue({ lines: [] });

    const result = await getItemPriceTool.handler({ itemName: 'Ghost Item' }, ctx);

    expect(result.isError).toBe(true);
  });

  it('returns isError when HTTP throws', async () => {
    const ctx = makeCtx();
    (ctx.http.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Timeout'));

    const result = await getItemPriceTool.handler(
      { itemName: 'Divine Orb', category: 'Currency' },
      ctx
    );

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toContain('Timeout');
  });
});
