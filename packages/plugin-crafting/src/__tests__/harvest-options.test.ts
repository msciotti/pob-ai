import { describe, it, expect, vi } from 'vitest';
import type { PluginContext } from '@poe-ai/core';
import { TtlCache } from '@poe-ai/core';
import { getHarvestOptions, harvestOptionsTool } from '../tools/harvest-options.js';

function makeCtx(): PluginContext {
  return {
    http: { get: vi.fn(), post: vi.fn() },
    cache: new TtlCache(),
    leagueState: { currentLeague: 'Standard', patchVersion: '3.26.0', hardcore: false, ssf: false },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

// ─────────────────────────────────────────────────────────────────────────────
// getHarvestOptions
//
// Harvest crafts are static, patch-stable data (no HTTP, no local game-data
// file — see the module doc comment in harvest-options.ts for why).
// ─────────────────────────────────────────────────────────────────────────────

describe('getHarvestOptions', () => {
  it('returns all options when called with no filters', () => {
    expect(getHarvestOptions().length).toBeGreaterThan(0);
  });

  it('filters by tag — only returns crafts with matching tag', () => {
    const results = getHarvestOptions('life');
    expect(results.length).toBeGreaterThan(0);
    for (const craft of results) {
      expect(craft.tag).toBe('life');
    }
  });

  it('returns empty array for a tag with no crafts', () => {
    expect(getHarvestOptions('nonexistent_xyz')).toEqual([]);
  });

  it('filters by itemClass — defence crafts available for armour', () => {
    const results = getHarvestOptions('defence', 'armour');
    expect(results.length).toBeGreaterThan(0);
  });

  it('each result has required HarvestCraft fields', () => {
    for (const craft of getHarvestOptions()) {
      expect(craft).toHaveProperty('name');
      expect(craft).toHaveProperty('description');
      expect(craft).toHaveProperty('tag');
      expect(craft).toHaveProperty('colour');
      expect(craft).toHaveProperty('applicableTo');
      expect(craft).toHaveProperty('operation');
    }
  });
});

describe('harvestOptionsTool handler', () => {
  it('returns a valid ToolResult shape', async () => {
    const result = await harvestOptionsTool.handler({ tag: 'life' }, makeCtx());

    expect(result).toHaveProperty('content');
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0]).toHaveProperty('type', 'text');
    expect(result.isError).toBeUndefined();

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.count).toBeGreaterThan(0);
  });
});
