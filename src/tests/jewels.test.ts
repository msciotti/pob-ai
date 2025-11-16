/**
 * Jewel Tests
 *
 * Tests jewel socketing in passive tree.
 */
import { TestSuite, loadTestBuild } from './test-utils.js';

// Example jewels for testing
const LIFE_JEWEL = `Jewel
Cobalt Jewel
+(20-30) to maximum Life
(4-6)% increased maximum Life`;

const DAMAGE_JEWEL = `Jewel
Crimson Jewel
(10-15)% increased Physical Damage
(10-15)% increased Fire Damage`;

const STAT_JEWEL = `Brawn
Crimson Jewel
6% increased Dexterity
6% increased Strength
15% reduced Intelligence`;

export const jewelTests: TestSuite = {
  name: 'Jewels',
  tests: [
    {
      name: 'Finding available jewel sockets',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        // Get initial jewel sockets (should be none since no jewel socket nodes allocated)
        let sockets = await runtime.getAvailableJewelSockets();
        const initialCount = sockets.length;

        // Allocate a jewel socket node
        // Need to find a jewel socket node that's close to the starting area
        // We'll use the API to try to allocate common jewel socket node names
        const commonJewelSockets = [
          'Jewel Socket',
          'Socket',
        ];

        let allocatedSocket = false;
        for (const socketName of commonJewelSockets) {
          try {
            await runtime.allocatePassive(socketName);
            allocatedSocket = true;
            break;
          } catch (err) {
            // Try next one
            continue;
          }
        }

        if (!allocatedSocket) {
          console.log(`   ⚠ No jewel sockets found near starting location`);
          return;
        }

        // Check for jewel sockets again
        sockets = await runtime.getAvailableJewelSockets();
        const afterCount = sockets.length;

        if (afterCount <= initialCount) {
          throw new Error(`Expected more jewel sockets after allocation. Initial: ${initialCount}, After: ${afterCount}`);
        }

        console.log(`   ✓ Jewel sockets found: ${initialCount} → ${afterCount}`);
      },
    },
    {
      name: 'Socketing and unsocketing a jewel',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        // Allocate a jewel socket
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
          } catch (err) {
            continue;
          }
        }

        if (!socketNodeId) {
          console.log(`   ⚠ No jewel sockets available to test`);
          return;
        }

        // Socket a jewel
        const result = await runtime.socketJewel(socketNodeId, LIFE_JEWEL);
        console.log(`   ✓ Socketed jewel: ${result.jewelName}`);

        // Verify it's socketed
        let socketed = await runtime.getSocketedJewels();
        if (socketed.length !== 1) {
          throw new Error(`Expected 1 socketed jewel, got ${socketed.length}`);
        }

        // Unsocket the jewel
        await runtime.unsocketJewel(socketNodeId);

        // Verify it's unsocketed
        socketed = await runtime.getSocketedJewels();
        if (socketed.length !== 0) {
          throw new Error(`Expected 0 socketed jewels after unsocketing, got ${socketed.length}`);
        }

        console.log(`   ✓ Unsocketed jewel successfully`);
      },
    },
    {
      name: 'Jewel affects character stats',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        // Allocate a jewel socket
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
          } catch (err) {
            continue;
          }
        }

        if (!socketNodeId) {
          console.log(`   ⚠ No jewel sockets available to test`);
          return;
        }

        // Get stats before jewel
        let stats = await runtime.getBuildStats();
        const lifeBefore = stats['Life'] || 0;

        // Socket life jewel
        await runtime.socketJewel(socketNodeId, LIFE_JEWEL);

        // Get stats after jewel
        stats = await runtime.getBuildStats();
        const lifeAfter = stats['Life'] || 0;

        if (lifeAfter <= lifeBefore) {
          throw new Error(
            `Expected life jewel to increase life. Before: ${lifeBefore}, After: ${lifeAfter}`
          );
        }

        console.log(`   ✓ Jewel increased life: ${lifeBefore} → ${lifeAfter} (+${lifeAfter - lifeBefore})`);
      },
    },
    {
      name: 'Multiple jewels can be socketed',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        // Try to allocate multiple jewel sockets
        const commonJewelSockets = ['Jewel Socket', 'Socket'];
        const allocatedSockets: number[] = [];

        for (const socketName of commonJewelSockets) {
          try {
            await runtime.allocatePassive(socketName);
          } catch (err) {
            // Socket might not be reachable, continue
          }
        }

        // Get available sockets
        const sockets = await runtime.getAvailableJewelSockets();
        if (sockets.length < 2) {
          console.log(`   ⚠ Need at least 2 jewel sockets, only found ${sockets.length}`);
          return;
        }

        // Socket jewels into first 2 sockets
        await runtime.socketJewel(sockets[0].nodeId, LIFE_JEWEL);
        await runtime.socketJewel(sockets[1].nodeId, DAMAGE_JEWEL);

        // Verify both are socketed
        const socketed = await runtime.getSocketedJewels();
        if (socketed.length !== 2) {
          throw new Error(`Expected 2 socketed jewels, got ${socketed.length}`);
        }

        console.log(`   ✓ Multiple jewels socketed: ${socketed.map(j => j.jewelName).join(', ')}`);
      },
    },
  ],
};
