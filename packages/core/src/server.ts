/**
 * Generalized MCP server for poe-ai.
 *
 * Loads plugins dynamically from the user's config and registers their tools
 * with the underlying MCP server. No PoB-specific logic lives here.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { ZodType } from 'zod';
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
   * PluginTool.inputSchema is a ZodType which registerTool accepts as the
   * inputSchema parameter (ZodType<object> is one of the two accepted union
   * members alongside ZodRawShape). The callback arg type is inferred by the
   * SDK from the schema generic, so we use a typed helper to bridge the gap.
   */
  private _registerPluginTools(plugins: PoEPlugin[], ctx: PluginContext): void {
    for (const plugin of plugins) {
      for (const tool of plugin.tools) {
        this._registerOneTool(tool, ctx);
      }
    }
  }

  private _registerOneTool<TInput>(tool: PluginTool<TInput>, ctx: PluginContext): void {
    const schema = tool.inputSchema as ZodType<object>;

    this.mcpServer.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: schema,
      },
      (input: object) => {
        // The MCP SDK validates the input against the schema before calling us.
        // Cast to TInput since we know the schema has already enforced the shape.
        return tool.handler(input as TInput, ctx);
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
