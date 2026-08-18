/**
 * Compare Builds Tests
 *
 * Tests for the compareBuilds runtime method introduced with the
 * compare_builds tool. Tests run at the runtime level (not the tool handler)
 * to keep them independent of MCP plumbing.
 *
 * The comparison build is fetched from pastebin, so network tests are guarded
 * by the SKIP_NETWORK_TESTS env var for offline / CI environments.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initializeRuntime, loadTestBuild } from './test-utils.js';
import type { LuaJITRuntime } from '../runtime/luajit-runtime.js';

// Known-good pastebin code (also listed in test-data/pastebin-codes.txt)
const COMPARE_PASTEBIN_CODE = 'uCLE0msa';

describe('compareBuilds', () => {
  let runtime: LuaJITRuntime;

  beforeAll(async () => {
    runtime = await initializeRuntime();
  });

  afterAll(async () => {
    await runtime.destroy();
  });

  it.skipIf(!!process.env['SKIP_NETWORK_TESTS'])(
    'compareBuilds returns the correct shape',
    async () => {
      await loadTestBuild(runtime);

      // Fetch the raw build code from pastebin
      const response = await fetch(`https://pastebin.com/raw/${COMPARE_PASTEBIN_CODE}`);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch comparison build from pastebin (${response.status}). ` +
          `Set SKIP_NETWORK_TESTS=1 to skip this test.`
        );
      }
      const rawCode = await response.text();

      const result = await runtime.compareBuilds(rawCode, 'Test Comparison');

      // Top-level shape
      expect(result).toHaveProperty('primary');
      expect(result).toHaveProperty('compare');
      expect(result).toHaveProperty('primaryReplaced');

      // primaryReplaced must be true — the primary build is swapped out
      expect(result.primaryReplaced).toBe(true);

      // BuildProfile shape for primary
      const primary = result.primary;
      expect(primary).toHaveProperty('stats');
      expect(primary).toHaveProperty('keystones');
      expect(primary).toHaveProperty('notables');
      expect(primary).toHaveProperty('uniqueItems');
      expect(primary).toHaveProperty('mainSkill');

      expect(typeof primary.stats).toBe('object');
      expect(Array.isArray(primary.keystones)).toBe(true);
      expect(Array.isArray(primary.notables)).toBe(true);
      expect(Array.isArray(primary.uniqueItems)).toBe(true);

      // stats values should be numbers
      for (const [, v] of Object.entries(primary.stats)) {
        expect(typeof v).toBe('number');
      }

      // keystones and notables should be sorted strings
      const keystonesCopy = [...primary.keystones].sort();
      expect(primary.keystones).toEqual(keystonesCopy);

      const notablesCopy = [...primary.notables].sort();
      expect(primary.notables).toEqual(notablesCopy);

      // uniqueItems entries have slot + name
      for (const item of primary.uniqueItems) {
        expect(typeof item.slot).toBe('string');
        expect(typeof item.name).toBe('string');
      }

      // mainSkill is either null or has label + gems
      if (primary.mainSkill !== null) {
        expect(typeof primary.mainSkill.label).toBe('string');
        expect(Array.isArray(primary.mainSkill.gems)).toBe(true);
      }

      // BuildProfile shape for compare (same rules)
      const compare = result.compare;
      expect(compare).toHaveProperty('stats');
      expect(compare).toHaveProperty('keystones');
      expect(compare).toHaveProperty('notables');
      expect(compare).toHaveProperty('uniqueItems');
      expect(compare).toHaveProperty('mainSkill');

      console.log(
        `   primary keystones: ${primary.keystones.length}, ` +
        `compare keystones: ${compare.keystones.length}`
      );
    }
  );
});
