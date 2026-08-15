import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WikiClient } from '../wiki-client.js';
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

const FAKE_SEARCH_RESPONSE = {
  query: {
    search: [
      {
        title: 'Fireball',
        snippet: '<span class="highlight">Fireball</span> is a spell that deals fire damage.',
      },
      {
        title: 'Fire Damage',
        snippet: 'Fire damage is one of the elemental damage types.',
      },
    ],
  },
};

const FAKE_PAGE_RESPONSE = {
  query: {
    pages: {
      '12345': {
        pageid: 12345,
        title: 'Fireball',
        extract: 'Fireball is an active skill gem that fires a projectile that explodes on impact.',
      },
    },
  },
};

const FAKE_MISSING_PAGE_RESPONSE = {
  query: {
    pages: {
      '-1': {
        title: 'NonExistentPage',
        missing: '',
      },
    },
  },
};

describe('WikiClient', () => {
  describe('search', () => {
    it('returns correctly shaped WikiSearchResult array', async () => {
      const ctx = makeCtx();
      (ctx.http.get as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_SEARCH_RESPONSE);

      const client = new WikiClient(ctx);
      const results = await client.search('fireball');

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        title: 'Fireball',
        snippet: 'Fireball is a spell that deals fire damage.',
        url: 'https://www.poewiki.net/wiki/Fireball',
      });
      expect(results[1]).toEqual({
        title: 'Fire Damage',
        snippet: 'Fire damage is one of the elemental damage types.',
        url: 'https://www.poewiki.net/wiki/Fire_Damage',
      });
    });

    it('strips HTML tags from snippets', async () => {
      const ctx = makeCtx();
      (ctx.http.get as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_SEARCH_RESPONSE);

      const client = new WikiClient(ctx);
      const results = await client.search('fireball');

      // The <span class="highlight"> tag should be stripped
      expect(results[0].snippet).not.toContain('<span');
      expect(results[0].snippet).not.toContain('</span>');
      expect(results[0].snippet).toContain('Fireball');
    });

    it('returns empty array when query has no results', async () => {
      const ctx = makeCtx();
      (ctx.http.get as ReturnType<typeof vi.fn>).mockResolvedValue({ query: { search: [] } });

      const client = new WikiClient(ctx);
      const results = await client.search('zzznoresults');

      expect(results).toEqual([]);
    });

    it('caches results so second call does not hit HTTP', async () => {
      const ctx = makeCtx();
      const httpGet = ctx.http.get as ReturnType<typeof vi.fn>;
      httpGet.mockResolvedValue(FAKE_SEARCH_RESPONSE);

      const client = new WikiClient(ctx);
      await client.search('fireball');
      await client.search('fireball');

      expect(httpGet).toHaveBeenCalledTimes(1);
    });

    it('includes patchVersion in cache key (different patch = separate cache entry)', async () => {
      const ctxA = makeCtx('3.26.0');
      const ctxB = makeCtx('3.25.0');

      const httpGetA = ctxA.http.get as ReturnType<typeof vi.fn>;
      const httpGetB = ctxB.http.get as ReturnType<typeof vi.fn>;
      httpGetA.mockResolvedValue(FAKE_SEARCH_RESPONSE);
      httpGetB.mockResolvedValue(FAKE_SEARCH_RESPONSE);

      // Populate ctxA's cache with patch 3.26.0 results
      const clientA = new WikiClient(ctxA);
      await clientA.search('fireball');

      // ctxB uses a different cache instance with a different patch — must hit HTTP
      const clientB = new WikiClient(ctxB);
      await clientB.search('fireball');

      expect(httpGetA).toHaveBeenCalledTimes(1);
      expect(httpGetB).toHaveBeenCalledTimes(1);
    });

    it('passes correct query params to the HTTP client', async () => {
      const ctx = makeCtx();
      const httpGet = ctx.http.get as ReturnType<typeof vi.fn>;
      httpGet.mockResolvedValue(FAKE_SEARCH_RESPONSE);

      const client = new WikiClient(ctx);
      await client.search('acrobatics');

      expect(httpGet).toHaveBeenCalledWith(
        'https://www.poewiki.net/api.php',
        expect.objectContaining({
          params: expect.objectContaining({
            action: 'query',
            list: 'search',
            srsearch: 'acrobatics',
            format: 'json',
          }),
        }),
      );
    });

    it('handles missing query.search gracefully', async () => {
      const ctx = makeCtx();
      (ctx.http.get as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const client = new WikiClient(ctx);
      const results = await client.search('fireball');

      expect(results).toEqual([]);
    });
  });

  describe('getPage', () => {
    it('returns a correctly shaped WikiPage when page exists', async () => {
      const ctx = makeCtx();
      (ctx.http.get as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_PAGE_RESPONSE);

      const client = new WikiClient(ctx);
      const page = await client.getPage('Fireball');

      expect(page).not.toBeNull();
      expect(page).toEqual({
        title: 'Fireball',
        extract: 'Fireball is an active skill gem that fires a projectile that explodes on impact.',
        url: 'https://www.poewiki.net/wiki/Fireball',
        patchVersion: '3.26.0',
      });
    });

    it('returns null when page is missing', async () => {
      const ctx = makeCtx();
      (ctx.http.get as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_MISSING_PAGE_RESPONSE);

      const client = new WikiClient(ctx);
      const page = await client.getPage('NonExistentPage');

      expect(page).toBeNull();
    });

    it('caches page content so second call does not hit HTTP', async () => {
      const ctx = makeCtx();
      const httpGet = ctx.http.get as ReturnType<typeof vi.fn>;
      httpGet.mockResolvedValue(FAKE_PAGE_RESPONSE);

      const client = new WikiClient(ctx);
      await client.getPage('Fireball');
      await client.getPage('Fireball');

      expect(httpGet).toHaveBeenCalledTimes(1);
    });

    it('cache key includes patchVersion so different patches are not mixed', async () => {
      const ctxA = makeCtx('3.26.0');
      const ctxB = makeCtx('3.25.0');

      const httpGetA = ctxA.http.get as ReturnType<typeof vi.fn>;
      const httpGetB = ctxB.http.get as ReturnType<typeof vi.fn>;
      httpGetA.mockResolvedValue(FAKE_PAGE_RESPONSE);
      httpGetB.mockResolvedValue(FAKE_PAGE_RESPONSE);

      const clientA = new WikiClient(ctxA);
      await clientA.getPage('Fireball');

      // Different patch context — must make its own HTTP call
      const clientB = new WikiClient(ctxB);
      await clientB.getPage('Fireball');

      expect(httpGetA).toHaveBeenCalledTimes(1);
      expect(httpGetB).toHaveBeenCalledTimes(1);
    });

    it('sets patchVersion from ctx.leagueState on the returned page', async () => {
      const ctx = makeCtx('3.99.0');
      (ctx.http.get as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_PAGE_RESPONSE);

      const client = new WikiClient(ctx);
      const page = await client.getPage('Fireball');

      expect(page?.patchVersion).toBe('3.99.0');
    });

    it('handles missing pages object gracefully', async () => {
      const ctx = makeCtx();
      (ctx.http.get as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const client = new WikiClient(ctx);
      const page = await client.getPage('Fireball');

      expect(page).toBeNull();
    });

    it('encodes spaces as underscores in the page URL', async () => {
      const ctx = makeCtx();
      (ctx.http.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        query: {
          pages: {
            '42': {
              pageid: 42,
              title: 'Resolute Technique',
              extract: 'Resolute Technique is a keystone passive.',
            },
          },
        },
      });

      const client = new WikiClient(ctx);
      const page = await client.getPage('Resolute Technique');

      expect(page?.url).toBe('https://www.poewiki.net/wiki/Resolute_Technique');
    });
  });
});
