import type { PoEPlugin } from '@poe-ai/core';
import { fossilInfoTool } from './tools/fossil-info.js';
import { essenceInfoTool } from './tools/essence-info.js';
import { modLookupTool } from './tools/mod-lookup.js';
import { harvestOptionsTool } from './tools/harvest-options.js';
import { influencedModsTool } from './tools/influenced-mods.js';

const CraftingPlugin: PoEPlugin = {
  name: '@poe-ai/plugin-crafting',
  version: '0.1.0',
  patchCompatibility: '*',

  async initialize(ctx) {
    ctx.logger.info(
      '[@poe-ai/plugin-crafting] Initialized — crafting knowledge ready (local RePoE game data)'
    );
    // No heavy init needed — crafting client is stateless, reads local game data via
    // @poe-ai/game-data and caches derived lookups in ctx.cache.
  },

  tools: [
    fossilInfoTool,
    essenceInfoTool,
    modLookupTool,
    harvestOptionsTool,
    influencedModsTool,
  ],
};

export default CraftingPlugin;
