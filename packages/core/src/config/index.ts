import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { PoeAiConfig } from './types.js';

const DEFAULT_CONFIG_PATH = join(homedir(), '.config', 'poe-ai', 'config.json');

export const DEFAULTS: PoeAiConfig = {
  league: 'Standard',
  patchVersion: '3.26.0',
  hardcore: false,
  ssf: false,
  plugins: ['@poe-ai/plugin-pob', '@poe-ai/plugin-wiki'],
};

/**
 * Resolve the config file path. Overridable via POE_AI_CONFIG_PATH so tests (and
 * anything else that wants an isolated config) don't have to touch the real
 * ~/.config/poe-ai/config.json. Read lazily (not cached at module load) so tests
 * that set the env var right before spawning/importing still see it.
 */
export function getConfigPath(): string {
  return process.env.POE_AI_CONFIG_PATH || DEFAULT_CONFIG_PATH;
}

/**
 * Load configuration from getConfigPath(), merged with defaults.
 * Missing file (ENOENT) is silently ignored. Any other error (e.g. malformed JSON,
 * permission denied) emits a warning so the user knows their config was skipped.
 */
export function loadConfig(): PoeAiConfig {
  const configPath = getConfigPath();
  try {
    const raw = readFileSync(configPath, 'utf8');
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`[poe-ai] Failed to parse config at ${configPath}, using defaults:`, (err as Error).message);
    }
    return { ...DEFAULTS };
  }
}

export type { PoeAiConfig };
