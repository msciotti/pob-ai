import type { PluginContext } from '@poe-ai/core';
import type {
  ItemPrice,
  ItemCategory,
  RawNinjaEconomyEntry,
} from './types.js';

/** TTLs in milliseconds */
const ECONOMY_TTL_MS = 15 * 60 * 1000;    // 15 minutes

/** Categories backed by itemoverview vs currencyoverview */
const CURRENCY_CATEGORIES: ItemCategory[] = ['Currency', 'Fragment'];

/** Order to try when auto-detecting item category */
const AUTO_DETECT_ORDER: ItemCategory[] = [
  'UniqueWeapon',
  'UniqueArmour',
  'UniqueAccessory',
  'UniqueJewel',
  'UniqueFlask',
  'Currency',
  'Fragment',
  'DivinationCard',
  'SkillGem',
];

export class NinjaClient {
  private readonly itemOverviewUrl = 'https://poe.ninja/api/data/itemoverview';
  private readonly currencyOverviewUrl = 'https://poe.ninja/api/data/currencyoverview';

  constructor(private readonly ctx: PluginContext) {}

  // ──────────────────────────────────────────────────────────────────────────
  // ──────────────────────────────────────────────────────────────────────────
  // Economy / item prices
  // ──────────────────────────────────────────────────────────────────────────

  async getItemPrice(
    itemName: string,
    category: ItemCategory | undefined,
    league: string
  ): Promise<ItemPrice | null> {
    if (category) {
      return this.getItemPriceFromCategory(itemName, category, league);
    }

    // Auto-detect: try each category in order
    for (const cat of AUTO_DETECT_ORDER) {
      const result = await this.getItemPriceFromCategory(itemName, cat, league);
      if (result) return result;
    }
    return null;
  }

  private async getItemPriceFromCategory(
    itemName: string,
    category: ItemCategory,
    league: string
  ): Promise<ItemPrice | null> {
    const lines = await this.fetchEconomyLines(category, league);
    const match = lines.find(
      (l) => l.name.toLowerCase() === itemName.toLowerCase()
    );
    if (!match) return null;

    return {
      name: match.name,
      chaosValue: match.chaosValue,
      divineValue: match.divineValue ?? 0,
      league,
      category,
      listingCount: match.listingCount ?? match.count ?? 0,
      dataAsOf: new Date().toISOString(),
    };
  }

  private async fetchEconomyLines(
    category: ItemCategory,
    league: string
  ): Promise<RawNinjaEconomyEntry[]> {
    const cacheKey = this.economyCacheKey(category, league);
    const cached = this.ctx.cache.get<RawNinjaEconomyEntry[]>(cacheKey);
    if (cached) return cached;

    const isCurrency = (CURRENCY_CATEGORIES as string[]).includes(category);
    const url = isCurrency ? this.currencyOverviewUrl : this.itemOverviewUrl;

    const raw = await this.ctx.http.get<{ lines?: RawNinjaEconomyEntry[] }>(url, {
      params: { league, type: category },
      timeoutMs: 15_000,
    });

    const lines: RawNinjaEconomyEntry[] = raw?.lines ?? [];
    this.ctx.cache.set(cacheKey, lines, ECONOMY_TTL_MS);
    return lines;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Cache key helpers
  // ──────────────────────────────────────────────────────────────────────────

  private economyCacheKey(category: ItemCategory, league: string): string {
    return `ninja:economy:${this.ctx.leagueState.patchVersion}:${league}:${category}`;
  }
}
