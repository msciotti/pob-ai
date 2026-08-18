import type { RawStashItem } from './types.js';
import type { NinjaPriceCache } from './ninja-prices.js';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Build the poe.ninja lookup name for a map item.
 * Returns null if the item is missing the required Map Tier property.
 */
function buildMapName(item: RawStashItem): string | null {
  const tierProp = item.properties?.find(p => p.name === 'Map Tier');
  if (!tierProp) return null;
  const tier = tierProp.values[0]?.[0];
  if (!tier) return null;

  const mods = item.explicitMods ?? [];
  let prefix = '';
  if (mods.some(m => m.toLowerCase().includes('blight-ravaged'))) prefix = 'Blight-Ravaged ';
  else if (mods.some(m => m.toLowerCase().includes('blighted'))) prefix = 'Blighted ';

  return `${prefix}${item.typeLine} T${tier}`;
}

/**
 * Strip game-engine format tags from a unique item's name field.
 * The PoE stash API returns names like "<<set:S>>Kaom's Heart".
 */
function uniqueName(item: RawStashItem): string {
  return item.name.replace(/<<set:[^>]+>>/g, '').trim();
}

// ──────────────────────────────────────────────────────────────────────────────
// ItemPricer
// ──────────────────────────────────────────────────────────────────────────────

/** Unique item category order to try when the stash API doesn't give us a sub-type */
const UNIQUE_CATS = [
  'UniqueWeapon',
  'UniqueArmour',
  'UniqueAccessory',
  'UniqueJewel',
  'UniqueFlask',
] as const;

type UniqueCat = typeof UNIQUE_CATS[number];
type NinjaCategory = UniqueCat | 'Currency' | 'Fragment' | 'Map' | 'DivinationCard' | 'SkillGem';

export class ItemPricer {
  constructor(private priceCache: NinjaPriceCache) {}

  /**
   * Attempt to price a raw stash item.
   * Returns null for item types we don't know how to price (rares, magic, normal bases).
   */
  async priceItem(
    item: RawStashItem,
    league: string
  ): Promise<{ chaosValue: number; category: string } | null> {
    const ext = item.extended?.category;

    // ── Gem ───────────────────────────────────────────────────────────────────
    if (item.frameType === 4 || ext === 'gems') {
      return this.lookup('SkillGem', item.typeLine.toLowerCase(), league);
    }

    // ── Currency ──────────────────────────────────────────────────────────────
    if (ext === 'currency') {
      const result = await this.lookup('Currency', item.typeLine.toLowerCase(), league);
      if (!result) return null;
      const qty = item.stackSize ?? 1;
      return { chaosValue: result.chaosValue * qty, category: result.category };
    }

    // ── Divination Card ───────────────────────────────────────────────────────
    if (ext === 'cards') {
      return this.lookup('DivinationCard', item.typeLine.toLowerCase(), league);
    }

    // ── Map ───────────────────────────────────────────────────────────────────
    if (ext === 'maps') {
      const mapName = buildMapName(item);
      if (!mapName) return null;
      return this.lookup('Map', mapName.toLowerCase(), league);
    }

    // ── Fragment ──────────────────────────────────────────────────────────────
    if (ext === 'fragment') {
      return this.lookup('Fragment', item.typeLine.toLowerCase(), league);
    }

    // ── Unique ────────────────────────────────────────────────────────────────
    if (item.frameType === 3) {
      const name = uniqueName(item).toLowerCase();
      for (const cat of UNIQUE_CATS) {
        const result = await this.lookup(cat, name, league);
        if (result) return result;
      }
      return null;
    }

    // Rares, magic, normal bases — not priced
    return null;
  }

  private async lookup(
    category: NinjaCategory,
    lookupKey: string,
    league: string
  ): Promise<{ chaosValue: number; category: string } | null> {
    const map = await this.priceCache.getPriceMap(category as Parameters<typeof this.priceCache.getPriceMap>[0], league);
    const entry = map.get(lookupKey);
    if (!entry) return null;
    return { chaosValue: entry.chaosValue, category };
  }
}
