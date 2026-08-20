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
  private ctx: PluginContext | null = null;
  private plugins: PoEPlugin[] = [];
  private initPromise: Promise<void> | null = null;
  private logger = new ConsoleLogger('[poe-ai:core]');

  // Every connect() creates its own McpServer (see connect() for why); tracked here
  // so close() can tear all of them down. Entries remove themselves once their
  // transport closes, so this doesn't grow unbounded over a long-lived HTTP server's
  // lifetime.
  private connectedServers = new Set<McpServer>();

  /**
   * Lazy initialization — called once on first connect().
   * Idempotent: subsequent calls return the same promise. The check-then-assign
   * below is race-safe because JS is single-threaded and nothing awaits between
   * them, so concurrent callers all observe the same in-flight promise.
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

    this.plugins = await loadPlugins(config.plugins, this.ctx, this.logger);

    this.logger.info(`Server initialized with ${this.plugins.length} plugins`);
  }

  /**
   * Register all tools contributed by the loaded plugins onto the given McpServer.
   *
   * Each tool's inputSchema is explicitly parsed via Zod before dispatching to
   * the handler, honoring the PluginTool contract defined in types.ts.
   */
  private _registerPluginTools(mcpServer: McpServer, plugins: PoEPlugin[], ctx: PluginContext): void {
    for (const plugin of plugins) {
      for (const tool of plugin.tools) {
        this._registerOneTool(mcpServer, tool, ctx);
      }
    }
  }

  private _registerOneTool<TInput>(mcpServer: McpServer, tool: PluginTool<TInput>, ctx: PluginContext): void {
    mcpServer.registerTool(
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
   *
   * A brand-new McpServer (and its underlying SDK Server/Protocol instance) is
   * created on every call, wired to the shared, already-initialized plugin state
   * (ctx + plugins) — plugin loading itself only ever happens once, via the
   * memoized initialize() above.
   *
   * This matters under concurrency: the SDK's Protocol class stores its active
   * transport as an instance field (`this._transport`), set by connect() and read
   * whenever a response needs to be sent back. Reusing a single McpServer across
   * multiple connect() calls — as stateless HTTP mode does, one call per request —
   * would have each new request's connect() overwrite that field, so an in-flight
   * request could have its response routed to a *different* request's transport.
   * Giving every connection its own McpServer instance keeps each one's transport
   * reference independent, which is the SDK-recommended pattern for stateless
   * request/response transports (HTTP) as well as the natural shape for long-lived
   * single-connection transports (stdio) — connect() is just called once there.
   */
  async connect(transport: Transport): Promise<void> {
    await this.initialize();

    const mcpServer = new McpServer({
      name: 'poe-ai',
      version: '0.1.0',
    });
    this._registerPluginTools(mcpServer, this.plugins, this.ctx!);

    // Only track (and wire cleanup for) a server once it's actually connected — if
    // connect() throws, there's nothing to close and nothing that will ever fire
    // onclose, so adding it beforehand would leak the entry in connectedServers
    // forever.
    await mcpServer.connect(transport);

    this.connectedServers.add(mcpServer);
    mcpServer.server.onclose = () => {
      this.connectedServers.delete(mcpServer);
    };
  }

  /**
   * Gracefully close the server: tears down every still-connected McpServer
   * (closing their transports) and disposes plugins that support it.
   */
  async close(): Promise<void> {
    const servers = [...this.connectedServers];
    this.connectedServers.clear();
    await Promise.all(servers.map((s) => s.close()));

    if (this.ctx) {
      const ctx = this.ctx;
      await Promise.all(
        this.plugins.map(async (plugin) => {
          try {
            await plugin.dispose?.(ctx);
          } catch (err) {
            this.logger.warn(`Error disposing plugin "${plugin.name}": ${(err as Error).message}`);
          }
        }),
      );
    }
  }
}
