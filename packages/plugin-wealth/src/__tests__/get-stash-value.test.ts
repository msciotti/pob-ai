import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getStashValueTool } from '../tools/get-stash-value.js';
import type { PluginContext } from '@poe-ai/core';
import type { StashTab, RawStashItem } from '../types.js';

// ──────────────────────────────────────────────────────────────────────────────
// Module mocks
// We use vi.fn() at module level and reset them in beforeEach.
// The mock factories use regular functions so they can be used as constructors.
// ──────────────────────────────────────────────────────────────────────────────

const mockGetTabs = vi.fn<() => Promise<StashTab[]>>();
const mockGetTabItems = vi.fn<() => Promise<RawStashItem[]>>();
const mockPriceItem = vi.fn<() => Promise<{ chaosValue: number; category: string } | null>>();
const mockGetDivinePrice = vi.fn<() => Promise<number>>();
const mockGetPriceMap = vi.fn();

vi.mock('../index.js', () => ({
  getCredentials: () => ({ sessionId: 'test-session', cfClearance: 'test-cf' }),
}));

vi.mock('../stash-client.js', () => {
  function StashClient() {
    return {
      getTabs: mockGetTabs,
      getTabItems: mockGetTabItems,
    };
  }
  StashClient.MAX_TABS = 20;
  return { StashClient };
});

vi.mock('../ninja-prices.js', () => {
  function NinjaPriceCache() {
    return {
      getPriceMap: mockGetPriceMap,
      getDivinePrice: mockGetDivinePrice,
    };
  }
  return { NinjaPriceCache };
});

vi.mock('../item-pricer.js', () => {
  function ItemPricer() {
    return {
      priceItem: mockPriceItem,
    };
  }
  return { ItemPricer };
});

const MAX_TABS = 20;

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function makeCtx(): PluginContext {
  return {
    http: { get: vi.fn(), post: vi.fn() },
    cache: {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
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

function makeTab(index: number, name = `Tab ${index}`): StashTab {
  return { id: `tab-${index}`, name, type: 'NormalStash', index };
}

function makeCurrencyItem(typeLine: string, stackSize = 1): RawStashItem {
  return {
    id: `item-${typeLine}`,
    name: '',
    typeLine,
    baseType: typeLine,
    ilvl: 0,
    frameType: 5,
    stackSize,
    extended: { category: 'currency' },
  };
}

function parseResult(result: { content: Array<{ text: string }> }) {
  return JSON.parse(result.content[0].text);
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe('get_stash_value tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDivinePrice.mockResolvedValue(200);
    mockGetPriceMap.mockResolvedValue(new Map());
  });

  it('sums chaos values correctly across multiple tabs', async () => {
    mockGetTabs.mockResolvedValue([makeTab(0), makeTab(1)]);
    mockGetTabItems
      .mockResolvedValueOnce([makeCurrencyItem('Divine Orb', 2)])
      .mockResolvedValueOnce([makeCurrencyItem('Chaos Orb', 10)]);
    mockPriceItem
      .mockResolvedValueOnce({ chaosValue: 400, category: 'Currency' })
      .mockResolvedValueOnce({ chaosValue: 10, category: 'Currency' });

    const ctx = makeCtx();
    const result = await getStashValueTool.handler({}, ctx);

    const data = parseResult(result);
    expect(data.success).toBe(true);
    expect(data.totalChaosValue).toBe(410);
    expect(data.tabsScanned).toBe(2);
  });

  it('converts chaos to divine using divine price', async () => {
    mockGetTabs.mockResolvedValue([makeTab(0)]);
    mockGetTabItems.mockResolvedValue([makeCurrencyItem('Divine Orb', 1)]);
    mockPriceItem.mockResolvedValue({ chaosValue: 400, category: 'Currency' });
    mockGetDivinePrice.mockResolvedValue(200);

    const ctx = makeCtx();
    const result = await getStashValueTool.handler({}, ctx);

    const data = parseResult(result);
    expect(data.totalDivineValue).toBe(2); // 400 / 200
    expect(data.divinePrice).toBe(200);
  });

  it('groups priced items by category', async () => {
    mockGetTabs.mockResolvedValue([makeTab(0)]);
    mockGetTabItems.mockResolvedValue([
      makeCurrencyItem('Divine Orb', 1),
      {
        id: 'card1', name: '', typeLine: 'The Doctor', baseType: 'The Doctor',
        ilvl: 0, frameType: 6, extended: { category: 'cards' },
      },
    ]);
    mockPriceItem
      .mockResolvedValueOnce({ chaosValue: 200, category: 'Currency' })
      .mockResolvedValueOnce({ chaosValue: 4000, category: 'DivinationCard' });

    const ctx = makeCtx();
    const result = await getStashValueTool.handler({}, ctx);

    const data = parseResult(result);
    expect(Object.keys(data.byCategory)).toContain('Currency');
    expect(Object.keys(data.byCategory)).toContain('DivinationCard');
    expect(data.byCategory.Currency.totalChaosValue).toBe(200);
    expect(data.byCategory.DivinationCard.totalChaosValue).toBe(4000);
  });

  it('filters tabs by tabNames (case-insensitive)', async () => {
    mockGetTabs.mockResolvedValue([
      makeTab(0, 'Currency'),
      makeTab(1, 'Maps'),
      makeTab(2, 'Junk'),
    ]);
    mockGetTabItems.mockResolvedValue([]);
    mockPriceItem.mockResolvedValue(null);

    const ctx = makeCtx();
    await getStashValueTool.handler(
      { tabNames: ['currency', 'maps'] },
      ctx
    );

    // Should only fetch items for Currency and Maps, not Junk
    expect(mockGetTabItems).toHaveBeenCalledTimes(2);
  });

  it('caps at 20 tabs even if more are available', async () => {
    const manyTabs = Array.from({ length: 25 }, (_, i) => makeTab(i));
    mockGetTabs.mockResolvedValue(manyTabs);
    mockGetTabItems.mockResolvedValue([]);
    mockPriceItem.mockResolvedValue(null);

    const ctx = makeCtx();
    const result = await getStashValueTool.handler({}, ctx);

    expect(mockGetTabItems).toHaveBeenCalledTimes(MAX_TABS);
    const data = parseResult(result);
    expect(data.tabsScanned).toBe(MAX_TABS);
  });

  it('counts unpriced items correctly', async () => {
    mockGetTabs.mockResolvedValue([makeTab(0)]);
    const rareItem: RawStashItem = {
      id: 'rare1', name: 'Dreadful Salvation', typeLine: 'Hubris Circlet',
      baseType: 'Hubris Circlet', ilvl: 86, frameType: 2,
      extended: { category: 'armour' },
    };
    mockGetTabItems.mockResolvedValue([rareItem, rareItem]);
    mockPriceItem.mockResolvedValue(null);

    const ctx = makeCtx();
    const result = await getStashValueTool.handler({}, ctx);

    const data = parseResult(result);
    expect(data.unpricedItems).toBe(2);
    expect(data.totalChaosValue).toBe(0);
  });

  it('handles empty stash gracefully', async () => {
    mockGetTabs.mockResolvedValue([makeTab(0)]);
    mockGetTabItems.mockResolvedValue([]);

    const ctx = makeCtx();
    const result = await getStashValueTool.handler({}, ctx);

    const data = parseResult(result);
    expect(data.success).toBe(true);
    expect(data.totalChaosValue).toBe(0);
    expect(data.totalDivineValue).toBe(0);
    expect(data.tabsScanned).toBe(1);
    expect(data.unpricedItems).toBe(0);
  });

  it('handles empty tab list gracefully', async () => {
    mockGetTabs.mockResolvedValue([]);

    const ctx = makeCtx();
    const result = await getStashValueTool.handler({}, ctx);

    const data = parseResult(result);
    expect(data.success).toBe(true);
    expect(data.totalChaosValue).toBe(0);
    expect(data.tabsScanned).toBe(0);
    expect(mockGetTabItems).not.toHaveBeenCalled();
  });

  it('uses ctx.leagueState.currentLeague when league is omitted', async () => {
    mockGetTabs.mockResolvedValue([]);

    const ctx = makeCtx();
    const result = await getStashValueTool.handler({}, ctx);

    const data = parseResult(result);
    expect(data.league).toBe('Settlers');
  });

  it('uses the provided league when given', async () => {
    mockGetTabs.mockResolvedValue([]);

    const ctx = makeCtx();
    const result = await getStashValueTool.handler(
      { league: 'Hardcore Settlers' },
      ctx
    );

    const data = parseResult(result);
    expect(data.league).toBe('Hardcore Settlers');
  });

  it('returns isError on unexpected failure', async () => {
    mockGetTabs.mockRejectedValue(new Error('Network error'));

    const ctx = makeCtx();
    const result = await getStashValueTool.handler({}, ctx);

    expect(result.isError).toBe(true);
    const data = parseResult(result);
    expect(data.success).toBe(false);
    expect(data.error).toContain('Network error');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Graceful degradation when poe.ninja pricing is unavailable
  // ──────────────────────────────────────────────────────────────────────────

  describe('pricing unavailable', () => {
    it('still returns stash contents/quantities (not isError) when getDivinePrice throws', async () => {
      mockGetTabs.mockResolvedValue([makeTab(0)]);
      mockGetTabItems.mockResolvedValue([makeCurrencyItem('Chaos Orb', 10)]);
      mockGetDivinePrice.mockRejectedValue(new Error('poe.ninja is down'));

      const ctx = makeCtx();
      const result = await getStashValueTool.handler({}, ctx);

      expect(result.isError).toBeFalsy();
      const data = parseResult(result);
      expect(data.success).toBe(true);
      expect(data.pricingAvailable).toBe(false);
      expect(data.pricingWarning).toContain('poe.ninja is down');
      // priceItem should never even be attempted once pricing is known-down
      expect(mockPriceItem).not.toHaveBeenCalled();
    });

    it('reports quantities for items scanned while pricing is unavailable', async () => {
      mockGetTabs.mockResolvedValue([makeTab(0, 'Currency Tab')]);
      mockGetTabItems.mockResolvedValue([makeCurrencyItem('Chaos Orb', 10)]);
      mockGetDivinePrice.mockRejectedValue(new Error('timeout'));

      const ctx = makeCtx();
      const result = await getStashValueTool.handler({}, ctx);

      const data = parseResult(result);
      expect(data.totalChaosValue).toBe(0);
      expect(data.unpricedItems).toBe(1);
      expect(data.unpricedItemDetails).toHaveLength(1);
      expect(data.unpricedItemDetails[0]).toMatchObject({
        typeLine: 'Chaos Orb',
        stackSize: 10,
        tabName: 'Currency Tab',
      });
    });

    it('degrades to quantities-only for remaining items when pricing fails mid-scan', async () => {
      mockGetTabs.mockResolvedValue([makeTab(0)]);
      mockGetTabItems.mockResolvedValue([
        makeCurrencyItem('Divine Orb', 1),
        makeCurrencyItem('Chaos Orb', 5),
      ]);
      mockGetDivinePrice.mockResolvedValue(200);
      mockPriceItem
        .mockResolvedValueOnce({ chaosValue: 200, category: 'Currency' })
        .mockRejectedValueOnce(new Error('poe.ninja timed out'));

      const ctx = makeCtx();
      const result = await getStashValueTool.handler({}, ctx);

      expect(result.isError).toBeFalsy();
      const data = parseResult(result);
      expect(data.success).toBe(true);
      expect(data.pricingAvailable).toBe(false);
      expect(data.pricingWarning).toContain('poe.ninja timed out');
      expect(data.totalChaosValue).toBe(200); // only the first item priced
      expect(data.unpricedItems).toBe(1);
      expect(data.unpricedItemDetails).toHaveLength(1);
      expect(data.unpricedItemDetails[0].typeLine).toBe('Chaos Orb');
    });

    it('reports pricingAvailable: true and omits pricingWarning/unpricedItemDetails on a normal scan', async () => {
      mockGetTabs.mockResolvedValue([makeTab(0)]);
      mockGetTabItems.mockResolvedValue([makeCurrencyItem('Divine Orb', 1)]);
      mockPriceItem.mockResolvedValue({ chaosValue: 200, category: 'Currency' });

      const ctx = makeCtx();
      const result = await getStashValueTool.handler({}, ctx);

      const data = parseResult(result);
      expect(data.pricingAvailable).toBe(true);
      expect(data.pricingWarning).toBeUndefined();
      expect(data.unpricedItemDetails).toBeUndefined();
    });

    it('does not list quantities for items pricing legitimately skips (rares) when pricing IS available', async () => {
      mockGetTabs.mockResolvedValue([makeTab(0)]);
      const rareItem: RawStashItem = {
        id: 'rare1', name: 'Dreadful Salvation', typeLine: 'Hubris Circlet',
        baseType: 'Hubris Circlet', ilvl: 86, frameType: 2,
        extended: { category: 'armour' },
      };
      mockGetTabItems.mockResolvedValue([rareItem]);
      mockPriceItem.mockResolvedValue(null); // not a pricing failure — just untracked

      const ctx = makeCtx();
      const result = await getStashValueTool.handler({}, ctx);

      const data = parseResult(result);
      expect(data.pricingAvailable).toBe(true);
      expect(data.unpricedItems).toBe(1);
      expect(data.unpricedItemDetails).toBeUndefined();
    });
  });
});
