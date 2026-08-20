import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { diffConfig, parseInitArgs, resolveLiveLeague, runInit } from '../init.js';

describe('parseInitArgs', () => {
  it('parses a comma-separated --plugins list and expands short names', () => {
    const flags = parseInitArgs(['--plugins=pob,wiki,ninja']);
    expect(flags.plugins).toEqual(['@poe-ai/plugin-pob', '@poe-ai/plugin-wiki', '@poe-ai/plugin-ninja']);
  });

  it('parses --league, --patch-version, boolean flags', () => {
    const flags = parseInitArgs(['--league=Standard', '--patch-version=3.27.0', '--hardcore', '--ssf', '--force', '--yes']);
    expect(flags.league).toBe('Standard');
    expect(flags.patchVersion).toBe('3.27.0');
    expect(flags.hardcore).toBe(true);
    expect(flags.ssf).toBe(true);
    expect(flags.force).toBe(true);
    expect(flags.yes).toBe(true);
  });

  it('defaults booleans to false and plugins/league to undefined', () => {
    const flags = parseInitArgs([]);
    expect(flags.hardcore).toBe(false);
    expect(flags.ssf).toBe(false);
    expect(flags.force).toBe(false);
    expect(flags.yes).toBe(false);
    expect(flags.plugins).toBeUndefined();
    expect(flags.league).toBeUndefined();
  });

  it('recognizes --skip-downloads and --help', () => {
    expect(parseInitArgs(['--skip-downloads']).skipDownloads).toBe(true);
    expect(parseInitArgs(['--help']).help).toBe(true);
    expect(parseInitArgs(['-h']).help).toBe(true);
  });
});

describe('diffConfig', () => {
  it('reports no lines when configs are identical', () => {
    expect(diffConfig({ a: 1, b: 'x' }, { a: 1, b: 'x' })).toEqual([]);
  });

  it('reports changed, added, and removed keys', () => {
    const lines = diffConfig({ a: 1, removedKey: 'gone' }, { a: 2, addedKey: 'new' });
    expect(lines.some((l) => l.includes('a: 1 -> 2'))).toBe(true);
    expect(lines.some((l) => l.includes('removedKey'))).toBe(true);
    expect(lines.some((l) => l.includes('addedKey'))).toBe(true);
  });
});

describe('resolveLiveLeague', () => {
  it('returns the first economyLeagues displayName', async () => {
    const http = { get: async <T,>() => ({ economyLeagues: [{ name: 'a', displayName: 'Allflame' }] }) as T };
    expect(await resolveLiveLeague(http)).toBe('Allflame');
  });

  it('returns null instead of throwing when the fetch fails', async () => {
    const http = { get: async <T,>(): Promise<T> => { throw new Error('network down'); } };
    expect(await resolveLiveLeague(http)).toBeNull();
  });

  it('returns null when the response has no economyLeagues', async () => {
    const http = { get: async <T,>() => ({}) as T };
    expect(await resolveLiveLeague(http)).toBeNull();
  });
});

function noopIO() {
  return { input: { on: () => {} } as any, output: { write: () => {} } as any };
}

describe('runInit', () => {
  let dir: string;
  let configPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'poe-ai-init-test-'));
    configPath = join(dir, 'config.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes a config with explicit flags, non-interactively, without prompting', async () => {
    const result = await runInit(
      ['--plugins=pob,wiki', '--league=Standard', '--yes', '--skip-downloads'],
      { io: noopIO(), isInteractive: false, configPath, log: () => {} }
    );

    expect(result.wrote).toBe(true);
    expect(existsSync(configPath)).toBe(true);
    const written = JSON.parse(readFileSync(configPath, 'utf8'));
    expect(written.plugins).toEqual(['@poe-ai/plugin-pob', '@poe-ai/plugin-wiki']);
    expect(written.league).toBe('Standard');
  });

  it('does not overwrite an existing config without --force', async () => {
    writeFileSync(configPath, JSON.stringify({ league: 'Old', plugins: [] }));

    const result = await runInit(
      ['--plugins=pob', '--league=New', '--yes', '--skip-downloads'],
      { io: noopIO(), isInteractive: false, configPath, log: () => {} }
    );

    expect(result.wrote).toBe(false);
    const stillOld = JSON.parse(readFileSync(configPath, 'utf8'));
    expect(stillOld.league).toBe('Old');
  });

  it('overwrites an existing config with --force', async () => {
    writeFileSync(configPath, JSON.stringify({ league: 'Old', plugins: [] }));

    const result = await runInit(
      ['--plugins=pob', '--league=New', '--yes', '--skip-downloads', '--force'],
      { io: noopIO(), isInteractive: false, configPath, log: () => {} }
    );

    expect(result.wrote).toBe(true);
    const updated = JSON.parse(readFileSync(configPath, 'utf8'));
    expect(updated.league).toBe('New');
  });

  it('uses fetchLeague to resolve the league when plugin-ninja is enabled and no --league given', async () => {
    const result = await runInit(
      ['--plugins=ninja', '--yes', '--skip-downloads'],
      {
        io: noopIO(),
        isInteractive: false,
        configPath,
        log: () => {},
        fetchLeague: async () => 'Allflame',
      }
    );

    expect(result.config?.league).toBe('Allflame');
  });

  it('falls back to Standard when plugin-ninja is not enabled and running non-interactively', async () => {
    const result = await runInit(
      ['--plugins=wiki', '--yes', '--skip-downloads'],
      { io: noopIO(), isInteractive: false, configPath, log: () => {} }
    );

    expect(result.config?.league).toBe('Standard');
  });

  it('falls back to a default league when the live fetch fails, even with plugin-ninja enabled', async () => {
    const result = await runInit(
      ['--plugins=ninja', '--yes', '--skip-downloads'],
      {
        io: noopIO(),
        isInteractive: false,
        configPath,
        log: () => {},
        fetchLeague: async () => null,
      }
    );

    expect(result.config?.league).toBe('Standard');
  });

  it('invokes runDownloads with the enabled plugin list unless --skip-downloads is set', async () => {
    let calledWith: string[] | null = null;
    await runInit(['--plugins=pob,wiki', '--yes'], {
      io: noopIO(),
      isInteractive: false,
      configPath,
      log: () => {},
      runDownloads: (plugins) => {
        calledWith = plugins;
        return [];
      },
    });

    expect(calledWith).toEqual(['@poe-ai/plugin-pob', '@poe-ai/plugin-wiki']);
  });

  it('does not invoke runDownloads when --skip-downloads is set', async () => {
    let called = false;
    await runInit(['--plugins=pob', '--yes', '--skip-downloads'], {
      io: noopIO(),
      isInteractive: false,
      configPath,
      log: () => {},
      runDownloads: () => {
        called = true;
        return [];
      },
    });

    expect(called).toBe(false);
  });

  it('prints help and does not write a config when --help is passed', async () => {
    const logs: string[] = [];
    const result = await runInit(['--help'], {
      io: noopIO(),
      isInteractive: false,
      configPath,
      log: (msg) => logs.push(msg),
    });

    expect(result.wrote).toBe(false);
    expect(existsSync(configPath)).toBe(false);
    expect(logs.join('\n')).toContain('Usage: poe-ai init');
  });
});
