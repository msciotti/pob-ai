import { describe, it, expect, vi, beforeEach } from 'vitest';
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

const FAKE_FOSSIL_RESPONSE = {
  name: 'Scorched Fossil',
  tags: ['fire'],
  description: 'Can be used to socket Resonators.',
};

const FAKE_ESSENCE_RESPONSE = {
  name: 'Deafening Essence of Hatred',
  guaranteedMods: {
    Ring: '+X% to Cold Resistance',
    Gloves: 'Adds X to X Cold Damage',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// getFossil
// ─────────────────────────────────────────────────────────────────────────────

describe('CraftingClient.getFossil', () => {
  it('returns a FossilResult with the fossil name', async () => {
    const ctx = makeCtx();
    (ctx.http.get as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_FOSSIL_RESPONSE);

    const client = new CraftingClient(ctx);
    const result = await client.getFossil('Scorched Fossil');

    expect(result.name).toBe('Scorched Fossil');
    expect(result.error).toBeUndefined();
  });

  it('caches correctly — second call does not hit HTTP', async () => {
    const ctx = makeCtx();
    const httpGet = ctx.http.get as ReturnType<typeof vi.fn>;
    httpGet.mockResolvedValue(FAKE_FOSSIL_RESPONSE);

    const client = new CraftingClient(ctx);
    await client.getFossil('Scorched Fossil');
    await client.getFossil('Scorched Fossil');

    expect(httpGet).toHaveBeenCalledTimes(1);
  });

  it('cache key includes patchVersion — different patches cause separate HTTP calls', async () => {
    const sharedCache = new TtlCache();

    const ctxV1 = makeCtx('3.25.0');
    ctxV1.cache = sharedCache;
    const ctxV2 = makeCtx('3.26.0');
    ctxV2.cache = sharedCache;

    const mockGet = vi.fn().mockResolvedValue(FAKE_FOSSIL_RESPONSE);
    ctxV1.http = { get: mockGet, post: vi.fn() } as any;
    ctxV2.http = { get: mockGet, post: vi.fn() } as any;

    const client1 = new CraftingClient(ctxV1);
    const client2 = new CraftingClient(ctxV2);

    await client1.getFossil('Scorched Fossil');
    await client2.getFossil('Scorched Fossil');

    // Both should call HTTP since they have different patch versions
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('falls back gracefully when JSON endpoint returns an error object', async () => {
    const ctx = makeCtx();
    const httpGet = ctx.http.get as ReturnType<typeof vi.fn>;
    // First call (JSON endpoint) returns an error response; second call (fallback HTML) succeeds
    httpGet
      .mockResolvedValueOnce({ error: 'not found' })
      .mockResolvedValueOnce('<html>Scorched Fossil page</html>');

    const client = new CraftingClient(ctx);
    const result = await client.getFossil('Scorched Fossil');

    expect(result.name).toBe('Scorched Fossil');
    expect(result.fallback).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('returns error field when all endpoints fail', async () => {
    const ctx = makeCtx();
    const httpGet = ctx.http.get as ReturnType<typeof vi.fn>;
    httpGet.mockRejectedValue(new Error('network timeout'));

    const client = new CraftingClient(ctx);
    const result = await client.getFossil('Scorched Fossil');

    expect(result.error).toBeDefined();
    expect(result.error).toContain('Scorched Fossil');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getEssence
// ─────────────────────────────────────────────────────────────────────────────

describe('CraftingClient.getEssence', () => {
  it('returns an EssenceResult with the essence name', async () => {
    const ctx = makeCtx();
    (ctx.http.get as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_ESSENCE_RESPONSE);

    const client = new CraftingClient(ctx);
    const result = await client.getEssence('Deafening Essence of Hatred');

    expect(result.name).toBe('Deafening Essence of Hatred');
    expect(result.error).toBeUndefined();
  });

  it('caches correctly — second call does not hit HTTP', async () => {
    const ctx = makeCtx();
    const httpGet = ctx.http.get as ReturnType<typeof vi.fn>;
    httpGet.mockResolvedValue(FAKE_ESSENCE_RESPONSE);

    const client = new CraftingClient(ctx);
    await client.getEssence('Deafening Essence of Hatred');
    await client.getEssence('Deafening Essence of Hatred');

    expect(httpGet).toHaveBeenCalledTimes(1);
  });

  it('falls back gracefully when JSON endpoint returns a string (HTML)', async () => {
    const ctx = makeCtx();
    const httpGet = ctx.http.get as ReturnType<typeof vi.fn>;
    // First call returns raw HTML (string), second call (fallback) succeeds
    httpGet
      .mockResolvedValueOnce('<html>Not JSON</html>')
      .mockResolvedValueOnce('<html>Essence page</html>');

    const client = new CraftingClient(ctx);
    const result = await client.getEssence('Deafening Essence of Hatred');

    expect(result.name).toBe('Deafening Essence of Hatred');
    expect(result.fallback).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getHarvestOptions
// ─────────────────────────────────────────────────────────────────────────────

describe('CraftingClient.getHarvestOptions', () => {
  it('returns all options when called with no filters', () => {
    const ctx = makeCtx();
    const client = new CraftingClient(ctx);
    const results = client.getHarvestOptions();

    expect(results.length).toBeGreaterThan(0);
  });

  it('filters by tag — only returns crafts with matching tag', () => {
    const ctx = makeCtx();
    const client = new CraftingClient(ctx);
    const results = client.getHarvestOptions('life');

    expect(results.length).toBeGreaterThan(0);
    for (const craft of results) {
      expect(craft.tag).toBe('life');
    }
  });

  it('returns an empty array for a tag that has no crafts', () => {
    const ctx = makeCtx();
    const client = new CraftingClient(ctx);
    const results = client.getHarvestOptions('nonexistent_tag_xyz');

    expect(results).toEqual([]);
  });

  it('filters by itemClass — narrows down by applicability', () => {
    const ctx = makeCtx();
    const client = new CraftingClient(ctx);
    // 'armour' class items should have defence crafts available
    const results = client.getHarvestOptions('defence', 'armour');

    expect(results.length).toBeGreaterThan(0);
  });

  it('each result has required HarvestCraft fields', () => {
    const ctx = makeCtx();
    const client = new CraftingClient(ctx);
    const results = client.getHarvestOptions();

    for (const craft of results) {
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
// Tool handler ToolResult shape tests
// ─────────────────────────────────────────────────────────────────────────────

describe('fossilInfoTool handler', () => {
  it('returns a valid ToolResult shape on success', async () => {
    const ctx = makeCtx();
    (ctx.http.get as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_FOSSIL_RESPONSE);

    // Import here to avoid hoisting issues with vi.fn()
    const { fossilInfoTool } = await import('../tools/fossil-info.js');
    const result = await fossilInfoTool.handler({ fossilName: 'Scorched Fossil' }, ctx);

    expect(result).toHaveProperty('content');
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0]).toHaveProperty('type', 'text');
    expect(typeof result.content[0].text).toBe('string');
    expect(result.isError).toBeUndefined();
  });

  it('returns isError: true when client throws', async () => {
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
