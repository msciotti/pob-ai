/**
 * `poe-ai init` — interactive/flag-driven first-run setup:
 *   1. Choose which plugins to enable and the league.
 *   2. Write ~/.config/poe-ai/config.json (never clobbering an existing one
 *      without --force).
 *   3. Run the config-driven downloads (section 1d) each enabled plugin
 *      needs — nothing runs at `npm install` time any more.
 *   4. Print the ready-to-paste .mcp.json snippet and `claude mcp add` command.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { getConfigPath } from '../config/index.js';
import type { PoeAiConfig } from '../config/types.js';
import { RateLimitedHttpClient } from '../http-client.js';
import {
  PLUGIN_CATALOG,
  catalogEntryFor,
  defaultPluginSelection,
  resolvePluginName,
} from './plugin-catalog.js';
import { promptMultiSelect, promptText, type PromptIO } from './prompts.js';
import { runPobDownloads, runRepoeDownload, type DownloadResult } from './downloads.js';

export interface InitFlags {
  plugins?: string[];
  league?: string;
  patchVersion?: string;
  hardcore: boolean;
  ssf: boolean;
  force: boolean;
  yes: boolean;
  skipDownloads: boolean;
  help: boolean;
}

const DEFAULT_PATCH_VERSION = '3.26.0';
const FALLBACK_LEAGUE = 'Standard';

export function parseInitArgs(argv: string[]): InitFlags {
  const flags: InitFlags = {
    hardcore: false,
    ssf: false,
    force: false,
    yes: false,
    skipDownloads: false,
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--force') flags.force = true;
    else if (arg === '--yes' || arg === '-y') flags.yes = true;
    else if (arg === '--hardcore') flags.hardcore = true;
    else if (arg === '--ssf') flags.ssf = true;
    else if (arg === '--skip-downloads') flags.skipDownloads = true;
    else if (arg === '--help' || arg === '-h') flags.help = true;
    else if (arg.startsWith('--plugins=')) {
      flags.plugins = arg
        .slice('--plugins='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map(resolvePluginName);
    } else if (arg.startsWith('--league=')) {
      flags.league = arg.slice('--league='.length);
    } else if (arg.startsWith('--patch-version=')) {
      flags.patchVersion = arg.slice('--patch-version='.length);
    }
  }

  return flags;
}

export const INIT_HELP = `Usage: poe-ai init [options]

  --plugins=<list>      Comma-separated plugins to enable (e.g. pob,wiki,ninja)
  --league=<name>        League name (default: live-resolved via poe.ninja if
                          plugin-ninja is enabled, else prompted/"Standard")
  --patch-version=<ver>  PoE patch version (default: ${DEFAULT_PATCH_VERSION})
  --hardcore              Mark the config as Hardcore
  --ssf                   Mark the config as Solo Self-Found
  --force                 Overwrite an existing config.json instead of just
                          showing what would change
  --yes, -y               Non-interactive: accept defaults for anything not
                          given as a flag
  --skip-downloads        Write config only, skip running plugin downloads
  --help, -h               Show this help
`;

/**
 * Shape of poe.ninja's /poe1/api/data/index-state response, as reverse-
 * engineered in plugin-ninja/src/ninja-client.ts — only the bit we need here.
 */
interface NinjaIndexStateShape {
  economyLeagues?: Array<{ name: string; displayName: string }>;
}

/**
 * Best-effort live league resolution via poe.ninja's index-state endpoint —
 * the first entry in `economyLeagues` is the current trade league (retired
 * ones live in `oldEconomyLeagues`). Returns null on any failure so the
 * caller can fall back to prompting/a default instead of failing init over
 * a transient network issue.
 */
export async function resolveLiveLeague(
  http: { get: <T>(url: string) => Promise<T> } = new RateLimitedHttpClient()
): Promise<string | null> {
  try {
    const data = await http.get<NinjaIndexStateShape>('https://poe.ninja/poe1/api/data/index-state');
    return data.economyLeagues?.[0]?.displayName ?? null;
  } catch {
    return null;
  }
}

/** Lines describing what would change if `next` were written over `current`. */
export function diffConfig(current: Record<string, unknown>, next: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(current), ...Object.keys(next)]);
  const lines: string[] = [];
  for (const key of [...keys].sort()) {
    const before = JSON.stringify(current[key]);
    const after = JSON.stringify(next[key]);
    if (before !== after) {
      lines.push(`  ${key}: ${before ?? '(unset)'} -> ${after ?? '(unset)'}`);
    }
  }
  return lines;
}

function mcpStdioSnippet(): string {
  return JSON.stringify(
    { mcpServers: { 'poe-ai': { command: 'poe-ai-mcp' } } },
    null,
    2
  );
}

export interface RunInitDeps {
  io: PromptIO;
  isInteractive: boolean;
  configPath?: string;
  fetchLeague?: typeof resolveLiveLeague;
  runDownloads?: (enabledPlugins: string[]) => DownloadResult[];
  log?: (msg: string) => void;
}

export interface RunInitResult {
  wrote: boolean;
  configPath: string;
  config?: PoeAiConfig;
  downloadResults: DownloadResult[];
}

function defaultRunDownloads(enabledPlugins: string[]): DownloadResult[] {
  const results: DownloadResult[] = [];
  const needs = new Set(enabledPlugins.flatMap((name) => catalogEntryFor(name)?.downloads ?? []));

  if (needs.has('pob')) results.push(...runPobDownloads());
  if (needs.has('repoe')) results.push(runRepoeDownload());

  return results;
}

export async function runInit(argv: string[], deps: RunInitDeps): Promise<RunInitResult> {
  const flags = parseInitArgs(argv);
  const log = deps.log ?? console.log;
  const configPath = deps.configPath ?? getConfigPath();
  const fetchLeague = deps.fetchLeague ?? resolveLiveLeague;
  const runDownloads = deps.runDownloads ?? defaultRunDownloads;

  if (flags.help) {
    log(INIT_HELP);
    return { wrote: false, configPath, downloadResults: [] };
  }

  // 1. Plugin selection
  let plugins = flags.plugins;
  if (!plugins) {
    if (deps.isInteractive && !flags.yes) {
      const defaults = defaultPluginSelection();
      const preselected = PLUGIN_CATALOG.map((e) => e.name)
        .map((name, i) => (defaults.includes(name) ? i : -1))
        .filter((i) => i >= 0);
      const chosenIndices = await promptMultiSelect(
        deps.io,
        '\nWhich plugins would you like to enable?',
        PLUGIN_CATALOG.map((e) => `${e.name} — ${e.label}`),
        preselected
      );
      plugins = chosenIndices.map((i) => PLUGIN_CATALOG[i].name);
    } else {
      plugins = defaultPluginSelection();
    }
  }

  // 2. League resolution
  let league = flags.league;
  if (!league) {
    const ninjaEnabled = plugins.includes('@poe-ai/plugin-ninja');
    if (ninjaEnabled) {
      log('\n🔎 Resolving current league via poe.ninja...');
      league = (await fetchLeague()) ?? undefined;
      if (league) {
        log(`   Detected live league: ${league}`);
      } else {
        log('   Could not reach poe.ninja — falling back.');
      }
    }
    if (!league) {
      if (deps.isInteractive && !flags.yes) {
        league = await promptText(deps.io, '\nLeague name', FALLBACK_LEAGUE);
      } else {
        league = FALLBACK_LEAGUE;
      }
    }
  }

  const config: PoeAiConfig = {
    league,
    patchVersion: flags.patchVersion ?? DEFAULT_PATCH_VERSION,
    hardcore: flags.hardcore,
    ssf: flags.ssf,
    plugins,
  };

  // 3. Write config, respecting an existing one unless --force
  if (existsSync(configPath) && !flags.force) {
    let existing: Record<string, unknown> = {};
    try {
      existing = JSON.parse(readFileSync(configPath, 'utf8'));
    } catch {
      // Malformed existing config — treat as empty for diff purposes, but
      // still refuse to overwrite it without --force.
    }
    const diff = diffConfig(existing, config as unknown as Record<string, unknown>);
    log(`\n⚠️  A config already exists at ${configPath} — not overwriting it.`);
    if (diff.length > 0) {
      log('   Re-running with --force would change:');
      diff.forEach((line) => log(line));
    } else {
      log('   (it already matches what this run would write)');
    }
    log('   Re-run with --force to overwrite.');
    return { wrote: false, configPath, downloadResults: [] };
  }

  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  log(`\n✅ Wrote config to ${configPath}`);

  // 4. Config-driven downloads (section 1d)
  let downloadResults: DownloadResult[] = [];
  if (!flags.skipDownloads) {
    downloadResults = runDownloads(plugins);
    const failed = downloadResults.filter((r) => !r.ok);
    if (failed.length > 0) {
      log('\n⚠️  Some setup steps did not complete:');
      for (const r of failed) {
        log(
          r.skippedMissingPackage
            ? `   - ${r.step}: package not installed — install it, then re-run poe-ai init`
            : `   - ${r.step}: failed — see output above`
        );
      }
    }
  }

  // 5. Ready-to-paste connection info
  log('\n📋 Add to your .mcp.json (or Claude Desktop MCP config):\n');
  log(mcpStdioSnippet());
  log('\n📋 Or via the Claude Code CLI:\n');
  log('   claude mcp add poe-ai -- poe-ai-mcp');

  return { wrote: true, configPath, config, downloadResults };
}
