import { z } from 'zod';
import type { PluginTool, PluginContext } from '@poe-ai/core';

/**
 * Key stats to diff before/after allocation so the tool response is immediately
 * useful without needing a follow-up get_build_stats call.
 */
const KEY_BUILD_STATS = ['Level', 'Life', 'TotalDPS', 'EnergyShield', 'Armour', 'Evasion'] as const;

const inputSchema = z.object({
  nodeName: z.string().min(1, 'Node name must not be empty'),
  autoPath: z.boolean().default(true),
});

type Input = z.infer<typeof inputSchema>;

export const allocatePassiveTool: PluginTool<Input> = {
  name: 'allocate_passive',
  description: 'Allocate a passive tree node by name (e.g. "Resolute Technique")',
  inputSchema,

  async handler({ nodeName, autoPath = true }: Input, ctx: PluginContext) {
    if (!ctx.pobRuntime) {
      return {
        content: [{ type: 'text' as const, text: 'PoB plugin not loaded' }],
        isError: true,
      };
    }

    try {
      // Capture stats before allocation for the diff
      ctx.logger.info('[allocate_passive] Getting stats before allocation...');
      let statsBefore: Record<string, number> = {};

      try {
        statsBefore = await ctx.pobRuntime.getBuildStats();
        ctx.logger.info(`[allocate_passive] Before stats: ${Object.keys(statsBefore).length} stats available`);
      } catch {
        ctx.logger.warn('[allocate_passive] Warning: Could not get stats before allocation');
      }

      // Perform the allocation
      ctx.logger.info(`[allocate_passive] Allocating passive node: ${nodeName} (autoPath: ${autoPath})`);
      await ctx.pobRuntime.allocatePassive(nodeName, autoPath);

      // Capture stats after allocation
      ctx.logger.info('[allocate_passive] Getting stats after allocation...');
      let statsAfter: Record<string, number> = {};

      try {
        statsAfter = await ctx.pobRuntime.getBuildStats();
        ctx.logger.info(`[allocate_passive] After stats: ${Object.keys(statsAfter).length} stats available`);
      } catch {
        ctx.logger.warn('[allocate_passive] Warning: Could not get stats after allocation');
      }

      // Calculate deltas for key stats
      const statChanges: Record<string, { before: number; after: number; delta: number }> = {};
      for (const key of KEY_BUILD_STATS) {
        const before = statsBefore[key];
        const after = statsAfter[key];
        if (typeof before === 'number' && typeof after === 'number') {
          statChanges[key] = { before, after, delta: after - before };
        }
      }

      const output = {
        success: true,
        message: `Passive node '${nodeName}' allocated successfully${autoPath ? ' with automatic pathing' : ''}`,
        nodeName,
        autoPath,
        statChanges,
      };

      ctx.logger.info('[allocate_passive] Passive node allocated successfully');
      return { content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }] };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      ctx.logger.error(`[allocate_passive] Failed to allocate passive: ${errorMessage}`);

      const output = {
        success: false,
        error: `Failed to allocate passive node: ${errorMessage}`,
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
        isError: true,
      };
    }
  },
};
