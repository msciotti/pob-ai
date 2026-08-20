import type { PluginContext } from '@poe-ai/core';
import type {
  ItemPrice,
  ItemCategory,
  RawNinjaEconomyEntry,
  NinjaIndexState,
  RawCurrencyOverviewResponse,
  RawItemOverviewResponse,
  RawExchangeOverviewResponse,
} from './types.js';

/**
 * poe.ninja client.
 *
 * poe.ninja's old public endpoints (`/api/data/currencyoverview`,
 * `/api/data/itemoverview`) 404 as of 2026-08. The site (an Astro app) now
 * calls a different set of endpoints under `https://poe.ninja/poe1/api/...`.
 * There's no official documentation for any of this — the shapes and flow
 * below were reverse-engineered from the site's JS bundles and real
 * responses:
 *
 *   1. GET /poe1/api/data/index-state
 *      Returns the league list (display name <-> URL slug) and, per league
 *      slug, a numeric "snapshot version" that the economy endpoints require
 *      in their path. This must be fetched/resolved before any price lookup.
 *   2. GET /poe1/api/economy/stash/{version}/currency/overview?type=&league=
 *      Currency + Fragment. Replaces /api/data/currencyoverview.
 *   3. GET /poe1/api/economy/stash/{version}/item/overview?type=&league=
 *      Uniques, maps, skill gems. Replaces /api/data/itemoverview.
 *   4. GET /poe1/api/economy/exchange/{version}/overview?type=&league=
 *      Categories with no item/overview coverage (DivinationCard 404s there).
 *
 * `{version}` is the numeric snapshot id from step 1 (NOT the league slug),
 * and `league` must be the league's display name (e.g. "Allflame").
 */

/** TTLs in milliseconds */
const ECONOMY_TTL_MS = 15 * 60 * 1000; // 15 minutes
const INDEX_STATE_TTL_MS = 15 * 60 * 1000; // 15 minutes

const BASE_URL = 'https://poe.ninja';

/** Categories backed by stash/{version}/currency/overview */
const CURRENCY_CATEGORIES: ItemCategory[] = ['Currency', 'Fragment'];

/** Categories with no item/overview coverage — must go through exchange/overview */
const EXCHANGE_ONLY_CATEGORIES: ItemCategory[] = ['DivinationCard'];

/** Order to try when auto-detecting item category */
const AUTO_DETECT_ORDER: ItemCategory[] = [
  'UniqueWeapon',
  'UniqueArmour',
  'UniqueAccessory',
  'UniqueJewel',
  'UniqueFlask',
  'Map',
  'Currency',
  'Fragment',
  'DivinationCard',
  'SkillGem',
];

export class NinjaClient {
  constructor(private readonly ctx: PluginContext) {}

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

    const { version, displayName } = await this.resolveLeague(league);

    let lines: RawNinjaEconomyEntry[];
    if ((CURRENCY_CATEGORIES as string[]).includes(category)) {
      lines = await this.fetchCurrencyLines(version, displayName, category);
    } else if ((EXCHANGE_ONLY_CATEGORIES as string[]).includes(category)) {
      lines = await this.fetchExchangeLines(version, displayName, category);
    } else {
      lines = await this.fetchItemLines(version, displayName, category);
    }

    this.ctx.cache.set(cacheKey, lines, ECONOMY_TTL_MS);
    return lines;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // League / snapshot-version resolution
  // ──────────────────────────────────────────────────────────────────────────

  private async resolveLeague(
    league: string
  ): Promise<{ version: string; displayName: string }> {
    const index = await this.fetchIndexState();
    const normalized = league.toLowerCase();

    const entry =
      index.economyLeagues.find(
        (l) => l.name.toLowerCase() === normalized || l.displayName.toLowerCase() === normalized
      ) ??
      index.oldEconomyLeagues.find(
        (l) => l.name.toLowerCase() === normalized || l.displayName.toLowerCase() === normalized
      );

    if (!entry) {
      throw new Error(
        `"${league}" is not a league poe.ninja tracks economy data for. ` +
          `Known leagues: ${index.economyLeagues.map((l) => l.name).join(', ')}.`
      );
    }

    // 'exp' is the standard trade-league snapshot. SSF has no poe.ninja
    // economy data (there's no trading in SSF to sample prices from), so we
    // always resolve 'exp' regardless of ctx.leagueState.ssf.
    const snapshot = index.snapshotVersions.find(
      (v) => v.url === entry.url && v.type === 'exp'
    );

    if (!snapshot) {
      throw new Error(`poe.ninja has no economy snapshot for league "${league}" right now.`);
    }

    return { version: snapshot.version, displayName: entry.name };
  }

  private async fetchIndexState(): Promise<NinjaIndexState> {
    const cacheKey = `ninja:index-state:${this.ctx.leagueState.patchVersion}`;
    const cached = this.ctx.cache.get<NinjaIndexState>(cacheKey);
    if (cached) return cached;

    const data = await this.ctx.http.get<NinjaIndexState>(
      `${BASE_URL}/poe1/api/data/index-state`,
      { timeoutMs: 15_000 }
    );
    this.ctx.cache.set(cacheKey, data, INDEX_STATE_TTL_MS);
    return data;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Per-endpoint fetch + normalize
  // ──────────────────────────────────────────────────────────────────────────

  private async fetchCurrencyLines(
    version: string,
    leagueDisplayName: string,
    category: ItemCategory
  ): Promise<RawNinjaEconomyEntry[]> {
    const raw = await this.ctx.http.get<RawCurrencyOverviewResponse>(
      `${BASE_URL}/poe1/api/economy/stash/${version}/currency/overview`,
      { params: { type: category, league: leagueDisplayName }, timeoutMs: 15_000 }
    );
    const rawLines = raw?.lines ?? [];

    // divineValue isn't provided directly — it has to be derived from the
    // Divine Orb's own chaos-equivalent value in the same league.
    let divineOrbChaosValue = rawLines.find((l) => l.currencyTypeName === 'Divine Orb')
      ?.chaosEquivalent;
    if (divineOrbChaosValue === undefined && category !== 'Currency') {
      // Divine Orb only appears in the Currency category — Fragment lookups
      // need a separate (cached) call to get the conversion rate. Guarded by
      // `category !== 'Currency'` above so this can never recurse back into
      // itself if a Currency fetch somehow comes back without a Divine Orb.
      const currencyEntries = await this.fetchEconomyLines('Currency', leagueDisplayName);
      divineOrbChaosValue = currencyEntries.find((e) => e.name === 'Divine Orb')?.chaosValue ?? 0;
    }
    divineOrbChaosValue ??= 0;

    return rawLines.map((l) => ({
      name: l.currencyTypeName,
      chaosValue: l.chaosEquivalent,
      divineValue: divineOrbChaosValue ? l.chaosEquivalent / divineOrbChaosValue : 0,
      listingCount: l.receive?.listing_count ?? l.pay?.listing_count ?? 0,
    }));
  }

  private async fetchItemLines(
    version: string,
    leagueDisplayName: string,
    category: ItemCategory
  ): Promise<RawNinjaEconomyEntry[]> {
    const raw = await this.ctx.http.get<RawItemOverviewResponse>(
      `${BASE_URL}/poe1/api/economy/stash/${version}/item/overview`,
      { params: { type: category, league: leagueDisplayName }, timeoutMs: 15_000 }
    );
    const rawLines = raw?.lines ?? [];

    return rawLines.map((l) => ({
      name: l.name,
      chaosValue: l.chaosValue,
      divineValue: l.divineValue,
      listingCount: l.listingCount,
      count: l.count,
    }));
  }

  private async fetchExchangeLines(
    version: string,
    leagueDisplayName: string,
    category: ItemCategory
  ): Promise<RawNinjaEconomyEntry[]> {
    const raw = await this.ctx.http.get<RawExchangeOverviewResponse>(
      `${BASE_URL}/poe1/api/economy/exchange/${version}/overview`,
      { params: { type: category, league: leagueDisplayName }, timeoutMs: 15_000 }
    );
    const rawLines = raw?.lines ?? [];
    const itemsById = new Map((raw?.items ?? []).map((i) => [i.id, i]));
    const divineRate = raw?.core?.rates?.['divine'];

    // The exchange endpoint has no per-line listing count — a known gap vs.
    // the old itemoverview shape.
    const entries: RawNinjaEconomyEntry[] = [];
    for (const l of rawLines) {
      const item = itemsById.get(l.id);
      if (!item) continue;
      entries.push({
        name: item.name,
        chaosValue: l.primaryValue,
        divineValue: divineRate ? l.primaryValue * divineRate : 0,
        listingCount: 0,
      });
    }
    return entries;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Cache key helpers
  // ──────────────────────────────────────────────────────────────────────────

  private economyCacheKey(category: ItemCategory, league: string): string {
    return `ninja:economy:${this.ctx.leagueState.patchVersion}:${league}:${category}`;
  }
}
