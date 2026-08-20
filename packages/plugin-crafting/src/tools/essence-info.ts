import { z } from 'zod';
import type { PluginTool, PluginContext } from '@poe-ai/core';
import { CraftingClient } from '../crafting-client.js';

const inputSchema = z.object({
  essenceName: z.string().min(1).describe('Essence name, e.g. "Deafening Essence of Hatred"'),
});

type Input = z.infer<typeof inputSchema>;

export const essenceInfoTool: PluginTool<Input> = {
  name: 'crafting_essence_info',
  description:
    'Look up crafting information about a Path of Exile essence from local game data. ' +
    'Returns the guaranteed mods the essence applies per item class.',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputSchema: inputSchema as any,

  async handler({ essenceName }: Input, ctx: PluginContext) {
    const client = new CraftingClient(ctx);

    try {
      ctx.logger.info(`[crafting_essence_info] Fetching essence info for "${essenceName}"`);
      const result = await client.getEssence(essenceName);

      if (result.error) {
        ctx.logger.error(`[crafting_essence_info] Error: ${result.error}`);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ success: false, error: result.error }),
            },
          ],
          isError: true,
        };
      }

      ctx.logger.info(`[crafting_essence_info] Success for "${essenceName}"`);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.logger.error(`[crafting_essence_info] Failed: ${msg}`);
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
