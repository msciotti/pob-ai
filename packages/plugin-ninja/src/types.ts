// ────────────────────────────────────────────────────────────────────────────
// Types for poe.ninja build meta data
// ────────────────────────────────────────────────────────────────────────────

export interface GemUsage {
  name: string;
  /** Percentage of sampled builds using this gem (0–100) */
  usagePercent: number;
}

export interface ItemUsage {
  name: string;
  usagePercent: number;
}

export interface KeystoneUsage {
  name: string;
  usagePercent: number;
}

export interface StatRange {
  min: number;
  median: number;
  max: number;
}

export interface MetaBuildData {
  skill: string;
  ascendancy: string | null;
  league: string;
  /** Number of builds sampled to produce this data */
  sampleSize: number;
  /** Most common support gems, sorted by descending usage %, top 10 */
  topSupportGems: GemUsage[];
  /** Most popular unique items across all slots, sorted by descending usage %, top 15 */
  popularUniqueItems: ItemUsage[];
  /** Most popular keystone passives, sorted by descending usage %, top 10 */
  popularKeystones: KeystoneUsage[];
  /** DPS range (TotalDPS or similar) across sampled builds */
  dpsRange: StatRange;
  /** Life or Energy Shield range across sampled builds */
  defenseRange: StatRange;
  /** ISO timestamp of when this data was fetched */
  dataAsOf: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Types for poe.ninja economy data
// ────────────────────────────────────────────────────────────────────────────

export type ItemCategory =
  | 'UniqueWeapon'
  | 'UniqueArmour'
  | 'UniqueAccessory'
  | 'UniqueJewel'
  | 'UniqueFlask'
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

// ────────────────────────────────────────────────────────────────────────────
// Raw poe.ninja API response shapes
//
// NOTE: The builds API response shape is based on community-documented
// endpoint structure. If field names differ from the actual API, update
// RawNinjaBuildEntry and the NinjaClient.getBuildsForSkill() method.
// ────────────────────────────────────────────────────────────────────────────

/** A single build entry from the poe.ninja builds API */
export interface RawNinjaBuildEntry {
  /** Character name */
  name?: string;
  /** Character level */
  level?: number;
  /** The class/ascendancy name (may be "Juggernaut", "Berserker", etc.) */
  class?: string;
  /** The main skill gem name */
  mainSkill?: string;
  /** Alias fields used by different poe.ninja API versions */
  skill?: string;
  /** Primary defensive stat value */
  life?: number;
  energyShield?: number;
  /** DPS stat value */
  dps?: number;
  tDps?: number;
  /** Gem names this character uses (all gems, not just supports) */
  activeGems?: string[];
  /** Unique item names this character has equipped */
  items?: string[];
  /** Keystone passive names this character has allocated */
  keystonePassives?: string[];
}

/** poe.ninja economy item entry (from itemoverview / currencyoverview) */
export interface RawNinjaEconomyEntry {
  name: string;
  chaosValue: number;
  divineValue?: number;
  listingCount?: number;
  count?: number;
}
