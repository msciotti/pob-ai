import { z } from 'zod';
import type { PluginTool } from '@poe-ai/core';
import { loadArchetypeEntries, getArchetypeEntry } from '../data-loader.js';
import { classifyBuild } from '../classifier.js';
import { buildProfileFromPobRuntime } from '../pob-adapter.js';
import { formatMatches, formatTopMatchDetail } from '../format.js';

const inputSchema = z.object({});
type Input = z.infer<typeof inputSchema>;

export const identifyArchetypeTool: PluginTool<Input> = {
  name: 'identify_archetype',
  description:
    'Classify the CURRENTLY LOADED Path of Building build against the archetype knowledge base. ' +
    'Requires load_build to have been called first and @poe-ai/plugin-pob to be loaded. ' +
    'Returns ranked candidate archetypes with matched/missing signals, plus scaling vectors, dead stats, ' +
    'and a failure-mode checklist evaluated against the build for the top match.',
  inputSchema,

  async handler(_input: Input, ctx) {
    const adapterResult = await buildProfileFromPobRuntime(ctx);
    if (!adapterResult.ok) {
      // Not an error — this is a clear, expected non-answer (no PoB plugin, or no build loaded yet).
      return { content: [{ type: 'text', text: adapterResult.reason }] };
    }

    try {
      const entries = loadArchetypeEntries();
      const matches = classifyBuild(adapterResult.profile, entries);

      const sections = [formatMatches(matches)];

      if (matches.length > 0) {
        const topEntry = getArchetypeEntry(matches[0].slug);
        if (topEntry) {
          sections.push(formatTopMatchDetail(topEntry, adapterResult.profile));
        }
      }

      return { content: [{ type: 'text', text: sections.join('\n\n') }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ctx.logger.error(`[identify_archetype] Failed: ${message}`);
      return { content: [{ type: 'text', text: `Failed to classify build: ${message}` }], isError: true };
    }
  },
};
