export interface PoeAiConfig {
  /** Current PoE league name, e.g. "Settlers of Kalguur" */
  league: string;
  /** Current PoE patch version, e.g. "3.26.0" */
  patchVersion: string;
  /** Whether the character is in Hardcore mode */
  hardcore: boolean;
  /** Whether the character is in Solo Self-Found mode */
  ssf: boolean;
  /** List of plugin package names to load, in order */
  plugins: string[];
  /** Default TTL for cached values in milliseconds */
  cacheTtlMs?: number;
  /** Maximum number of entries in the shared cache */
  cacheMaxSize?: number;
  /** Minimum interval between HTTP requests to the same host, in milliseconds */
  httpMinIntervalMs?: number;
}
