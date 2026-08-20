import { z } from 'zod';
import type { PluginTool, PluginContext } from '@poe-ai/core';

// list_allocated_nodes takes no inputs
const inputSchema = z.object({});
type Input = z.infer<typeof inputSchema>;

export const listAllocatedNodesTool: PluginTool<Input> = {
  name: 'list_allocated_nodes',
  description:
    'List every passive tree node currently allocated on the loaded Path of Building build, ' +
    'including which ones are keystones or notables.',
  inputSchema,

  async handler(_input: Input, ctx: PluginContext) {
    if (!ctx.pobRuntime) {
      return {
        content: [{ type: 'text' as const, text: 'PoB plugin not loaded' }],
        isError: true,
      };
    }

    try {
      ctx.logger.info('[list_allocated_nodes] Fetching allocated nodes...');

      // getAllocatedNodes is an extended runtime method beyond the minimal PobRuntime
      // interface in @poe-ai/core (same cast pattern as get_build_summary.ts).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const runtime = ctx.pobRuntime as any;
      const nodes = (await runtime.getAllocatedNodes()) as Array<{
        id: string;
        name: string;
        type: string;
        isKeystone: boolean;
        isNotable: boolean;
      }>;

      const keystones = nodes.filter((n) => n.isKeystone).map((n) => n.name);
      const notables = nodes.filter((n) => n.isNotable && !n.isKeystone).map((n) => n.name);

      const output = {
        success: true,
        count: nodes.length,
        keystones,
        notables,
        nodes,
      };

      ctx.logger.info(
        `[list_allocated_nodes] ${nodes.length} nodes allocated (${keystones.length} keystones, ${notables.length} notables)`
      );

      return { content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }] };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      ctx.logger.error(`[list_allocated_nodes] Failed: ${errorMessage}`);

      return {
        content: [
          { type: 'text' as const, text: JSON.stringify({ success: false, error: errorMessage }) },
        ],
        isError: true,
      };
    }
  },
};
