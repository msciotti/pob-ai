import { z } from 'zod';
import type { PluginTool } from '@poe-ai/core';
import { WikiClient } from '../wiki-client.js';

export const getPassiveInfoTool: PluginTool<{ passiveName: string }> = {
  name: 'get_passive_info',
  description:
    'Get detailed information about a Path of Exile passive skill tree node. If @poe-ai/plugin-pob ' +
    'is loaded with a build, also reports whether this node is currently allocated on that build.',
  inputSchema: z.object({
    passiveName: z.string().describe('Name of the passive node, e.g. "Resolute Technique" or "Acrobatics"'),
  }),
  async handler({ passiveName }, ctx) {
    const client = new WikiClient(ctx);

    // Best-effort: report allocation status from the currently loaded PoB build, if any.
    // getNodeInfo() is an extended runtime method beyond the minimal PobRuntime interface
    // in @poe-ai/core, so it's reached via a cast (same pattern as other pob-runtime call
    // sites). It throws when no build is loaded or the name doesn't match a tree node —
    // either way we just leave `allocated` unknown rather than fail the wiki lookup.
    let allocated: boolean | undefined;
    if (ctx.pobRuntime) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const runtime = ctx.pobRuntime as any;
        const nodeInfo = await runtime.getNodeInfo(passiveName);
        allocated = nodeInfo.allocated as boolean;
      } catch {
        // No build loaded, or no tree node named exactly this — leave allocated unknown.
      }
    }
    const allocatedLine = allocated !== undefined ? `\n**Allocated in current build:** ${allocated ? 'Yes' : 'No'}` : '';

    try {
      const page = await client.getPage(passiveName);
      if (!page) {
        // Fall back to search with "passive" qualifier to narrow results
        const results = await client.search(`${passiveName} passive`);
        if (results.length === 0) {
          return { content: [{ type: 'text', text: `Could not find passive "${passiveName}" on the wiki.` }] };
        }
        return {
          content: [{
            type: 'text',
            text: results.map(r => `- **${r.title}**: ${r.snippet}\n  ${r.url}`).join('\n') + allocatedLine,
          }],
        };
      }
      return {
        content: [{
          type: 'text',
          text: `**${page.title}** (patch ${page.patchVersion})\n${page.url}${allocatedLine}\n\n${page.extract.slice(0, 3000)}`,
        }],
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `Failed: ${(err as Error).message}` }], isError: true };
    }
  },
};
