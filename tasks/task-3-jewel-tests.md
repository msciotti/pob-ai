# Task 3: Jewel Tests

## Goal
Implement API and tests for jewel socketing in passive tree

## Branch Name
`claude/add-jewel-tests-01PtSjaZ1J2ZfEL1DoxbTfAR`

## Files to Create/Modify
- `scripts/pob-bridge.lua` - Add jewel API functions
- `src/pob/luajit-runtime.ts` - Add TypeScript wrappers
- `src/tests/jewels.test.ts` - New test file

## Research Phase

1. **Find Jewel Data Structure**
   - Search for `jewels` in codebase using Grep
   - Look in `pob-data/src/Classes/PassiveSpec.lua` for jewel handling
   - Search for jewel socket nodes in passive tree
   - Find how `allocNodes` stores jewel socket allocations

2. **Understand Jewel Mechanics**
   - Jewel sockets are special passive nodes
   - Must allocate the socket node before adding jewel
   - Jewels can be regular (generic mods) or Abyss jewels
   - Cluster jewels are more complex (add new passive nodes)

3. **Common Jewel Socket Nodes**
   - Search for nodes with `isJewelSocket = true`
   - Typical jewel socket node IDs to test with
   - How to find allocated jewel sockets

## Implementation Steps

### 1. Add Lua API Functions (`scripts/pob-bridge.lua`)

Add these functions to the `api` table:

```lua
-- Socket a jewel in a passive tree node
function api.socketJewel(params)
  local nodeId = params.nodeId
  local itemText = params.itemText

  if not build or not build.spec then
    return {success = false, error = "Build not initialized"}
  end

  if not nodeId then
    return {success = false, error = "Node ID required"}
  end

  if not itemText then
    return {success = false, error = "Item text required"}
  end

  -- Check if node is allocated
  if not build.spec.allocNodes[nodeId] then
    return {success = false, error = "Node " .. nodeId .. " is not allocated"}
  end

  -- Check if node is a jewel socket
  local node = build.spec.nodes[nodeId]
  if not node or not node.isJewelSocket then
    return {success = false, error = "Node " .. nodeId .. " is not a jewel socket"}
  end

  -- Parse the jewel item
  local item = new("Item", build.targetVersion, itemText)

  if not item or not item.baseName then
    return {success = false, error = "Failed to parse item"}
  end

  -- Verify it's a jewel
  if not item.type or not item.type:match("Jewel") then
    return {success = false, error = "Item is not a jewel"}
  end

  -- Initialize jewels table if needed
  if not build.spec.jewels then
    build.spec.jewels = {}
  end

  -- Socket the jewel
  build.spec.jewels[nodeId] = item

  -- Trigger build recalculation
  if build.calcsTab and build.calcsTab.BuildOutput then
    build.calcsTab:BuildOutput()
  end

  return {
    success = true,
    message = "Jewel socketed at node " .. nodeId,
    jewelName = item.name or item.baseName
  }
end

-- Unsocket a jewel from a node
function api.unsocketJewel(params)
  local nodeId = params.nodeId

  if not build or not build.spec then
    return {success = false, error = "Build not initialized"}
  end

  if not nodeId then
    return {success = false, error = "Node ID required"}
  end

  if build.spec.jewels then
    build.spec.jewels[nodeId] = nil
  end

  -- Trigger build recalculation
  if build.calcsTab and build.calcsTab.BuildOutput then
    build.calcsTab:BuildOutput()
  end

  return {success = true, message = "Jewel removed from node " .. nodeId}
end

-- Get all socketed jewels
function api.getSocketedJewels(params)
  if not build or not build.spec then
    return {success = false, error = "Build not initialized"}
  end

  local jewels = {}

  if build.spec.jewels then
    for nodeId, item in pairs(build.spec.jewels) do
      table.insert(jewels, {
        nodeId = nodeId,
        name = item.name or item.baseName,
        baseName = item.baseName,
        rarity = item.rarity
      })
    end
  end

  return {success = true, jewels = jewels, count = #jewels}
end

-- Get available (allocated) jewel socket nodes
function api.getAvailableJewelSockets(params)
  if not build or not build.spec then
    return {success = false, error = "Build not initialized"}
  end

  local sockets = {}

  for nodeId, _ in pairs(build.spec.allocNodes) do
    local node = build.spec.nodes[nodeId]
    if node and node.isJewelSocket then
      local hasJewel = build.spec.jewels and build.spec.jewels[nodeId] ~= nil
      table.insert(sockets, {
        nodeId = nodeId,
        name = node.name or "Jewel Socket",
        hasJewel = hasJewel
      })
    end
  end

  return {success = true, sockets = sockets, count = #sockets}
end
```

### 2. Add TypeScript Wrappers (`src/pob/luajit-runtime.ts`)

Add these methods to the `LuaJITRuntime` class:

```typescript
/**
 * Socket a jewel in a passive tree node
 * @param nodeId - The passive tree node ID (must be an allocated jewel socket)
 * @param itemText - The jewel item text
 */
async socketJewel(nodeId: number, itemText: string): Promise<void> {
  const response = await this.sendCommand('socketJewel', {
    nodeId,
    itemText,
  });

  if (!response.success) {
    throw new Error(response.error || 'Failed to socket jewel');
  }
  console.log(response.message);
}

/**
 * Remove a jewel from a passive tree node
 */
async unsocketJewel(nodeId: number): Promise<void> {
  const response = await this.sendCommand('unsocketJewel', { nodeId });
  if (!response.success) {
    throw new Error(response.error || 'Failed to unsocket jewel');
  }
  console.log(response.message);
}

/**
 * Get all socketed jewels
 */
async getSocketedJewels(): Promise<Array<{
  nodeId: number;
  name: string;
  baseName: string;
  rarity: string;
}>> {
  const response = await this.sendCommand('getSocketedJewels', {});
  if (!response.success) {
    throw new Error(response.error || 'Failed to get socketed jewels');
  }
  return response.jewels || [];
}

/**
 * Get available (allocated) jewel socket nodes
 */
async getAvailableJewelSockets(): Promise<Array<{
  nodeId: number;
  name: string;
  hasJewel: boolean;
}>> {
  const response = await this.sendCommand('getAvailableJewelSockets', {});
  if (!response.success) {
    throw new Error(response.error || 'Failed to get available jewel sockets');
  }
  return response.sockets || [];
}
```

### 3. Find Jewel Socket Node IDs

Create a debug script to find jewel socket nodes in the test build:

```typescript
// /tmp/find-jewel-sockets.js
import { LuaJITRuntime } from '/home/user/pob-ai/dist/pob/luajit-runtime.js';
import { loadConfig } from '/home/user/pob-ai/dist/config/index.js';
import { getPobPath } from '/home/user/pob-ai/dist/pob/detector.js';
import { readFile } from 'fs/promises';

async function main() {
  const config = await loadConfig();
  const pobPath = await getPobPath(config.pobPath);
  const runtime = new LuaJITRuntime(pobPath);
  await runtime.initialize();

  const buildPath = '/home/user/pob-ai/test-data/sample-build.txt';
  const buildXML = await readFile(buildPath, 'utf-8');
  await runtime.loadBuildFromXML(buildXML, 'Test Build');

  // Find jewel socket nodes
  const resp = await runtime.sendCommand('debugExec', {
    code: `
      local jewelSockets = {}

      -- Find all jewel socket nodes
      for nodeId, node in pairs(build.spec.nodes) do
        if node.isJewelSocket then
          table.insert(jewelSockets, {
            nodeId = nodeId,
            name = node.name or "Jewel Socket",
            allocated = build.spec.allocNodes[nodeId] ~= nil
          })
        end
      end

      return {jewelSockets = jewelSockets, count = #jewelSockets}
    `
  });

  console.log('Jewel sockets found:', JSON.stringify(resp.result, null, 2));

  runtime.destroy();
}

main().catch(console.error);
```

Run this to find node IDs to use in tests, then use those IDs in the tests below.

### 4. Create Test Jewels

```typescript
const DAMAGE_JEWEL = `Rarity: RARE
Crimson Jewel
Viridian Jewel
Requires Level 20
12% increased Fire Damage
10% increased Spell Damage
+15% to Critical Strike Multiplier`;

const LIFE_JEWEL = `Rarity: RARE
Cobalt Jewel
Requires Level 20
+25 to maximum Life
+8% to all Elemental Resistances
12% increased Maximum Life`;

const CRIT_JEWEL = `Rarity: RARE
Crimson Jewel
Requires Level 20
+18% to Global Critical Strike Multiplier
+12% to Critical Strike Chance
15% increased Critical Strike Chance`;
```

### 5. Create Tests (`src/tests/jewels.test.ts`)

```typescript
import { TestSuite } from './test-utils.js';
import { loadTestBuild } from './test-utils.js';

const DAMAGE_JEWEL = `Rarity: RARE
Crimson Jewel
Viridian Jewel
Requires Level 20
12% increased Fire Damage
10% increased Spell Damage
+15% to Critical Strike Multiplier`;

const LIFE_JEWEL = `Rarity: RARE
Cobalt Jewel
Requires Level 20
+25 to maximum Life
+8% to all Elemental Resistances
12% increased Maximum Life`;

const CRIT_JEWEL = `Rarity: RARE
Crimson Jewel
Requires Level 20
+18% to Global Critical Strike Multiplier
+12% to Critical Strike Chance
15% increased Critical Strike Chance`;

// TODO: Update these node IDs after running the find-jewel-sockets script
const JEWEL_SOCKET_1 = 26725; // Example node ID - update with actual
const JEWEL_SOCKET_2 = 36634; // Example node ID - update with actual

export const jewelTests: TestSuite = {
  name: 'Jewels',
  tests: [
    {
      name: 'Can find available jewel sockets',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        const sockets = await runtime.getAvailableJewelSockets();

        if (sockets.length === 0) {
          throw new Error('No jewel sockets found - build may need jewel sockets allocated');
        }

        console.log(`   ✓ Found ${sockets.length} jewel socket(s)`);
      },
    },

    {
      name: 'Socketing damage jewel should increase DPS',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        const sockets = await runtime.getAvailableJewelSockets();
        if (sockets.length === 0) {
          console.log('   ⚠ Skipping - no jewel sockets available');
          return;
        }

        const socketNode = sockets[0].nodeId;

        // Get base DPS
        let stats = await runtime.getBuildStats();
        const baseDPS = stats['TotalDPS'] || 0;

        // Socket damage jewel
        await runtime.socketJewel(socketNode, DAMAGE_JEWEL);

        stats = await runtime.getBuildStats();
        const dpsWithJewel = stats['TotalDPS'] || 0;

        // DPS should increase
        if (dpsWithJewel <= baseDPS) {
          throw new Error(
            `Expected DPS to increase. Base: ${baseDPS}, With jewel: ${dpsWithJewel}`
          );
        }

        const increase = ((dpsWithJewel / baseDPS - 1) * 100).toFixed(2);
        console.log(`   ✓ DPS: ${baseDPS.toFixed(2)} → ${dpsWithJewel.toFixed(2)} (+${increase}%)`);
      },
    },

    {
      name: 'Socketing life jewel should increase max life',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        const sockets = await runtime.getAvailableJewelSockets();
        if (sockets.length === 0) {
          console.log('   ⚠ Skipping - no jewel sockets available');
          return;
        }

        const socketNode = sockets[0].nodeId;

        // Get base life
        let stats = await runtime.getBuildStats();
        const baseLife = stats['Life'] || 0;

        // Socket life jewel
        await runtime.socketJewel(socketNode, LIFE_JEWEL);

        stats = await runtime.getBuildStats();
        const lifeWithJewel = stats['Life'] || 0;

        // Life should increase
        if (lifeWithJewel <= baseLife) {
          throw new Error(
            `Expected life to increase. Base: ${baseLife}, With jewel: ${lifeWithJewel}`
          );
        }

        console.log(`   ✓ Life: ${baseLife} → ${lifeWithJewel} (+${lifeWithJewel - baseLife})`);
      },
    },

    {
      name: 'Unsocketing jewel should remove its bonuses',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        const sockets = await runtime.getAvailableJewelSockets();
        if (sockets.length === 0) {
          console.log('   ⚠ Skipping - no jewel sockets available');
          return;
        }

        const socketNode = sockets[0].nodeId;

        // Get base life
        let stats = await runtime.getBuildStats();
        const baseLife = stats['Life'] || 0;

        // Socket and then unsocket
        await runtime.socketJewel(socketNode, LIFE_JEWEL);
        stats = await runtime.getBuildStats();
        const lifeWith = stats['Life'] || 0;

        await runtime.unsocketJewel(socketNode);
        stats = await runtime.getBuildStats();
        const lifeAfter = stats['Life'] || 0;

        // Should return close to original
        if (Math.abs(lifeAfter - baseLife) > 5) {
          throw new Error(
            `Expected life to return to baseline. Base: ${baseLife}, After: ${lifeAfter}`
          );
        }

        console.log(`   ✓ Life: ${baseLife} → ${lifeWith} → ${lifeAfter}`);
      },
    },

    {
      name: 'Multiple jewels can be socketed',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        const sockets = await runtime.getAvailableJewelSockets();
        if (sockets.length < 2) {
          console.log('   ⚠ Skipping - need at least 2 jewel sockets');
          return;
        }

        // Socket two different jewels
        await runtime.socketJewel(sockets[0].nodeId, DAMAGE_JEWEL);
        await runtime.socketJewel(sockets[1].nodeId, LIFE_JEWEL);

        const socketedJewels = await runtime.getSocketedJewels();

        if (socketedJewels.length !== 2) {
          throw new Error(`Expected 2 socketed jewels, got ${socketedJewels.length}`);
        }

        console.log(`   ✓ Socketed ${socketedJewels.length} jewels`);
      },
    },

    {
      name: 'Cannot socket jewel in unallocated socket',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        // Try to socket in an unallocated node (use a very high ID that won't be allocated)
        const unallocatedNode = 99999;

        let errorThrown = false;
        try {
          await runtime.socketJewel(unallocatedNode, DAMAGE_JEWEL);
        } catch (error) {
          errorThrown = true;
        }

        if (!errorThrown) {
          throw new Error('Expected error when socketing jewel in unallocated node');
        }

        console.log(`   ✓ Correctly prevented socketing in unallocated node`);
      },
    },

    {
      name: 'getSocketedJewels lists all socketed jewels',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        const sockets = await runtime.getAvailableJewelSockets();
        if (sockets.length === 0) {
          console.log('   ⚠ Skipping - no jewel sockets available');
          return;
        }

        // Socket a jewel
        await runtime.socketJewel(sockets[0].nodeId, CRIT_JEWEL);

        const jewels = await runtime.getSocketedJewels();

        if (jewels.length !== 1) {
          throw new Error(`Expected 1 jewel, got ${jewels.length}`);
        }

        const jewel = jewels[0];
        if (jewel.nodeId !== sockets[0].nodeId) {
          throw new Error(`Jewel in wrong socket. Expected ${sockets[0].nodeId}, got ${jewel.nodeId}`);
        }

        console.log(`   ✓ Listed jewel: ${jewel.baseName} at node ${jewel.nodeId}`);
      },
    },
  ],
};
```

### 6. Register Tests

Add to `src/tests/test-runner.ts`:

```typescript
import { jewelTests } from './jewels.test.js';

// In the test suites array:
const testSuites = [
  passiveAllocationTests,
  itemEquipmentTests,
  skillGemTests,
  jewelTests, // Add this
];
```

## Expected Outcome

- 6-8 new passing tests for jewel functionality
- All existing tests (22) still pass
- Total: 28-30 passing tests

## Important Notes

- **Must allocate jewel socket nodes first** - Tests may need to allocate jewel sockets if the test build doesn't have any
- **Find actual node IDs** - Run the find-jewel-sockets script to get real jewel socket node IDs from the test build
- **Tests may need adjustment** - If test build has no jewel sockets, you may need to allocate them first in the test

## Testing

```bash
pnpm build && pnpm test
```

All tests should pass before committing.

## Commit Message Template

```
Add jewel tests and API

Implements jewel socketing management with comprehensive tests:

API Additions (pob-bridge.lua):
- socketJewel(nodeId, itemText) - Socket jewel in passive tree
- unsocketJewel(nodeId) - Remove jewel from socket
- getSocketedJewels() - List all socketed jewels
- getAvailableJewelSockets() - List allocated jewel socket nodes

Runtime Methods (luajit-runtime.ts):
- Jewel socketing in passive tree
- Jewel removal
- Jewel and socket listing

Tests (jewels.test.ts):
1. Find available jewel sockets
2. Damage jewel increases DPS
3. Life jewel increases max life
4. Unsocketing removes bonuses
5. Multiple jewels can be socketed
6. Cannot socket in unallocated node
7. getSocketedJewels lists all jewels

All X tests passing.
```
