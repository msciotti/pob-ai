/**
 * Load Build Source Tests
 *
 * Unit tests for the source detection and build-code fetching logic in the
 * load_build tool. These run entirely offline against a mocked ctx.http —
 * no LuaJIT runtime or network needed.
 */
import { describe, it, expect, vi } from 'vitest';
import { detectSource, fetchBuildCode } from '../tools/load-build.js';
import type { PluginContext } from '@poe-ai/core';

// Plausible PoB build code: base64-ish and long enough to pass validation
const FAKE_BUILD_CODE = 'eNrtWVtz2jgU_' + 'aB3cD4eF5gH6iJ7kL8mN9oP0qR1sT2uV'.repeat(3);

function mockCtx(get: ReturnType<typeof vi.fn>): PluginContext {
  return {
    http: { get },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  } as unknown as PluginContext;
}

describe('detectSource', () => {
  it('resolves a full pobb.in URL to a single pobbin candidate', () => {
    expect(detectSource('https://pobb.in/Dmb4Pgk3aa9c')).toEqual([
      { type: 'pobbin', code: 'Dmb4Pgk3aa9c' },
    ]);
  });

  it('resolves full pastebin URLs, including raw and www variants', () => {
    for (const url of [
      'https://pastebin.com/uCLE0msa',
      'https://pastebin.com/raw/uCLE0msa',
      'https://www.pastebin.com/uCLE0msa',
    ]) {
      expect(detectSource(url)).toEqual([{ type: 'pastebin', code: 'uCLE0msa' }]);
    }
  });

  it('returns both candidates for an ambiguous bare 8-char code, pastebin first', () => {
    expect(detectSource('uCLE0msa')).toEqual([
      { type: 'pastebin', code: 'uCLE0msa' },
      { type: 'pobbin', code: 'uCLE0msa' },
    ]);
  });

  it('treats a non-8-char alphanumeric code as pobbin only', () => {
    expect(detectSource('Dmb4Pgk3aa9c')).toEqual([{ type: 'pobbin', code: 'Dmb4Pgk3aa9c' }]);
  });

  it('rejects unrecognisable input', () => {
    expect(detectSource('not a code!')).toEqual([]);
    expect(detectSource('https://example.com/uCLE0msa')).toEqual([]);
    expect(detectSource('a'.repeat(31))).toEqual([]);
  });
});

describe('fetchBuildCode', () => {
  it('fetches a pastebin code from the raw endpoint', async () => {
    const get = vi.fn().mockResolvedValue(FAKE_BUILD_CODE);
    const result = await fetchBuildCode([{ type: 'pastebin', code: 'uCLE0msa' }], mockCtx(get));
    expect(get).toHaveBeenCalledWith('https://pastebin.com/raw/uCLE0msa', expect.anything());
    expect(result).toEqual({
      code: FAKE_BUILD_CODE,
      source: { type: 'pastebin', code: 'uCLE0msa' },
    });
  });

  it('fetches a pobbin code from the /raw endpoint', async () => {
    const get = vi.fn().mockResolvedValue(`${FAKE_BUILD_CODE}\n`);
    const result = await fetchBuildCode(
      [{ type: 'pobbin', code: 'Dmb4Pgk3aa9c' }],
      mockCtx(get)
    );
    expect(get).toHaveBeenCalledWith('https://pobb.in/Dmb4Pgk3aa9c/raw', expect.anything());
    expect(result.code).toBe(FAKE_BUILD_CODE);
  });

  it('falls through to pobbin when pastebin 404s on an ambiguous code', async () => {
    const get = vi
      .fn()
      .mockRejectedValueOnce(new Error('Request failed with status code 404'))
      .mockResolvedValueOnce(FAKE_BUILD_CODE);
    const result = await fetchBuildCode(detectSource('uCLE0msa'), mockCtx(get));
    expect(result.source).toEqual({ type: 'pobbin', code: 'uCLE0msa' });
    expect(get).toHaveBeenNthCalledWith(2, 'https://pobb.in/uCLE0msa/raw', expect.anything());
  });

  it('rejects content that does not look like a build code (e.g. an HTML page)', async () => {
    const get = vi.fn().mockResolvedValue('<!DOCTYPE html><html><body>CAPTCHA</body></html>');
    await expect(
      fetchBuildCode([{ type: 'pastebin', code: 'uCLE0msa' }], mockCtx(get))
    ).rejects.toThrow(/does not look like a PoB build code/);
  });

  it('aggregates failures from every candidate into one error', async () => {
    const get = vi.fn().mockRejectedValue(new Error('Request failed with status code 404'));
    await expect(fetchBuildCode(detectSource('uCLE0msa'), mockCtx(get))).rejects.toThrow(
      /pastebin "uCLE0msa".*pobbin "uCLE0msa"/
    );
    expect(get).toHaveBeenCalledTimes(2);
  });
});
