import { readFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import type { PobMcpConfig } from './types.js';
import { DEFAULT_CONFIG } from './types.js';

/**
 * Get the config file path
 * ~/.config/pob-mcp/config.json
 */
export function getConfigPath(): string {
  return join(homedir(), '.config', 'pob-mcp', 'config.json');
}

/**
 * Load configuration from file or return defaults
 */
export async function loadConfig(): Promise<Required<PobMcpConfig>> {
  const configPath = getConfigPath();

  try {
    const configData = await readFile(configPath, 'utf-8');
    const userConfig = JSON.parse(configData) as Partial<PobMcpConfig>;

    // Merge user config with defaults
    return {
      ...DEFAULT_CONFIG,
      ...userConfig,
    };
  } catch (error) {
    // Config file doesn't exist or is invalid, use defaults
    return DEFAULT_CONFIG;
  }
}

export type { PobMcpConfig };
export { DEFAULT_CONFIG };
