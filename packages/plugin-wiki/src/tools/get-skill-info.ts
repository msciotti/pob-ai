import { z } from 'zod';
import type { PluginTool } from '@poe-ai/core';
import { WikiClient } from '../wiki-client.js';

export const getSkillInfoTool: PluginTool<{ skillName: string }> = {
  name: 'get_skill_info',
  description: 'Get information about a Path of Exile skill gem including stats by level and support gem interactions.',
  inputSchema: z.object({
    skillName: z.string().describe('Name of the skill gem, e.g. "Fireball" or "Glacial Cascade"'),
  }),
  async handler({ skillName }, ctx) {
    const client = new WikiClient(ctx);
    try {
      const page = await client.getPage(skillName);
      if (!page) {
        // Fall back to search with "skill" qualifier to narrow results
        const results = await client.search(`${skillName} skill`);
        if (results.length === 0) {
          return { content: [{ type: 'text', text: `Could not find skill "${skillName}" on the wiki.` }] };
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
