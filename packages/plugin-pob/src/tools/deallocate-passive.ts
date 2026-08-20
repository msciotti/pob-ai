import { z } from 'zod';
import type { PluginTool, PluginContext } from '@poe-ai/core';
import { KEY_BUILD_STATS } from './constants.js';

const inputSchema = z.object({
  nodeName: z.string().min(1, 'Node name must not be empty'),
});
type Input = z.infer<typeof inputSchema>;

export const deallocatePassiveTool: PluginTool<Input> = {
  name: 'deallocate_passive',
  description:
    'Deallocate a passive tree node by name (e.g. "Resolute Technique"). Also deallocates any ' +
    'other allocated node that only connects to the tree through it.',
  inputSchema,

  async handler({ nodeName }: Input, ctx: PluginContext) {
    if (!ctx.pobRuntime) {
      return {
        content: [{ type: 'text' as const, text: 'PoB plugin not loaded' }],
        isError: true,
      };
    }

    // deallocatePassive is an extended runtime method beyond the minimal PobRuntime
    // interface in @poe-ai/core (same cast pattern as allocate_passive/get_build_summary).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const runtime = ctx.pobRuntime as any;

    try {
      // Capture stats before deallocation for the diff. Kept self-contained (not shared
      // with allocate_passive.ts) since that tool's diff logic is under separate active work.
      ctx.logger.info('[deallocate_passive] Getting stats before deallocation...');
      let statsBefore: Record<string, number> = {};

      try {
        statsBefore = await ctx.pobRuntime.getBuildStats();
        ctx.logger.info(`[deallocate_passive] Before stats: ${Object.keys(statsBefore).length} stats available`);
      } catch {
        ctx.logger.warn('[deallocate_passive] Warning: Could not get stats before deallocation');
      }

      ctx.logger.info(`[deallocate_passive] Deallocating passive node: ${nodeName}`);
      const result = (await runtime.deallocatePassive(nodeName)) as { success: boolean; message: string };

      ctx.logger.info('[deallocate_passive] Getting stats after deallocation...');
      let statsAfter: Record<string, number> = {};

      try {
        statsAfter = await ctx.pobRuntime.getBuildStats();
        ctx.logger.info(`[deallocate_passive] After stats: ${Object.keys(statsAfter).length} stats available`);
      } catch {
        ctx.logger.warn('[deallocate_passive] Warning: Could not get stats after deallocation');
      }

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
        message: result.message,
        nodeName,
        statChanges,
      };

      ctx.logger.info('[deallocate_passive] Passive node deallocated successfully');
      return { content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }] };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      ctx.logger.error(`[deallocate_passive] Failed to deallocate passive: ${errorMessage}`);

      const output = {
        success: false,
        error: `Failed to deallocate passive node: ${errorMessage}`,
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
        isError: true,
      };
    }
  },
};
