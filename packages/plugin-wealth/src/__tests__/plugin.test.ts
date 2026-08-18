import { describe, it, expect, vi } from 'vitest';
import WealthPlugin from '../index.js';
import type { PluginContext } from '@poe-ai/core';

function makeCtx(): PluginContext {
  return {
    http: { get: vi.fn(), post: vi.fn() },
    cache: { get: vi.fn(), set: vi.fn(), delete: vi.fn(), clear: vi.fn() },
    leagueState: {
      currentLeague: 'Settlers',
      patchVersion: '3.26.0',
      hardcore: false,
      ssf: false,
    },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  } as unknown as PluginContext;
}

describe('WealthPlugin', () => {
  it('has the correct name', () => {
    expect(WealthPlugin.name).toBe('@poe-ai/plugin-wealth');
  });

  it('has the correct version', () => {
    expect(WealthPlugin.version).toBe('0.1.0');
  });

  it('has patchCompatibility set to wildcard', () => {
    expect(WealthPlugin.patchCompatibility).toBe('*');
  });

  it('initialize() resolves without error', async () => {
    const ctx = makeCtx();
    await expect(WealthPlugin.initialize(ctx)).resolves.toBeUndefined();
  });

  it('initialize() warns when credentials are missing', async () => {
    const ctx = makeCtx();
    delete process.env['POE_SESSION_ID'];
    delete process.env['POE_CF_CLEARANCE'];
    await WealthPlugin.initialize(ctx);
    expect(ctx.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('POE_SESSION_ID')
    );
  });

  it('initialize() logs ready when credentials are set', async () => {
    const ctx = makeCtx();
    process.env['POE_SESSION_ID'] = 'test-session';
    process.env['POE_CF_CLEARANCE'] = 'test-clearance';
    await WealthPlugin.initialize(ctx);
    expect(ctx.logger.info).toHaveBeenCalledWith(
      expect.stringContaining('@poe-ai/plugin-wealth')
    );
    delete process.env['POE_SESSION_ID'];
    delete process.env['POE_CF_CLEARANCE'];
  });

  it('tools array contains get_stash_value', () => {
    const names = WealthPlugin.tools.map(t => t.name);
    expect(names).toContain('get_stash_value');
  });
});
