import type { ZodType } from 'zod';

// Returned by every tool handler
export interface ToolResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}

// A single MCP tool contributed by a plugin.
// The server calls inputSchema.parse(rawInput) before invoking handler,
// so TInput is the parsed/validated type.
export interface PluginTool<TInput = unknown> {
  name: string;
  description: string;
  inputSchema: ZodType<TInput>;
  handler(input: TInput, ctx: PluginContext): Promise<ToolResult>;
}

// Current PoE league and patch info — set in user config
export interface LeagueState {
  currentLeague: string;  // e.g. "Settlers of Kalguur"
  patchVersion: string;   // e.g. "3.26.0"
  hardcore: boolean;
  /** Solo Self-Found — affects economy tools (no trade access, different price context) */
  ssf: boolean;
}

// Simple structured logger
export interface Logger {
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
  debug(msg: string, ...args: unknown[]): void;
}

// TTL-based cache interface
export interface Cache {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, ttlMs?: number): void;
  delete(key: string): void;
  clear(): void;
}

// Rate-limited HTTP client interface
export interface HttpClient {
  get<T = unknown>(url: string, options?: HttpRequestOptions): Promise<T>;
  post<T = unknown>(url: string, body: unknown, options?: HttpRequestOptions): Promise<T>;
}

export interface HttpRequestOptions {
  params?: Record<string, string | number | boolean>;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

// The PoB LuaJIT runtime — defined here as an interface so core doesn't depend on plugin-pob
// plugin-pob sets this on ctx during initialize(); other plugins can read it
export interface PobRuntime {
  getBuildStats(): Promise<Record<string, number>>;
  loadBuildFromXML(xml: string, name?: string): Promise<void>;
  importFromCode(code: string, name?: string): Promise<void>;
  allocatePassive(nodeName: string, autoPath?: boolean): Promise<{ success: boolean; message: string }>;
  newBuild(): Promise<void>;
  destroy(): Promise<void>;
}

// Shared context passed to every plugin during initialize() and to every tool handler.
// IMPORTANT: The server passes a SINGLE shared mutable object to all plugins — not a copy.
// This means writes to ctx (e.g. ctx.pobRuntime = runtime) in one plugin's initialize()
// are visible to all subsequent plugins and all tool handlers.
export interface PluginContext {
  /** Set by @poe-ai/plugin-pob during initialize(). Other plugins can use it for build calcs.
   *  Always check for undefined — pobRuntime is only present if plugin-pob is loaded. */
  pobRuntime?: PobRuntime;
  /** Rate-limited HTTP client, shared across all plugins */
  http: HttpClient;
  /** TTL-based in-memory cache, shared across all plugins */
  cache: Cache;
  /** Current league and patch info from user config */
  leagueState: LeagueState;
  /** Structured logger */
  logger: Logger;
}

// The plugin interface — implemented by every plugin package
export interface PoEPlugin {
  /** npm package name, e.g. "@poe-ai/plugin-pob" */
  name: string;
  /** Plugin semver version */
  version: string;
  /** Semver range of PoE patch versions this plugin supports, e.g. "3.26.*" or "*" */
  patchCompatibility: string;
  /** Called once at server startup. Use to initialize connections, warm caches, set ctx.pobRuntime, etc. */
  initialize(ctx: PluginContext): Promise<void>;
  /** The MCP tools this plugin contributes to the server */
  tools: PluginTool[];
  /** Optional cleanup called on server shutdown */
  dispose?(ctx: PluginContext): Promise<void>;
}
