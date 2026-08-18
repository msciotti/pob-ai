import type { PluginContext } from '@poe-ai/core';
import type { StashTab, RawStashItem } from './types.js';

const STASH_URL = 'https://www.pathofexile.com/character-window/get-stash-items';

/** 5-minute TTL for tab lists */
const TAB_LIST_TTL_MS = 5 * 60 * 1000;
/** 2-minute TTL for tab items */
const TAB_ITEMS_TTL_MS = 2 * 60 * 1000;
/** Hard cap on tabs fetched per call */
const MAX_TABS = 20;

interface RawTabEntry {
  id: string;
  n: string;
  type: string;
  i: number;
}

export class StashClient {
  constructor(
    private readonly ctx: PluginContext,
    private readonly sessionId: string,
    private readonly cfClearance: string,
  ) {}

  private cookieHeader(): string {
    return `POESESSID=${this.sessionId}; cf_clearance=${this.cfClearance}`;
  }

  /**
   * Fetch the tab list for the authenticated account in the given league.
   * Results are cached for 5 minutes.
   */
  async getTabs(league: string): Promise<StashTab[]> {
    const key = `wealth:stash:tabs:${league}`;
    const cached = this.ctx.cache.get<StashTab[]>(key);
    if (cached) return cached;

    const raw = await this.ctx.http.get<{ tabs?: RawTabEntry[] }>(
      STASH_URL,
      {
        params: { league, tabs: 1, public: false },
        headers: { Cookie: this.cookieHeader() },
        timeoutMs: 20_000,
      }
    );

    const tabs: StashTab[] = (raw?.tabs ?? []).map(t => ({
      id: t.id,
      name: t.n,
      type: t.type,
      index: t.i,
    }));

    this.ctx.cache.set(key, tabs, TAB_LIST_TTL_MS);
    return tabs;
  }

  /**
   * Fetch items from a specific stash tab by its 0-based index.
   * Results are cached for 2 minutes.
   */
  async getTabItems(league: string, tabIndex: number): Promise<RawStashItem[]> {
    const key = `wealth:stash:items:${league}:${tabIndex}`;
    const cached = this.ctx.cache.get<RawStashItem[]>(key);
    if (cached) return cached;

    const raw = await this.ctx.http.get<{ items?: RawStashItem[] }>(
      STASH_URL,
      {
        params: { league, tabs: 0, tabIndex, public: false },
        headers: { Cookie: this.cookieHeader() },
        timeoutMs: 20_000,
      }
    );

    const items: RawStashItem[] = raw?.items ?? [];
    this.ctx.cache.set(key, items, TAB_ITEMS_TTL_MS);
    return items;
  }

  static readonly MAX_TABS = MAX_TABS;
}
