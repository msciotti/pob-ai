import { z } from 'zod';
import type { PluginTool } from '@poe-ai/core';
import { WikiClient } from '../wiki-client.js';

export const wikiLookupTool: PluginTool<{ query: string }> = {
  name: 'wiki_lookup',
  description: 'Search the official Path of Exile wiki for any game concept — passives, items, skills, mechanics, etc.',
  inputSchema: z.object({
    query: z.string().min(1).describe('The item, skill, passive, or mechanic to look up'),
  }),
  async handler({ query }, ctx) {
    const client = new WikiClient(ctx);
    try {
      const results = await client.search(query);
      if (results.length === 0) {
        return { content: [{ type: 'text', text: `No wiki results found for "${query}".` }] };
      }

      // Fetch the first result's full page
      const page = await client.getPage(results[0].title);
      const text = page
        ? `**${page.title}** (patch ${page.patchVersion})\n${page.url}\n\n${page.extract.slice(0, 2000)}${page.extract.length > 2000 ? '...' : ''}`
        : results.map(r => `- **${r.title}**: ${r.snippet}\n  ${r.url}`).join('\n');

      return { content: [{ type: 'text', text }] };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Wiki lookup failed: ${(err as Error).message}` }],
        isError: true,
      };
    }
  },
};
