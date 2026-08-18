/**
 * Integration tests for WikiClient — hit the real poewiki.net API.
 *
 * Run with:
 *   WIKI_INTEGRATION=true pnpm --filter @poe-ai/plugin-wiki test
 *
 * Skipped by default so CI doesn't depend on external network availability.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { WikiClient } from '../wiki-client.js';
import { TtlCache } from '@poe-ai/core';
import { RateLimitedHttpClient } from '@poe-ai/core';
import type { PluginContext } from '@poe-ai/core';

const RUN = process.env.WIKI_INTEGRATION === 'true';

function makeRealCtx(): PluginContext {
  return {
    http: new RateLimitedHttpClient({ minIntervalMs: 500 }),
    cache: new TtlCache(),
    leagueState: { currentLeague: 'Standard', patchVersion: '3.26.0', hardcore: false, ssf: false },
    logger: { info: console.log, warn: console.warn, error: console.error, debug: () => {} },
  } as any;
}

describe.skipIf(!RUN)('WikiClient (integration)', () => {
  let client: WikiClient;

  beforeAll(() => {
    client = new WikiClient(makeRealCtx());
  });

  describe('search', () => {
    it('returns results for a known skill', async () => {
      const results = await client.search('Fireball');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].title).toBeTruthy();
      expect(results[0].url).toMatch(/^https:\/\/www\.poewiki\.net\/wiki\//);
      expect(results[0].snippet).toBeTruthy();
    });

    it('returns results for a known item', async () => {
      const results = await client.search('Kaom\'s Heart');
      expect(results.length).toBeGreaterThan(0);
    });

    it('returns empty array for a nonsense query', async () => {
      const results = await client.search('zzzzzzzzzzzznotapage12345');
      expect(results).toEqual([]);
    });
  });

  describe('getPage', () => {
    it('returns a page with substantial extract content', async () => {
      const page = await client.getPage('Fireball');
      expect(page).not.toBeNull();
      expect(page!.title).toBe('Fireball');
      // The extract should contain actual game mechanics info, not just a one-liner
      expect(page!.extract.length).toBeGreaterThan(200);
      expect(page!.url).toBe('https://www.poewiki.net/wiki/Fireball');
      expect(page!.patchVersion).toBe('3.26.0');
    });

    it('extract includes section content, not just the intro sentence', async () => {
      const page = await client.getPage('Fireball');
      expect(page).not.toBeNull();
      // poewiki skill pages always have a "Skill functions and interactions" section
      expect(page!.extract).toContain('Skill functions and interactions');
    });

    it('returns null for a page that does not exist', async () => {
      const page = await client.getPage('ThisPageDefinitelyDoesNotExist_zzz999');
      expect(page).toBeNull();
    });

    it('handles multi-word page titles', async () => {
      const page = await client.getPage('Resolute Technique');
      expect(page).not.toBeNull();
      expect(page!.url).toBe('https://www.poewiki.net/wiki/Resolute_Technique');
      expect(page!.extract.length).toBeGreaterThan(100);
    });

    it('caches the result — second call does not increase response time significantly', async () => {
      // Prime the cache
      await client.getPage('Fireball');

      const start = Date.now();
      await client.getPage('Fireball');
      const elapsed = Date.now() - start;

      // Cache hit should be essentially instant (< 50ms), no network round-trip
      expect(elapsed).toBeLessThan(50);
    });
  });
});
