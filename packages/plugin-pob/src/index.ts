import type { PoEPlugin, PluginContext } from '@poe-ai/core';
import { LuaJITRuntime } from './runtime/luajit-runtime.js';
import { getPobPath } from './runtime/detector.js';
import { loadBuildTool } from './tools/load-build.js';
import { getStatsTool } from './tools/get-stats.js';
import { allocatePassiveTool } from './tools/allocate-passive.js';

const PobPlugin: PoEPlugin = {
  name: '@poe-ai/plugin-pob',
  version: '0.1.0',
  patchCompatibility: '*',

  async initialize(ctx: PluginContext): Promise<void> {
    ctx.logger.info('[plugin-pob] Initializing PoB runtime...');

    // Detect PoB installation — respects config if provided via ctx.leagueState
    // extension point. For now we detect from the environment.
    const pobPath = await getPobPath();

    ctx.logger.info(`[plugin-pob] Using PoB at: ${pobPath}`);

    const runtime = new LuaJITRuntime({ pobPath });
    await runtime.initialize();

    // Store on shared context so other plugins can use PoB calcs
    ctx.pobRuntime = runtime;

    ctx.logger.info('[plugin-pob] PoB runtime initialized successfully');
  },

  tools: [loadBuildTool, getStatsTool, allocatePassiveTool],

  async dispose(ctx: PluginContext): Promise<void> {
    if (ctx.pobRuntime) {
      await ctx.pobRuntime.destroy();
      ctx.logger.info('[plugin-pob] PoB runtime destroyed');
    }
  },
};

export default PobPlugin;

// Named exports for consumers that want individual pieces
export { LuaJITRuntime } from './runtime/luajit-runtime.js';
export { getPobPath, detectPobPath } from './runtime/detector.js';
export { PassiveTreeAnalyzer, PassiveTreeSimulator } from './runtime/passive-tree-utils.js';
export { loadBuildTool } from './tools/load-build.js';
export { getStatsTool } from './tools/get-stats.js';
export { allocatePassiveTool } from './tools/allocate-passive.js';
