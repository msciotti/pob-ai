import type { PluginContext } from '@poe-ai/core';

/** TTL: 6 hours in milliseconds */
const CRAFTING_TTL_MS = 6 * 60 * 60 * 1000;

const BASE_URL = 'https://poedb.tw/us';

// ─────────────────────────────────────────────────────────────────────────────
// Return types
// ─────────────────────────────────────────────────────────────────────────────

export interface FossilResult {
  name: string;
  /** Modifier tags this fossil adds or restricts */
  tags?: string[];
  /** Fossil description/effect text */
  description?: string;
  /** Raw API or HTML response for inspection */
  raw?: unknown;
  /** Whether the data came from a fallback (HTML) source */
  fallback?: boolean;
  error?: string;
}

export interface EssenceResult {
  name: string;
  /** Guaranteed mods this essence applies per item class */
  guaranteedMods?: Record<string, string>;
  /** Raw API or HTML response for inspection */
  raw?: unknown;
  fallback?: boolean;
  error?: string;
}

export interface ModResult {
  id?: string;
  name?: string;
  text?: string;
  itemClass?: string;
  influence?: string;
  /** Full raw entry from the API */
  raw?: unknown;
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

export class CraftingClient {
  constructor(private readonly ctx: PluginContext) {}

  // ── Fossils ────────────────────────────────────────────────────────────────

  async getFossil(name: string): Promise<FossilResult> {
    const cacheKey = `crafting:fossil:${this.ctx.leagueState.patchVersion}:${name.toLowerCase()}`;
    const cached = this.ctx.cache.get<FossilResult>(cacheKey);
    if (cached) return cached;

    try {
      const url = `${BASE_URL}/json.php`;
      const raw = await this.ctx.http.get<unknown>(url, {
        params: { type: 'Fossil', n: name },
        timeoutMs: 10_000,
      });

      // poedb JSON endpoint may return an error object or HTML string
      if (typeof raw === 'string' || this.isErrorResponse(raw)) {
        return await this.getFossilFallback(name, cacheKey);
      }

      const result: FossilResult = { name, raw };
      this.ctx.cache.set(cacheKey, result, CRAFTING_TTL_MS);
      return result;
    } catch {
      return await this.getFossilFallback(name, cacheKey);
    }
  }

  private async getFossilFallback(name: string, cacheKey: string): Promise<FossilResult> {
    try {
      // URL-encode the fossil name: spaces become underscores for poedb paths
      const slug = name.replace(/\s+/g, '_');
      const raw = await this.ctx.http.get<unknown>(`${BASE_URL}/${slug}`, {
        timeoutMs: 10_000,
      });
      const result: FossilResult = { name, raw, fallback: true };
      this.ctx.cache.set(cacheKey, result, CRAFTING_TTL_MS);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const result: FossilResult = {
        name,
        error: `Failed to fetch fossil data for "${name}": ${msg}`,
      };
      // Don't cache errors — let the next call retry
      return result;
    }
  }

  // ── Essences ───────────────────────────────────────────────────────────────

  async getEssence(name: string): Promise<EssenceResult> {
    const cacheKey = `crafting:essence:${this.ctx.leagueState.patchVersion}:${name.toLowerCase()}`;
    const cached = this.ctx.cache.get<EssenceResult>(cacheKey);
    if (cached) return cached;

    try {
      const url = `${BASE_URL}/json.php`;
      const raw = await this.ctx.http.get<unknown>(url, {
        params: { type: 'Essence', n: name },
        timeoutMs: 10_000,
      });

      if (typeof raw === 'string' || this.isErrorResponse(raw)) {
        return await this.getEssenceFallback(name, cacheKey);
      }

      const result: EssenceResult = { name, raw };
      this.ctx.cache.set(cacheKey, result, CRAFTING_TTL_MS);
      return result;
    } catch {
      return await this.getEssenceFallback(name, cacheKey);
    }
  }

  private async getEssenceFallback(name: string, cacheKey: string): Promise<EssenceResult> {
    try {
      const slug = name.replace(/\s+/g, '_');
      const raw = await this.ctx.http.get<unknown>(`${BASE_URL}/${slug}`, {
        timeoutMs: 10_000,
      });
      const result: EssenceResult = { name, raw, fallback: true };
      this.ctx.cache.set(cacheKey, result, CRAFTING_TTL_MS);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        name,
        error: `Failed to fetch essence data for "${name}": ${msg}`,
      };
    }
  }

  // ── Mod search ─────────────────────────────────────────────────────────────

  async searchMods(
    query: string,
    itemClass?: string,
    influence?: string
  ): Promise<ModResult[]> {
    const cacheKey = [
      'crafting:mods',
      this.ctx.leagueState.patchVersion,
      query.toLowerCase(),
      itemClass ?? '',
      influence ?? '',
    ].join(':');

    const cached = this.ctx.cache.get<ModResult[]>(cacheKey);
    if (cached) return cached;

    try {
      const params: Record<string, string> = { type: 'Mod', q: query };
      if (itemClass) params['class'] = itemClass;
      if (influence) params['influence'] = influence;

      const raw = await this.ctx.http.get<unknown>(`${BASE_URL}/json.php`, {
        params,
        timeoutMs: 10_000,
      });

      if (typeof raw === 'string' || this.isErrorResponse(raw)) {
        // poedb mod endpoint not available — return empty with explanation
        return [];
      }

      let results: ModResult[] = [];

      if (Array.isArray(raw)) {
        results = raw.map((entry) => this.normalizeModEntry(entry));
      } else if (raw && typeof raw === 'object' && 'data' in raw && Array.isArray((raw as Record<string, unknown>)['data'])) {
        results = ((raw as Record<string, unknown>)['data'] as unknown[]).map((entry) =>
          this.normalizeModEntry(entry)
        );
      }

      // Client-side influence filter if the API didn't filter for us
      if (influence) {
        results = results.filter(
          (m) =>
            !m.influence ||
            m.influence.toLowerCase().includes(influence.toLowerCase())
        );
      }

      this.ctx.cache.set(cacheKey, results, CRAFTING_TTL_MS);
      return results;
    } catch {
      return [];
    }
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

  // ── Utility ───────────────────────────────────────────────────────────────

  private isErrorResponse(raw: unknown): boolean {
    if (!raw || typeof raw !== 'object') return false;
    const obj = raw as Record<string, unknown>;
    return (
      'error' in obj ||
      ('success' in obj && obj['success'] === false)
    );
  }

  private normalizeModEntry(entry: unknown): ModResult {
    if (!entry || typeof entry !== 'object') {
      return { raw: entry };
    }
    const obj = entry as Record<string, unknown>;
    return {
      id: typeof obj['id'] === 'string' ? obj['id'] : undefined,
      name: typeof obj['name'] === 'string' ? obj['name'] : undefined,
      text: typeof obj['text'] === 'string' ? obj['text'] : (typeof obj['stat'] === 'string' ? obj['stat'] : undefined),
      itemClass: typeof obj['class'] === 'string' ? obj['class'] : undefined,
      influence: typeof obj['influence'] === 'string' ? obj['influence'] : undefined,
      raw: entry,
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
