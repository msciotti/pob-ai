import { z } from 'zod';
import type { PluginTool, PluginContext } from '@poe-ai/core';
import { StashClient } from '../stash-client.js';
import { NinjaPriceCache } from '../ninja-prices.js';
import { ItemPricer } from '../item-pricer.js';
import { getCredentials } from '../index.js';
import type { PricedItem, UnpricedItemSummary, WealthSummary } from '../types.js';

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
    'Requires POE_SESSION_ID and POE_CF_CLEARANCE environment variables.',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputSchema: inputSchema as any,

  async handler({ league, tabNames }: Input, ctx: PluginContext) {
    const { sessionId, cfClearance } = getCredentials();

    if (!sessionId || !cfClearance) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: false,
            error: 'Stash API credentials not configured. Set POE_SESSION_ID and POE_CF_CLEARANCE environment variables.',
          }),
        }],
        isError: true,
      };
    }

    const targetLeague = league ?? ctx.leagueState.currentLeague;

    try {
      ctx.logger.info(
        `[get_stash_value] Scanning stash in ${targetLeague}`
      );

      const stashClient = new StashClient(ctx, sessionId, cfClearance);
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

      // 4. Get divine price for conversion. Pricing itself (poe.ninja) can be
      // down or changed out from under us — that must never take down the
      // whole tool. If it fails here, fall back to quantities-only for the
      // entire scan; if it fails partway through the item loop below, fall
      // back for whatever's left.
      let pricingAvailable = true;
      let pricingWarning: string | undefined;
      let divinePrice = 1;

      try {
        divinePrice = await priceCache.getDivinePrice(targetLeague);
      } catch (err) {
        pricingAvailable = false;
        const msg = err instanceof Error ? err.message : String(err);
        pricingWarning = `poe.ninja pricing is unavailable (${msg}). Showing stash contents and quantities only — chaos/divine values could not be computed.`;
        ctx.logger.warn(`[get_stash_value] ${pricingWarning}`);
      }

      // 5. Fetch and price items from each tab
      const byCategory: WealthSummary['byCategory'] = {};
      const unpricedItemDetails: UnpricedItemSummary[] = [];
      let totalChaosValue = 0;
      let unpricedItems = 0;

      for (const tab of tabs) {
        const items = await stashClient.getTabItems(targetLeague, tab.index);

        for (const raw of items) {
          const displayName =
            raw.frameType === 3
              ? raw.name.replace(/<<set:[^>]+>>/g, '').trim() || raw.typeLine
              : raw.typeLine;
          const stackSize = raw.stackSize ?? 1;

          let priced: { chaosValue: number; category: string } | null = null;
          if (pricingAvailable) {
            try {
              priced = await pricer.priceItem(raw, targetLeague);
            } catch (err) {
              pricingAvailable = false;
              const msg = err instanceof Error ? err.message : String(err);
              pricingWarning = `poe.ninja pricing failed partway through the scan (${msg}). Remaining items are shown as quantities only.`;
              ctx.logger.warn(`[get_stash_value] ${pricingWarning}`);
            }
          }

          if (!priced) {
            unpricedItems++;
            // Only record contents/quantities when the reason is a pricing
            // outage, not just an item type we never price (rares, etc.) —
            // that'd be noisy for the common case.
            if (!pricingAvailable) {
              unpricedItemDetails.push({
                name: displayName,
                typeLine: raw.typeLine,
                category: raw.extended?.category ?? 'unknown',
                stackSize,
                tabName: tab.name,
              });
            }
            continue;
          }

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
        pricingAvailable,
        ...(pricingWarning ? { pricingWarning } : {}),
        ...(unpricedItemDetails.length > 0 ? { unpricedItemDetails } : {}),
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
