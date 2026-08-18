import type { PluginContext } from '@poe-ai/core';
import type { NinjaPriceLine } from './types.js';

const TTL_MS = 15 * 60 * 1000;
const ITEM_URL = 'https://poe.ninja/api/data/itemoverview';
const CURRENCY_URL = 'https://poe.ninja/api/data/currencyoverview';

type NinjaCategory =
  | 'Currency' | 'Fragment'
  | 'Map'
  | 'UniqueWeapon' | 'UniqueArmour' | 'UniqueAccessory' | 'UniqueJewel' | 'UniqueFlask'
  | 'DivinationCard' | 'SkillGem';

const CURRENCY_CATS: NinjaCategory[] = ['Currency', 'Fragment'];

export class NinjaPriceCache {
  constructor(private ctx: PluginContext) {}

  async getPriceMap(category: NinjaCategory, league: string): Promise<Map<string, NinjaPriceLine>> {
    const key = `wealth:ninja:${this.ctx.leagueState.patchVersion}:${league}:${category}`;
    const cached = this.ctx.cache.get<Map<string, NinjaPriceLine>>(key);
    if (cached) return cached;

    const isCurrency = (CURRENCY_CATS as string[]).includes(category);
    const url = isCurrency ? CURRENCY_URL : ITEM_URL;
    const raw = await this.ctx.http.get<{ lines?: NinjaPriceLine[] }>(url, {
      params: { league, type: category },
      timeoutMs: 15_000,
    });

    const map = new Map<string, NinjaPriceLine>();
    for (const line of raw?.lines ?? []) {
      map.set(line.name.toLowerCase(), line);
    }
    this.ctx.cache.set(key, map, TTL_MS);
    return map;
  }

  /** Convenience: get the chaos value of Divine Orb (for div conversion) */
  async getDivinePrice(league: string): Promise<number> {
    const map = await this.getPriceMap('Currency', league);
    return map.get('divine orb')?.chaosValue ?? 1;
  }
}
