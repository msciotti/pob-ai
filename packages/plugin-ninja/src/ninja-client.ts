import type { PluginContext } from '@poe-ai/core';
import type {
  MetaBuildData,
  ItemPrice,
  ItemCategory,
  GemUsage,
  ItemUsage,
  KeystoneUsage,
  StatRange,
  RawNinjaBuildEntry,
  RawNinjaEconomyEntry,
} from './types.js';

/** TTLs in milliseconds */
const BUILDS_TTL_MS = 60 * 60 * 1000;     // 1 hour
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
  private readonly buildsUrl = 'https://poe.ninja/api/data/builds';
  private readonly itemOverviewUrl = 'https://poe.ninja/api/data/itemoverview';
  private readonly currencyOverviewUrl = 'https://poe.ninja/api/data/currencyoverview';

  constructor(private readonly ctx: PluginContext) {}

  // ──────────────────────────────────────────────────────────────────────────
  // Build meta
  // ──────────────────────────────────────────────────────────────────────────

  async getBuildsForSkill(
    skill: string,
    ascendancy: string | null,
    league: string
  ): Promise<MetaBuildData> {
    const cacheKey = this.buildsCacheKey(skill, ascendancy, league);
    const cached = this.ctx.cache.get<MetaBuildData>(cacheKey);
    if (cached) return cached;

    // Fetch the full build overview for the league
    // NOTE: poe.ninja builds API field names are based on community documentation.
    // If the response shape differs, update RawNinjaBuildEntry in types.ts.
    const raw = await this.ctx.http.get<{ lines?: RawNinjaBuildEntry[] }>(this.buildsUrl, {
      params: {
        overview: league,
        type: 'exp',
        language: 'en',
      },
      timeoutMs: 30_000,
    });

    const lines: RawNinjaBuildEntry[] = raw?.lines ?? [];

    // Filter to builds using the requested skill
    let filtered = lines.filter((b) => {
      const mainSkill = b.mainSkill ?? b.skill ?? '';
      return mainSkill.toLowerCase() === skill.toLowerCase();
    });

    // Optionally narrow by ascendancy
    if (ascendancy && filtered.length >= 5) {
      const byAscendancy = filtered.filter(
        (b) => (b.class ?? '').toLowerCase() === ascendancy.toLowerCase()
      );
      // Only apply the filter if there are enough samples
      if (byAscendancy.length >= 5) {
        filtered = byAscendancy;
      } else {
        this.ctx.logger.warn(
          `[plugin-ninja] Only ${byAscendancy.length} builds found for ${skill}/${ascendancy}; ` +
            `falling back to all ${filtered.length} ${skill} builds`
        );
      }
    }

    const sampleSize = filtered.length;
    if (sampleSize === 0) {
      // Return empty result rather than throwing — the skill might just not be popular
      const empty: MetaBuildData = {
        skill,
        ascendancy,
        league,
        sampleSize: 0,
        topSupportGems: [],
        popularUniqueItems: [],
        popularKeystones: [],
        dpsRange: { min: 0, median: 0, max: 0 },
        defenseRange: { min: 0, median: 0, max: 0 },
        dataAsOf: new Date().toISOString(),
      };
      return empty;
    }

    const result: MetaBuildData = {
      skill,
      ascendancy: ascendancy ?? null,
      league,
      sampleSize,
      topSupportGems: this.computeGemUsage(filtered, skill, sampleSize),
      popularUniqueItems: this.computeItemUsage(filtered, sampleSize),
      popularKeystones: this.computeKeystoneUsage(filtered, sampleSize),
      dpsRange: this.computeStatRange(filtered.map((b) => b.dps ?? b.tDps ?? 0)),
      defenseRange: this.computeStatRange(
        filtered.map((b) => Math.max(b.life ?? 0, b.energyShield ?? 0))
      ),
      dataAsOf: new Date().toISOString(),
    };

    this.ctx.cache.set(cacheKey, result, BUILDS_TTL_MS);
    return result;
  }

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

  private buildsCacheKey(skill: string, ascendancy: string | null, league: string): string {
    return `ninja:builds:${this.ctx.leagueState.patchVersion}:${league}:${skill}:${ascendancy ?? 'any'}`;
  }

  private economyCacheKey(category: ItemCategory, league: string): string {
    return `ninja:economy:${this.ctx.leagueState.patchVersion}:${league}:${category}`;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Aggregation helpers
  // ──────────────────────────────────────────────────────────────────────────

  private computeGemUsage(
    builds: RawNinjaBuildEntry[],
    mainSkill: string,
    sampleSize: number
  ): GemUsage[] {
    const counts = new Map<string, number>();
    for (const build of builds) {
      for (const gem of build.activeGems ?? []) {
        // Skip the main skill itself — we want supports and off-skills
        if (gem.toLowerCase() === mainSkill.toLowerCase()) continue;
        counts.set(gem, (counts.get(gem) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([name, count]) => ({
        name,
        usagePercent: Math.round((count / sampleSize) * 1000) / 10,
      }))
      .sort((a, b) => b.usagePercent - a.usagePercent)
      .slice(0, 10);
  }

  private computeItemUsage(builds: RawNinjaBuildEntry[], sampleSize: number): ItemUsage[] {
    const counts = new Map<string, number>();
    for (const build of builds) {
      for (const item of build.items ?? []) {
        counts.set(item, (counts.get(item) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([name, count]) => ({
        name,
        usagePercent: Math.round((count / sampleSize) * 1000) / 10,
      }))
      .sort((a, b) => b.usagePercent - a.usagePercent)
      .slice(0, 15);
  }

  private computeKeystoneUsage(builds: RawNinjaBuildEntry[], sampleSize: number): KeystoneUsage[] {
    const counts = new Map<string, number>();
    for (const build of builds) {
      for (const keystone of build.keystonePassives ?? []) {
        counts.set(keystone, (counts.get(keystone) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([name, count]) => ({
        name,
        usagePercent: Math.round((count / sampleSize) * 1000) / 10,
      }))
      .sort((a, b) => b.usagePercent - a.usagePercent)
      .slice(0, 10);
  }

  private computeStatRange(values: number[]): StatRange {
    const nonZero = values.filter((v) => v > 0).sort((a, b) => a - b);
    if (nonZero.length === 0) return { min: 0, median: 0, max: 0 };
    const mid = Math.floor(nonZero.length / 2);
    const median =
      nonZero.length % 2 === 0
        ? (nonZero[mid - 1] + nonZero[mid]) / 2
        : nonZero[mid];
    return {
      min: Math.round(nonZero[0]),
      median: Math.round(median),
      max: Math.round(nonZero[nonZero.length - 1]),
    };
  }
}
