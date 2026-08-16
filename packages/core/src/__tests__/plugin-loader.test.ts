import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadPlugins } from '../plugin-loader.js';
import type { PluginImporter } from '../plugin-loader.js';
import type { PoEPlugin, PluginContext } from '../types.js';
import { createPluginContext } from '../context.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(): PluginContext {
  return createPluginContext({
    leagueState: {
      currentLeague: 'Standard',
      patchVersion: '3.26.0',
      hardcore: false,
      ssf: false,
    },
  });
}

function makePlugin(overrides: Partial<PoEPlugin> = {}): PoEPlugin {
  return {
    name: 'test-plugin',
    version: '1.0.0',
    patchCompatibility: '*',
    initialize: vi.fn().mockResolvedValue(undefined),
    tools: [
      {
        name: 'test_tool',
        description: 'A test tool',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        inputSchema: { parse: vi.fn((x) => x) } as any,
        handler: vi.fn(),
      },
    ],
    ...overrides,
  };
}

function makeImporter(map: Record<string, { default?: unknown }>): PluginImporter {
  return async (name: string) => {
    if (name in map) return map[name];
    throw new Error(`Cannot find module '${name}'`);
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('loadPlugins', () => {
  let ctx: PluginContext;

  beforeEach(() => {
    ctx = makeContext();
  });

  it('loads a valid plugin, calls initialize, and returns it', async () => {
    const plugin = makePlugin();
    const importer = makeImporter({ 'test-plugin': { default: plugin } });
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

    const result = await loadPlugins(['test-plugin'], ctx, logger, importer);

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(plugin);
    expect(plugin.initialize).toHaveBeenCalledOnce();
    expect(plugin.initialize).toHaveBeenCalledWith(ctx);
  });

  it('reports the correct tool count in the log message', async () => {
    const plugin = makePlugin();
    const importer = makeImporter({ 'my-plugin': { default: plugin } });
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

    await loadPlugins(['my-plugin'], ctx, logger, importer);

    const logCalls = (logger.info as ReturnType<typeof vi.fn>).mock.calls.map(
      (call: unknown[]) => call[0] as string,
    );
    expect(logCalls.some((msg) => msg.includes('1 tools'))).toBe(true);
  });

  it('skips a plugin that fails to import and logs a warning', async () => {
    const importer = makeImporter({}); // no modules available — all imports throw
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

    const result = await loadPlugins(['@poe-ai/nonexistent-plugin'], ctx, logger, importer);

    expect(result).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalledOnce();
    const warnMsg = (logger.warn as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(warnMsg).toContain('@poe-ai/nonexistent-plugin');
    expect(warnMsg).toContain('skipping');
  });

  it('continues loading other plugins after one fails to import', async () => {
    const goodPlugin = makePlugin({ name: 'good-plugin' });
    const importer = makeImporter({ 'good-plugin': { default: goodPlugin } });
    // 'bad-plugin' is not in the map — import throws
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

    const result = await loadPlugins(['bad-plugin', 'good-plugin'], ctx, logger, importer);

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(goodPlugin);
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it('skips a plugin with no default export and logs a warning', async () => {
    // Module exists but has no default export
    const importer = makeImporter({ 'malformed-plugin': { /* no default */ } });
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

    const result = await loadPlugins(['malformed-plugin'], ctx, logger, importer);

    expect(result).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalledOnce();
    const warnMsg = (logger.warn as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(warnMsg).toContain('malformed-plugin');
    expect(warnMsg).toContain('skipping');
  });

  it('skips a plugin whose default export is not a valid PoEPlugin (missing initialize)', async () => {
    const notAPlugin = { name: 'not-a-plugin', tools: [] }; // missing initialize()
    const importer = makeImporter({ 'bad-export': { default: notAPlugin } });
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

    const result = await loadPlugins(['bad-export'], ctx, logger, importer);

    expect(result).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it('skips a plugin whose initialize() rejects and logs a warning', async () => {
    const flakyPlugin = makePlugin({
      initialize: vi.fn().mockRejectedValue(new Error('init failed')),
    });
    const importer = makeImporter({ 'flaky-plugin': { default: flakyPlugin } });
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

    const result = await loadPlugins(['flaky-plugin'], ctx, logger, importer);

    expect(result).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalledOnce();
    const warnMsg = (logger.warn as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(warnMsg).toContain('init failed');
  });

  it('ctx mutations from one plugin are visible to subsequent plugins', async () => {
    // Plugin A sets ctx.pobRuntime during initialize()
    const pluginA = makePlugin({
      name: 'plugin-a',
      initialize: vi.fn().mockImplementation(async (pluginCtx: PluginContext) => {
        // Simulate what plugin-pob does: mutate the shared context
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (pluginCtx as any).pobRuntime = { marker: 'set-by-plugin-a' };
      }),
    });

    // Plugin B reads ctx.pobRuntime during initialize() and records what it saw
    let seenRuntime: unknown = undefined;
    const pluginB = makePlugin({
      name: 'plugin-b',
      initialize: vi.fn().mockImplementation(async (pluginCtx: PluginContext) => {
        seenRuntime = pluginCtx.pobRuntime;
      }),
    });

    const importer = makeImporter({
      'plugin-a': { default: pluginA },
      'plugin-b': { default: pluginB },
    });
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

    const result = await loadPlugins(['plugin-a', 'plugin-b'], ctx, logger, importer);

    expect(result).toHaveLength(2);
    // plugin-b should have seen the value set by plugin-a
    expect(seenRuntime).toEqual({ marker: 'set-by-plugin-a' });
  });

  it('returns an empty array when no plugins are configured', async () => {
    const importer = makeImporter({});
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

    const result = await loadPlugins([], ctx, logger, importer);

    expect(result).toHaveLength(0);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
