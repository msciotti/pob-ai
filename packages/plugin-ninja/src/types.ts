// ────────────────────────────────────────────────────────────────────────────
// Types for poe.ninja economy data
//
// poe.ninja's public `/api/data/{currency,item}overview` endpoints were
// retired. The site (an Astro app) now calls a set of endpoints under
// `https://poe.ninja/poe1/api/...` that require resolving a numeric
// "snapshot version" for the league first. There is no official API
// documentation for any of this — these shapes were reverse-engineered from
// the site's own JS bundles and real responses (see ninja-client.ts for the
// resolution flow). Interfaces below only cover the fields we consume.
// ────────────────────────────────────────────────────────────────────────────

export type ItemCategory =
  | 'UniqueWeapon'
  | 'UniqueArmour'
  | 'UniqueAccessory'
  | 'UniqueJewel'
  | 'UniqueFlask'
  | 'Map'
  | 'Currency'
  | 'Fragment'
  | 'DivinationCard'
  | 'SkillGem';

export interface ItemPrice {
  name: string;
  chaosValue: number;
  divineValue: number;
  league: string;
  category: ItemCategory;
  /** Number of price listings sampled */
  listingCount: number;
  /** ISO timestamp of when this data was fetched */
  dataAsOf: string;
}

/** Normalized internal shape all three raw response types are mapped down to. */
export interface RawNinjaEconomyEntry {
  name: string;
  chaosValue: number;
  divineValue?: number;
  listingCount?: number;
  count?: number;
}

// ──────────────────────────────────────────────────────────────────────────
// GET /poe1/api/data/index-state
//
// League + snapshot-version directory. Must be fetched first: economy
// endpoints take a numeric "version" (a snapshot id, NOT the league slug)
// in the path, plus the league's display name as a query param.
// ──────────────────────────────────────────────────────────────────────────

export interface NinjaLeagueRef {
  name: string;
  url: string;
  displayName: string;
}

export interface NinjaSnapshotVersion {
  url: string;
  /** 'exp' is the standard trade-league economy snapshot. Other types observed
   *  in the wild (e.g. 'depthsolo') return identical data to 'exp' in testing
   *  and PoE has no separate SSF trade economy (SSF doesn't trade), so we
   *  always resolve 'exp' regardless of ctx.leagueState.ssf. */
  type: string;
  name: string;
  version: string;
  snapshotName: string;
  overviewType: number;
}

export interface NinjaIndexState {
  economyLeagues: NinjaLeagueRef[];
  oldEconomyLeagues: NinjaLeagueRef[];
  snapshotVersions: NinjaSnapshotVersion[];
}

// ──────────────────────────────────────────────────────────────────────────
// GET /poe1/api/economy/stash/{version}/currency/overview?type=&league=
// Replaces the old /api/data/currencyoverview. Covers Currency + Fragment.
// ──────────────────────────────────────────────────────────────────────────

export interface NinjaCurrencyDirection {
  value: number;
  count: number;
  listing_count: number;
}

export interface RawCurrencyLine {
  currencyTypeName: string;
  pay?: NinjaCurrencyDirection;
  receive?: NinjaCurrencyDirection;
  /** Value in chaos orbs — the direct equivalent of the old `chaosValue`. */
  chaosEquivalent: number;
  detailsId?: string;
}

export interface RawCurrencyOverviewResponse {
  lines: RawCurrencyLine[];
}

// ──────────────────────────────────────────────────────────────────────────
// GET /poe1/api/economy/stash/{version}/item/overview?type=&league=
// Replaces the old /api/data/itemoverview. Covers uniques, maps, skill gems.
// NOT valid for DivinationCard (404s) — that goes through exchange/overview.
// ──────────────────────────────────────────────────────────────────────────

export interface RawItemLine {
  name: string;
  chaosValue: number;
  divineValue?: number;
  listingCount?: number;
  count?: number;
  detailsId?: string;
}

export interface RawItemOverviewResponse {
  lines: RawItemLine[];
}

// ──────────────────────────────────────────────────────────────────────────
// GET /poe1/api/economy/exchange/{version}/overview?type=&league=
// Used for categories with no stash/item/overview coverage (e.g.
// DivinationCard). `lines` and `items` are separate arrays joined by `id`;
// values are denominated in `core.primary` (observed to always be "chaos")
// and there is no per-line listing count.
// ──────────────────────────────────────────────────────────────────────────

export interface RawExchangeCoreItem {
  id: string;
  name: string;
  category: string;
}

export interface RawExchangeCore {
  items: RawExchangeCoreItem[];
  /** Conversion rates from `primary` to other currencies, e.g. { divine: 0.005 } */
  rates: Record<string, number>;
  primary: string;
  secondary?: string;
}

export interface RawExchangeItem {
  id: string;
  name: string;
  category: string;
}

export interface RawExchangeLine {
  id: string;
  primaryValue: number;
}

export interface RawExchangeOverviewResponse {
  core: RawExchangeCore;
  items: RawExchangeItem[];
  lines: RawExchangeLine[];
}
