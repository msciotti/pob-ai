import { z } from 'zod';
import type { PluginTool, PluginContext } from '@poe-ai/core';
import { CraftingClient, generateCraftofExileLink } from '../crafting-client.js';

const inputSchema = z.object({
  fossilName: z.string().min(1).describe('Name of the fossil, e.g. "Scorched Fossil"'),
});

type Input = z.infer<typeof inputSchema>;

export const fossilInfoTool: PluginTool<Input> = {
  name: 'crafting_fossil_info',
  description:
    'Look up crafting information about a Path of Exile fossil from poedb.tw. ' +
    'Returns the fossil\'s mod tags, effects, and a craftofexile.com deep link for planning fossil crafts.',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputSchema: inputSchema as any,

  async handler({ fossilName }: Input, ctx: PluginContext) {
    const client = new CraftingClient(ctx);

    try {
      ctx.logger.info(`[crafting_fossil_info] Fetching fossil info for "${fossilName}"`);
      const result = await client.getFossil(fossilName);

      if (result.error) {
        ctx.logger.error(`[crafting_fossil_info] Error: ${result.error}`);
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

      const output = {
        ...result,
        craftofexile_url: generateCraftofExileLink('fossil'),
      };

      ctx.logger.info(`[crafting_fossil_info] Success for "${fossilName}"`);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.logger.error(`[crafting_fossil_info] Failed: ${msg}`);
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
