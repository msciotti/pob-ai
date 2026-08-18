import type { PluginContext } from '@poe-ai/core';
import type { NinjaPriceLine } from './types.js';

const TTL_MS = 15 * 60 * 1000;

const ITEM_URL = 'https://poe.ninja/poe1/api/economy/stash/current/item/overview';
const CURRENCY_URL = 'https://poe.ninja/poe1/api/economy/stash/current/currency/overview';

type NinjaCategory =
  | 'Currency' | 'Fragment'
  | 'Map'
  | 'UniqueWeapon' | 'UniqueArmour' | 'UniqueAccessory' | 'UniqueJewel' | 'UniqueFlask'
  | 'DivinationCard' | 'SkillGem';

const CURRENCY_CATS: NinjaCategory[] = ['Currency', 'Fragment'];

/** Raw shape returned by the currency endpoint */
interface RawCurrencyLine {
  currencyTypeName: string;
  chaosEquivalent: number;
  divineValue?: number;
  listingCount?: number;
}

/** Raw shape returned by the item endpoint */
interface RawItemLine {
  name: string;
  chaosValue: number;
  divineValue?: number;
  listingCount?: number;
  count?: number;
  variant?: string;
}

const USER_AGENT = 'poe-ai/1.0 (github.com/msciotti/poe-ai)';

export class NinjaPriceCache {
  constructor(private ctx: PluginContext) {}

  async getPriceMap(category: NinjaCategory, league: string): Promise<Map<string, NinjaPriceLine>> {
    const key = `wealth:ninja:${this.ctx.leagueState.patchVersion}:${league}:${category}`;
    const cached = this.ctx.cache.get<Map<string, NinjaPriceLine>>(key);
    if (cached) return cached;

    const isCurrency = (CURRENCY_CATS as string[]).includes(category);
    const map = isCurrency
      ? await this.fetchCurrencyMap(category, league)
      : await this.fetchItemMap(category, league);

    this.ctx.cache.set(key, map, TTL_MS);
    return map;
  }

  private async fetchCurrencyMap(category: NinjaCategory, league: string): Promise<Map<string, NinjaPriceLine>> {
    const raw = await this.ctx.http.get<{ lines?: RawCurrencyLine[] }>(CURRENCY_URL, {
      params: { league, type: category },
      headers: { 'User-Agent': USER_AGENT },
      timeoutMs: 15_000,
    });

    const map = new Map<string, NinjaPriceLine>();
    for (const line of raw?.lines ?? []) {
      map.set(line.currencyTypeName.toLowerCase(), {
        name: line.currencyTypeName,
        chaosValue: line.chaosEquivalent,
        divineValue: line.divineValue,
        listingCount: line.listingCount,
      });
    }
    return map;
  }

  private async fetchItemMap(category: NinjaCategory, league: string): Promise<Map<string, NinjaPriceLine>> {
    const raw = await this.ctx.http.get<{ lines?: RawItemLine[] }>(ITEM_URL, {
      params: { league, type: category },
      headers: { 'User-Agent': USER_AGENT },
      timeoutMs: 15_000,
    });

    const map = new Map<string, NinjaPriceLine>();
    for (const line of raw?.lines ?? []) {
      map.set(line.name.toLowerCase(), {
        name: line.name,
        chaosValue: line.chaosValue,
        divineValue: line.divineValue,
        listingCount: line.listingCount ?? line.count,
        variant: line.variant,
      });
    }
    return map;
  }

  /** Convenience: get the chaos value of Divine Orb (for div conversion) */
  async getDivinePrice(league: string): Promise<number> {
    const map = await this.getPriceMap('Currency', league);
    return map.get('divine orb')?.chaosValue ?? 1;
  }
}
