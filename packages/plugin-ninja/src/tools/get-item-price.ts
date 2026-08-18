import { z } from 'zod';
import type { PluginTool, PluginContext } from '@poe-ai/core';
import { NinjaClient } from '../ninja-client.js';
import type { ItemCategory } from '../types.js';

const ITEM_CATEGORIES = [
  'UniqueWeapon',
  'UniqueArmour',
  'UniqueAccessory',
  'UniqueJewel',
  'UniqueFlask',
  'Map',
  'Currency',
  'Fragment',
  'DivinationCard',
  'SkillGem',
] as const;

const inputSchema = z.object({
  itemName: z
    .string()
    .min(1)
    .describe('Name of the item, e.g. "Kaom\'s Heart" or "Divine Orb"'),
  category: z
    .enum(ITEM_CATEGORIES)
    .optional()
    .describe(
      'Item category. If omitted, all categories are searched automatically. ' +
        'Providing the correct category is faster.'
    ),
  league: z
    .string()
    .optional()
    .describe('League name. Defaults to the current league from config.'),
});

type Input = z.infer<typeof inputSchema>;

export const getItemPriceTool: PluginTool<Input> = {
  name: 'get_item_price',
  description:
    'Get the current chaos and divine orb value of an item from poe.ninja economy data. ' +
    'Works for unique items, currencies, divination cards, and skill gems.',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputSchema: inputSchema as any,

  async handler({ itemName, category, league }: Input, ctx: PluginContext) {
    const targetLeague = league ?? ctx.leagueState.currentLeague;
    const client = new NinjaClient(ctx);

    try {
      ctx.logger.info(
        `[get_item_price] Fetching price for "${itemName}" in ${targetLeague}` +
          (category ? ` (category: ${category})` : ' (auto-detect)')
      );

      const result = await client.getItemPrice(itemName, category as ItemCategory | undefined, targetLeague);

      if (!result) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error:
                  `"${itemName}" was not found on poe.ninja for ${targetLeague}. ` +
                  'The item may not be tracked, or may be spelled differently.',
              }),
            },
          ],
          isError: true,
        };
      }

      ctx.logger.info(
        `[get_item_price] Found: ${result.name} = ${result.chaosValue}c / ${result.divineValue}div`
      );

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.logger.error(`[get_item_price] Failed: ${msg}`);
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
