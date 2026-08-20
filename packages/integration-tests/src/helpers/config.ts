/**
 * Writes a temporary ~/.config/poe-ai/config.json-shaped file and points the
 * server at it via POE_AI_CONFIG_PATH, so e2e runs never touch a developer's real
 * config and each test gets an isolated plugin list.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { FIXTURE_PLUGIN_JS } from './paths.js';

/** Module specifier for the built fixture plugin — a file:// URL, since it isn't
 *  published to node_modules under any package name. Node's dynamic import()
 *  (used by @poe-ai/core's plugin loader) accepts this directly. */
export const FIXTURE_PLUGIN_SPECIFIER = pathToFileURL(FIXTURE_PLUGIN_JS).href;

export interface TempConfigHandle {
  configPath: string;
  cleanup: () => void;
}

export interface TempConfigOptions {
  /** Plugin module specifiers to load, in order. Defaults to just the fixture plugin. */
  plugins?: string[];
  /** Extra fields merged into the written config (league, patchVersion, etc). */
  overrides?: Record<string, unknown>;
}

export function writeTempConfig(options: TempConfigOptions = {}): TempConfigHandle {
  const dir = mkdtempSync(join(tmpdir(), 'poe-ai-e2e-'));
  const configPath = join(dir, 'config.json');

  const config = {
    league: 'Standard',
    patchVersion: '3.26.0',
    hardcore: false,
    ssf: false,
    plugins: options.plugins ?? [FIXTURE_PLUGIN_SPECIFIER],
    // No real network calls happen in the hermetic suites, but keep this at 0 so
    // nothing is ever accidentally throttled if a smoke test shares this helper.
    httpMinIntervalMs: 0,
    ...options.overrides,
  };

  writeFileSync(configPath, JSON.stringify(config, null, 2));

  return {
    configPath,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
