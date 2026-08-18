import type { PluginContext } from '@poe-ai/core';

/** TTL: 6 hours in milliseconds */
const CRAFTING_TTL_MS = 6 * 60 * 60 * 1000;

const BASE_URL = 'https://poedb.tw/us';

// ─────────────────────────────────────────────────────────────────────────────
// Return types
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
  /** Mod text with HTML stripped and values normalised, e.g. "+(46 — 48)% to Cold Resistance" */
  text: string;
  /** Tags on this mod, e.g. ["elemental","cold","resistance"] */
  tags: string[];
}

export interface EssenceResult {
  name: string;
  /** All guaranteed mods this essence can apply (across all item types) */
  mods: EssenceMod[];
  error?: string;
}

/** A raw mod entry as embedded by poedb in item-class HTML pages */
interface PoedbModEntry {
  Name: string;
  Level: string;
  ModGenerationTypeID: string;
  ModFamilyList: string[];
  DropChance: number;
  /** HTML string with mod text */
  str: string;
  /** Tags this mod has (used by fossils/harvest) */
  fossil_no: string[];
  /** Item class tags this mod can appear on */
  spawn_no: string[];
}

export interface ModResult {
  /** Mod suffix/prefix name, e.g. "of Bameth" */
  name: string;
  /** Required item level */
  level: number;
  /** Spawn weight on this item class */
  weight: number;
  /** Mod family, e.g. "ChaosResistance" */
  family: string;
  /** Clean mod text, e.g. "+(31 — 35)% to Chaos Resistance" */
  text: string;
  /** Tags this mod has, e.g. ["chaos","resistance"] */
  tags: string[];
  /** Generation type: "normal" | "synthesis" | "corrupted" | other */
  generationType: string;
}

export interface HarvestCraft {
  name: string;
  description: string;
  /** Harvest colour that produces this craft: yellow, blue, purple, red */
  colour: 'yellow' | 'blue' | 'purple' | 'red';
  /** Tag associated with the craft operation, e.g. "life", "caster" */
  tag: string;
  /** Broad applicability — not always 1-to-1 with PoE item classes */
  applicableTo: string[];
  operation: 'reforge' | 'augment' | 'remove-add' | 'remove' | 'other';
}

// ─────────────────────────────────────────────────────────────────────────────
// Static harvest craft data
// Harvest crafts are a finite, patch-stable list; we keep them as static data
// rather than scraping poedb (which doesn't have a clean harvest endpoint).
// ─────────────────────────────────────────────────────────────────────────────

const HARVEST_CRAFTS: HarvestCraft[] = [
  // ── Reforge keeping prefix/suffix ──────────────────────────────────────────
  {
    name: 'Reforge keeping prefixes',
    description: 'Reforge a magic or rare item with new random modifiers, keeping all prefixes.',
    colour: 'yellow',
    tag: 'reforge',
    applicableTo: ['any'],
    operation: 'reforge',
  },
  {
    name: 'Reforge keeping suffixes',
    description: 'Reforge a magic or rare item with new random modifiers, keeping all suffixes.',
    colour: 'yellow',
    tag: 'reforge',
    applicableTo: ['any'],
    operation: 'reforge',
  },
  // ── Augment ─────────────────────────────────────────────────────────────────
  {
    name: 'Augment a life modifier',
    description: 'Add a new life modifier to a magic or rare item that has no life modifier.',
    colour: 'yellow',
    tag: 'life',
    applicableTo: ['any'],
    operation: 'augment',
  },
  {
    name: 'Augment a caster modifier',
    description: 'Add a new caster modifier to a magic or rare item that has no caster modifier.',
    colour: 'blue',
    tag: 'caster',
    applicableTo: ['weapon', 'armour', 'accessory'],
    operation: 'augment',
  },
  {
    name: 'Augment an attack modifier',
    description: 'Add a new attack modifier to a magic or rare item that has no attack modifier.',
    colour: 'yellow',
    tag: 'attack',
    applicableTo: ['weapon', 'armour', 'accessory'],
    operation: 'augment',
  },
  {
    name: 'Augment a defence modifier',
    description: 'Add a new defence modifier to a magic or rare item that has no defence modifier.',
    colour: 'purple',
    tag: 'defence',
    applicableTo: ['armour'],
    operation: 'augment',
  },
  {
    name: 'Augment a physical modifier',
    description: 'Add a new physical modifier to a magic or rare item that has no physical modifier.',
    colour: 'yellow',
    tag: 'physical',
    applicableTo: ['weapon', 'armour'],
    operation: 'augment',
  },
  {
    name: 'Augment a fire modifier',
    description: 'Add a new fire modifier to a magic or rare item that has no fire modifier.',
    colour: 'red',
    tag: 'fire',
    applicableTo: ['weapon', 'armour', 'accessory'],
    operation: 'augment',
  },
  {
    name: 'Augment a cold modifier',
    description: 'Add a new cold modifier to a magic or rare item that has no cold modifier.',
    colour: 'blue',
    tag: 'cold',
    applicableTo: ['weapon', 'armour', 'accessory'],
    operation: 'augment',
  },
  {
    name: 'Augment a lightning modifier',
    description: 'Add a new lightning modifier to a magic or rare item that has no lightning modifier.',
    colour: 'yellow',
    tag: 'lightning',
    applicableTo: ['weapon', 'armour', 'accessory'],
    operation: 'augment',
  },
  {
    name: 'Augment a chaos modifier',
    description: 'Add a new chaos modifier to a magic or rare item that has no chaos modifier.',
    colour: 'purple',
    tag: 'chaos',
    applicableTo: ['weapon', 'armour', 'accessory'],
    operation: 'augment',
  },
  {
    name: 'Augment a speed modifier',
    description: 'Add a new speed modifier to a magic or rare item that has no speed modifier.',
    colour: 'yellow',
    tag: 'speed',
    applicableTo: ['boots', 'gloves', 'belt'],
    operation: 'augment',
  },
  // ── Remove-Add (non-destructive reroll of one tag) ─────────────────────────
  {
    name: 'Remove a life modifier, then add a new caster modifier',
    description: 'Remove a life modifier from a rare item, then add a new caster modifier.',
    colour: 'blue',
    tag: 'caster',
    applicableTo: ['weapon', 'armour', 'accessory'],
    operation: 'remove-add',
  },
  {
    name: 'Remove a caster modifier, then add a new life modifier',
    description: 'Remove a caster modifier from a rare item, then add a new life modifier.',
    colour: 'yellow',
    tag: 'life',
    applicableTo: ['weapon', 'armour', 'accessory'],
    operation: 'remove-add',
  },
  {
    name: 'Remove an attack modifier, then add a new caster modifier',
    description: 'Remove an attack modifier from a rare item, then add a new caster modifier.',
    colour: 'blue',
    tag: 'caster',
    applicableTo: ['weapon', 'armour', 'accessory'],
    operation: 'remove-add',
  },
  {
    name: 'Remove a caster modifier, then add a new attack modifier',
    description: 'Remove a caster modifier from a rare item, then add a new attack modifier.',
    colour: 'yellow',
    tag: 'attack',
    applicableTo: ['weapon', 'armour', 'accessory'],
    operation: 'remove-add',
  },
  {
    name: 'Remove a physical modifier, then add a new fire modifier',
    description: 'Remove a physical modifier from a rare item, then add a new fire modifier.',
    colour: 'red',
    tag: 'fire',
    applicableTo: ['weapon', 'armour', 'accessory'],
    operation: 'remove-add',
  },
  {
    name: 'Remove a fire modifier, then add a new cold modifier',
    description: 'Remove a fire modifier from a rare item, then add a new cold modifier.',
    colour: 'blue',
    tag: 'cold',
    applicableTo: ['weapon', 'armour', 'accessory'],
    operation: 'remove-add',
  },
  {
    name: 'Remove a cold modifier, then add a new lightning modifier',
    description: 'Remove a cold modifier from a rare item, then add a new lightning modifier.',
    colour: 'yellow',
    tag: 'lightning',
    applicableTo: ['weapon', 'armour', 'accessory'],
    operation: 'remove-add',
  },
  {
    name: 'Remove a lightning modifier, then add a new chaos modifier',
    description: 'Remove a lightning modifier from a rare item, then add a new chaos modifier.',
    colour: 'purple',
    tag: 'chaos',
    applicableTo: ['weapon', 'armour', 'accessory'],
    operation: 'remove-add',
  },
  {
    name: 'Remove a defence modifier, then add a new life modifier',
    description: 'Remove a defence modifier from a rare item, then add a new life modifier.',
    colour: 'yellow',
    tag: 'life',
    applicableTo: ['armour'],
    operation: 'remove-add',
  },
  {
    name: 'Remove a life modifier, then add a new defence modifier',
    description: 'Remove a life modifier from a rare item, then add a new defence modifier.',
    colour: 'purple',
    tag: 'defence',
    applicableTo: ['armour'],
    operation: 'remove-add',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// CraftingClient
// ─────────────────────────────────────────────────────────────────────────────

// Map poedb ModGenerationTypeID → human-readable label
const GEN_TYPE: Record<string, string> = {
  '1': 'unique',
  '2': 'normal',
  '3': 'synthesis',
  '4': 'enchantment',
  '5': 'corrupted',
  '7': 'bestiary',
  '8': 'synthesis-implicit',
  '10': 'blight',
  '20': 'expedition',
  '24': 'scourge-upside',
  '25': 'scourge-downside',
};

// poedb item class page slug → PoE item class name (add more as needed)
const ITEM_CLASS_SLUGS: Record<string, string> = {
  ring: 'Rings',
  rings: 'Rings',
  amulet: 'Amulets',
  amulets: 'Amulets',
  belt: 'Belts',
  belts: 'Belts',
  helmet: 'Helmets',
  helmets: 'Helmets',
  gloves: 'Gloves',
  boots: 'Boots',
  'body armour': 'BodyArmours',
  'body armor': 'BodyArmours',
  'body armours': 'BodyArmours',
  quiver: 'Quivers',
  quivers: 'Quivers',
  shield: 'Shields',
  shields: 'Shields',
};

export class CraftingClient {
  constructor(private readonly ctx: PluginContext) {}

  // ── HTML fetching ──────────────────────────────────────────────────────────

  private async fetchHtml(slug: string): Promise<string> {
    const url = `${BASE_URL}/${slug}`;
    // ctx.http.get returns parsed JSON by default; for HTML we need the raw string.
    // poedb returns text/html, so the http client will return it as a string.
    const raw = await this.ctx.http.get<string>(url, { timeoutMs: 15_000 });
    if (typeof raw !== 'string') {
      throw new Error(`Expected HTML string from ${url}, got ${typeof raw}`);
    }
    return raw;
  }

  // ── HTML parsing helpers ───────────────────────────────────────────────────

  /** Strip all HTML tags from a string */
  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\u2014/g, '—')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Parse the spawn weight multiplier table poedb embeds on fossil pages.
   *
   * The HTML looks like:
   *   <li><span class='badge bg-primary'>Elemental</span> x600%
   *   <li><span class='badge bg-primary'><i>bleed</i></span> x0%
   *
   * Multiple badge spans before the "x NNN%" indicate combined tag requirements
   * (i.e. the mod must have ALL of those tags).
   */
  private parseSpawnWeightMultipliers(html: string): SpawnWeightMultiplier[] {
    const results: SpawnWeightMultiplier[] = [];

    // Find the spawn-weight-multipliers section
    const sectionIdx = html.indexOf('spawn-weight-multipliers');
    if (sectionIdx === -1) return results;
    const section = html.slice(sectionIdx, sectionIdx + 4000);

    // Each <li> encodes one multiplier rule
    const liMatches = section.matchAll(/<li>(.*?)(?=<li>|<\/ul>|<\/tbody>)/gs);
    for (const [, liHtml] of liMatches) {
      // Extract tag names from badge spans
      const badgeTags: string[] = [];
      for (const [, badgeInner] of liHtml.matchAll(/<span[^>]*badge[^>]*>(.*?)<\/span>/gs)) {
        const tag = this.stripHtml(badgeInner).toLowerCase().trim();
        if (tag) badgeTags.push(tag);
      }
      // Extract the multiplier: "x600%" → 6 or "x0%" → 0
      const multMatch = liHtml.match(/x(\d+)%/);
      if (badgeTags.length > 0 && multMatch) {
        results.push({
          tags: badgeTags,
          multiplier: parseInt(multMatch[1], 10) / 100,
        });
      }
    }

    return results;
  }

  /**
   * Parse the plain-text description of a fossil's effects from the
   * spawn-weight-multipliers paragraph on poedb.
   */
  private parseFossilDescription(html: string): string {
    const sectionIdx = html.indexOf('spawn-weight-multipliers');
    if (sectionIdx === -1) return '';
    const section = html.slice(sectionIdx, sectionIdx + 2000);
    // The description is in a <p> tag immediately following the heading
    const pMatch = section.match(/<p[^>]*>([\s\S]*?)<\/p>/);
    if (!pMatch) {
      // Fall back to stripping everything up to the next section anchor
      const textSection = section.slice(0, 800);
      return this.stripHtml(textSection).replace(/^[^A-Z]*/, '').trim();
    }
    return this.stripHtml(pMatch[1]);
  }

  /**
   * Parse the embedded poedb mod JSON array from an item-class HTML page.
   *
   * poedb inlines a JS array literal like: [{"Name":"of the Brute",...},...]
   * This is the authoritative source for spawn weights and mod tags.
   */
  private parseModArray(html: string): PoedbModEntry[] {
    const idx = html.indexOf('[{"Name":');
    if (idx === -1) return [];

    // Walk forward to find the matching closing bracket
    let depth = 0;
    let end = idx;
    for (let i = idx; i < html.length; i++) {
      if (html[i] === '[') depth++;
      else if (html[i] === ']') {
        depth--;
        if (depth === 0) { end = i + 1; break; }
      }
    }

    try {
      return JSON.parse(html.slice(idx, end)) as PoedbModEntry[];
    } catch {
      return [];
    }
  }

  /**
   * Parse the essence mod table from a poedb essence page.
   *
   * The table has thead `Generation | Description` and one tbody row per mod.
   * poedb doesn't explicitly label which item class gets which mod row,
   * so we return all rows with clean text.
   */
  private parseEssenceMods(html: string): EssenceMod[] {
    const results: EssenceMod[] = [];

    // Find the Essence Modifiers section
    const sectionIdx = html.indexOf('Essence Modifiers');
    if (sectionIdx === -1) return results;
    const section = html.slice(sectionIdx, sectionIdx + 8000);

    // Find the first table (Generation/Description)
    const tableMatch = section.match(/<table[^>]*>([\s\S]*?)<\/table>/);
    if (!tableMatch) return results;

    const tableHtml = tableMatch[1];
    const rowMatches = tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g);

    for (const [, rowHtml] of rowMatches) {
      // Each row has two <td>: Generation and Description
      const cells = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)];
      if (cells.length < 2) continue;

      const generation = this.stripHtml(cells[0][1]).trim() as 'Prefix' | 'Suffix';
      if (generation !== 'Prefix' && generation !== 'Suffix') continue;

      const descHtml = cells[1][1];

      // Extract tags from badge data-tag attributes
      const tags: string[] = [];
      for (const [, tagVal] of descHtml.matchAll(/data-tag="([^"]+)"/g)) {
        tags.push(tagVal.toLowerCase());
      }

      // Strip HTML for clean text — remove the float-end badge span first
      const cleanDesc = descHtml.replace(/<span class='float-end'>[\s\S]*?<\/span>/, '');
      const text = this.stripHtml(cleanDesc);

      if (text) {
        results.push({ generation, text, tags });
      }
    }

    return results;
  }

  // ── Public methods ─────────────────────────────────────────────────────────

  async getFossil(name: string): Promise<FossilResult> {
    const cacheKey = `crafting:fossil:${this.ctx.leagueState.patchVersion}:${name.toLowerCase()}`;
    const cached = this.ctx.cache.get<FossilResult>(cacheKey);
    if (cached) return cached;

    try {
      const slug = name.replace(/\s+/g, '_');
      const html = await this.fetchHtml(slug);

      const spawnWeightMultipliers = this.parseSpawnWeightMultipliers(html);
      const description = this.parseFossilDescription(html);

      const result: FossilResult = { name, spawnWeightMultipliers, description };
      this.ctx.cache.set(cacheKey, result, CRAFTING_TTL_MS);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { name, spawnWeightMultipliers: [], description: '', error: `Failed to fetch fossil "${name}": ${msg}` };
    }
  }

  async getEssence(name: string): Promise<EssenceResult> {
    const cacheKey = `crafting:essence:${this.ctx.leagueState.patchVersion}:${name.toLowerCase()}`;
    const cached = this.ctx.cache.get<EssenceResult>(cacheKey);
    if (cached) return cached;

    try {
      const slug = name.replace(/\s+/g, '_');
      const html = await this.fetchHtml(slug);

      const mods = this.parseEssenceMods(html);
      const result: EssenceResult = { name, mods };
      this.ctx.cache.set(cacheKey, result, CRAFTING_TTL_MS);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { name, mods: [], error: `Failed to fetch essence "${name}": ${msg}` };
    }
  }

  /**
   * Search mods on a given item class.
   *
   * poedb embeds a JSON array of all mods for an item class in the HTML of the
   * item class page (e.g. poedb.tw/us/Rings). We fetch that page, parse the
   * array, then filter by query text, influence tag, and generation type.
   *
   * @param query     Substring match against mod text, e.g. "cold resistance"
   * @param itemClass Normalised item class, e.g. "ring" or "body armour"
   * @param influence Optional influence tag: shaper|elder|crusader|hunter|warlord|redeemer|synthesis|eldritch
   */
  async searchMods(query: string, itemClass?: string, influence?: string): Promise<ModResult[]> {
    const normalised = (itemClass ?? 'ring').toLowerCase().trim();
    const pageSlug = ITEM_CLASS_SLUGS[normalised] ?? 'Rings';

    const cacheKey = `crafting:mods:${this.ctx.leagueState.patchVersion}:${pageSlug}`;
    let entries = this.ctx.cache.get<PoedbModEntry[]>(cacheKey);

    if (!entries) {
      try {
        const html = await this.fetchHtml(pageSlug);
        entries = this.parseModArray(html);
        if (entries.length > 0) {
          this.ctx.cache.set(cacheKey, entries, CRAFTING_TTL_MS);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.ctx.logger.error(`[crafting_mod_lookup] Failed to fetch ${pageSlug}: ${msg}`);
        return [];
      }
    }

    // Determine which generation types to include
    // ModGenerationTypeID "2" = normal explicit mods
    // "3" = synthesis implicit, "5" = corrupted, etc.
    const influenceGenTypes = this.influenceToGenTypes(influence);

    return entries
      .filter((e) => {
        // Generation type filter
        if (influenceGenTypes.length > 0 && !influenceGenTypes.includes(e.ModGenerationTypeID)) {
          return false;
        }
        // For normal mods (no influence filter), only include explicit (type 2)
        if (!influence && e.ModGenerationTypeID !== '2') return false;

        // Query text filter (strip HTML from str for matching)
        if (query) {
          const cleanText = this.stripHtml(e.str).toLowerCase();
          const cleanName = e.Name.toLowerCase();
          const familyName = (e.ModFamilyList[0] ?? '').toLowerCase();
          const q = query.toLowerCase();
          if (!cleanText.includes(q) && !cleanName.includes(q) && !familyName.includes(q)) {
            return false;
          }
        }

        return true;
      })
      .map((e) => this.normalizeModEntry(e));
  }

  // ── Harvest crafts ─────────────────────────────────────────────────────────

  getHarvestOptions(tag?: string, itemClass?: string): HarvestCraft[] {
    let results = HARVEST_CRAFTS;

    if (tag) {
      const lowerTag = tag.toLowerCase();
      results = results.filter((c) => c.tag.toLowerCase() === lowerTag);
    }

    if (itemClass) {
      const lowerClass = itemClass.toLowerCase();
      results = results.filter(
        (c) =>
          c.applicableTo.includes('any') ||
          c.applicableTo.some((a) => a.toLowerCase().includes(lowerClass)) ||
          lowerClass.includes(c.applicableTo.find((a) => lowerClass.includes(a)) ?? '__no_match__')
      );
    }

    return results;
  }

  // ── Influenced mods ────────────────────────────────────────────────────────

  async getInfluencedMods(influence: string, itemClass?: string): Promise<ModResult[]> {
    return this.searchMods('', itemClass, influence);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /** Map an influence name to the poedb ModGenerationTypeID values that represent it */
  private influenceToGenTypes(influence?: string): string[] {
    if (!influence) return [];
    switch (influence.toLowerCase()) {
      case 'synthesis': return ['3', '8'];
      case 'corrupted': return ['5'];
      case 'scourge': return ['24', '25'];
      // Shaper/Elder/Crusader/Hunter/Warlord/Redeemer mods are all "normal" gen type (2)
      // but tagged in fossil_no — we filter by tag below
      default: return ['2'];
    }
  }

  private normalizeModEntry(e: PoedbModEntry): ModResult {
    return {
      name: e.Name,
      level: parseInt(e.Level, 10),
      weight: e.DropChance,
      family: e.ModFamilyList[0] ?? '',
      text: this.stripHtml(e.str),
      tags: e.fossil_no,
      generationType: GEN_TYPE[e.ModGenerationTypeID] ?? e.ModGenerationTypeID,
    };
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
