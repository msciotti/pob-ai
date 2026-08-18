import type { PoEPlugin, PluginContext } from '@poe-ai/core';
import { getStashValueTool } from './tools/get-stash-value.js';

// Credentials are set during initialize() and read by tool handlers via getCredentials().
let sessionId: string | undefined;
let cfClearance: string | undefined;

export function getCredentials(): { sessionId: string | undefined; cfClearance: string | undefined } {
  return { sessionId, cfClearance };
}

const WealthPlugin: PoEPlugin = {
  name: '@poe-ai/plugin-wealth',
  version: '0.1.0',
  patchCompatibility: '*',

  async initialize(ctx: PluginContext): Promise<void> {
    sessionId = process.env['POE_SESSION_ID'];
    cfClearance = process.env['POE_CF_CLEARANCE'];

    if (!sessionId || !cfClearance) {
      ctx.logger.warn(
        '[@poe-ai/plugin-wealth] POE_SESSION_ID or POE_CF_CLEARANCE not set — ' +
          'stash tools will return an error until credentials are configured'
      );
    } else {
      ctx.logger.info('[@poe-ai/plugin-wealth] Credentials loaded, stash API ready');
    }
  },

  tools: [getStashValueTool],
};

export default WealthPlugin;
