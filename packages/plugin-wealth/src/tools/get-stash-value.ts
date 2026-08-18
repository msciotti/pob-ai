import { z } from 'zod';
import type { PluginTool, PluginContext } from '@poe-ai/core';
import { StashClient } from '../stash-client.js';
import { NinjaPriceCache } from '../ninja-prices.js';
import { ItemPricer } from '../item-pricer.js';
import type { PricedItem, WealthSummary } from '../types.js';

const inputSchema = z.object({
  league: z
    .string()
    .optional()
    .describe('League name. Defaults to current league.'),
  tabNames: z
    .array(z.string())
    .optional()
    .describe('Filter to specific tab names. Omit to scan all tabs.'),
});

type Input = z.infer<typeof inputSchema>;

export const getStashValueTool: PluginTool<Input> = {
  name: 'get_stash_value',
  description:
    'Fetch stash tabs for the authenticated PoE account and return a total wealth breakdown ' +
    'by category (currency, maps, uniques, gems, divination cards) in both chaos and divine orbs. ' +
    'Requires running oauth-login.mjs once to authenticate.',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputSchema: inputSchema as any,

  async handler({ league, tabNames }: Input, ctx: PluginContext) {
    const targetLeague = league ?? ctx.leagueState.currentLeague;

    try {
      ctx.logger.info(
        `[get_stash_value] Scanning stash in ${targetLeague}`
      );

      const stashClient = new StashClient(ctx);
      const priceCache = new NinjaPriceCache(ctx);
      const pricer = new ItemPricer(priceCache);

      // 1. Get tabs
      let tabs = await stashClient.getTabs(targetLeague);

      // 2. Filter by requested tab names (case-insensitive)
      if (tabNames && tabNames.length > 0) {
        const nameSet = new Set(tabNames.map(n => n.toLowerCase()));
        tabs = tabs.filter(t => nameSet.has(t.name.toLowerCase()));
      }

      // 3. Cap at MAX_TABS to protect the API rate limit
      if (tabs.length > StashClient.MAX_TABS) {
        ctx.logger.warn(
          `[get_stash_value] ${tabs.length} tabs matched — capping at ${StashClient.MAX_TABS}`
        );
        tabs = tabs.slice(0, StashClient.MAX_TABS);
      }

      // 4. Get divine price for conversion
      const divinePrice = await priceCache.getDivinePrice(targetLeague);

      // 5. Fetch and price items from each tab
      const byCategory: WealthSummary['byCategory'] = {};
      let totalChaosValue = 0;
      let unpricedItems = 0;

      for (const tab of tabs) {
        const items = await stashClient.getTabItems(targetLeague, tab.id);

        for (const raw of items) {
          const priced = await pricer.priceItem(raw, targetLeague);

          if (!priced) {
            unpricedItems++;
            continue;
          }

          const displayName =
            raw.frameType === 3
              ? raw.name.replace(/<<set:[^>]+>>/g, '').trim() || raw.typeLine
              : raw.typeLine;

          const stackSize = raw.stackSize ?? 1;
          const pricedItem: PricedItem = {
            name: displayName,
            typeLine: raw.typeLine,
            category: priced.category,
            stackSize,
            unitChaosValue: stackSize > 0 ? priced.chaosValue / stackSize : priced.chaosValue,
            totalChaosValue: priced.chaosValue,
            tabName: tab.name,
          };

          if (!byCategory[priced.category]) {
            byCategory[priced.category] = { totalChaosValue: 0, items: [] };
          }
          byCategory[priced.category].totalChaosValue += priced.chaosValue;
          byCategory[priced.category].items.push(pricedItem);
          totalChaosValue += priced.chaosValue;
        }
      }

      const summary: WealthSummary = {
        totalChaosValue,
        totalDivineValue: divinePrice > 0 ? totalChaosValue / divinePrice : 0,
        divinePrice,
        byCategory,
        unpricedItems,
        tabsScanned: tabs.length,
      };

      ctx.logger.info(
        `[get_stash_value] Done: ${totalChaosValue.toFixed(1)}c across ${tabs.length} tabs`
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                success: true,
                league: targetLeague,
                ...summary,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.logger.error(`[get_stash_value] Failed: ${msg}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: msg }),
          },
        ],
        isError: true,
      };
    }
  },
};
