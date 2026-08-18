import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StashClient } from '../stash-client.js';
import type { PluginContext } from '@poe-ai/core';

// Mock token-store so tests don't hit disk
vi.mock('../token-store.js', () => ({
  readToken: vi.fn().mockResolvedValue({
    access_token: 'test-bearer-token',
    token_type: 'Bearer',
    expires_in: 3600,
    scope: 'account:stashes',
  }),
}));

function makeCtx(httpGetImpl?: (url: string, opts: unknown) => unknown): PluginContext {
  const store = new Map<string, unknown>();
  return {
    http: {
      get: vi.fn().mockImplementation(httpGetImpl ?? (() => ({ stashes: [], stash: { items: [] } }))),
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

describe('StashClient', () => {
  describe('getTabs', () => {
    it('maps GGG stash list response to StashTab shape', async () => {
      const ctx = makeCtx(() => ({
        stashes: [
          { id: 'abc-123', name: 'Currency', type: 'CurrencyStash', index: 3, metadata: { public: true } },
        ],
      }));

      const client = new StashClient(ctx);
      const tabs = await client.getTabs('Settlers');

      expect(tabs[0]).toEqual({
        id: 'abc-123',
        name: 'Currency',
        type: 'CurrencyStash',
        index: 3,
        public: true,
      });
    });

    it('returns empty array when response has no stashes', async () => {
      const ctx = makeCtx(() => ({}));
      const client = new StashClient(ctx);
      const tabs = await client.getTabs('Settlers');
      expect(tabs).toEqual([]);
    });

    it('caches results and avoids a second HTTP call', async () => {
      const ctx = makeCtx(() => ({
        stashes: [{ id: 'x', name: 'My Tab', type: 'NormalStash', index: 0 }],
      }));
      const client = new StashClient(ctx);

      await client.getTabs('Settlers');
      await client.getTabs('Settlers');

      expect(ctx.http.get).toHaveBeenCalledTimes(1);
    });

    it('calls the correct URL with Bearer auth', async () => {
      const ctx = makeCtx(() => ({ stashes: [] }));
      const client = new StashClient(ctx);

      await client.getTabs('Settlers');

      expect(ctx.http.get).toHaveBeenCalledWith(
        'https://api.pathofexile.com/stash/Settlers',
        expect.objectContaining({
          headers: { Authorization: 'Bearer test-bearer-token' },
        })
      );
    });

    it('URL-encodes league names with spaces', async () => {
      const ctx = makeCtx(() => ({ stashes: [] }));
      const client = new StashClient(ctx);

      await client.getTabs('Hardcore Settlers');

      expect(ctx.http.get).toHaveBeenCalledWith(
        'https://api.pathofexile.com/stash/Hardcore%20Settlers',
        expect.anything()
      );
    });
  });

  describe('getTabItems', () => {
    it('calls the correct URL with stash UUID', async () => {
      const ctx = makeCtx(() => ({ stash: { id: 'uuid-1', name: 'Tab', type: 'NormalStash', items: [] } }));
      const client = new StashClient(ctx);

      await client.getTabItems('Settlers', 'uuid-1');

      expect(ctx.http.get).toHaveBeenCalledWith(
        'https://api.pathofexile.com/stash/Settlers/uuid-1',
        expect.objectContaining({
          headers: { Authorization: 'Bearer test-bearer-token' },
        })
      );
    });

    it('returns items from response', async () => {
      const fakeItem = { id: 'item1', name: '', typeLine: 'Divine Orb', baseType: 'Divine Orb', ilvl: 0, frameType: 5 };
      const ctx = makeCtx(() => ({ stash: { id: 'uuid-1', name: 'Tab', type: 'NormalStash', items: [fakeItem] } }));
      const client = new StashClient(ctx);

      const items = await client.getTabItems('Settlers', 'uuid-1');
      expect(items).toHaveLength(1);
      expect(items[0].typeLine).toBe('Divine Orb');
    });

    it('returns empty array when response has no items', async () => {
      const ctx = makeCtx(() => ({}));
      const client = new StashClient(ctx);
      const items = await client.getTabItems('Settlers', 'uuid-1');
      expect(items).toEqual([]);
    });

    it('caches item results to avoid redundant fetches', async () => {
      const ctx = makeCtx(() => ({ stash: { items: [] } }));
      const client = new StashClient(ctx);

      await client.getTabItems('Settlers', 'uuid-2');
      await client.getTabItems('Settlers', 'uuid-2');

      expect(ctx.http.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('MAX_TABS', () => {
    it('is 20', () => {
      expect(StashClient.MAX_TABS).toBe(20);
    });
  });
});
