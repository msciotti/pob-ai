/**
 * Unit tests for computeStatChanges — pure function, no LuaJIT/PoB build
 * required. Lives alongside the runtime integration tests (this package's
 * vitest config only includes src/tests/**\/*.test.ts) but runs instantly.
 */
import { describe, it, expect } from 'vitest';
import { computeStatChanges } from '../tools/stat-diff.js';

describe('computeStatChanges', () => {
  it('includes any stat that changed, not a fixed subset', () => {
    // The regression case from issue #64: CritChance isn't in any curated
    // "key stats" list, but must show up when it changes.
    const before = { Life: 1000, CritChance: 25, TotalDPS: 50000 };
    const after = { Life: 1000, CritChance: 0, TotalDPS: 48000 };

    const changes = computeStatChanges(before, after);

    expect(changes.CritChance).toEqual({ before: 25, after: 0, delta: -25 });
    expect(changes.TotalDPS).toEqual({ before: 50000, after: 48000, delta: -2000 });
    expect(changes.Life).toBeUndefined(); // unchanged
  });

  it('ignores changes smaller than epsilon (floating-point noise)', () => {
    const before = { Life: 1000.00000001 };
    const after = { Life: 1000.00000002 };

    const changes = computeStatChanges(before, after);

    expect(changes).toEqual({});
  });

  it('respects a custom epsilon', () => {
    const before = { Life: 1000 };
    const after = { Life: 1000.01 };

    expect(computeStatChanges(before, after, { epsilon: 0.1 })).toEqual({});
    expect(computeStatChanges(before, after, { epsilon: 0.001 })).toHaveProperty('Life');
  });

  it('treats a stat missing from one snapshot as 0 on that side', () => {
    // Some stats can disappear entirely (not just report 0) when a mechanic
    // is disabled -- e.g. PoB may stop reporting crit-related stats at all
    // once Resolute Technique is allocated, rather than reporting them as 0.
    const before = { EnergyShield: 500 };
    const after = {}; // EnergyShield gone entirely

    const changes = computeStatChanges(before, after);

    expect(changes.EnergyShield).toEqual({ before: 500, after: 0, delta: -500 });
  });

  it('treats a stat appearing from nothing the same way', () => {
    const before = {};
    const after = { Ward: 200 };

    const changes = computeStatChanges(before, after);

    expect(changes.Ward).toEqual({ before: 0, after: 200, delta: 200 });
  });

  it('sorts by largest relative change first, zero-crossing treated as unbounded', () => {
    const before = { A: 100, B: 10, C: 5 };
    const after = { A: 110, B: 15, C: 0 }; // A: +10%, B: +50%, C: -100% (to zero)

    const changes = computeStatChanges(before, after);
    const order = Object.keys(changes);

    // C goes to exactly zero -> Infinity relative change -> sorts first.
    expect(order[0]).toBe('C');
    expect(order[1]).toBe('B'); // +50% > +10%
    expect(order[2]).toBe('A');
  });

  it('caps the result at maxEntries, keeping the largest relative changes', () => {
    const before: Record<string, number> = {};
    const after: Record<string, number> = {};
    for (let i = 0; i < 40; i++) {
      before[`Stat${i}`] = 100;
      // Stat0 changes the most (10x), Stat39 the least (~0.03%)
      after[`Stat${i}`] = 100 + (40 - i);
    }

    const changes = computeStatChanges(before, after, { maxEntries: 25 });

    expect(Object.keys(changes)).toHaveLength(25);
    expect(changes.Stat0).toBeDefined(); // largest relative change, must survive the cap
    expect(changes.Stat39).toBeUndefined(); // smallest, should be dropped
  });

  it('defaults maxEntries to 25', () => {
    const before: Record<string, number> = {};
    const after: Record<string, number> = {};
    for (let i = 0; i < 100; i++) {
      before[`Stat${i}`] = 1;
      after[`Stat${i}`] = 2;
    }

    expect(Object.keys(computeStatChanges(before, after))).toHaveLength(25);
  });

  it('returns an empty object when nothing changed', () => {
    const stats = { Life: 1000, Mana: 100 };
    expect(computeStatChanges(stats, { ...stats })).toEqual({});
  });

  it('ignores non-numeric values on either side', () => {
    const before = { Life: 1000 } as unknown as Record<string, number>;
    const after = { Life: 1000, Note: 'not a number' } as unknown as Record<string, number>;

    const changes = computeStatChanges(before, after);

    expect(changes).toEqual({});
  });
});
