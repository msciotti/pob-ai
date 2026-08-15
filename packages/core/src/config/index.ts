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
 * If the file does not exist or cannot be parsed, returns the defaults silently.
 */
export function loadConfig(): PoeAiConfig {
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf8');
    const userConfig = JSON.parse(raw) as Partial<PoeAiConfig>;
    return { ...DEFAULTS, ...userConfig };
  } catch {
    // Config file missing or unreadable — use defaults
    return { ...DEFAULTS };
  }
}

export type { PoeAiConfig };
