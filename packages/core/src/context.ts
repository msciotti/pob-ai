import type { PluginContext, LeagueState } from './types.js';
import { TtlCache } from './cache.js';
import { RateLimitedHttpClient } from './http-client.js';
import { ConsoleLogger } from './logger.js';

export interface ContextOptions {
  leagueState: LeagueState;
  cacheTtlMs?: number;
  cacheMaxSize?: number;
  httpMinIntervalMs?: number;
}

export function createPluginContext(options: ContextOptions): PluginContext {
  return {
    pobRuntime: undefined, // set by plugin-pob during initialize()
    http: new RateLimitedHttpClient({ minIntervalMs: options.httpMinIntervalMs }),
    cache: new TtlCache({ defaultTtlMs: options.cacheTtlMs, maxSize: options.cacheMaxSize }),
    leagueState: options.leagueState,
    logger: new ConsoleLogger(),
  };
}
