import { z } from 'zod';
import type { PluginTool, PluginContext } from '@poe-ai/core';

// get_build_stats takes no inputs
const inputSchema = z.object({});

type Input = z.infer<typeof inputSchema>;

export const getStatsTool: PluginTool<Input> = {
  name: 'get_build_stats',
  description: 'Get all calculated stats for the currently loaded Path of Building build',
  inputSchema,

  async handler(_input: Input, ctx: PluginContext) {
    if (!ctx.pobRuntime) {
      return {
        content: [{ type: 'text' as const, text: 'PoB plugin not loaded' }],
        isError: true,
      };
    }

    try {
      ctx.logger.info('[get_build_stats] Getting build stats...');
      const stats = await ctx.pobRuntime.getBuildStats();
      const statCount = Object.keys(stats).length;

      ctx.logger.info(`[get_build_stats] Retrieved ${statCount} stats`);

      const output = {
        success: true,
        stats,
        statCount,
      };

      return { content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }] };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      ctx.logger.error(`[get_build_stats] Failed to get build stats: ${errorMessage}`);

      const output = {
        success: false,
        error: `Failed to get build stats: ${errorMessage}`,
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
        isError: true,
      };
    }
  },
};
