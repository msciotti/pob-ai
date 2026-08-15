import type { PluginContext, LeagueState } from './types.js';
import { TtlCache } from './cache.js';
import { RateLimitedHttpClient } from './http-client.js';
import { ConsoleLogger } from './logger.js';

export interface ContextOptions {
  leagueState: LeagueState;
  cacheTtlMs?: number;
  cacheMaxSize?: number;
  httpMinIntervalMs?: number;
  /** Used as the logger prefix, e.g. "plugin-pob" → "[poe-ai:plugin-pob]" */
  loggerName?: string;
}

export function createPluginContext(options: ContextOptions): PluginContext {
  const prefix = options.loggerName ? `[poe-ai:${options.loggerName}]` : '[poe-ai]';
  return {
    pobRuntime: undefined, // set by plugin-pob during initialize(); shared via single mutable object
    http: new RateLimitedHttpClient({ minIntervalMs: options.httpMinIntervalMs }),
    cache: new TtlCache({ defaultTtlMs: options.cacheTtlMs, maxSize: options.cacheMaxSize }),
    leagueState: options.leagueState,
    logger: new ConsoleLogger(prefix),
  };
}
