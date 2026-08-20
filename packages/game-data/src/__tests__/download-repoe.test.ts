import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'fs';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
// This exercises the real repo-root download script directly (not a
// reimplementation) -- see scripts/download-repoe.js's own comment on why
// `runDownload` takes injectable fetchers. Excluded from this package's
// `tsc` build (see tsconfig.json) since it reaches outside the package's
// rootDir; vitest transpiles it fine on its own.
// @ts-expect-error -- plain JS script outside this package, no type declarations
import { runDownload, FILES, REPOE_PIN_SHA } from '../../../../scripts/download-repoe.js';

const GOOD_FILES: Record<string, string> = {
  'version.txt': '3.29.3.1.4',
  'mods.min.json': JSON.stringify({ Strength1: { name: 'of the Brute' } }),
  'mod_types.min.json': JSON.stringify({}),
  'tags.min.json': JSON.stringify(['ring']),
  'fossils.min.json': JSON.stringify({}),
  'essences.min.json': JSON.stringify({}),
  'crafting_bench_options.min.json': JSON.stringify([]),
  'base_items.min.json': JSON.stringify({}),
  'item_classes.min.json': JSON.stringify({}),
};

/**
 * Build a fake fetchText/fetchToFile pair serving canned content by
 * filename, so tests never touch the network. `failAfter` simulates a
 * connection dying after N successful fetchToFile calls.
 */
function fakeFetchers(filesByName: Record<string, string>, opts: { failAfter?: number } = {}) {
  let served = 0;
  const fetchToFile = async (url: string, destPath: string) => {
    const filename = url.split('/').pop() as string;
    served += 1;
    if (opts.failAfter !== undefined && served > opts.failAfter) {
      throw new Error(`simulated network failure fetching ${filename}`);
    }
    const content = filesByName[filename];
    if (content === undefined) throw new Error(`no fake content for ${filename}`);
    await writeFile(destPath, content);
  };
  const fetchText = async (url: string) => {
    const filename = url.split('/').pop() as string;
    const content = filesByName[filename];
    if (content === undefined) throw new Error(`no fake content for ${filename}`);
    return content;
  };
  return { fetchText, fetchToFile };
}

let workDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'repoe-download-test-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('runDownload', () => {
  it('downloads, validates, and atomically swaps in a fresh data dir', async () => {
    const dataDir = join(workDir, 'repoe-data');
    const { fetchText, fetchToFile } = fakeFetchers(GOOD_FILES);

    const result = await runDownload({ dataDir, fetchText, fetchToFile, log() {}, warn() {} });

    expect(result).toEqual({ updated: true, version: '3.29.3.1.4' });
    for (const file of FILES as string[]) {
      expect(existsSync(join(dataDir, file))).toBe(true);
    }
    const stamp = JSON.parse(await readFile(join(dataDir, '.repoe-stamp.json'), 'utf-8'));
    expect(stamp.sha).toBe(REPOE_PIN_SHA);
    expect(stamp.version).toBe('3.29.3.1.4');
  });

  it('skips re-download when the pin matches and all files are present', async () => {
    const dataDir = join(workDir, 'repoe-data');
    const { fetchText, fetchToFile } = fakeFetchers(GOOD_FILES);
    await runDownload({ dataDir, fetchText, fetchToFile, log() {}, warn() {} });

    let fetchCount = 0;
    const countingFetchToFile = async (url: string, destPath: string) => {
      fetchCount += 1;
      return fetchToFile(url, destPath);
    };
    const result = await runDownload({
      dataDir,
      fetchText,
      fetchToFile: countingFetchToFile,
      log() {},
      warn() {},
    });

    expect(result).toEqual({ updated: false, version: '3.29.3.1.4' });
    expect(fetchCount).toBe(0);
  });

  it('rejects a downloaded file that is not valid JSON (e.g. an HTML error page)', async () => {
    const dataDir = join(workDir, 'repoe-data');
    const brokenFiles = { ...GOOD_FILES, 'fossils.min.json': '<html>502 Bad Gateway</html>' };
    const { fetchText, fetchToFile } = fakeFetchers(brokenFiles);

    await expect(runDownload({ dataDir, fetchText, fetchToFile, log() {}, warn() {} })).rejects.toThrow(
      /fossils\.min\.json is not valid JSON/
    );

    // Nothing should have been swapped in -- the real data dir was never touched.
    expect(existsSync(dataDir)).toBe(false);
  });

  it('regression: an interrupted --force refresh does not leave mixed-version data behind', async () => {
    const dataDir = join(workDir, 'repoe-data');
    const { fetchText, fetchToFile } = fakeFetchers(GOOD_FILES);

    // Establish good baseline data at v1.
    await runDownload({ dataDir, fetchText, fetchToFile, log() {}, warn() {} });
    const beforeContents: Record<string, string> = {};
    for (const file of FILES as string[]) {
      beforeContents[file] = await readFile(join(dataDir, file), 'utf-8');
    }
    const beforeStamp = await readFile(join(dataDir, '.repoe-stamp.json'), 'utf-8');

    // Force a refresh to "v2" content, but simulate the connection dying
    // partway through the file loop (after 3 of the 9 files download).
    const v2Files = { ...GOOD_FILES, 'version.txt': '3.30.0.0.0' };
    const flaky = fakeFetchers(v2Files, { failAfter: 3 });

    await expect(
      runDownload({
        dataDir,
        force: true,
        fetchText: flaky.fetchText,
        fetchToFile: flaky.fetchToFile,
        log() {},
        warn() {},
      })
    ).rejects.toThrow(/simulated network failure/);

    // The real data dir must be completely untouched by the failed attempt --
    // same file contents, same stamp -- never a mix of v1 and v2 files.
    for (const file of FILES as string[]) {
      expect(await readFile(join(dataDir, file), 'utf-8')).toBe(beforeContents[file]);
    }
    expect(await readFile(join(dataDir, '.repoe-stamp.json'), 'utf-8')).toBe(beforeStamp);
    expect(JSON.parse(beforeStamp).version).toBe('3.29.3.1.4');

    // No orphaned temp directory left behind next to the data dir.
    const siblingEntries = await readdir(dirname(dataDir));
    expect(siblingEntries.some((name) => name.includes('.tmp-'))).toBe(false);

    // A later plain (non-forced) run must still see it as up to date at v1 --
    // never silently accept the half-written v2 attempt as current.
    const after = await runDownload({ dataDir, fetchText, fetchToFile, log() {}, warn() {} });
    expect(after).toEqual({ updated: false, version: '3.29.3.1.4' });
  });
});
