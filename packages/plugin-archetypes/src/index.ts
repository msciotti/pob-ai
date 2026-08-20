import type { PoEPlugin } from '@poe-ai/core';
import { listArchetypesTool } from './tools/list-archetypes.js';
import { archetypeInfoTool } from './tools/archetype-info.js';
import { identifyArchetypeTool } from './tools/identify-archetype.js';
import { loadArchetypeEntries } from './data-loader.js';

const ArchetypesPlugin: PoEPlugin = {
  name: '@poe-ai/plugin-archetypes',
  version: '0.1.0', // keep in sync with packages/plugin-archetypes/package.json
  patchCompatibility: '*', // the plugin itself is patch-agnostic; individual entries carry their own patchValidity

  async initialize(ctx) {
    // Fail fast and loud if the bundled data files don't validate — better to skip this
    // plugin at startup (server continues without it) than to serve broken knowledge.
    const entries = loadArchetypeEntries();
    ctx.logger.info(`Archetypes plugin initialized (${entries.length} archetypes loaded)`);
  },

  tools: [listArchetypesTool, archetypeInfoTool, identifyArchetypeTool],
};

export default ArchetypesPlugin;
