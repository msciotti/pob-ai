/** A single tab from the PoE stash API tab list */
export interface StashTab {
  id: string;
  name: string;
  type: string;     // "NormalStash", "CurrencyStash", "MapStash", "PremiumStash", etc.
  index: number;
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

/** An item we couldn't get a price for because pricing itself was unavailable
 *  (as opposed to an item type we simply don't price, like rares) — still
 *  reported so the user sees what's in the stash even without values. */
export interface UnpricedItemSummary {
  name: string;
  typeLine: string;
  category: string;
  stackSize: number;
  tabName: string;
}

/** Summary of total stash value */
export interface WealthSummary {
  totalChaosValue: number;
  totalDivineValue: number;
  divinePrice: number;    // Current divine orb price in chaos
  byCategory: Record<string, { totalChaosValue: number; items: PricedItem[] }>;
  unpricedItems: number;  // Items we couldn't price (any reason)
  tabsScanned: number;
  /** False if poe.ninja pricing failed partway through (or entirely) —
   *  stash contents/quantities are still returned in that case. */
  pricingAvailable: boolean;
  /** Set when pricingAvailable is false, explaining what happened. */
  pricingWarning?: string;
  /** Contents/quantities for items encountered while pricing was
   *  unavailable — only populated when pricingAvailable is false. */
  unpricedItemDetails?: UnpricedItemSummary[];
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
