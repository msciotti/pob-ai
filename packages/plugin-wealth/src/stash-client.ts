import type { PluginContext } from '@poe-ai/core';
import type { StashTab, RawStashItem } from './types.js';

const POE_API = 'https://www.pathofexile.com/character-window/get-stash-items';

/** 5-minute TTL for tab lists; stash contents change frequently but tab structure is stable */
const TAB_LIST_TTL_MS = 5 * 60 * 1000;
/** 2-minute TTL for tab items — short because stash contents change as items are moved/sold */
const TAB_ITEMS_TTL_MS = 2 * 60 * 1000;
/** Hard cap on tabs fetched per call to avoid hammering the PoE API (~45 req/60s rate limit) */
const MAX_TABS = 20;

interface StashTabListResponse {
  tabs?: Array<{
    id: string;
    n: string;      // tab name
    type: string;
    i: number;      // index
    hidden?: boolean;
    public?: boolean;
  }>;
}

interface StashItemsResponse {
  items?: RawStashItem[];
}

export class StashClient {
  constructor(private ctx: PluginContext) {}

  /**
   * Fetch the tab list for an account+league, returning only public tabs.
   * Results are cached for 5 minutes.
   */
  async getPublicTabs(accountName: string, league: string): Promise<StashTab[]> {
    const key = `wealth:stash:tabs:${accountName}:${league}`;
    const cached = this.ctx.cache.get<StashTab[]>(key);
    if (cached) return cached;

    const raw = await this.ctx.http.get<StashTabListResponse>(POE_API, {
      params: {
        accountName,
        league,
        tabs: 1,
        tabIndex: 0,
        public: true,
      },
      timeoutMs: 20_000,
    });

    const tabs: StashTab[] = (raw?.tabs ?? [])
      .filter(t => t.public === true && t.hidden !== true)
      .map(t => ({
        id: t.id,
        name: t.n,
        type: t.type,
        index: t.i,
        public: true,
      }));

    this.ctx.cache.set(key, tabs, TAB_LIST_TTL_MS);
    return tabs;
  }

  /**
   * Fetch items from a specific stash tab by its index.
   * Results are cached for 2 minutes.
   * Respects the MAX_TABS cap (callers should not pass a tabIndex beyond that).
   */
  async getTabItems(accountName: string, league: string, tabIndex: number): Promise<RawStashItem[]> {
    const key = `wealth:stash:items:${accountName}:${league}:${tabIndex}`;
    const cached = this.ctx.cache.get<RawStashItem[]>(key);
    if (cached) return cached;

    const raw = await this.ctx.http.get<StashItemsResponse>(POE_API, {
      params: {
        accountName,
        league,
        tabs: 0,
        tabIndex,
        public: true,
      },
      timeoutMs: 20_000,
    });

    const items: RawStashItem[] = raw?.items ?? [];
    this.ctx.cache.set(key, items, TAB_ITEMS_TTL_MS);
    return items;
  }

  /** Expose the max tab cap so callers can apply it consistently */
  static readonly MAX_TABS = MAX_TABS;
}
