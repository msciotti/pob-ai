import { z } from 'zod';
import type { PluginTool } from '@poe-ai/core';
import { getArchetypeEntry, loadArchetypeEntries } from '../data-loader.js';
import { formatArchetypeEntry } from '../format.js';

const inputSchema = z.object({
  archetype: z.string().min(1).describe('The archetype slug, e.g. "righteous-fire-regen-tank" (see list_archetypes)'),
});
type Input = z.infer<typeof inputSchema>;

export const archetypeInfoTool: PluginTool<Input> = {
  name: 'archetype_info',
  description: 'Get the full knowledge-base entry for one archetype: identity signals, scaling vectors, dead stats, defensive profile, and failure modes.',
  inputSchema,

  async handler({ archetype }: Input, ctx) {
    try {
      const entry = getArchetypeEntry(archetype);
      if (!entry) {
        const known = loadArchetypeEntries().map((e) => e.slug).join(', ');
        return {
          content: [{ type: 'text', text: `Unknown archetype slug "${archetype}". Known slugs: ${known}` }],
          isError: true,
        };
      }
      return { content: [{ type: 'text', text: formatArchetypeEntry(entry) }] };
    } catch (err) {
      ctx.logger.error(`[archetype_info] Failed: ${(err as Error).message}`);
      return { content: [{ type: 'text', text: `Failed to load archetype: ${(err as Error).message}` }], isError: true };
    }
  },
};
