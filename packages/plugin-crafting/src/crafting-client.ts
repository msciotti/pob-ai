import type { PluginContext } from '@poe-ai/core';
import {
  getMods,
  getFossils,
  getEssences,
  getBaseItems,
  getItemClasses,
  getGameDataVersion,
} from '@poe-ai/game-data';
import type { RePoEMod, RePoEItemClasses } from '@poe-ai/game-data';

// ─────────────────────────────────────────────────────────────────────────────
// Return types
//
// These shapes are preserved from the poedb-scraping implementation (PR #55)
// so tool output stays stable for existing consumers -- only the data source
// underneath changed. Exception: ModResult.level was renamed to
// requiredLevel (issue #64) -- it's an item-level requirement, and the bare
// "level" name was ambiguous against mod/gem level. This is a client-visible
// field rename.
// ─────────────────────────────────────────────────────────────────────────────

export interface SpawnWeightMultiplier {
  /** Tag(s) the multiplier applies to, e.g. ["elemental"] or ["physical","ailment"] */
  tags: string[];
  /** Multiplier value, e.g. 6 means 6× weight boost; 0 means blocked */
  multiplier: number;
}

export interface FossilResult {
  name: string;
  /** Spawn weight multipliers this fossil applies to mod tags */
  spawnWeightMultipliers: SpawnWeightMultiplier[];
  /** Human-readable description of the fossil's effects */
  description: string;
  error?: string;
}

export interface EssenceMod {
  generation: 'Prefix' | 'Suffix';
  /** Mod text with values normalised, e.g. "+(46-48)% to Cold Resistance" */
  text: string;
  /** Tags on this mod, e.g. ["elemental","cold","resistance"] */
  tags: string[];
}

export interface EssenceResult {
  name: string;
  /** All guaranteed mods this essence can apply (across all item types), deduplicated */
  mods: EssenceMod[];
  error?: string;
}

export interface ModResult {
  /** Mod suffix/prefix name, e.g. "of Bameth" */
  name: string;
  /** Required item level */
  requiredLevel: number;
  /** Spawn weight on this item class */
  weight: number;
  /** Mod family/group, e.g. "ChaosResistance" */
  family: string;
  /** Mod text, e.g. "+(31-35)% to Chaos Resistance" */
  text: string;
  /** Tags this mod has, e.g. ["chaos","resistance"] */
  tags: string[];
  /** Generation type, e.g. "prefix" | "suffix" | "corrupted" | other RePoE generation_type */
  generationType: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Item class resolution
//
// User-facing item class strings (e.g. "ring", "body armour") are resolved to
// an item_classes.min.json key. Common shorthand is aliased explicitly since
// RePoE's own keys are a mix of singular/plural and multi-word forms (e.g.
// "Ring", "Body Armour", "One Hand Sword").
// ─────────────────────────────────────────────────────────────────────────────

const ITEM_CLASS_ALIASES: Record<string, string> = {
  ring: 'Ring',
  rings: 'Ring',
  amulet: 'Amulet',
  amulets: 'Amulet',
  belt: 'Belt',
  belts: 'Belt',
  helmet: 'Helmet',
  helmets: 'Helmet',
  helm: 'Helmet',
  helms: 'Helmet',
  gloves: 'Gloves',
  glove: 'Gloves',
  boots: 'Boots',
  boot: 'Boots',
  'body armour': 'Body Armour',
  'body armor': 'Body Armour',
  'body armours': 'Body Armour',
  chest: 'Body Armour',
  quiver: 'Quiver',
  quivers: 'Quiver',
  shield: 'Shield',
  shields: 'Shield',
  jewel: 'Jewel',
  jewels: 'Jewel',
  sword: 'One Hand Sword',
  'one hand sword': 'One Hand Sword',
  '2h sword': 'Two Hand Sword',
  'two hand sword': 'Two Hand Sword',
  axe: 'One Hand Axe',
  'one hand axe': 'One Hand Axe',
  '2h axe': 'Two Hand Axe',
  'two hand axe': 'Two Hand Axe',
  mace: 'One Hand Mace',
  'one hand mace': 'One Hand Mace',
  '2h mace': 'Two Hand Mace',
  'two hand mace': 'Two Hand Mace',
  bow: 'Bow',
  bows: 'Bow',
  staff: 'Staff',
  staves: 'Staff',
  staffs: 'Staff',
  warstaff: 'Warstaff',
  claw: 'Claw',
  claws: 'Claw',
  dagger: 'Dagger',
  daggers: 'Dagger',
  'rune dagger': 'Rune Dagger',
  wand: 'Wand',
  wands: 'Wand',
  sceptre: 'Sceptre',
  sceptres: 'Sceptre',
  scepter: 'Sceptre',
};

/** Resolve a user-facing item class string to its item_classes.min.json key. */
function resolveItemClassKey(itemClasses: RePoEItemClasses, input?: string): string | undefined {
  if (!input) return undefined;
  if (itemClasses[input]) return input;

  const norm = input.trim().toLowerCase();
  for (const key of Object.keys(itemClasses)) {
    if (key.toLowerCase() === norm) return key;
    if (itemClasses[key].name.toLowerCase() === norm) return key;
  }
  return ITEM_CLASS_ALIASES[norm];
}

/**
 * Resolve the set of item tags shared by every base item of a given class --
 * the tag set the game checks a mod's `spawn_weights` against for that class.
 *
 * We take the intersection (not union) of tags across all bases of the class:
 * attribute tags (str_armour/dex_armour/etc.) vary per base within a class, so
 * intersecting strips those out and leaves only the tags every base shares
 * (e.g. "ring", "default", or "body_armour"/"armour"/"default"). Verified
 * against the real 3.29.3.1.4 export -- see PR description.
 */
async function getItemClassTags(ctx: PluginContext, classKey: string): Promise<Set<string>> {
  const version = await getGameDataVersion();
  const cacheKey = `crafting:classtags:${version}:${classKey}`;
  const cached = ctx.cache.get<string[]>(cacheKey);
  if (cached) return new Set(cached);

  const baseItems = await getBaseItems();
  let intersection: Set<string> | undefined;
  for (const item of Object.values(baseItems)) {
    if (item.item_class !== classKey) continue;
    const itemTags = new Set(item.tags);
    intersection = intersection
      ? new Set([...intersection].filter((t) => itemTags.has(t)))
      : itemTags;
  }
  const tags = intersection ? [...intersection] : [];
  ctx.cache.set(cacheKey, tags);
  return new Set(tags);
}

/**
 * Resolve a mod's spawn weight for a given item tag set by replicating the
 * game's rule: walk `spawn_weights` in order and return the first entry whose
 * tag the item has. Returns undefined if nothing matches (mod cannot spawn on
 * this item at all -- shouldn't normally happen since almost every item tag
 * set includes "default").
 */
function resolveSpawnWeight(mod: RePoEMod, tags: Set<string>): number | undefined {
  for (const sw of mod.spawn_weights) {
    if (tags.has(sw.tag)) return sw.weight;
  }
  return undefined;
}

function toModResult(mod: RePoEMod, weight: number): ModResult {
  return {
    name: mod.name,
    requiredLevel: mod.required_level,
    weight,
    family: mod.groups[0] ?? '',
    text: mod.text,
    tags: mod.implicit_tags,
    generationType: mod.generation_type,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Influence resolution
//
// The six "conqueror-style" influences (Shaper, Elder, and the four map
// conquerors) are encoded in RePoE as a per-item-class `influence_tags` array
// on item_classes.min.json, using internal codenames for three of them --
// verified against the real 3.29.3.1.4 export:
//   Hunter -> "basilisk", Warlord -> "adjudicator", Redeemer -> "eyrie"
// (Shaper/Elder/Crusader keep their plain names as codenames.)
//
// Synthesis and Eldritch mods aren't per-item-class influence tags -- they're
// identified by `generation_type` instead. NOTE: this RePoE export has no
// domain="item" mods under a synthesis-flavoured generation_type (the
// synthesis_a/synthesis_globals/synthesis_bonus types that do exist are all
// map-mod domains, not gear-implicit mods) -- see PR description. "synthesis"
// is kept here for forward-compatibility but currently returns no results.
// ─────────────────────────────────────────────────────────────────────────────

const INFLUENCE_CODENAMES: Record<string, string> = {
  shaper: 'shaper',
  elder: 'elder',
  crusader: 'crusader',
  hunter: 'basilisk',
  warlord: 'adjudicator',
  redeemer: 'eyrie',
};

const GENERATION_TYPE_INFLUENCES: Record<string, string[]> = {
  eldritch: ['searing_exarch_implicit', 'eater_of_worlds_implicit'],
  corrupted: ['corrupted'],
  scourge: ['scourge_benefit', 'scourge_detriment', 'scourge_gimmick'],
  synthesis: ['synthesis_a', 'synthesis_globals', 'synthesis_bonus'],
};

// ─────────────────────────────────────────────────────────────────────────────
// CraftingClient
// ─────────────────────────────────────────────────────────────────────────────

export class CraftingClient {
  constructor(private readonly ctx: PluginContext) {}

  async getFossil(name: string): Promise<FossilResult> {
    try {
      const fossils = await getFossils();
      const target = name.trim().toLowerCase();
      const entry = Object.values(fossils).find((f) => f.name.toLowerCase() === target);

      if (!entry) {
        return {
          name,
          spawnWeightMultipliers: [],
          description: '',
          error: `Fossil "${name}" not found in local game data`,
        };
      }

      const spawnWeightMultipliers: SpawnWeightMultiplier[] = [
        ...entry.positive_mod_weights.map((w) => ({ tags: [w.tag], multiplier: w.weight / 100 })),
        ...entry.negative_mod_weights.map((w) => ({ tags: [w.tag], multiplier: w.weight / 100 })),
      ];
      const description = [
        ...Object.values(entry.descriptions),
        ...Object.values(entry.blocked_descriptions),
      ].join('; ');

      return { name: entry.name, spawnWeightMultipliers, description };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        name,
        spawnWeightMultipliers: [],
        description: '',
        error: `Failed to load fossil "${name}": ${msg}`,
      };
    }
  }

  async getEssence(name: string): Promise<EssenceResult> {
    try {
      const essences = await getEssences();
      const target = name.trim().toLowerCase();
      const entry = Object.values(essences).find((e) => e.name.toLowerCase() === target);

      if (!entry) {
        return { name, mods: [], error: `Essence "${name}" not found in local game data` };
      }

      const modsData = await getMods();
      const seen = new Set<string>();
      const mods: EssenceMod[] = [];

      for (const modId of Object.values(entry.mods)) {
        if (seen.has(modId)) continue;
        seen.add(modId);

        const mod = modsData[modId];
        if (!mod) continue;

        const generation =
          mod.generation_type === 'prefix' ? 'Prefix' : mod.generation_type === 'suffix' ? 'Suffix' : undefined;
        if (!generation || !mod.text) continue;

        mods.push({ generation, text: mod.text, tags: mod.implicit_tags });
      }

      return { name: entry.name, mods };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { name, mods: [], error: `Failed to load essence "${name}": ${msg}` };
    }
  }

  /**
   * Search mods on a given item class.
   *
   * @param query     Substring match against mod text, name, or family, e.g. "cold damage"
   * @param itemClass Item class, e.g. "ring" or "body armour"
   * @param influence Optional influence filter: shaper|elder|crusader|hunter|warlord|redeemer|synthesis|eldritch|corrupted|scourge
   */
  async searchMods(query: string, itemClass?: string, influence?: string): Promise<ModResult[]> {
    let results: ModResult[];

    if (influence) {
      results = await this.getInfluencedMods(influence, itemClass);
    } else {
      const itemClasses = await getItemClasses();
      // Default to "ring" only when itemClass was omitted entirely -- a typo'd
      // or unrecognized class must NOT silently fall back to plausible-looking
      // Ring data, it should return nothing.
      const classKey = resolveItemClassKey(itemClasses, itemClass ?? 'ring');
      if (!classKey) {
        this.ctx.logger.warn(`[crafting] Unknown item class "${itemClass}" -- returning no results`);
        return [];
      }
      const tags = await getItemClassTags(this.ctx, classKey);
      const mods = await getMods();

      results = [];
      for (const mod of Object.values(mods)) {
        if (mod.domain !== 'item') continue;
        // Essence-only mods (e.g. "of the Essence") have no real spawn tag and
        // would otherwise only be excluded incidentally because their only
        // spawn_weights entry is "default":0 -- check the flag explicitly so a
        // future essence-only mod with a nonzero non-default weight can't leak
        // into normal search results.
        if (mod.is_essence_only) continue;
        if (mod.generation_type !== 'prefix' && mod.generation_type !== 'suffix') continue;
        if (!mod.text) continue;

        const weight = resolveSpawnWeight(mod, tags);
        if (!weight) continue;

        results.push(toModResult(mod, weight));
      }
    }

    const q = query.toLowerCase().trim();
    if (!q) return results;

    return results.filter((m) => {
      return (
        m.text.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        m.family.toLowerCase().includes(q)
      );
    });
  }

  /**
   * Look up influence-specific item modifiers.
   *
   * @param influence Influence type: shaper|elder|crusader|hunter|warlord|redeemer|synthesis|eldritch
   * @param itemClass Optional item class filter, e.g. "ring", "helmet"
   */
  async getInfluencedMods(influence: string, itemClass?: string): Promise<ModResult[]> {
    const key = influence.trim().toLowerCase();
    const itemClasses = await getItemClasses();
    const mods = await getMods();

    // Resolve itemClass once, up front, for both branches below. An
    // unrecognized item class must return [] (not silently ignore the
    // filter) -- only an OMITTED item class means "no class filter".
    let classKey: string | undefined;
    if (itemClass) {
      classKey = resolveItemClassKey(itemClasses, itemClass);
      if (!classKey) {
        this.ctx.logger.warn(`[crafting] Unknown item class "${itemClass}" -- returning no results`);
        return [];
      }
    }

    const codename = INFLUENCE_CODENAMES[key];
    if (codename) {
      // classInfluenceTags stays undefined ONLY when no itemClass was given
      // (meaning: don't filter by class at all). Whenever a class WAS given
      // and resolved, this is always an array -- possibly empty, if that
      // class can't roll influence mods at all (e.g. Belt) -- so the
      // `.includes()` check below correctly yields zero matches for it,
      // rather than falling through as "no filter" the way an `undefined`
      // fallback would.
      const classInfluenceTags: string[] | undefined = classKey
        ? itemClasses[classKey]?.influence_tags ?? []
        : undefined;

      const results: ModResult[] = [];
      for (const mod of Object.values(mods)) {
        if (mod.domain !== 'item' || !mod.text) continue;

        for (const sw of mod.spawn_weights) {
          if (!sw.tag.endsWith(`_${codename}`)) continue;
          if (classInfluenceTags && !classInfluenceTags.includes(sw.tag)) continue;
          if (sw.weight > 0) results.push(toModResult(mod, sw.weight));
          break; // a mod only carries one influence-family tag
        }
      }
      return results;
    }

    const allowedGenTypes = GENERATION_TYPE_INFLUENCES[key];
    if (!allowedGenTypes) {
      this.ctx.logger.warn(`[crafting] Unknown influence "${influence}" -- returning no results`);
      return [];
    }

    const tags = classKey ? await getItemClassTags(this.ctx, classKey) : undefined;
    const results: ModResult[] = [];
    for (const mod of Object.values(mods)) {
      if (mod.domain !== 'item' || !mod.text) continue;
      if (!allowedGenTypes.includes(mod.generation_type)) continue;

      const weight = tags ? resolveSpawnWeight(mod, tags) : mod.spawn_weights[0]?.weight ?? 0;
      if (!weight) continue;

      results.push(toModResult(mod, weight));
    }
    return results;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility: craftofexile.com deep link
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a craftofexile.com deep link for a given crafting method.
 * @param method - e.g. 'fossil', 'essence', 'beast', 'harvest'
 */
export function generateCraftofExileLink(method: string): string {
  return `https://www.craftofexile.com/?m=${encodeURIComponent(method)}`;
}
