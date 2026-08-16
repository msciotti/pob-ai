import type { PoEPlugin, PluginContext } from '@poe-ai/core';
import { getMetaBuildsTool } from './tools/get-meta-builds.js';
import { getItemPriceTool } from './tools/get-item-price.js';

const NinjaPlugin: PoEPlugin = {
  name: '@poe-ai/plugin-ninja',
  version: '0.1.0',
  patchCompatibility: '*',

  async initialize(ctx: PluginContext): Promise<void> {
    ctx.logger.info('[@poe-ai/plugin-ninja] Initialized — poe.ninja integration ready');
  },

  tools: [getMetaBuildsTool, getItemPriceTool],
};

export default NinjaPlugin;
