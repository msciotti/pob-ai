import { z } from 'zod';
import type { PluginTool, PluginContext } from '@poe-ai/core';
import { NinjaClient } from '../ninja-client.js';

const inputSchema = z.object({
  skill: z
    .string()
    .min(1)
    .describe('The main skill name, e.g. "Fireball" or "Boneshatter"'),
  ascendancy: z
    .string()
    .optional()
    .describe('Optional ascendancy to narrow results, e.g. "Juggernaut" or "Elementalist"'),
  league: z
    .string()
    .optional()
    .describe('League name. Defaults to the current league from config.'),
});

type Input = z.infer<typeof inputSchema>;

export const getMetaBuildsTool: PluginTool<Input> = {
  name: 'get_meta_builds',
  description:
    'Get meta statistics for a skill from poe.ninja: most popular support gems, unique items, ' +
    'and keystones used by top ladder builds, plus DPS and defense ranges. ' +
    'Combine with get_build_summary to identify gaps between your build and the meta.',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputSchema: inputSchema as any,

  async handler({ skill, ascendancy, league }: Input, ctx: PluginContext) {
    const targetLeague = league ?? ctx.leagueState.currentLeague;
    const client = new NinjaClient(ctx);

    try {
      ctx.logger.info(
        `[get_meta_builds] Fetching meta for skill="${skill}" ascendancy="${ascendancy ?? 'any'}" league="${targetLeague}"`
      );

      const data = await client.getBuildsForSkill(skill, ascendancy ?? null, targetLeague);

      if (data.sampleSize === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: `No poe.ninja build data found for skill "${skill}" in ${targetLeague}. ` +
                  'The skill may not be popular this league, or the build data may not yet be available.',
              }),
            },
          ],
          isError: true,
        };
      }

      ctx.logger.info(
        `[get_meta_builds] Found data: sampleSize=${data.sampleSize}, ` +
          `top gem=${data.topSupportGems[0]?.name ?? 'none'}`
      );

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.logger.error(`[get_meta_builds] Failed: ${msg}`);
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
