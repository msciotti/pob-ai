import { z } from 'zod';
import type { PluginTool, PluginContext } from '@poe-ai/core';
import { CraftingClient } from '../crafting-client.js';

const inputSchema = z.object({
  influence: z
    .string()
    .describe(
      'Influence type: shaper, elder, crusader, hunter, warlord, redeemer, synthesis, eldritch'
    ),
  itemClass: z
    .string()
    .optional()
    .describe('Item class filter, e.g. "ring", "helmet", "body armour"'),
});

type Input = z.infer<typeof inputSchema>;

export const influencedModsTool: PluginTool<Input> = {
  name: 'crafting_influenced_mods',
  description:
    'Look up influence-specific item modifiers for Path of Exile. ' +
    'Returns mods associated with a given influence type (e.g. Shaper, Elder, Crusader) ' +
    'optionally filtered to a specific item class.',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputSchema: inputSchema as any,

  async handler({ influence, itemClass }: Input, ctx: PluginContext) {
    const client = new CraftingClient(ctx);

    try {
      ctx.logger.info(
        `[crafting_influenced_mods] Fetching ${influence} mods` +
          (itemClass ? ` for "${itemClass}"` : '')
      );

      const results = await client.getInfluencedMods(influence, itemClass);

      ctx.logger.info(`[crafting_influenced_mods] Found ${results.length} mod(s)`);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              { influence, itemClass: itemClass ?? null, count: results.length, mods: results },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.logger.error(`[crafting_influenced_mods] Failed: ${msg}`);
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
