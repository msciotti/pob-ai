import { z } from 'zod';
import type { PluginTool } from '@poe-ai/core';
import { loadArchetypeEntries } from '../data-loader.js';

const inputSchema = z.object({});
type Input = z.infer<typeof inputSchema>;

export const listArchetypesTool: PluginTool<Input> = {
  name: 'list_archetypes',
  description: 'List every build archetype in the knowledge base — slug and a one-line summary for each. Use archetype_info for the full entry.',
  inputSchema,

  async handler(_input: Input, ctx) {
    try {
      const entries = loadArchetypeEntries();
      const text = entries
        .map((e) => `- \`${e.slug}\` — ${e.name}: ${e.summary.split(/(?<=\.)\s/)[0]}`)
        .join('\n');
      return { content: [{ type: 'text', text }] };
    } catch (err) {
      ctx.logger.error(`[list_archetypes] Failed: ${(err as Error).message}`);
      return { content: [{ type: 'text', text: `Failed to load archetypes: ${(err as Error).message}` }], isError: true };
    }
  },
};
