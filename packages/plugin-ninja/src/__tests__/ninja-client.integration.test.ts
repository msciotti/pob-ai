/**
 * Integration tests for NinjaClient — hit the real poe.ninja site.
 *
 * Run with:
 *   NINJA_INTEGRATION=true pnpm --filter @poe-ai/plugin-ninja test
 *
 * Skipped by default so CI doesn't depend on poe.ninja availability.
 * These tests are the early-warning system for poe.ninja API changes —
 * poe.ninja has no official API and no versioning guarantees.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { NinjaClient } from '../ninja-client.js';
import { TtlCache, RateLimitedHttpClient } from '@poe-ai/core';
import type { PluginContext } from '@poe-ai/core';

const RUN = process.env.NINJA_INTEGRATION === 'true';

function makeRealCtx(): PluginContext {
  return {
    http: new RateLimitedHttpClient({ minIntervalMs: 1000 }),
    cache: new TtlCache(),
    // Standard is always populated and never wipes, unlike the current
    // temporary league, so it's a stable target for CI-adjacent runs.
    leagueState: { currentLeague: 'Standard', patchVersion: '3.29.3.1.4', hardcore: false, ssf: false },
    logger: { info: console.log, warn: console.warn, error: console.error, debug: () => {} },
  } as any;
}

describe.skipIf(!RUN)('NinjaClient (integration)', () => {
  let client: NinjaClient;

  beforeAll(() => {
    client = new NinjaClient(makeRealCtx());
  });

  it('gets a real Divine Orb price in Standard', async () => {
    const result = await client.getItemPrice('Divine Orb', 'Currency', 'Standard');

    expect(result).not.toBeNull();
    expect(result!.name).toBe('Divine Orb');
    expect(result!.chaosValue).toBeGreaterThan(0);
    expect(result!.divineValue).toBeCloseTo(1); // self-ratio
  });

  it('gets a real unique item price in Standard', async () => {
    const result = await client.getItemPrice("Kaom's Heart", 'UniqueArmour', 'Standard');

    expect(result).not.toBeNull();
    expect(result!.name).toBe("Kaom's Heart");
    expect(result!.chaosValue).toBeGreaterThan(0);
  });

  it('resolves the current temporary league name from index-state and prices an item in it', async () => {
    // The current challenge league's name changes every few months, so
    // discover it live rather than hardcoding it.
    const http = new RateLimitedHttpClient({ minIntervalMs: 1000 });
    const index = await http.get<{ economyLeagues: Array<{ name: string }> }>(
      'https://poe.ninja/poe1/api/data/index-state'
    );
    const currentLeague = index.economyLeagues[0]?.name;
    expect(currentLeague).toBeTruthy();

    // Chaos Orb is the base currency and isn't listed as a priced line
    // itself — Exalted Orb is always tracked and a good stand-in.
    const result = await client.getItemPrice('Exalted Orb', 'Currency', currentLeague!);
    expect(result).not.toBeNull();
    expect(result!.chaosValue).toBeGreaterThan(0);
  });

  it('returns null (not throw) for an item that does not exist', async () => {
    const result = await client.getItemPrice('Definitely Not A Real Item Name', 'Currency', 'Standard');
    expect(result).toBeNull();
  });
});
