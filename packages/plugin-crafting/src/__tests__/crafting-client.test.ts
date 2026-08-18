import { describe, it, expect, vi } from 'vitest';
import { CraftingClient, generateCraftofExileLink } from '../crafting-client.js';
import type { PluginContext } from '@poe-ai/core';
import { TtlCache } from '@poe-ai/core';

function makeCtx(patchVersion = '3.26.0'): PluginContext {
  return {
    http: { get: vi.fn(), post: vi.fn() },
    cache: new TtlCache(),
    leagueState: { currentLeague: 'Standard', patchVersion, hardcore: false, ssf: false },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  } as any;
}

// Minimal HTML that mimics the poedb fossil page's spawn-weight-multiplier section
const FAKE_FOSSIL_HTML = `
<html><body>
<h2 id="spawn-weight-multipliers">Spawn Weight Multipliers</h2>
<p>Using this fossil multiplies the spawn weights of all modifiers with &quot;elemental&quot; tags by 6,
modifiers with both &quot;physical&quot; and &quot;ailment&quot; tags by 0.</p>
<ul>
<li><span class='badge bg-primary'>Elemental</span> x600%</li>
<li><span class='badge bg-primary'><i>bleed</i></span> x0%</li>
</ul>
</body></html>
`;

// Minimal HTML that mimics the poedb essence page's Essence Modifiers table
const FAKE_ESSENCE_HTML = `
<html><body>
<h2>Essence Modifiers /4</h2>
<table class='table table-hover table-striped mb-0 filters bg-dark'>
  <thead><tr><th>Generation</th><th>Description</th></tr></thead>
  <tbody>
    <tr>
      <td>Prefix</td>
      <td>Adds <span class='mod-value'>(134\u2014184)</span> to <span class='mod-value'>(270\u2014313)</span> Cold Damage
        <span class='float-end'>
          <span class="badge bg-primary craftingdamage" data-tag="damage">Damage</span>
          <span class="badge bg-primary craftingelemental" data-tag="elemental">Elemental</span>
          <span class="badge bg-primary craftingcold" data-tag="cold">Cold</span>
          <span class="badge bg-primary craftingattack" data-tag="attack">Attack</span>
        </span>
      </td>
    </tr>
    <tr>
      <td>Suffix</td>
      <td><span class='mod-value'>+(46\u201448)</span>% to Cold Resistance
        <span class='float-end'>
          <span class="badge bg-primary craftingelemental" data-tag="elemental">Elemental</span>
          <span class="badge bg-primary craftingcold" data-tag="cold">Cold</span>
          <span class="badge bg-primary craftingresistance" data-tag="resistance">Resistance</span>
        </span>
      </td>
    </tr>
  </tbody>
</table>
</body></html>
`;

// Minimal HTML that mimics the poedb item class page with embedded mod JSON array
const chaosResistMod = {
  Name: 'of Bameth',
  Level: '81',
  ModGenerationTypeID: '2',
  ModFamilyList: ['ChaosResistance'],
  DropChance: 250,
  str: "<span class='mod-value'>+(31\u201435)</span>% to Chaos Resistance",
  fossil_no: ['chaos', 'resistance'],
  adds_no: [],
  spawn_no: ['armour', 'ring', 'amulet', 'belt', 'quiver', 'default'],
  mod_no: [],
  hover: '',
};
const FAKE_RINGS_HTML = `<html><body>[${JSON.stringify(chaosResistMod)}]</body></html>`;

// ─────────────────────────────────────────────────────────────────────────────
// getFossil
// ─────────────────────────────────────────────────────────────────────────────

describe('CraftingClient.getFossil', () => {
  it('parses spawnWeightMultipliers from poedb HTML', async () => {
    const ctx = makeCtx();
    (ctx.http.get as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_FOSSIL_HTML);

    const client = new CraftingClient(ctx);
    const result = await client.getFossil('Prismatic Fossil');

    expect(result.error).toBeUndefined();
    expect(result.spawnWeightMultipliers).toHaveLength(2);
    expect(result.spawnWeightMultipliers[0]).toMatchObject({ tags: ['elemental'], multiplier: 6 });
    expect(result.spawnWeightMultipliers[1]).toMatchObject({ tags: ['bleed'], multiplier: 0 });
  });

  it('parses description text from poedb HTML', async () => {
    const ctx = makeCtx();
    (ctx.http.get as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_FOSSIL_HTML);

    const client = new CraftingClient(ctx);
    const result = await client.getFossil('Prismatic Fossil');

    expect(result.description).toContain('elemental');
  });

  it('caches correctly — second call does not hit HTTP', async () => {
    const ctx = makeCtx();
    const httpGet = ctx.http.get as ReturnType<typeof vi.fn>;
    httpGet.mockResolvedValue(FAKE_FOSSIL_HTML);

    const client = new CraftingClient(ctx);
    await client.getFossil('Prismatic Fossil');
    await client.getFossil('Prismatic Fossil');

    expect(httpGet).toHaveBeenCalledTimes(1);
  });

  it('cache key includes patchVersion — different patches cause separate HTTP calls', async () => {
    const sharedCache = new TtlCache();
    const ctxV1 = makeCtx('3.25.0');
    ctxV1.cache = sharedCache;
    const ctxV2 = makeCtx('3.26.0');
    ctxV2.cache = sharedCache;

    const mockGet = vi.fn().mockResolvedValue(FAKE_FOSSIL_HTML);
    ctxV1.http = { get: mockGet, post: vi.fn() } as any;
    ctxV2.http = { get: mockGet, post: vi.fn() } as any;

    await new CraftingClient(ctxV1).getFossil('Prismatic Fossil');
    await new CraftingClient(ctxV2).getFossil('Prismatic Fossil');

    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('returns error field when HTTP fails', async () => {
    const ctx = makeCtx();
    (ctx.http.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network timeout'));

    const client = new CraftingClient(ctx);
    const result = await client.getFossil('Scorched Fossil');

    expect(result.error).toBeDefined();
    expect(result.error).toContain('Scorched Fossil');
    expect(result.spawnWeightMultipliers).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getEssence
// ─────────────────────────────────────────────────────────────────────────────

describe('CraftingClient.getEssence', () => {
  it('parses mods from the Essence Modifiers table', async () => {
    const ctx = makeCtx();
    (ctx.http.get as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_ESSENCE_HTML);

    const client = new CraftingClient(ctx);
    const result = await client.getEssence('Deafening Essence of Hatred');

    expect(result.error).toBeUndefined();
    expect(result.mods).toHaveLength(2);
    expect(result.mods[0].generation).toBe('Prefix');
    expect(result.mods[0].text).toContain('Cold Damage');
    expect(result.mods[0].tags).toContain('cold');
    expect(result.mods[1].generation).toBe('Suffix');
    expect(result.mods[1].text).toContain('Cold Resistance');
    expect(result.mods[1].tags).toContain('resistance');
  });

  it('caches correctly — second call does not hit HTTP', async () => {
    const ctx = makeCtx();
    const httpGet = ctx.http.get as ReturnType<typeof vi.fn>;
    httpGet.mockResolvedValue(FAKE_ESSENCE_HTML);

    const client = new CraftingClient(ctx);
    await client.getEssence('Deafening Essence of Hatred');
    await client.getEssence('Deafening Essence of Hatred');

    expect(httpGet).toHaveBeenCalledTimes(1);
  });

  it('returns error field when HTTP fails', async () => {
    const ctx = makeCtx();
    (ctx.http.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network error'));

    const client = new CraftingClient(ctx);
    const result = await client.getEssence('Deafening Essence of Hatred');

    expect(result.error).toBeDefined();
    expect(result.mods).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// searchMods
// ─────────────────────────────────────────────────────────────────────────────

describe('CraftingClient.searchMods', () => {
  it('parses mod entries from the embedded JSON array', async () => {
    const ctx = makeCtx();
    (ctx.http.get as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_RINGS_HTML);

    const client = new CraftingClient(ctx);
    const results = await client.searchMods('chaos resistance', 'ring');

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('of Bameth');
    expect(results[0].weight).toBe(250);
    expect(results[0].tags).toContain('chaos');
    expect(results[0].text).toContain('Chaos Resistance');
    expect(results[0].generationType).toBe('normal');
  });

  it('caches the item-class page — second call with same class does not re-fetch', async () => {
    const ctx = makeCtx();
    const httpGet = ctx.http.get as ReturnType<typeof vi.fn>;
    httpGet.mockResolvedValue(FAKE_RINGS_HTML);

    const client = new CraftingClient(ctx);
    await client.searchMods('chaos', 'ring');
    await client.searchMods('resistance', 'ring');

    // Both queries hit the same cached page
    expect(httpGet).toHaveBeenCalledTimes(1);
  });

  it('returns empty array when HTTP fails', async () => {
    const ctx = makeCtx();
    (ctx.http.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('timeout'));

    const client = new CraftingClient(ctx);
    const results = await client.searchMods('life', 'ring');

    expect(results).toEqual([]);
  });

  it('filters out non-normal gen types when no influence specified', async () => {
    const synthesisEntry = { ...chaosResistMod, ModGenerationTypeID: '3', Name: 'SynthesisMod' };
    const htmlWithBoth = `<html><body>[${JSON.stringify(chaosResistMod)},${JSON.stringify(synthesisEntry)}]</body></html>`;

    const ctx = makeCtx();
    (ctx.http.get as ReturnType<typeof vi.fn>).mockResolvedValue(htmlWithBoth);

    const client = new CraftingClient(ctx);
    const results = await client.searchMods('chaos resistance', 'ring');

    // Only the normal (type 2) mod should appear
    expect(results.every((r) => r.generationType === 'normal')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getHarvestOptions
// ─────────────────────────────────────────────────────────────────────────────

describe('CraftingClient.getHarvestOptions', () => {
  it('returns all options when called with no filters', () => {
    const ctx = makeCtx();
    const results = new CraftingClient(ctx).getHarvestOptions();
    expect(results.length).toBeGreaterThan(0);
  });

  it('filters by tag — only returns crafts with matching tag', () => {
    const ctx = makeCtx();
    const results = new CraftingClient(ctx).getHarvestOptions('life');
    expect(results.length).toBeGreaterThan(0);
    for (const craft of results) {
      expect(craft.tag).toBe('life');
    }
  });

  it('returns empty array for a tag with no crafts', () => {
    const ctx = makeCtx();
    expect(new CraftingClient(ctx).getHarvestOptions('nonexistent_xyz')).toEqual([]);
  });

  it('filters by itemClass — defence crafts available for armour', () => {
    const ctx = makeCtx();
    const results = new CraftingClient(ctx).getHarvestOptions('defence', 'armour');
    expect(results.length).toBeGreaterThan(0);
  });

  it('each result has required HarvestCraft fields', () => {
    const ctx = makeCtx();
    for (const craft of new CraftingClient(ctx).getHarvestOptions()) {
      expect(craft).toHaveProperty('name');
      expect(craft).toHaveProperty('description');
      expect(craft).toHaveProperty('tag');
      expect(craft).toHaveProperty('colour');
      expect(craft).toHaveProperty('applicableTo');
      expect(craft).toHaveProperty('operation');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// fossilInfoTool handler — ToolResult shape
// ─────────────────────────────────────────────────────────────────────────────

describe('fossilInfoTool handler', () => {
  it('returns a valid ToolResult shape on success', async () => {
    const ctx = makeCtx();
    (ctx.http.get as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_FOSSIL_HTML);

    const { fossilInfoTool } = await import('../tools/fossil-info.js');
    const result = await fossilInfoTool.handler({ fossilName: 'Prismatic Fossil' }, ctx);

    expect(result).toHaveProperty('content');
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0]).toHaveProperty('type', 'text');
    expect(typeof result.content[0].text).toBe('string');
    expect(result.isError).toBeUndefined();
  });

  it('returns isError: true when HTTP fails', async () => {
    const ctx = makeCtx();
    (ctx.http.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('HTTP failure'));

    const { fossilInfoTool } = await import('../tools/fossil-info.js');
    const result = await fossilInfoTool.handler({ fossilName: 'Scorched Fossil' }, ctx);

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
  it('returns the correct URL for "fossil"', () => {
    expect(generateCraftofExileLink('fossil')).toBe('https://www.craftofexile.com/?m=fossil');
  });

  it('encodes special characters in the method', () => {
    const url = generateCraftofExileLink('essence craft');
    expect(url).toContain('essence');
    expect(url).not.toContain(' ');
  });
});
