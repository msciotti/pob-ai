import type { PluginContext } from '@poe-ai/core';
import type { NinjaPriceLine } from './types.js';

/**
 * poe.ninja client for plugin-wealth.
 *
 * poe.ninja's old public endpoints (`/api/data/currencyoverview`,
 * `/api/data/itemoverview`) 404 as of 2026-08. The site now calls a
 * different set of endpoints under `https://poe.ninja/poe1/api/...` that
 * require resolving a numeric "snapshot version" for the league first.
 * There's no official API documentation for any of this.
 *
 * This is a small, deliberately-duplicated copy of the client logic added
 * for @poe-ai/plugin-ninja (see that package's ninja-client.ts for the full
 * writeup of how these endpoints were discovered/verified) — cross-plugin
 * runtime deps aren't added through core, so plugins each carry their own
 * copy of this shape of glue code.
 *
 *   1. GET /poe1/api/data/index-state
 *      League list + a numeric "snapshot version" per league slug, required
 *      in the path of every economy endpoint below.
 *   2. GET /poe1/api/economy/stash/{version}/currency/overview?type=&league=
 *      Currency + Fragment. Replaces /api/data/currencyoverview.
 *   3. GET /poe1/api/economy/stash/{version}/item/overview?type=&league=
 *      Uniques, maps, skill gems. Replaces /api/data/itemoverview.
 *   4. GET /poe1/api/economy/exchange/{version}/overview?type=&league=
 *      DivinationCard, which 404s on item/overview.
 */

const TTL_MS = 15 * 60 * 1000;
const INDEX_STATE_TTL_MS = 15 * 60 * 1000;

const BASE_URL = 'https://poe.ninja';
const USER_AGENT = 'poe-ai/1.0 (github.com/msciotti/poe-ai)';

/**
 * poe.ninja can rotate a league's snapshot version well inside our 15-minute
 * index-state TTL. When that happens every economy endpoint 404s against
 * the now-stale `{version}` in the path. Detect that specific failure so we
 * can invalidate the cached index-state and retry once with a fresh version,
 * rather than surfacing every call as an error until the TTL naturally expires.
 */
function isNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const status =
    (err as { response?: { status?: number } }).response?.status ??
    (err as { status?: number }).status;
  return status === 404;
}

type NinjaCategory =
  | 'Currency' | 'Fragment'
  | 'Map'
  | 'UniqueWeapon' | 'UniqueArmour' | 'UniqueAccessory' | 'UniqueJewel' | 'UniqueFlask'
  | 'DivinationCard' | 'SkillGem';

const CURRENCY_CATS: NinjaCategory[] = ['Currency', 'Fragment'];
const EXCHANGE_ONLY_CATS: NinjaCategory[] = ['DivinationCard'];

// ──────────────────────────────────────────────────────────────────────────
// Raw response shapes (see @poe-ai/plugin-ninja's types.ts for full detail)
// ──────────────────────────────────────────────────────────────────────────

interface NinjaLeagueRef {
  name: string;
  url: string;
  displayName: string;
}

interface NinjaSnapshotVersion {
  url: string;
  type: string;
  version: string;
}

interface NinjaIndexState {
  economyLeagues: NinjaLeagueRef[];
  oldEconomyLeagues: NinjaLeagueRef[];
  snapshotVersions: NinjaSnapshotVersion[];
}

interface NinjaCurrencyDirection {
  listing_count: number;
}

/** Raw shape returned by the currency endpoint */
interface RawCurrencyLine {
  currencyTypeName: string;
  chaosEquivalent: number;
  pay?: NinjaCurrencyDirection;
  receive?: NinjaCurrencyDirection;
}

/** Raw shape returned by the item endpoint */
interface RawItemLine {
  name: string;
  chaosValue: number;
  divineValue?: number;
  listingCount?: number;
  count?: number;
  variant?: string;
}

interface RawExchangeCoreItem {
  id: string;
  name: string;
}

interface RawExchangeOverviewResponse {
  core: { rates: Record<string, number> };
  items: RawExchangeCoreItem[];
  lines: Array<{ id: string; primaryValue: number }>;
}

export class NinjaPriceCache {
  constructor(private ctx: PluginContext) {}

  async getPriceMap(category: NinjaCategory, league: string): Promise<Map<string, NinjaPriceLine>> {
    // Resolve to the canonical league displayName first so the cache key is
    // stable regardless of how the caller spelled/cased the league name
    // (e.g. "standard" and "Standard" now share one cache entry/HTTP call).
    const { version, displayName } = await this.resolveLeague(league);

    const key = this.priceMapCacheKey(category, displayName);
    const cached = this.ctx.cache.get<Map<string, NinjaPriceLine>>(key);
    if (cached) return cached;

    const map = await this.fetchPriceMapWithRetry(category, version, displayName, league);

    this.ctx.cache.set(key, map, TTL_MS);
    return map;
  }

  private async fetchPriceMapForVersion(
    category: NinjaCategory,
    version: string,
    leagueDisplayName: string
  ): Promise<Map<string, NinjaPriceLine>> {
    if ((CURRENCY_CATS as string[]).includes(category)) {
      return this.fetchCurrencyMap(version, leagueDisplayName, category);
    }
    if ((EXCHANGE_ONLY_CATS as string[]).includes(category)) {
      return this.fetchExchangeMap(version, leagueDisplayName, category);
    }
    return this.fetchItemMap(version, leagueDisplayName, category);
  }

  /**
   * Fetch a price map for an already-resolved version, and if that 404s
   * (stale snapshot version — poe.ninja rotated it since we cached
   * index-state), invalidate the cached index-state, re-resolve the league,
   * and retry exactly once with the fresh version before giving up.
   */
  private async fetchPriceMapWithRetry(
    category: NinjaCategory,
    version: string,
    leagueDisplayName: string,
    league: string
  ): Promise<Map<string, NinjaPriceLine>> {
    try {
      return await this.fetchPriceMapForVersion(category, version, leagueDisplayName);
    } catch (err) {
      if (!isNotFoundError(err)) throw err;
      this.ctx.cache.delete(this.indexStateCacheKey());
      const fresh = await this.resolveLeague(league);
      return this.fetchPriceMapForVersion(category, fresh.version, fresh.displayName);
    }
  }

  private priceMapCacheKey(category: NinjaCategory, league: string): string {
    return `wealth:ninja:${this.ctx.leagueState.patchVersion}:${league}:${category}`;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // League / snapshot-version resolution
  // ──────────────────────────────────────────────────────────────────────────

  private async resolveLeague(league: string): Promise<{ version: string; displayName: string }> {
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

    // 'exp' is the standard trade-league snapshot. PoE has no separate SSF
    // trade economy (SSF doesn't trade), so we always resolve 'exp'.
    const snapshot = index.snapshotVersions.find((v) => v.url === entry.url && v.type === 'exp');
    if (!snapshot) {
      throw new Error(`poe.ninja has no economy snapshot for league "${league}" right now.`);
    }

    return { version: snapshot.version, displayName: entry.name };
  }

  private async fetchIndexState(): Promise<NinjaIndexState> {
    const cacheKey = this.indexStateCacheKey();
    const cached = this.ctx.cache.get<NinjaIndexState>(cacheKey);
    if (cached) return cached;

    const data = await this.ctx.http.get<NinjaIndexState>(`${BASE_URL}/poe1/api/data/index-state`, {
      headers: { 'User-Agent': USER_AGENT },
      timeoutMs: 15_000,
    });
    this.ctx.cache.set(cacheKey, data, INDEX_STATE_TTL_MS);
    return data;
  }

  private indexStateCacheKey(): string {
    return `wealth:ninja:index-state:${this.ctx.leagueState.patchVersion}`;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Per-endpoint fetch + normalize
  // ──────────────────────────────────────────────────────────────────────────

  private async fetchCurrencyMap(
    version: string,
    leagueDisplayName: string,
    category: NinjaCategory
  ): Promise<Map<string, NinjaPriceLine>> {
    const raw = await this.ctx.http.get<{ lines?: RawCurrencyLine[] }>(
      `${BASE_URL}/poe1/api/economy/stash/${version}/currency/overview`,
      { params: { league: leagueDisplayName, type: category }, headers: { 'User-Agent': USER_AGENT }, timeoutMs: 15_000 }
    );
    const rawLines = raw?.lines ?? [];

    // divineValue isn't provided directly — derive it from the Divine Orb's
    // own chaos-equivalent value in the same league. Fragment lookups don't
    // include Divine Orb in their own line set, so fall back to a separate
    // (cached) Currency category fetch.
    let divineOrbChaosValue = rawLines.find((l) => l.currencyTypeName === 'Divine Orb')?.chaosEquivalent;
    if (divineOrbChaosValue === undefined && category !== 'Currency') {
      const currencyMap = await this.getPriceMap('Currency', leagueDisplayName);
      divineOrbChaosValue = currencyMap.get('divine orb')?.chaosValue ?? 0;
    }
    divineOrbChaosValue ??= 0;

    const map = new Map<string, NinjaPriceLine>();
    for (const line of rawLines) {
      map.set(line.currencyTypeName.toLowerCase(), {
        name: line.currencyTypeName,
        chaosValue: line.chaosEquivalent,
        divineValue: divineOrbChaosValue ? line.chaosEquivalent / divineOrbChaosValue : 0,
        listingCount: line.receive?.listing_count ?? line.pay?.listing_count ?? 0,
      });
    }
    return map;
  }

  private async fetchItemMap(
    version: string,
    leagueDisplayName: string,
    category: NinjaCategory
  ): Promise<Map<string, NinjaPriceLine>> {
    const raw = await this.ctx.http.get<{ lines?: RawItemLine[] }>(
      `${BASE_URL}/poe1/api/economy/stash/${version}/item/overview`,
      { params: { league: leagueDisplayName, type: category }, headers: { 'User-Agent': USER_AGENT }, timeoutMs: 15_000 }
    );

    const map = new Map<string, NinjaPriceLine>();
    for (const line of raw?.lines ?? []) {
      map.set(line.name.toLowerCase(), {
        name: line.name,
        chaosValue: line.chaosValue,
        divineValue: line.divineValue,
        listingCount: line.listingCount ?? line.count,
        variant: line.variant,
      });
    }
    return map;
  }

  private async fetchExchangeMap(
    version: string,
    leagueDisplayName: string,
    category: NinjaCategory
  ): Promise<Map<string, NinjaPriceLine>> {
    const raw = await this.ctx.http.get<RawExchangeOverviewResponse>(
      `${BASE_URL}/poe1/api/economy/exchange/${version}/overview`,
      { params: { league: leagueDisplayName, type: category }, headers: { 'User-Agent': USER_AGENT }, timeoutMs: 15_000 }
    );
    const itemsById = new Map((raw?.items ?? []).map((i) => [i.id, i]));
    const divineRate = raw?.core?.rates?.['divine'];

    // No per-line listing count on this endpoint — a known gap vs. the old
    // itemoverview shape.
    const map = new Map<string, NinjaPriceLine>();
    for (const line of raw?.lines ?? []) {
      const item = itemsById.get(line.id);
      if (!item) continue;
      map.set(item.name.toLowerCase(), {
        name: item.name,
        chaosValue: line.primaryValue,
        divineValue: divineRate ? line.primaryValue * divineRate : 0,
        listingCount: 0,
      });
    }
    return map;
  }

  /** Convenience: get the chaos value of Divine Orb (for div conversion) */
  async getDivinePrice(league: string): Promise<number> {
    const map = await this.getPriceMap('Currency', league);
    return map.get('divine orb')?.chaosValue ?? 1;
  }
}
