/**
 * Tests for the download-pob.js completion sentinel — specifically the bug this
 * guards against: a marker check against a file that's extracted partway through
 * the tarball (e.g. src/HeadlessWrapper.lua) would permanently treat an
 * interrupted/corrupt download as "already present". `fetchTarball`/`extractTarball`
 * are injected so none of this touches the real network or a real tar archive.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

  describe('POE_AI_ALL_TREES marker mismatch recovery', () => {
    it('records allTrees in the marker after a fresh pruned download', async () => {
      const fetchTarball = vi.fn().mockResolvedValue('fake-response');
      const extractTarball = vi.fn().mockResolvedValue(undefined);

      await downloadPob({ dataDir, allTrees: false, fetchTarball, extractTarball });

      const marker = JSON.parse(readFileSync(downloadCompleteMarkerPath(dataDir), 'utf8'));
      expect(marker.allTrees).toBe(false);
    });

    it('records allTrees:true in the marker after a fresh full download', async () => {
      const fetchTarball = vi.fn().mockResolvedValue('fake-response');
      const extractTarball = vi.fn().mockResolvedValue(undefined);

      await downloadPob({ dataDir, allTrees: true, fetchTarball, extractTarball });

      const marker = JSON.parse(readFileSync(downloadCompleteMarkerPath(dataDir), 'utf8'));
      expect(marker.allTrees).toBe(true);
    });

    it('forces a fresh re-download when POE_AI_ALL_TREES=1 is requested against an already-pruned install', async () => {
      // Simulate a prior pruned download: marker present, allTrees: false.
      mkdirSync(dataDir, { recursive: true });
      writeFileSync(
        downloadCompleteMarkerPath(dataDir),
        JSON.stringify({ downloadedAt: new Date().toISOString(), allTrees: false })
      );

      const fetchTarball = vi.fn().mockResolvedValue('fake-response');
      const extractTarball = vi.fn().mockResolvedValue(undefined);

      const result = await downloadPob({ dataDir, allTrees: true, fetchTarball, extractTarball });

      // The whole point of the fix: a real re-download happens instead of a no-op.
      expect(fetchTarball).toHaveBeenCalledOnce();
      expect(extractTarball).toHaveBeenCalledOnce();
      expect(result.skipped).toBe(false);

      const marker = JSON.parse(readFileSync(downloadCompleteMarkerPath(dataDir), 'utf8'));
      expect(marker.allTrees).toBe(true);
    });

    it('skips re-fetching when POE_AI_ALL_TREES=1 is requested and the marker already says allTrees:true', async () => {
      mkdirSync(dataDir, { recursive: true });
      writeFileSync(
        downloadCompleteMarkerPath(dataDir),
        JSON.stringify({ downloadedAt: new Date().toISOString(), allTrees: true })
      );

      const fetchTarball = vi.fn();
      const extractTarball = vi.fn();

      const result = await downloadPob({ dataDir, allTrees: true, fetchTarball, extractTarball });

      expect(result).toEqual({ skipped: true });
      expect(fetchTarball).not.toHaveBeenCalled();
    });

    it('prunes an already-full install in place (no network) when POE_AI_ALL_TREES is not set', async () => {
      mkdirSync(join(dataDir, 'src', 'TreeData', '2_6'), { recursive: true });
      writeFileSync(join(dataDir, 'src', 'TreeData', '2_6', 'tree.lua'), 'return {}');
      mkdirSync(join(dataDir, 'src', 'TreeData', '3_29'), { recursive: true });
      writeFileSync(join(dataDir, 'src', 'TreeData', '3_29', 'tree.lua'), 'return {}');
      writeFileSync(
        downloadCompleteMarkerPath(dataDir),
        JSON.stringify({ downloadedAt: new Date().toISOString(), allTrees: true })
      );

      const fetchTarball = vi.fn();
      const extractTarball = vi.fn();

      const result = await downloadPob({ dataDir, allTrees: false, fetchTarball, extractTarball });

      expect(fetchTarball).not.toHaveBeenCalled();
      expect(extractTarball).not.toHaveBeenCalled();
      expect(result.skipped).toBe(false);
      expect(result.prunedInPlace).toBe(true);
      expect(existsSync(join(dataDir, 'src', 'TreeData', '2_6'))).toBe(false);
      expect(existsSync(join(dataDir, 'src', 'TreeData', '3_29'))).toBe(true);

      const marker = JSON.parse(readFileSync(downloadCompleteMarkerPath(dataDir), 'utf8'));
      expect(marker.allTrees).toBe(false);
    });

    it('treats a legacy plain-timestamp marker as allTrees:false (the historical default)', async () => {
      mkdirSync(dataDir, { recursive: true });
      writeFileSync(downloadCompleteMarkerPath(dataDir), 'done\n');

      const fetchTarball = vi.fn().mockResolvedValue('fake-response');
      const extractTarball = vi.fn().mockResolvedValue(undefined);

      // Requesting the pruned set against a legacy marker should still skip —
      // both sides agree the data is pruned.
      const skipResult = await downloadPob({ dataDir, allTrees: false, fetchTarball, extractTarball });
      expect(skipResult).toEqual({ skipped: true });
      expect(fetchTarball).not.toHaveBeenCalled();

      // But requesting ALL_TREES against that same legacy marker must force a
      // real re-download, not a silent no-op.
      const allTreesResult = await downloadPob({ dataDir, allTrees: true, fetchTarball, extractTarball });
      expect(fetchTarball).toHaveBeenCalledOnce();
      expect(allTreesResult.skipped).toBe(false);
    });
  });
});
