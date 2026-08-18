/** A single tab from the PoE stash API tab list */
export interface StashTab {
  id: string;
  name: string;
  type: string;     // "NormalStash", "CurrencyStash", "MapStash", "PremiumStash", etc.
  index: number;
  public: boolean;
}

/** Raw item from the PoE stash API */
export interface RawStashItem {
  id: string;
  name: string;           // Unique item name (may have "<<set:S>>" prefix); empty for non-unique
  typeLine: string;       // Base type name
  baseType: string;
  ilvl: number;
  frameType: number;      // 0=normal, 1=magic, 2=rare, 3=unique, 4=gem, 5=currency, 6=divCard
  stackSize?: number;
  maxStackSize?: number;
  properties?: Array<{
    name: string;
    values: Array<[string, number]>;
  }>;
  explicitMods?: string[];
  extended?: {
    category?: string;   // "currency", "gems", "cards", "maps", "armour", "weapons", "accessories", "jewels", "flasks"
    subcategories?: string[];
  };
}

/** An item with its computed chaos value */
export interface PricedItem {
  name: string;           // Display name
  typeLine: string;
  category: string;
  stackSize: number;
  unitChaosValue: number;
  totalChaosValue: number;
  tabName: string;
}

/** Summary of total stash value */
export interface WealthSummary {
  totalChaosValue: number;
  totalDivineValue: number;
  divinePrice: number;    // Current divine orb price in chaos
  byCategory: Record<string, { totalChaosValue: number; items: PricedItem[] }>;
  unpricedItems: number;  // Items we couldn't price
  tabsScanned: number;
}

/** poe.ninja price entry (reused from ninja-client shape) */
export interface NinjaPriceLine {
  name: string;
  chaosValue: number;
  divineValue?: number;
  listingCount?: number;
  count?: number;
  variant?: string;       // used by some gem entries
}
