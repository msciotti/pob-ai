import { z } from 'zod';
import type { PluginTool, PluginContext } from '@poe-ai/core';
import { CraftingClient } from '../crafting-client.js';

const inputSchema = z.object({
  tag: z
    .string()
    .optional()
    .describe(
      'Harvest tag filter: life, caster, attack, defence, physical, fire, cold, lightning, chaos, speed, reforge'
    ),
  itemClass: z
    .string()
    .optional()
    .describe('Item class filter to narrow down applicability'),
});

type Input = z.infer<typeof inputSchema>;

export const harvestOptionsTool: PluginTool<Input> = {
  name: 'crafting_harvest_options',
  description:
    'List available Harvest crafting options in Path of Exile. ' +
    'Filter by tag (e.g. "life", "caster") or item class to find relevant crafts. ' +
    'Harvest crafts include augment, remove-add, and reforge operations tied to specific modifier tags.',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputSchema: inputSchema as any,

  async handler({ tag, itemClass }: Input, ctx: PluginContext) {
    const client = new CraftingClient(ctx);

    try {
      ctx.logger.info(
        `[crafting_harvest_options] Listing harvest options` +
          (tag ? ` tag="${tag}"` : '') +
          (itemClass ? ` itemClass="${itemClass}"` : '')
      );

      const results = client.getHarvestOptions(tag, itemClass);

      ctx.logger.info(`[crafting_harvest_options] Returned ${results.length} option(s)`);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ count: results.length, crafts: results }, null, 2),
          },
        ],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.logger.error(`[crafting_harvest_options] Failed: ${msg}`);
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
