/**
 * Compute which build stats changed between two snapshots.
 *
 * Used by allocate_passive's before/after diff. Originally that diff only
 * checked a fixed subset of stats (KEY_BUILD_STATS), which meant an effect
 * outside that list -- e.g. Resolute Technique zeroing CritChance, its
 * headline effect -- never showed up. This checks every stat PoB reports,
 * so any real change is surfaced regardless of which stat it lands on.
 */

export interface StatChange {
  before: number;
  after: number;
  delta: number;
}

/** Below this absolute delta, a "change" is treated as floating-point noise. */
const DEFAULT_EPSILON = 1e-6;

/** Cap the diff at this many entries so a build with hundreds of tiny shifts
 *  (e.g. reallocating deep in the tree) doesn't dump its entire stat table. */
const DEFAULT_MAX_ENTRIES = 25;

export interface ComputeStatChangesOptions {
  epsilon?: number;
  maxEntries?: number;
}

/**
 * Diff two flat stat snapshots. A stat missing from one snapshot is treated
 * as 0 on that side (PoB can stop reporting a stat entirely rather than
 * reporting it as 0 -- e.g. some crit-related stats -- so this still catches
 * the change either way). Sorted by largest relative change first; a stat
 * that went to/from exactly zero counts as an unbounded (Infinity) relative
 * change, since that's the most qualitatively significant kind of shift.
 */
export function computeStatChanges(
  before: Record<string, number>,
  after: Record<string, number>,
  options: ComputeStatChangesOptions = {}
): Record<string, StatChange> {
  const epsilon = options.epsilon ?? DEFAULT_EPSILON;
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;

  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

  const changes: Array<{ key: string; before: number; after: number; delta: number; relativeChange: number }> = [];

  for (const key of keys) {
    const beforeValue = typeof before[key] === 'number' ? before[key] : 0;
    const afterValue = typeof after[key] === 'number' ? after[key] : 0;
    const delta = afterValue - beforeValue;
    if (Math.abs(delta) <= epsilon) continue;

    // Unbounded in both directions: a stat appearing from nothing (before
    // === 0) is Infinity already since dividing by 0; a stat disappearing
    // TO nothing (after === 0, e.g. Resolute Technique zeroing CritChance)
    // only reaches relativeChange 1 (a 100% decrease) otherwise, which any
    // >100% swing elsewhere would outrank past the cap -- so treat that
    // case as Infinity too, matching "went to/from zero" above.
    const relativeChange = beforeValue === 0 || afterValue === 0 ? Infinity : Math.abs(delta / beforeValue);
    changes.push({ key, before: beforeValue, after: afterValue, delta, relativeChange });
  }

  changes.sort((a, b) => {
    if (b.relativeChange !== a.relativeChange) return b.relativeChange - a.relativeChange;
    return Math.abs(b.delta) - Math.abs(a.delta);
  });

  const result: Record<string, StatChange> = {};
  for (const { key, before: b, after: a, delta } of changes.slice(0, maxEntries)) {
    result[key] = { before: b, after: a, delta };
  }
  return result;
}
