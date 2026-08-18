import { describe, it, expect, vi } from 'vitest';
import NinjaPlugin from '../index.js';
import { TtlCache } from '@poe-ai/core';
import type { PluginContext } from '@poe-ai/core';

function makeCtx(): PluginContext {
  return {
    http: { get: vi.fn(), post: vi.fn() },
    cache: new TtlCache(),
    leagueState: { currentLeague: 'Standard', patchVersion: '3.26.0', hardcore: false, ssf: false },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  } as any;
}

describe('NinjaPlugin shape and lifecycle', () => {
  it('has correct name', () => {
    expect(NinjaPlugin.name).toBe('@poe-ai/plugin-ninja');
  });

  it('has patchCompatibility', () => {
    expect(NinjaPlugin.patchCompatibility).toBe('*');
  });

  it('registers get_item_price tool', () => {
    expect(NinjaPlugin.tools.some((t) => t.name === 'get_item_price')).toBe(true);
  });

  it('initialize() completes without throwing', async () => {
    const ctx = makeCtx();
    await expect(NinjaPlugin.initialize(ctx)).resolves.toBeUndefined();
  });

  it('initialize() logs', async () => {
    const ctx = makeCtx();
    await NinjaPlugin.initialize(ctx);
    expect(ctx.logger.info as ReturnType<typeof vi.fn>).toHaveBeenCalled();
  });
});
