/**
 * Build Summary Tests
 *
 * Tests for the runtime methods consumed by the get_build_summary tool:
 * getBuildMeta, getAllocatedNodes, getSocketGroups, getEquippedItems.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initializeRuntime, loadTestBuild } from './test-utils.js';
import type { LuaJITRuntime } from '../runtime/luajit-runtime.js';

describe('Build Summary runtime methods', () => {
  let runtime: LuaJITRuntime;

  beforeAll(async () => {
    runtime = await initializeRuntime();
    // Load once for the whole suite — individual tests don't mutate meta-level state
    await loadTestBuild(runtime);
  });

  afterAll(async () => {
    await runtime.destroy();
  });

  it('getBuildMeta returns expected shape', async () => {
    const meta = await runtime.getBuildMeta();

    expect(typeof meta.characterLevel).toBe('number');
    expect(meta.characterLevel).toBeGreaterThan(0);

    expect(typeof meta.bandit).toBe('string');
    expect(typeof meta.pantheonMajorGod).toBe('string');
    expect(typeof meta.pantheonMinorGod).toBe('string');

    console.log(
      `   Level: ${meta.characterLevel}, Bandit: ${meta.bandit}, ` +
      `Major: ${meta.pantheonMajorGod}, Minor: ${meta.pantheonMinorGod}`
    );
  });

  it('getAllocatedNodes returns array of node objects', async () => {
    const nodes = await runtime.getAllocatedNodes();

    expect(Array.isArray(nodes)).toBe(true);

    // Every node must have id, name, type
    for (const node of nodes) {
      expect(typeof node.id).toBe('string');
      expect(typeof node.name).toBe('string');
      expect(typeof node.type).toBe('string');
    }

    console.log(`   Allocated nodes: ${nodes.length}`);
  });

  it('getSocketGroups returns array of groups with gem arrays', async () => {
    // Ensure there's at least one socket group to inspect
    await runtime.addSocketGroup('Summary Test', [{ name: 'Fireball', level: 20, quality: 0 }]);

    const groups = await runtime.getSocketGroups();

    expect(Array.isArray(groups)).toBe(true);
    expect(groups.length).toBeGreaterThan(0);

    for (const group of groups) {
      expect(Array.isArray(group.gems)).toBe(true);

      for (const gem of group.gems) {
        expect(typeof gem.name).toBe('string');
        expect(typeof gem.level).toBe('number');
        expect(typeof gem.quality).toBe('number');
        expect(typeof gem.enabled).toBe('boolean');
      }
    }

    console.log(
      `   Socket groups: ${groups.length}, first group gems: ${groups[0].gems.length}`
    );
  });

  it('getEquippedItems returns array with slot, name, rarity', async () => {
    // Equip an item so there's something to inspect
    await runtime.equipItem(
      `Kaom's Heart\nGlorious Plate\nUnique\nHas no Sockets\n+1000 to maximum Life`,
      'Body Armour'
    );

    const items = await runtime.getEquippedItems();

    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(0);

    for (const item of items) {
      expect(typeof item.slot).toBe('string');
      expect(typeof item.name).toBe('string');
      expect(typeof item.rarity).toBe('string');
    }

    const bodyArmour = items.find(i => i.slot === 'Body Armour');
    expect(bodyArmour).toBeDefined();
    expect(bodyArmour!.name).toContain("Kaom");

    console.log(`   Equipped items: ${items.length}`);
  });
});
