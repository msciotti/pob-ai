import { z } from 'zod';
import type { PluginTool, PluginContext } from '@poe-ai/core';
import { KEY_BUILD_STATS } from './constants.js';

const inputSchema = z.object({
  source: z
    .string()
    .regex(/^[a-zA-Z0-9]{8}$/, 'Must be an 8-character pastebin code (e.g. "uCLE0msa")'),
  buildName: z.string().optional(),
});

type Input = z.infer<typeof inputSchema>;

export const loadBuildTool: PluginTool<Input> = {
  name: 'load_build',
  description: 'Load a Path of Building build from a pastebin code (e.g. "uCLE0msa")',
  inputSchema,

  async handler({ source, buildName }: Input, ctx: PluginContext) {
    if (!ctx.pobRuntime) {
      return {
        content: [{ type: 'text' as const, text: 'PoB plugin not loaded' }],
        isError: true,
      };
    }

    try {
      const finalBuildName = buildName || 'Imported Build';
      ctx.logger.info(`[load_build] Loading build from pastebin: ${source}`);
      await ctx.pobRuntime.importFromCode(source, finalBuildName);

      // Try to fetch stats to verify load succeeded, but don't fail if unavailable
      ctx.logger.info('[load_build] Attempting to fetch build stats...');
      let stats: Record<string, number> = {};
      let statsAvailable = false;

      try {
        stats = await ctx.pobRuntime.getBuildStats();
        statsAvailable = Object.keys(stats).length > 0;
        ctx.logger.info(`[load_build] Build stats retrieved: ${Object.keys(stats).length} stats available`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.logger.warn(`[load_build] Stats not immediately available: ${msg}`);
      }

      // Extract a few key stats for the immediate response
      const sampleStats: Record<string, number> = {};
      if (statsAvailable) {
        for (const key of KEY_BUILD_STATS) {
          if (typeof stats[key] === 'number') {
            sampleStats[key] = stats[key];
          }
        }
      }

      const output = {
        success: true,
        message: `Build '${finalBuildName}' loaded successfully from pastebin code`,
        buildName: finalBuildName,
        statsAvailable,
        sampleStats,
      };

      ctx.logger.info('[load_build] Build loaded successfully');
      return { content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }] };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      ctx.logger.error(`[load_build] Failed to load build: ${errorMessage}`);

      const output = {
        success: false,
        error: `Failed to load build: ${errorMessage}`,
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
        isError: true,
      };
    }
  },
};
