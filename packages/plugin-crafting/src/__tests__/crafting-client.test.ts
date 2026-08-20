import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { PluginContext } from '@poe-ai/core';
import { TtlCache } from '@poe-ai/core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, 'fixtures');
const EMPTY_DIR = join(__dirname, 'fixtures-missing');

const ORIGINAL_ENV = process.env.POE_AI_REPOE_DIR;

function makeCtx(): PluginContext {
  return {
    http: { get: vi.fn(), post: vi.fn() },
    cache: new TtlCache(),
    leagueState: { currentLeague: 'Standard', patchVersion: '3.26.0', hardcore: false, ssf: false },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

beforeEach(() => {
  vi.resetModules();
  process.env.POE_AI_REPOE_DIR = FIXTURES_DIR;
});

afterEach(() => {
  if (ORIGINAL_ENV === undefined) {
    delete process.env.POE_AI_REPOE_DIR;
  } else {
    process.env.POE_AI_REPOE_DIR = ORIGINAL_ENV;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// getFossil
// ─────────────────────────────────────────────────────────────────────────────

describe('CraftingClient.getFossil', () => {
  it('parses spawnWeightMultipliers from local fossil data', async () => {
    const { CraftingClient } = await import('../crafting-client.js');
    const client = new CraftingClient(makeCtx());

    const result = await client.getFossil('Prismatic Fossil');

    expect(result.error).toBeUndefined();
    expect(result.spawnWeightMultipliers).toContainEqual({ tags: ['elemental'], multiplier: 6 });
    expect(result.spawnWeightMultipliers).toContainEqual({ tags: ['bleed'], multiplier: 0 });
    expect(result.spawnWeightMultipliers).toContainEqual({ tags: ['poison'], multiplier: 0 });
  });

  it('parses description text from descriptions + blocked_descriptions', async () => {
    const { CraftingClient } = await import('../crafting-client.js');
    const client = new CraftingClient(makeCtx());

    const result = await client.getFossil('Prismatic Fossil');

    expect(result.description).toContain('Elemental');
  });

  it('is case-insensitive and trims whitespace on name lookup', async () => {
    const { CraftingClient } = await import('../crafting-client.js');
    const client = new CraftingClient(makeCtx());

    const result = await client.getFossil('  prismatic fossil  ');

    expect(result.error).toBeUndefined();
    expect(result.name).toBe('Prismatic Fossil');
  });

  it('returns error field for a nonexistent fossil', async () => {
    const { CraftingClient } = await import('../crafting-client.js');
    const client = new CraftingClient(makeCtx());

    const result = await client.getFossil('Nonexistent Fossil Zzz999');

    expect(result.error).toBeDefined();
    expect(result.spawnWeightMultipliers).toEqual([]);
  });

  it('surfaces a clear error when the repoe-data directory is missing', async () => {
    process.env.POE_AI_REPOE_DIR = EMPTY_DIR;
    const { CraftingClient } = await import('../crafting-client.js');
    const client = new CraftingClient(makeCtx());

    const result = await client.getFossil('Prismatic Fossil');

    expect(result.error).toContain('pnpm download-repoe');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getEssence
// ─────────────────────────────────────────────────────────────────────────────

describe('CraftingClient.getEssence', () => {
  it('parses and deduplicates mods across item classes', async () => {
    const { CraftingClient } = await import('../crafting-client.js');
    const client = new CraftingClient(makeCtx());

    const result = await client.getEssence('Whispering Essence of Hatred');

    expect(result.error).toBeUndefined();
    // 4 item classes map to only 2 distinct mod ids (ColdDamagePercentEssence1, ColdResist1)
    expect(result.mods).toHaveLength(2);
    expect(result.mods.find((m) => m.text.includes('Cold Damage'))).toMatchObject({
      generation: 'Suffix',
      tags: expect.arrayContaining(['cold']),
    });
    expect(result.mods.find((m) => m.text.includes('Cold Resistance'))).toMatchObject({
      generation: 'Suffix',
    });
  });

  it('skips mod ids that are not in local mod data', async () => {
    const { CraftingClient } = await import('../crafting-client.js');
    const client = new CraftingClient(makeCtx());

    const result = await client.getEssence('Broken Essence of Hatred');

    expect(result.error).toBeUndefined();
    expect(result.mods).toEqual([]);
  });

  it('returns error field for a nonexistent essence', async () => {
    const { CraftingClient } = await import('../crafting-client.js');
    const client = new CraftingClient(makeCtx());

    const result = await client.getEssence('Nonexistent Essence Zzz999');

    expect(result.error).toBeDefined();
    expect(result.mods).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// searchMods
// ─────────────────────────────────────────────────────────────────────────────

describe('CraftingClient.searchMods', () => {
  it('resolves spawn weight via first-matching-tag-wins against the item class tag set', async () => {
    const { CraftingClient } = await import('../crafting-client.js');
    const client = new CraftingClient(makeCtx());

    const results = await client.searchMods('chaos resistance', 'ring');

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      name: 'of Bameth',
      level: 81,
      weight: 250,
      family: 'ChaosResistance',
      generationType: 'suffix',
    });
    expect(results[0].tags).toEqual(['chaos', 'resistance']);
  });

  it('defaults to "ring" when itemClass is omitted', async () => {
    const { CraftingClient } = await import('../crafting-client.js');
    const client = new CraftingClient(makeCtx());

    const results = await client.searchMods('brute');

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('of the Brute');
  });

  it('resolves item class case-insensitively and against the plural display name', async () => {
    const { CraftingClient } = await import('../crafting-client.js');
    const client = new CraftingClient(makeCtx());

    const byCase = await client.searchMods('strength', 'RING');
    const byDisplayName = await client.searchMods('strength', 'Rings');

    expect(byCase).toHaveLength(1);
    expect(byDisplayName).toHaveLength(1);
    expect(byCase[0].name).toBe('of the Brute');
  });

  it('excludes essence-only mods (0 weight for every class) from normal search', async () => {
    const { CraftingClient } = await import('../crafting-client.js');
    const client = new CraftingClient(makeCtx());

    const results = await client.searchMods('cold damage', 'ring');

    expect(results).toEqual([]);
  });

  it('excludes essence-only mods via the explicit flag, not just incidental zero weight', async () => {
    // EssenceOnlyLeakTest is_essence_only:true but has a nonzero, non-default
    // ("ring": 500) spawn weight -- if the is_essence_only check were ever
    // dropped in favour of relying on weight alone, this mod would leak into
    // ring search results.
    const { CraftingClient } = await import('../crafting-client.js');
    const client = new CraftingClient(makeCtx());

    const results = await client.searchMods('essence-only leak', 'ring');

    expect(results).toEqual([]);
  });

  it('excludes corrupted-implicit mods from normal (prefix/suffix) search', async () => {
    const { CraftingClient } = await import('../crafting-client.js');
    const client = new CraftingClient(makeCtx());

    const results = await client.searchMods('maximum life', 'ring');

    expect(results).toEqual([]);
  });

  it('returns empty array for a query that matches nothing', async () => {
    const { CraftingClient } = await import('../crafting-client.js');
    const client = new CraftingClient(makeCtx());

    const results = await client.searchMods('zzznomatchxyz', 'ring');

    expect(results).toEqual([]);
  });

  it('caches the resolved item-class tag set under a patch-versioned key', async () => {
    const { CraftingClient } = await import('../crafting-client.js');
    const ctx = makeCtx();
    const client = new CraftingClient(ctx);

    await client.searchMods('strength', 'ring');

    const cached = ctx.cache.get('crafting:classtags:3.29.3.1.4:Ring');
    expect(cached).toBeDefined();
  });

  it('derives the Boots tag set as the intersection across bases -- str_armour/dex_armour stripped', async () => {
    // BootsStr1 has tags [boots, armour, str_armour, default] and BootsDex1 has
    // [boots, armour, dex_armour, default] -- only the tags shared by every
    // base of the class should survive into the resolved tag set.
    const { CraftingClient } = await import('../crafting-client.js');
    const ctx = makeCtx();
    const client = new CraftingClient(ctx);

    await client.searchMods('', 'boots');

    const cached = ctx.cache.get<string[]>('crafting:classtags:3.29.3.1.4:Boots');
    expect(cached).toBeDefined();
    expect([...(cached as string[])].sort()).toEqual(['armour', 'boots', 'default']);
  });

  it('resolves spawn weight via the FIRST matching tag, not the highest weight among matches', async () => {
    // FirstMatchOrderTest's spawn_weights lists "armour":100 before "boots":900.
    // Both tags are in the resolved Boots tag set, so a correct
    // first-match-wins implementation returns 100; a max-weight
    // implementation would incorrectly return 900.
    const { CraftingClient } = await import('../crafting-client.js');
    const client = new CraftingClient(makeCtx());

    const results = await client.searchMods('ordering', 'boots');

    expect(results).toHaveLength(1);
    expect(results[0].weight).toBe(100);
  });

  it('returns an empty array and warns for an unresolvable item class, instead of falling back to Ring', async () => {
    const { CraftingClient } = await import('../crafting-client.js');
    const ctx = makeCtx();
    const client = new CraftingClient(ctx);

    const results = await client.searchMods('strength', 'not-a-real-item-class');

    expect(results).toEqual([]);
    expect(ctx.logger.warn).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getInfluencedMods
// ─────────────────────────────────────────────────────────────────────────────

describe('CraftingClient.getInfluencedMods', () => {
  it('maps "shaper" to the "shaper" spawn-weight codename', async () => {
    const { CraftingClient } = await import('../crafting-client.js');
    const client = new CraftingClient(makeCtx());

    const results = await client.getInfluencedMods('shaper', 'boots');

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ name: "The Shaper's", weight: 800 });
  });

  it('maps "hunter" to the "basilisk" internal codename', async () => {
    const { CraftingClient } = await import('../crafting-client.js');
    const client = new CraftingClient(makeCtx());

    const results = await client.getInfluencedMods('hunter', 'boots');

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Hunter's");
  });

  it('maps "warlord" to the "adjudicator" internal codename', async () => {
    const { CraftingClient } = await import('../crafting-client.js');
    const client = new CraftingClient(makeCtx());

    const results = await client.getInfluencedMods('warlord', 'boots');

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Warlord's");
  });

  it('maps "redeemer" to the "eyrie" internal codename', async () => {
    const { CraftingClient } = await import('../crafting-client.js');
    const client = new CraftingClient(makeCtx());

    const results = await client.getInfluencedMods('redeemer', 'boots');

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Redeemer\'s');
  });

  it('maps "crusader" to its own name (no codename translation needed)', async () => {
    const { CraftingClient } = await import('../crafting-client.js');
    const client = new CraftingClient(makeCtx());

    const results = await client.getInfluencedMods('crusader', 'boots');

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Crusader's");
  });

  it('is scoped to the given item class — a ring-only mod is excluded from boots results', async () => {
    const { CraftingClient } = await import('../crafting-client.js');
    const client = new CraftingClient(makeCtx());

    const bootsResults = await client.getInfluencedMods('shaper', 'boots');
    const ringResults = await client.getInfluencedMods('shaper', 'ring');

    expect(bootsResults.map((m) => m.name)).not.toContain("Shaper's");
    expect(ringResults.map((m) => m.name)).toContain("Shaper's");
  });

  it('returns results across all item classes when itemClass is omitted', async () => {
    const { CraftingClient } = await import('../crafting-client.js');
    const client = new CraftingClient(makeCtx());

    const results = await client.getInfluencedMods('shaper');

    const names = results.map((m) => m.name);
    expect(names).toContain("The Shaper's");
    expect(names).toContain("Shaper's");
  });

  it('CRITICAL: returns [] for a class that resolves but cannot roll influence mods at all (Belt), instead of leaking other classes\' mods', async () => {
    // Belt has no `influence_tags` in item_classes.min.json at all (it's not
    // one of the classes that can be shaper/elder/etc. influenced). Before the
    // fix, `classInfluenceTags` was `undefined` in this case -- indistinguishable
    // from "itemClass omitted" -- so the filter was skipped entirely and every
    // other class's shaper mods (Boots', Ring's) leaked into "belt" results.
    const { CraftingClient } = await import('../crafting-client.js');
    const client = new CraftingClient(makeCtx());

    const results = await client.getInfluencedMods('shaper', 'belt');

    expect(results).toEqual([]);
  });

  it('returns an empty array and warns for an unresolvable item class', async () => {
    const { CraftingClient } = await import('../crafting-client.js');
    const ctx = makeCtx();
    const client = new CraftingClient(ctx);

    const results = await client.getInfluencedMods('shaper', 'not-a-real-item-class');

    expect(results).toEqual([]);
    expect(ctx.logger.warn).toHaveBeenCalled();
  });

  it('returns an empty array and warns for an unrecognized influence', async () => {
    const { CraftingClient } = await import('../crafting-client.js');
    const ctx = makeCtx();
    const client = new CraftingClient(ctx);

    const results = await client.getInfluencedMods('nonsense-influence', 'boots');

    expect(results).toEqual([]);
    expect(ctx.logger.warn).toHaveBeenCalled();
  });

  it('resolves the "corrupted" influence via generation_type', async () => {
    const { CraftingClient } = await import('../crafting-client.js');
    const client = new CraftingClient(makeCtx());

    const results = await client.getInfluencedMods('corrupted', 'ring');

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((m) => m.generationType === 'corrupted')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// fossilInfoTool handler — ToolResult shape
// ─────────────────────────────────────────────────────────────────────────────

describe('fossilInfoTool handler', () => {
  it('returns a valid ToolResult shape on success', async () => {
    const { fossilInfoTool } = await import('../tools/fossil-info.js');
    const result = await fossilInfoTool.handler({ fossilName: 'Prismatic Fossil' }, makeCtx());

    expect(result).toHaveProperty('content');
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0]).toHaveProperty('type', 'text');
    expect(typeof result.content[0].text).toBe('string');
    expect(result.isError).toBeUndefined();

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveProperty('craftofexile_url');
  });

  it('returns isError: true for a fossil not found in local data', async () => {
    const { fossilInfoTool } = await import('../tools/fossil-info.js');
    const result = await fossilInfoTool.handler({ fossilName: 'Nonexistent Fossil Zzz999' }, makeCtx());

    expect(result.isError).toBe(true);
    expect(result.content[0].type).toBe('text');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveProperty('error');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// generateCraftofExileLink
// ─────────────────────────────────────────────────────────────────────────────

describe('generateCraftofExileLink', () => {
  it('returns the correct URL for "fossil"', async () => {
    const { generateCraftofExileLink } = await import('../crafting-client.js');
    expect(generateCraftofExileLink('fossil')).toBe('https://www.craftofexile.com/?m=fossil');
  });

  it('encodes special characters in the method', async () => {
    const { generateCraftofExileLink } = await import('../crafting-client.js');
    const url = generateCraftofExileLink('essence craft');
    expect(url).toContain('essence');
    expect(url).not.toContain(' ');
  });
});
