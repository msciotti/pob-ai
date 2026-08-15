import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { PoeAiConfig } from './types.js';

const CONFIG_PATH = join(homedir(), '.config', 'poe-ai', 'config.json');

const DEFAULTS: PoeAiConfig = {
  league: 'Standard',
  patchVersion: '3.26.0',
  hardcore: false,
  ssf: false,
  plugins: ['@poe-ai/plugin-pob', '@poe-ai/plugin-wiki'],
};

/**
 * Load configuration from ~/.config/poe-ai/config.json, merged with defaults.
 * Missing file (ENOENT) is silently ignored. Any other error (e.g. malformed JSON,
 * permission denied) emits a warning so the user knows their config was skipped.
 */
export function loadConfig(): PoeAiConfig {
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf8');
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`[poe-ai] Failed to parse config at ${CONFIG_PATH}, using defaults:`, (err as Error).message);
    }
    return { ...DEFAULTS };
  }
}

export type { PoeAiConfig };
