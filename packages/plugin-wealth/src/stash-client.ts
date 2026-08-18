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
  constructor(private ctx: PluginContext, private poesessid?: string) {}

  private get headers(): Record<string, string> | undefined {
    return this.poesessid
      ? { Cookie: `POESESSID=${this.poesessid}` }
      : undefined;
  }

  /**
   * Fetch the tab list for an account+league.
   * With a POESESSID, returns all tabs. Without one, returns only public tabs.
   * Results are cached for 5 minutes.
   */
  async getTabs(accountName: string, league: string): Promise<StashTab[]> {
    const key = `wealth:stash:tabs:${accountName}:${league}:${this.poesessid ? 'auth' : 'public'}`;
    const cached = this.ctx.cache.get<StashTab[]>(key);
    if (cached) return cached;

    const params: Record<string, string | number | boolean> = {
      accountName,
      league,
      tabs: 1,
      tabIndex: 0,
    };
    if (!this.poesessid) params['public'] = true;

    const raw = await this.ctx.http.get<StashTabListResponse>(POE_API, {
      params,
      headers: this.headers,
      timeoutMs: 20_000,
    });

    const tabs: StashTab[] = (raw?.tabs ?? [])
      .filter(t => t.hidden !== true)
      .map(t => ({
        id: t.id,
        name: t.n,
        type: t.type,
        index: t.i,
        public: t.public === true,
      }));

    this.ctx.cache.set(key, tabs, TAB_LIST_TTL_MS);
    return tabs;
  }

  /**
   * Fetch items from a specific stash tab by its index.
   * Results are cached for 2 minutes.
   */
  async getTabItems(accountName: string, league: string, tabIndex: number): Promise<RawStashItem[]> {
    const key = `wealth:stash:items:${accountName}:${league}:${tabIndex}:${this.poesessid ? 'auth' : 'public'}`;
    const cached = this.ctx.cache.get<RawStashItem[]>(key);
    if (cached) return cached;

    const params: Record<string, string | number | boolean> = {
      accountName,
      league,
      tabs: 0,
      tabIndex,
    };
    if (!this.poesessid) params['public'] = true;

    const raw = await this.ctx.http.get<StashItemsResponse>(POE_API, {
      params,
      headers: this.headers,
      timeoutMs: 20_000,
    });

    const items: RawStashItem[] = raw?.items ?? [];
    this.ctx.cache.set(key, items, TAB_ITEMS_TTL_MS);
    return items;
  }

  /** Expose the max tab cap so callers can apply it consistently */
  static readonly MAX_TABS = MAX_TABS;
}
