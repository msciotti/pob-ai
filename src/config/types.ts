/**
 * Configuration interface for pob-mcp
 */
export interface PobMcpConfig {
  /**
   * Path to Path of Building installation
   * If not specified, will attempt auto-detection
   */
  pobPath?: string;

  /**
   * Build cache TTL in milliseconds
   * Default: 30 minutes
   */
  cacheTtl?: number;

  /**
   * Maximum number of builds to cache
   * Default: 100
   */
  maxCachedBuilds?: number;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Required<PobMcpConfig> = {
  pobPath: '',
  cacheTtl: 30 * 60 * 1000, // 30 minutes
  maxCachedBuilds: 100,
};
