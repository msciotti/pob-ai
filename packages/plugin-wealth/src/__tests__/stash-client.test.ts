import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StashClient } from '../stash-client.js';
import type { PluginContext } from '@poe-ai/core';

const SESSION_ID = 'test-poesessid';
const CF_CLEARANCE = 'test-cf-clearance';
const EXPECTED_COOKIE = `POESESSID=${SESSION_ID}; cf_clearance=${CF_CLEARANCE}`;
const STASH_URL = 'https://www.pathofexile.com/character-window/get-stash-items';

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

describe('StashClient', () => {
  describe('getTabs', () => {
    it('maps character-window tab list response to StashTab shape', async () => {
      const ctx = makeCtx(() => ({
        tabs: [
          { id: 'abc-123', n: 'Currency', type: 'CurrencyStash', i: 3 },
        ],
      }));

      const client = new StashClient(ctx, SESSION_ID, CF_CLEARANCE);
      const tabs = await client.getTabs('Settlers');

      expect(tabs[0]).toEqual({
        id: 'abc-123',
        name: 'Currency',
        type: 'CurrencyStash',
        index: 3,
      });
    });

    it('returns empty array when response has no tabs', async () => {
      const ctx = makeCtx(() => ({}));
      const client = new StashClient(ctx, SESSION_ID, CF_CLEARANCE);
      const tabs = await client.getTabs('Settlers');
      expect(tabs).toEqual([]);
    });

    it('caches results and avoids a second HTTP call', async () => {
      const ctx = makeCtx(() => ({
        tabs: [{ id: 'x', n: 'My Tab', type: 'NormalStash', i: 0 }],
      }));
      const client = new StashClient(ctx, SESSION_ID, CF_CLEARANCE);

      await client.getTabs('Settlers');
      await client.getTabs('Settlers');

      expect(ctx.http.get).toHaveBeenCalledTimes(1);
    });

    it('calls the correct URL with cookie auth and tabs=1', async () => {
      const ctx = makeCtx(() => ({ tabs: [] }));
      const client = new StashClient(ctx, SESSION_ID, CF_CLEARANCE);

      await client.getTabs('Settlers');

      expect(ctx.http.get).toHaveBeenCalledWith(
        STASH_URL,
        expect.objectContaining({
          params: expect.objectContaining({ league: 'Settlers', tabs: 1 }),
          headers: { Cookie: EXPECTED_COOKIE },
        })
      );
    });

    it('does not include accountName in params', async () => {
      const ctx = makeCtx(() => ({ tabs: [] }));
      const client = new StashClient(ctx, SESSION_ID, CF_CLEARANCE);

      await client.getTabs('Settlers');

      const callParams = (ctx.http.get as ReturnType<typeof vi.fn>).mock.calls[0][1].params;
      expect(callParams).not.toHaveProperty('accountName');
    });
  });

  describe('getTabItems', () => {
    it('calls the correct URL with tabIndex', async () => {
      const ctx = makeCtx(() => ({ items: [] }));
      const client = new StashClient(ctx, SESSION_ID, CF_CLEARANCE);

      await client.getTabItems('Settlers', 3);

      expect(ctx.http.get).toHaveBeenCalledWith(
        STASH_URL,
        expect.objectContaining({
          params: expect.objectContaining({ league: 'Settlers', tabIndex: 3, tabs: 0 }),
          headers: { Cookie: EXPECTED_COOKIE },
        })
      );
    });

    it('returns items from response', async () => {
      const fakeItem = { id: 'item1', name: '', typeLine: 'Divine Orb', baseType: 'Divine Orb', ilvl: 0, frameType: 5 };
      const ctx = makeCtx(() => ({ items: [fakeItem] }));
      const client = new StashClient(ctx, SESSION_ID, CF_CLEARANCE);

      const items = await client.getTabItems('Settlers', 0);
      expect(items).toHaveLength(1);
      expect(items[0].typeLine).toBe('Divine Orb');
    });

    it('returns empty array when response has no items', async () => {
      const ctx = makeCtx(() => ({}));
      const client = new StashClient(ctx, SESSION_ID, CF_CLEARANCE);
      const items = await client.getTabItems('Settlers', 0);
      expect(items).toEqual([]);
    });

    it('caches item results to avoid redundant fetches', async () => {
      const ctx = makeCtx(() => ({ items: [] }));
      const client = new StashClient(ctx, SESSION_ID, CF_CLEARANCE);

      await client.getTabItems('Settlers', 2);
      await client.getTabItems('Settlers', 2);

      expect(ctx.http.get).toHaveBeenCalledTimes(1);
    });

    it('uses separate cache keys for different tab indices', async () => {
      const ctx = makeCtx(() => ({ items: [] }));
      const client = new StashClient(ctx, SESSION_ID, CF_CLEARANCE);

      await client.getTabItems('Settlers', 0);
      await client.getTabItems('Settlers', 1);

      expect(ctx.http.get).toHaveBeenCalledTimes(2);
    });
  });

  describe('MAX_TABS', () => {
    it('is 20', () => {
      expect(StashClient.MAX_TABS).toBe(20);
    });
  });
});
