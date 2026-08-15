import type { PoEPlugin } from '@poe-ai/core';
import { wikiLookupTool } from './tools/wiki-lookup.js';
import { getPassiveInfoTool } from './tools/get-passive-info.js';
import { getItemInfoTool } from './tools/get-item-info.js';
import { getSkillInfoTool } from './tools/get-skill-info.js';

const WikiPlugin: PoEPlugin = {
  name: '@poe-ai/plugin-wiki',
  version: '0.1.0',
  patchCompatibility: '*',

  async initialize(ctx) {
    ctx.logger.info('Wiki plugin initialized');
    // No heavy init needed — wiki client is stateless, uses ctx.http + ctx.cache
  },

  tools: [wikiLookupTool, getPassiveInfoTool, getItemInfoTool, getSkillInfoTool],
};

export default WikiPlugin;
