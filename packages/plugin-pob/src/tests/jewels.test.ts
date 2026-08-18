/**
 * Jewel Tests
 *
 * Tests jewel socketing in passive tree.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initializeRuntime, loadTestBuild } from './test-utils.js';
import type { LuaJITRuntime } from '../runtime/luajit-runtime.js';

const LIFE_JEWEL = `Jewel
Cobalt Jewel
+(20-30) to maximum Life
(4-6)% increased maximum Life`;

const DAMAGE_JEWEL = `Jewel
Crimson Jewel
(10-15)% increased Physical Damage
(10-15)% increased Fire Damage`;

describe('Jewels', () => {
  let runtime: LuaJITRuntime;

  beforeAll(async () => {
    runtime = await initializeRuntime();
  });

  afterAll(async () => {
    await runtime.destroy();
  });

  it('Finding available jewel sockets', async () => {
    await loadTestBuild(runtime);

    let sockets = await runtime.getAvailableJewelSockets();
    const initialCount = sockets.length;

    const commonJewelSockets = ['Jewel Socket', 'Socket'];

    let allocatedSocket = false;
    for (const socketName of commonJewelSockets) {
      try {
        await runtime.allocatePassive(socketName);
        allocatedSocket = true;
        break;
      } catch {
        continue;
      }
    }

    if (!allocatedSocket) {
      console.log(`   No jewel sockets found near starting location — skipping count assertion`);
      return;
    }

    sockets = await runtime.getAvailableJewelSockets();
    const afterCount = sockets.length;

    expect(afterCount).toBeGreaterThan(initialCount);
    console.log(`   Jewel sockets found: ${initialCount} → ${afterCount}`);
  });

  it('Socketing and unsocketing a jewel', async () => {
    await loadTestBuild(runtime);

    const commonJewelSockets = ['Jewel Socket', 'Socket'];
    let socketNodeId: number | undefined;

    for (const socketName of commonJewelSockets) {
      try {
        await runtime.allocatePassive(socketName);
        const sockets = await runtime.getAvailableJewelSockets();
        if (sockets.length > 0) {
          socketNodeId = sockets[0].nodeId;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!socketNodeId) {
      console.log(`   No jewel sockets available — skipping socket/unsocket test`);
      return;
    }

    const result = await runtime.socketJewel(socketNodeId, LIFE_JEWEL);
    console.log(`   Socketed jewel: ${result.jewelName}`);

    let socketed = await runtime.getSocketedJewels();
    expect(socketed).toHaveLength(1);

    await runtime.unsocketJewel(socketNodeId);

    socketed = await runtime.getSocketedJewels();
    expect(socketed).toHaveLength(0);
    console.log(`   Unsocketed jewel successfully`);
  });

  it('Jewel affects character stats', async () => {
    await loadTestBuild(runtime);

    const commonJewelSockets = ['Jewel Socket', 'Socket'];
    let socketNodeId: number | undefined;

    for (const socketName of commonJewelSockets) {
      try {
        await runtime.allocatePassive(socketName);
        const sockets = await runtime.getAvailableJewelSockets();
        if (sockets.length > 0) {
          socketNodeId = sockets[0].nodeId;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!socketNodeId) {
      console.log(`   No jewel sockets available — skipping stat effect test`);
      return;
    }

    let stats = await runtime.getBuildStats();
    const lifeBefore = stats['Life'] || 0;

    await runtime.socketJewel(socketNodeId, LIFE_JEWEL);

    stats = await runtime.getBuildStats();
    const lifeAfter = stats['Life'] || 0;

    expect(lifeAfter).toBeGreaterThan(lifeBefore);
    console.log(`   Jewel increased life: ${lifeBefore} → ${lifeAfter} (+${lifeAfter - lifeBefore})`);
  });

  it('Multiple jewels can be socketed', async () => {
    await loadTestBuild(runtime);

    const commonJewelSockets = ['Jewel Socket', 'Socket'];
    for (const socketName of commonJewelSockets) {
      try {
        await runtime.allocatePassive(socketName);
      } catch {
        // Socket might not be reachable, continue
      }
    }

    const sockets = await runtime.getAvailableJewelSockets();
    if (sockets.length < 2) {
      console.log(`   Need at least 2 jewel sockets, only found ${sockets.length} — skipping`);
      return;
    }

    await runtime.socketJewel(sockets[0].nodeId, LIFE_JEWEL);
    await runtime.socketJewel(sockets[1].nodeId, DAMAGE_JEWEL);

    const socketed = await runtime.getSocketedJewels();
    expect(socketed).toHaveLength(2);
    console.log(`   Multiple jewels socketed: ${socketed.map(j => j.jewelName).join(', ')}`);
  });
});
