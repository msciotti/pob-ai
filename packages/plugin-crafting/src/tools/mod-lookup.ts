import { z } from 'zod';
import type { PluginTool, PluginContext } from '@poe-ai/core';
import { CraftingClient } from '../crafting-client.js';

const inputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe('Mod text or stat to search for, e.g. "cold damage" or "life regeneration"'),
  itemClass: z
    .string()
    .optional()
    .describe('Item class filter, e.g. "ring", "helmet", "body armour"'),
  influence: z
    .string()
    .optional()
    .describe(
      'Influence filter: shaper, elder, crusader, hunter, warlord, redeemer, synthesis, eldritch'
    ),
});

type Input = z.infer<typeof inputSchema>;

export const modLookupTool: PluginTool<Input> = {
  name: 'crafting_mod_lookup',
  description:
    'Search for Path of Exile item modifiers (mods) by stat text, item class, or influence type. ' +
    'Useful for finding which items can roll a specific modifier and what its value ranges are.',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputSchema: inputSchema as any,

  async handler({ query, itemClass, influence }: Input, ctx: PluginContext) {
    const client = new CraftingClient(ctx);

    try {
      ctx.logger.info(
        `[crafting_mod_lookup] Searching mods: query="${query}"` +
          (itemClass ? ` class="${itemClass}"` : '') +
          (influence ? ` influence="${influence}"` : '')
      );

      const results = await client.searchMods(query, itemClass, influence);

      ctx.logger.info(`[crafting_mod_lookup] Found ${results.length} mod(s)`);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ count: results.length, mods: results }, null, 2),
          },
        ],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.logger.error(`[crafting_mod_lookup] Failed: ${msg}`);
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
