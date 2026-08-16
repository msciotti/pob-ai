/**
 * Generalized MCP server for poe-ai.
 *
 * Loads plugins dynamically from the user's config and registers their tools
 * with the underlying MCP server. No PoB-specific logic lives here.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { PoEPlugin, PluginContext, PluginTool } from './types.js';
import { loadPlugins } from './plugin-loader.js';
import { createPluginContext } from './context.js';
import { ConsoleLogger } from './logger.js';
import { loadConfig } from './config/index.js';

export class PoeAiMcpServer {
  private mcpServer: McpServer;
  private ctx: PluginContext | null = null;
  private initPromise: Promise<void> | null = null;
  private logger = new ConsoleLogger('[poe-ai:core]');

  constructor() {
    this.mcpServer = new McpServer({
      name: 'poe-ai',
      version: '0.1.0',
    });
  }

  /**
   * Lazy initialization — called once on first connect().
   * Idempotent: subsequent calls return the same promise.
   */
  private async initialize(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this._doInitialize();
    return this.initPromise;
  }

  private async _doInitialize(): Promise<void> {
    const config = loadConfig();

    this.ctx = createPluginContext({
      leagueState: {
        currentLeague: config.league,
        patchVersion: config.patchVersion,
        hardcore: config.hardcore,
        ssf: config.ssf,
      },
      cacheTtlMs: config.cacheTtlMs,
      cacheMaxSize: config.cacheMaxSize,
      httpMinIntervalMs: config.httpMinIntervalMs,
      loggerName: 'core',
    });

    const plugins = await loadPlugins(config.plugins, this.ctx, this.logger);
    this._registerPluginTools(plugins, this.ctx);

    this.logger.info(`Server initialized with ${plugins.length} plugins`);
  }

  /**
   * Register all tools contributed by the loaded plugins.
   *
   * Each tool's inputSchema is explicitly parsed via Zod before dispatching to
   * the handler, honoring the PluginTool contract defined in types.ts.
   */
  private _registerPluginTools(plugins: PoEPlugin[], ctx: PluginContext): void {
    for (const plugin of plugins) {
      for (const tool of plugin.tools) {
        this._registerOneTool(tool, ctx);
      }
    }
  }

  private _registerOneTool<TInput>(tool: PluginTool<TInput>, ctx: PluginContext): void {
    this.mcpServer.registerTool(
      tool.name,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { description: tool.description, inputSchema: (tool.inputSchema as any).shape ?? tool.inputSchema },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (rawInput: unknown): Promise<any> => {
        // Explicitly parse via Zod to honor the PluginTool contract from types.ts:
        // the handler must receive a fully-validated, correctly-typed TInput.
        // This guards against SDK versions that may not validate before calling back.
        const parsed = tool.inputSchema.parse(rawInput);
        return tool.handler(parsed, ctx);
      },
    );
  }

  /**
   * Connect the MCP server to a transport.
   * Can be called multiple times for different transports (stateless HTTP mode).
   */
  async connect(transport: Transport): Promise<void> {
    await this.initialize();
    await this.mcpServer.connect(transport);
  }

  /**
   * Gracefully close the server and dispose of plugins that support it.
   */
  async close(): Promise<void> {
    await this.mcpServer.close();
  }

  /**
   * Expose the underlying McpServer for advanced use cases.
   */
  getServer(): McpServer {
    return this.mcpServer;
  }
}
