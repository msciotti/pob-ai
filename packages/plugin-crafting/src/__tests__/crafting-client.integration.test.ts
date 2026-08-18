/**
 * Integration tests for CraftingClient — hit the real poedb.tw site.
 *
 * Run with:
 *   CRAFTING_INTEGRATION=true pnpm --filter @poe-ai/plugin-crafting test
 *
 * Skipped by default so CI doesn't depend on poedb availability.
 * These tests are the early-warning system for poedb HTML structure changes.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { CraftingClient } from '../crafting-client.js';
import { TtlCache, RateLimitedHttpClient } from '@poe-ai/core';
import type { PluginContext } from '@poe-ai/core';

const RUN = process.env.CRAFTING_INTEGRATION === 'true';

function makeRealCtx(): PluginContext {
  return {
    http: new RateLimitedHttpClient({ minIntervalMs: 1000 }),
    cache: new TtlCache(),
    leagueState: { currentLeague: 'Standard', patchVersion: '3.26.0', hardcore: false, ssf: false },
    logger: { info: console.log, warn: console.warn, error: console.error, debug: () => {} },
  } as any;
}

describe.skipIf(!RUN)('CraftingClient (integration)', () => {
  let client: CraftingClient;

  beforeAll(() => {
    client = new CraftingClient(makeRealCtx());
  });

  // ── Fossils ──────────────────────────────────────────────────────────────

  describe('getFossil', () => {
    it('returns spawn weight multipliers for Prismatic Fossil', async () => {
      const result = await client.getFossil('Prismatic Fossil');

      expect(result.error).toBeUndefined();
      expect(result.name).toBe('Prismatic Fossil');
      // Prismatic boosts elemental tags — there must be at least one multiplier
      expect(result.spawnWeightMultipliers.length).toBeGreaterThan(0);
      // Each multiplier has tags (array of strings) and a numeric multiplier
      for (const m of result.spawnWeightMultipliers) {
        expect(Array.isArray(m.tags)).toBe(true);
        expect(m.tags.length).toBeGreaterThan(0);
        expect(typeof m.multiplier).toBe('number');
      }
    });

    it('Prismatic Fossil boosts elemental mods', async () => {
      const result = await client.getFossil('Prismatic Fossil');

      const elementalBoost = result.spawnWeightMultipliers.find((m) =>
        m.tags.some((t) => t.toLowerCase().includes('elemental'))
      );
      expect(elementalBoost).toBeDefined();
      expect(elementalBoost!.multiplier).toBeGreaterThan(1);
    });

    it('returns a description string', async () => {
      const result = await client.getFossil('Prismatic Fossil');

      expect(typeof result.description).toBe('string');
      expect(result.description.length).toBeGreaterThan(0);
    });

    it('returns error field for a nonexistent fossil', async () => {
      const result = await client.getFossil('Nonexistent Fossil Zzz999');

      expect(result.error).toBeDefined();
      expect(result.spawnWeightMultipliers).toEqual([]);
    });

    it('caches result — second call is instant', async () => {
      await client.getFossil('Prismatic Fossil'); // prime cache

      const start = Date.now();
      await client.getFossil('Prismatic Fossil');
      expect(Date.now() - start).toBeLessThan(50);
    });
  });

  // ── Essences ─────────────────────────────────────────────────────────────

  describe('getEssence', () => {
    it('returns mods for Deafening Essence of Hatred', async () => {
      const result = await client.getEssence('Deafening Essence of Hatred');

      expect(result.error).toBeUndefined();
      expect(result.name).toBe('Deafening Essence of Hatred');
      expect(result.mods.length).toBeGreaterThan(0);
    });

    it('each mod has generation, text, and tags', async () => {
      const result = await client.getEssence('Deafening Essence of Hatred');

      for (const mod of result.mods) {
        expect(['Prefix', 'Suffix']).toContain(mod.generation);
        expect(typeof mod.text).toBe('string');
        expect(mod.text.length).toBeGreaterThan(0);
        expect(Array.isArray(mod.tags)).toBe(true);
      }
    });

    it('Deafening Essence of Hatred grants cold mods', async () => {
      const result = await client.getEssence('Deafening Essence of Hatred');

      const hasColdMod = result.mods.some(
        (m) => m.tags.includes('cold') || m.text.toLowerCase().includes('cold')
      );
      expect(hasColdMod).toBe(true);
    });

    it('returns error field for a nonexistent essence', async () => {
      const result = await client.getEssence('Nonexistent Essence Zzz999');

      expect(result.error).toBeDefined();
      expect(result.mods).toEqual([]);
    });
  });

  // ── Mod search ───────────────────────────────────────────────────────────

  describe('searchMods', () => {
    it('returns results for "cold resistance" on rings', async () => {
      const results = await client.searchMods('cold resistance', 'ring');

      expect(results.length).toBeGreaterThan(0);
    });

    it('each result has required fields with correct types', async () => {
      const results = await client.searchMods('life', 'ring');

      expect(results.length).toBeGreaterThan(0);
      for (const mod of results) {
        expect(typeof mod.name).toBe('string');
        expect(typeof mod.level).toBe('number');
        expect(typeof mod.weight).toBe('number');
        expect(typeof mod.family).toBe('string');
        expect(typeof mod.text).toBe('string');
        expect(Array.isArray(mod.tags)).toBe(true);
        expect(typeof mod.generationType).toBe('string');
      }
    });

    it('only returns normal explicit mods when no influence specified', async () => {
      const results = await client.searchMods('resistance', 'ring');

      for (const mod of results) {
        expect(mod.generationType).toBe('normal');
      }
    });

    it('results contain the query string in mod text or name', async () => {
      const results = await client.searchMods('chaos resistance', 'ring');

      expect(results.length).toBeGreaterThan(0);
      for (const mod of results) {
        const matchesText = mod.text.toLowerCase().includes('chaos') ||
          mod.text.toLowerCase().includes('resistance');
        const matchesName = mod.name.toLowerCase().includes('chaos') ||
          mod.family.toLowerCase().includes('chaos');
        expect(matchesText || matchesName).toBe(true);
      }
    });

    it('returns empty array for a query that matches nothing', async () => {
      const results = await client.searchMods('zzznomatchxyz', 'ring');

      expect(results).toEqual([]);
    });

    it('caches item class page — second query on same class does not re-fetch', async () => {
      // Both queries hit ring page; second should be instant from cache
      await client.searchMods('fire', 'ring'); // prime cache

      const start = Date.now();
      await client.searchMods('cold', 'ring');
      expect(Date.now() - start).toBeLessThan(50);
    });
  });
});
