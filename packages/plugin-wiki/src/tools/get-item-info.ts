import { z } from 'zod';
import type { PluginTool } from '@poe-ai/core';
import { WikiClient } from '../wiki-client.js';

export const getItemInfoTool: PluginTool<{ itemName: string }> = {
  name: 'get_item_info',
  description: 'Get detailed information about a Path of Exile item (unique, base type, etc.).',
  inputSchema: z.object({
    itemName: z.string().describe('Name of the item, e.g. "Kaom\'s Heart" or "Vaal Regalia"'),
  }),
  async handler({ itemName }, ctx) {
    const client = new WikiClient(ctx);
    try {
      const page = await client.getPage(itemName);
      if (!page) {
        // Fall back to a broader search
        const results = await client.search(itemName);
        if (results.length === 0) {
          return { content: [{ type: 'text', text: `Could not find item "${itemName}" on the wiki.` }] };
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
