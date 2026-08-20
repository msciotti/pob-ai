import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { PluginContext } from '@poe-ai/core';
import { TtlCache } from '@poe-ai/core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, 'fixtures');
const EMPTY_DIR = join(__dirname, 'fixtures-missing');
const ORIGINAL_ENV = process.env.POE_AI_REPOE_DIR;

function makeCtx(): PluginContext {
  return {
    http: { get: vi.fn(), post: vi.fn() },
    cache: new TtlCache(),
    leagueState: { currentLeague: 'Standard', patchVersion: '3.26.0', hardcore: false, ssf: false },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

beforeEach(() => {
  vi.resetModules();
  process.env.POE_AI_REPOE_DIR = FIXTURES_DIR;
});

afterEach(() => {
  if (ORIGINAL_ENV === undefined) {
    delete process.env.POE_AI_REPOE_DIR;
  } else {
    process.env.POE_AI_REPOE_DIR = ORIGINAL_ENV;
  }
});

describe('essenceInfoTool handler', () => {
  it('returns a valid ToolResult shape on success', async () => {
    const { essenceInfoTool } = await import('../tools/essence-info.js');
    const result = await essenceInfoTool.handler(
      { essenceName: 'Whispering Essence of Hatred' },
      makeCtx()
    );

    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0].type).toBe('text');
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.mods.length).toBeGreaterThan(0);
  });

  it('returns isError: true for an essence not found in local data', async () => {
    const { essenceInfoTool } = await import('../tools/essence-info.js');
    const result = await essenceInfoTool.handler({ essenceName: 'Nonexistent Zzz999' }, makeCtx());

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveProperty('error');
  });
});

describe('modLookupTool handler', () => {
  it('returns a valid ToolResult shape on success', async () => {
    const { modLookupTool } = await import('../tools/mod-lookup.js');
    const result = await modLookupTool.handler(
      { query: 'chaos resistance', itemClass: 'ring' },
      makeCtx()
    );

    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0].type).toBe('text');
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.count).toBe(1);
    expect(parsed.mods[0].name).toBe('of Bameth');
  });

  it('returns isError: true with a clear message when the repoe-data directory is missing', async () => {
    process.env.POE_AI_REPOE_DIR = EMPTY_DIR;
    const { modLookupTool } = await import('../tools/mod-lookup.js');
    const result = await modLookupTool.handler(
      { query: 'chaos resistance', itemClass: 'ring' },
      makeCtx()
    );

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toContain('pnpm download-repoe');
  });
});

describe('influencedModsTool handler', () => {
  it('returns a valid ToolResult shape on success', async () => {
    const { influencedModsTool } = await import('../tools/influenced-mods.js');
    const result = await influencedModsTool.handler(
      { influence: 'shaper', itemClass: 'boots' },
      makeCtx()
    );

    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0].type).toBe('text');
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.influence).toBe('shaper');
    expect(parsed.count).toBe(1);
    expect(parsed.mods[0].name).toBe("The Shaper's");
  });

  it('returns isError: true with a clear message when the repoe-data directory is missing', async () => {
    process.env.POE_AI_REPOE_DIR = EMPTY_DIR;
    const { influencedModsTool } = await import('../tools/influenced-mods.js');
    const result = await influencedModsTool.handler(
      { influence: 'shaper', itemClass: 'boots' },
      makeCtx()
    );

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toContain('pnpm download-repoe');
  });
});
