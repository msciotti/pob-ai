import { z } from 'zod';
import type { PluginTool } from '@poe-ai/core';
import { WikiClient } from '../wiki-client.js';

export const getPassiveInfoTool: PluginTool<{ passiveName: string }> = {
  name: 'get_passive_info',
  description: 'Get detailed information about a Path of Exile passive skill tree node.',
  inputSchema: z.object({
    passiveName: z.string().describe('Name of the passive node, e.g. "Resolute Technique" or "Acrobatics"'),
  }),
  async handler({ passiveName }, ctx) {
    const client = new WikiClient(ctx);
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
            text: results.map(r => `- **${r.title}**: ${r.snippet}\n  ${r.url}`).join('\n'),
          }],
        };
      }
      return {
        content: [{
          type: 'text',
          text: `**${page.title}** (patch ${page.patchVersion})\n${page.url}\n\n${page.extract.slice(0, 3000)}`,
        }],
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `Failed: ${(err as Error).message}` }], isError: true };
    }
  },
};
