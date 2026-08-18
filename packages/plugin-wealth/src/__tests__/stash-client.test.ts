import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StashClient } from '../stash-client.js';
import type { PluginContext } from '@poe-ai/core';

// ──────────────────────────────────────────────────────────────────────────────
// Mock context factory
// ──────────────────────────────────────────────────────────────────────────────

function makeCtx(httpGetImpl?: (url: string, opts: unknown) => unknown): PluginContext {
  const store = new Map<string, unknown>();
  return {
    http: {
      get: vi.fn().mockImplementation(httpGetImpl ?? (() => ({ tabs: [], items: [] }))),
      post: vi.fn(),
    },
    cache: {
      get: vi.fn((key: string) => store.get(key)),
      set: vi.fn((key: string, value: unknown) => { store.set(key, value); }),
      delete: vi.fn((key: string) => { store.delete(key); }),
      clear: vi.fn(() => { store.clear(); }),
    },
    leagueState: {
      currentLeague: 'Settlers',
      patchVersion: '3.26.0',
      hardcore: false,
      ssf: false,
    },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  } as unknown as PluginContext;
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe('StashClient', () => {
  describe('getTabs', () => {
    it('filters out hidden tabs but includes private tabs', async () => {
      const ctx = makeCtx(() => ({
        tabs: [
          { id: 'a', n: 'Public Tab', type: 'NormalStash', i: 0, public: true },
          { id: 'b', n: 'Private Tab', type: 'NormalStash', i: 1, public: false },
          { id: 'c', n: 'Hidden Tab', type: 'NormalStash', i: 2, public: true, hidden: true },
        ],
      }));

      const client = new StashClient(ctx);
      const tabs = await client.getTabs('TestAccount', 'Settlers');

      // hidden tabs are excluded; private tabs are included (API filters by auth, not client)
      expect(tabs).toHaveLength(2);
      expect(tabs.map(t => t.name)).toContain('Public Tab');
      expect(tabs.map(t => t.name)).toContain('Private Tab');
      expect(tabs.map(t => t.name)).not.toContain('Hidden Tab');
    });

    it('maps raw tab fields to StashTab shape', async () => {
      const ctx = makeCtx(() => ({
        tabs: [
          { id: 'abc', n: 'Currency', type: 'CurrencyStash', i: 3, public: true },
        ],
      }));

      const client = new StashClient(ctx);
      const tabs = await client.getTabs('TestAccount', 'Settlers');

      expect(tabs[0]).toEqual({
        id: 'abc',
        name: 'Currency',
        type: 'CurrencyStash',
        index: 3,
        public: true,
      });
    });

    it('returns empty array when response has no tabs', async () => {
      const ctx = makeCtx(() => ({}));
      const client = new StashClient(ctx);
      const tabs = await client.getTabs('TestAccount', 'Settlers');
      expect(tabs).toEqual([]);
    });

    it('caches results and avoids a second HTTP call', async () => {
      const ctx = makeCtx(() => ({
        tabs: [{ id: 'x', n: 'My Tab', type: 'NormalStash', i: 0, public: true }],
      }));
      const client = new StashClient(ctx);

      await client.getTabs('TestAccount', 'Settlers');
      await client.getTabs('TestAccount', 'Settlers');

      // Should only have called http.get once; the second call hits cache
      expect(ctx.http.get).toHaveBeenCalledTimes(1);
    });

    it('calls the correct URL with correct params', async () => {
      const ctx = makeCtx(() => ({ tabs: [] }));
      const client = new StashClient(ctx);

      await client.getTabs('MyAccount', 'Settlers');

      expect(ctx.http.get).toHaveBeenCalledWith(
        'https://www.pathofexile.com/character-window/get-stash-items',
        expect.objectContaining({
          params: expect.objectContaining({
            accountName: 'MyAccount',
            league: 'Settlers',
            tabs: 1,
            tabIndex: 0,
            public: true,
          }),
        })
      );
    });
  });

  describe('getTabItems', () => {
    it('calls the API with tabs=0 and the correct tabIndex', async () => {
      const ctx = makeCtx(() => ({ items: [] }));
      const client = new StashClient(ctx);

      await client.getTabItems('MyAccount', 'Settlers', 5);

      expect(ctx.http.get).toHaveBeenCalledWith(
        'https://www.pathofexile.com/character-window/get-stash-items',
        expect.objectContaining({
          params: expect.objectContaining({
            accountName: 'MyAccount',
            league: 'Settlers',
            tabs: 0,
            tabIndex: 5,
            public: true,
          }),
        })
      );
    });

    it('returns items from response', async () => {
      const fakeItem = { id: 'item1', name: '', typeLine: 'Divine Orb', baseType: 'Divine Orb', ilvl: 0, frameType: 5 };
      const ctx = makeCtx(() => ({ items: [fakeItem] }));
      const client = new StashClient(ctx);

      const items = await client.getTabItems('MyAccount', 'Settlers', 0);
      expect(items).toHaveLength(1);
      expect(items[0].typeLine).toBe('Divine Orb');
    });

    it('returns empty array when response has no items', async () => {
      const ctx = makeCtx(() => ({}));
      const client = new StashClient(ctx);
      const items = await client.getTabItems('MyAccount', 'Settlers', 0);
      expect(items).toEqual([]);
    });

    it('caches item results to avoid redundant fetches', async () => {
      const ctx = makeCtx(() => ({ items: [] }));
      const client = new StashClient(ctx);

      await client.getTabItems('MyAccount', 'Settlers', 2);
      await client.getTabItems('MyAccount', 'Settlers', 2);

      expect(ctx.http.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('MAX_TABS', () => {
    it('is 20', () => {
      expect(StashClient.MAX_TABS).toBe(20);
    });
  });
});
