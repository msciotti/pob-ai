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

/** poe.ninja economy item entry (from itemoverview / currencyoverview) */
export interface RawNinjaEconomyEntry {
  name: string;
  chaosValue: number;
  divineValue?: number;
  listingCount?: number;
  count?: number;
}
