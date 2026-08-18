import type { PluginContext } from '@poe-ai/core';

export interface WikiSearchResult {
  title: string;
  snippet: string;
  url: string;
}

export interface WikiPage {
  title: string;
  extract: string;
  url: string;
  patchVersion: string;
}

export class WikiClient {
  private readonly baseUrl = 'https://www.poewiki.net';
  private readonly apiUrl = 'https://www.poewiki.net/api.php';

  constructor(private ctx: PluginContext) {}

  async search(query: string): Promise<WikiSearchResult[]> {
    const cacheKey = `wiki:search:${this.ctx.leagueState.patchVersion}:${query.toLowerCase().trim()}`;
    const cached = this.ctx.cache.get<WikiSearchResult[]>(cacheKey);
    if (cached) return cached;

    const data = await this.ctx.http.get<any>(this.apiUrl, {
      params: {
        action: 'query',
        list: 'search',
        srsearch: query,
        format: 'json',
        srlimit: '5',
      },
    });

    const results: WikiSearchResult[] = (data?.query?.search ?? []).map((r: any) => ({
      title: r.title,
      snippet: r.snippet?.replace(/<[^>]+>/g, '') ?? '', // strip HTML tags
      url: `${this.baseUrl}/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}`,
    }));

    // Cache 6 hours — wiki content only changes on patch day
    this.ctx.cache.set(cacheKey, results, 6 * 60 * 60 * 1000);
    return results;
  }

  async getPage(title: string): Promise<WikiPage | null> {
    const cacheKey = `wiki:page:${this.ctx.leagueState.patchVersion}:${title}`;
    const cached = this.ctx.cache.get<WikiPage>(cacheKey);
    if (cached) return cached;

    const data = await this.ctx.http.get<any>(this.apiUrl, {
      params: {
        action: 'query',
        prop: 'extracts',
        explaintext: 'true',
        titles: title,
        format: 'json',
      },
    });

    const pages = data?.query?.pages ?? {};
    const page = Object.values(pages)[0] as any;
    if (!page || page.missing !== undefined) return null;

    const result: WikiPage = {
      title: page.title,
      extract: page.extract ?? '',
      url: `${this.baseUrl}/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
      patchVersion: this.ctx.leagueState.patchVersion,
    };

    this.ctx.cache.set(cacheKey, result, 6 * 60 * 60 * 1000);
    return result;
  }
}
