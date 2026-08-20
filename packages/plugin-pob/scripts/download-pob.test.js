/**
 * Tests for the download-pob.js completion sentinel — specifically the bug this
 * guards against: a marker check against a file that's extracted partway through
 * the tarball (e.g. src/HeadlessWrapper.lua) would permanently treat an
 * interrupted/corrupt download as "already present". `fetchTarball`/`extractTarball`
 * are injected so none of this touches the real network or a real tar archive.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { downloadCompleteMarkerPath, downloadPob } from './download-pob.js';

describe('downloadPob', () => {
  let dataDir;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'pob-download-test-'));
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('skips re-fetching entirely when the completion marker is already present', async () => {
    writeFileSync(downloadCompleteMarkerPath(dataDir), 'done\n');
    const fetchTarball = vi.fn();
    const extractTarball = vi.fn();

    const result = await downloadPob({ dataDir, fetchTarball, extractTarball });

    expect(result).toEqual({ skipped: true });
    expect(fetchTarball).not.toHaveBeenCalled();
    expect(extractTarball).not.toHaveBeenCalled();
  });

  it('does NOT treat a partial/interrupted download as complete, even if it left real files behind', async () => {
    // This is exactly the bug being fixed: an interrupted extraction landed
    // src/HeadlessWrapper.lua (an extracted PoB file, not the completion marker)
    // but never finished. A marker check against that file would have wrongly
    // treated this as "already present" forever.
    mkdirSync(join(dataDir, 'src'), { recursive: true });
    writeFileSync(join(dataDir, 'src', 'HeadlessWrapper.lua'), '-- partial extraction\n');
    expect(existsSync(downloadCompleteMarkerPath(dataDir))).toBe(false);

    const fetchTarball = vi.fn().mockResolvedValue('fake-response');
    const extractTarball = vi.fn().mockResolvedValue(undefined);

    const result = await downloadPob({ dataDir, fetchTarball, extractTarball });

    expect(result.skipped).toBe(false);
    expect(fetchTarball).toHaveBeenCalledOnce();
    expect(extractTarball).toHaveBeenCalledOnce();
  });

  it('writes the completion marker only after a successful download + extract', async () => {
    const fetchTarball = vi.fn().mockResolvedValue('fake-response');
    const extractTarball = vi.fn().mockResolvedValue(undefined);

    expect(existsSync(downloadCompleteMarkerPath(dataDir))).toBe(false);

    const result = await downloadPob({ dataDir, fetchTarball, extractTarball });

    expect(result).toEqual({ skipped: false });
    expect(extractTarball).toHaveBeenCalledWith('fake-response', dataDir);
    expect(existsSync(downloadCompleteMarkerPath(dataDir))).toBe(true);
  });

  it('does not write the completion marker if extraction fails, so the next run retries instead of skipping', async () => {
    const fetchTarball = vi.fn().mockResolvedValue('fake-response');
    const extractTarball = vi.fn().mockRejectedValue(new Error('boom'));

    const result = await downloadPob({ dataDir, fetchTarball, extractTarball });

    expect(result.error).toBeInstanceOf(Error);
    expect(existsSync(downloadCompleteMarkerPath(dataDir))).toBe(false);

    // A subsequent run must actually retry, not silently skip.
    const retryFetch = vi.fn().mockResolvedValue('fake-response');
    const retryExtract = vi.fn().mockResolvedValue(undefined);
    await downloadPob({ dataDir, fetchTarball: retryFetch, extractTarball: retryExtract });

    expect(retryFetch).toHaveBeenCalledOnce();
    expect(existsSync(downloadCompleteMarkerPath(dataDir))).toBe(true);
  });

  it('does not write the completion marker if the fetch itself fails', async () => {
    const fetchTarball = vi.fn().mockRejectedValue(new Error('network down'));
    const extractTarball = vi.fn();

    const result = await downloadPob({ dataDir, fetchTarball, extractTarball });

    expect(result.error).toBeInstanceOf(Error);
    expect(extractTarball).not.toHaveBeenCalled();
    expect(existsSync(downloadCompleteMarkerPath(dataDir))).toBe(false);
  });
});
