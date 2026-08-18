import type { PluginContext } from '@poe-ai/core';
import type { StashTab, RawStashItem } from './types.js';
import { readToken } from './token-store.js';

const POE_API_BASE = 'https://api.pathofexile.com/stash';

/** 5-minute TTL for tab lists */
const TAB_LIST_TTL_MS = 5 * 60 * 1000;
/** 2-minute TTL for tab items */
const TAB_ITEMS_TTL_MS = 2 * 60 * 1000;
/** Hard cap on tabs fetched per call */
const MAX_TABS = 20;

interface GGGStashListResponse {
  stashes?: Array<{
    id: string;
    name: string;
    type: string;
    index: number;
    metadata?: { colour?: string; public?: boolean };
  }>;
}

interface GGGStashItemsResponse {
  stash?: {
    id: string;
    name: string;
    type: string;
    items?: RawStashItem[];
  };
}

export class StashClient {
  constructor(private ctx: PluginContext) {}

  private async authHeaders(): Promise<Record<string, string>> {
    const { access_token } = await readToken();
    return { Authorization: `Bearer ${access_token}` };
  }

  /**
   * Fetch the tab list for the authenticated account in the given league.
   * Results are cached for 5 minutes.
   */
  async getTabs(league: string): Promise<StashTab[]> {
    const key = `wealth:stash:tabs:${league}:oauth`;
    const cached = this.ctx.cache.get<StashTab[]>(key);
    if (cached) return cached;

    const headers = await this.authHeaders();
    const raw = await this.ctx.http.get<GGGStashListResponse>(
      `${POE_API_BASE}/${encodeURIComponent(league)}`,
      { headers, timeoutMs: 20_000 }
    );

    const tabs: StashTab[] = (raw?.stashes ?? []).map(s => ({
      id: s.id,
      name: s.name,
      type: s.type,
      index: s.index,
      public: s.metadata?.public === true,
    }));

    this.ctx.cache.set(key, tabs, TAB_LIST_TTL_MS);
    return tabs;
  }

  /**
   * Fetch items from a specific stash tab by its UUID.
   * Results are cached for 2 minutes.
   */
  async getTabItems(league: string, stashId: string): Promise<RawStashItem[]> {
    const key = `wealth:stash:items:${league}:${stashId}:oauth`;
    const cached = this.ctx.cache.get<RawStashItem[]>(key);
    if (cached) return cached;

    const headers = await this.authHeaders();
    const raw = await this.ctx.http.get<GGGStashItemsResponse>(
      `${POE_API_BASE}/${encodeURIComponent(league)}/${stashId}`,
      { headers, timeoutMs: 20_000 }
    );

    const items: RawStashItem[] = raw?.stash?.items ?? [];
    this.ctx.cache.set(key, items, TAB_ITEMS_TTL_MS);
    return items;
  }

  static readonly MAX_TABS = MAX_TABS;
}
