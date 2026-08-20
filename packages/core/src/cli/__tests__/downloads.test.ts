import { describe, expect, it } from 'vitest';
import { runPobDownloads, runRepoeDownload } from '../downloads.js';

// These exercise the real require.resolve('<pkg>/scripts/...') path against
// this workspace's actual installed packages (plugin-pob and game-data are
// optionalDependencies of @poe-ai/core specifically so this resolution
// works) -- not mocked, since the resolution behavior itself (respecting
// each package's `exports` map, and degrading gracefully if a package isn't
// installed) is exactly what's worth covering here. The scripts they spawn
// are themselves idempotent/already-tested (download-pob.test.js etc.), so
// running them for real is safe and fast when the data is already cached.

describe('runPobDownloads', () => {
  it('resolves and runs download-pob.js + download-luajit.js from @poe-ai/plugin-pob', () => {
    const results = runPobDownloads();
    expect(results.map((r) => r.step)).toEqual(['pob-data', 'LuaJIT']);
    for (const r of results) {
      expect(r.skippedMissingPackage).toBeFalsy();
    }
  }, 20_000);
});

describe('runRepoeDownload', () => {
  it('resolves and runs download-repoe.js from @poe-ai/game-data', () => {
    const result = runRepoeDownload();
    expect(result.step).toBe('RePoE game data');
    expect(result.skippedMissingPackage).toBeFalsy();
  }, 20_000);
});
