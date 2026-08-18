import type { PoEPlugin, PluginContext } from '@poe-ai/core';
import { getStashValueTool } from './tools/get-stash-value.js';

const WealthPlugin: PoEPlugin = {
  name: '@poe-ai/plugin-wealth',
  version: '0.1.0',
  patchCompatibility: '*',
  async initialize(ctx: PluginContext): Promise<void> {
    ctx.logger.info('[@poe-ai/plugin-wealth] Initialized — stash wealth tracking ready');
  },
  tools: [getStashValueTool],
};

export default WealthPlugin;
