# Task 2: Flask Tests

## Goal
Implement API and tests for flask equipment and activation

## Branch Name
`claude/add-flask-tests-01PtSjaZ1J2ZfEL1DoxbTfAR`

## Files to Create/Modify
- `scripts/pob-bridge.lua` - Add flask API functions
- `src/pob/luajit-runtime.ts` - Add TypeScript wrappers
- `src/tests/flasks.test.ts` - New test file

## Research Phase

1. **Find Flask Data Structure**
   - Search for `flaskList` in codebase using Grep
   - Look in `pob-data/src/Classes/ItemsTab.lua` for flask handling
   - Search for how flasks are different from regular items
   - Find flask slot numbers (typically 1-5)

2. **Understand Flask Mechanics**
   - Find how `flask.active` or similar enables flask effects
   - Look for `includeInFullDPS` for flasks
   - Understand flask item format in PoB XML
   - Find how flask suffixes/prefixes work (e.g., "of Heat")

3. **Common Flask Types**
   - Utility flasks: Diamond (crit), Granite (armour), Quicksilver (speed)
   - Life/Mana flasks
   - Unique flasks: Dying Sun, Bottled Faith, etc.

## Implementation Steps

### 1. Add Lua API Functions (`scripts/pob-bridge.lua`)

Add these functions to the `api` table:

```lua
-- Add/equip a flask
function api.addFlask(params)
  local slot = params.slot
  local itemText = params.itemText

  if not build or not build.itemsTab then
    return {success = false, error = "Build not initialized"}
  end

  if not slot or slot < 1 or slot > 5 then
    return {success = false, error = "Flask slot must be between 1 and 5"}
  end

  if not itemText then
    return {success = false, error = "Item text required"}
  end

  -- Parse the item
  local item = new("Item", build.targetVersion, itemText)

  if not item or not item.baseName then
    return {success = false, error = "Failed to parse item"}
  end

  -- Verify it's a flask
  if not item.type or not item.type:match("Flask") then
    return {success = false, error = "Item is not a flask"}
  end

  -- Initialize flask list if needed
  if not build.itemsTab.flaskList then
    build.itemsTab.flaskList = {}
  end

  -- Add to flask list
  build.itemsTab.flaskList[slot] = item

  -- Set flask as active by default
  if not build.itemsTab.activeFlaskList then
    build.itemsTab.activeFlaskList = {}
  end
  build.itemsTab.activeFlaskList[slot] = true

  -- Trigger build recalculation
  if build.calcsTab and build.calcsTab.BuildOutput then
    build.calcsTab:BuildOutput()
  end

  return {
    success = true,
    message = "Flask equipped in slot " .. slot,
    flaskName = item.name or item.baseName
  }
end

-- Remove a flask
function api.removeFlask(params)
  local slot = params.slot

  if not build or not build.itemsTab then
    return {success = false, error = "Build not initialized"}
  end

  if not slot or slot < 1 or slot > 5 then
    return {success = false, error = "Flask slot must be between 1 and 5"}
  end

  if build.itemsTab.flaskList then
    build.itemsTab.flaskList[slot] = nil
  end

  if build.itemsTab.activeFlaskList then
    build.itemsTab.activeFlaskList[slot] = nil
  end

  -- Trigger build recalculation
  if build.calcsTab and build.calcsTab.BuildOutput then
    build.calcsTab:BuildOutput()
  end

  return {success = true, message = "Flask removed from slot " .. slot}
end

-- Set flask active/inactive
function api.setFlaskActive(params)
  local slot = params.slot
  local active = params.active

  if not build or not build.itemsTab then
    return {success = false, error = "Build not initialized"}
  end

  if not slot or slot < 1 or slot > 5 then
    return {success = false, error = "Flask slot must be between 1 and 5"}
  end

  if not build.itemsTab.flaskList or not build.itemsTab.flaskList[slot] then
    return {success = false, error = "No flask in slot " .. slot}
  end

  if not build.itemsTab.activeFlaskList then
    build.itemsTab.activeFlaskList = {}
  end

  build.itemsTab.activeFlaskList[slot] = active

  -- Trigger build recalculation
  if build.calcsTab and build.calcsTab.BuildOutput then
    build.calcsTab:BuildOutput()
  end

  return {
    success = true,
    message = "Flask " .. (active and "activated" or "deactivated") .. " in slot " .. slot
  }
end

-- Get all flasks
function api.getFlasks(params)
  if not build or not build.itemsTab then
    return {success = false, error = "Build not initialized"}
  end

  local flasks = {}

  if build.itemsTab.flaskList then
    for slot = 1, 5 do
      local flask = build.itemsTab.flaskList[slot]
      if flask then
        local isActive = build.itemsTab.activeFlaskList and build.itemsTab.activeFlaskList[slot] or false
        table.insert(flasks, {
          slot = slot,
          name = flask.name or flask.baseName,
          baseName = flask.baseName,
          rarity = flask.rarity,
          active = isActive
        })
      end
    end
  end

  return {success = true, flasks = flasks, count = #flasks}
end
```

### 2. Add TypeScript Wrappers (`src/pob/luajit-runtime.ts`)

Add these methods to the `LuaJITRuntime` class:

```typescript
/**
 * Equip a flask in a specific slot (1-5)
 */
async addFlask(slot: number, itemText: string): Promise<void> {
  const response = await this.sendCommand('addFlask', {
    slot,
    itemText,
  });

  if (!response.success) {
    throw new Error(response.error || 'Failed to add flask');
  }
  console.log(response.message);
}

/**
 * Remove a flask from a slot
 */
async removeFlask(slot: number): Promise<void> {
  const response = await this.sendCommand('removeFlask', { slot });
  if (!response.success) {
    throw new Error(response.error || 'Failed to remove flask');
  }
  console.log(response.message);
}

/**
 * Set whether a flask is active (effects enabled)
 */
async setFlaskActive(slot: number, active: boolean): Promise<void> {
  const response = await this.sendCommand('setFlaskActive', { slot, active });
  if (!response.success) {
    throw new Error(response.error || 'Failed to set flask active state');
  }
  console.log(response.message);
}

/**
 * Get all equipped flasks and their states
 */
async getFlasks(): Promise<Array<{
  slot: number;
  name: string;
  baseName: string;
  rarity: string;
  active: boolean;
}>> {
  const response = await this.sendCommand('getFlasks', {});
  if (!response.success) {
    throw new Error(response.error || 'Failed to get flasks');
  }
  return response.flasks || [];
}
```

### 3. Create Test Flasks

Create test flask item texts (you can put these directly in the test file or in separate files):

```typescript
const DIAMOND_FLASK = `Rarity: MAGIC
Diamond Flask of the Order
Requires Level 27
+35% to Critical Strike Chance
15% increased Attack Speed during Flask effect
15% increased Cast Speed during Flask effect`;

const GRANITE_FLASK = `Rarity: MAGIC
Granite Flask of Iron Skin
Requires Level 27
+3000 to Armour
25% increased Armour during Flask effect`;

const QUICKSILVER_FLASK = `Rarity: NORMAL
Quicksilver Flask
Requires Level 4
40% increased Movement Speed`;
```

### 4. Create Tests (`src/tests/flasks.test.ts`)

```typescript
import { TestSuite } from './test-utils.js';
import { loadTestBuild } from './test-utils.js';

const DIAMOND_FLASK = `Rarity: MAGIC
Diamond Flask of the Order
Requires Level 27
+35% to Critical Strike Chance
15% increased Attack Speed during Flask effect
15% increased Cast Speed during Flask effect`;

const GRANITE_FLASK = `Rarity: MAGIC
Granite Flask of Iron Skin
Requires Level 27
+3000 to Armour
25% increased Armour during Flask effect`;

const QUICKSILVER_FLASK = `Rarity: NORMAL
Quicksilver Flask
Requires Level 4
40% increased Movement Speed`;

export const flaskTests: TestSuite = {
  name: 'Flasks',
  tests: [
    {
      name: 'Equipping diamond flask should increase crit chance when active',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        // Get base crit
        let stats = await runtime.getBuildStats();
        const baseCrit = stats['CritChance'] || 0;

        // Equip and activate diamond flask
        await runtime.addFlask(1, DIAMOND_FLASK);

        stats = await runtime.getBuildStats();
        const critWithFlask = stats['CritChance'] || 0;

        // Diamond flask should increase crit chance
        if (critWithFlask <= baseCrit) {
          throw new Error(
            `Expected diamond flask to increase crit. Base: ${baseCrit}%, With flask: ${critWithFlask}%`
          );
        }

        console.log(`   ✓ Crit chance: ${baseCrit}% → ${critWithFlask}%`);
      },
    },

    {
      name: 'Disabling flask should remove its bonuses',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        // Equip diamond flask (active by default)
        await runtime.addFlask(1, DIAMOND_FLASK);

        let stats = await runtime.getBuildStats();
        const critActive = stats['CritChance'] || 0;

        // Deactivate flask
        await runtime.setFlaskActive(1, false);

        stats = await runtime.getBuildStats();
        const critInactive = stats['CritChance'] || 0;

        // Crit should decrease when flask is disabled
        if (critInactive >= critActive) {
          throw new Error(
            `Expected crit to decrease when flask disabled. Active: ${critActive}%, Inactive: ${critInactive}%`
          );
        }

        console.log(`   ✓ Crit with flask: ${critActive}%, without: ${critInactive}%`);
      },
    },

    {
      name: 'Granite flask should increase armour rating',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        let stats = await runtime.getBuildStats();
        const baseArmour = stats['Armour'] || 0;

        // Equip granite flask
        await runtime.addFlask(2, GRANITE_FLASK);

        stats = await runtime.getBuildStats();
        const armourWithFlask = stats['Armour'] || 0;

        // Should gain significant armour
        if (armourWithFlask <= baseArmour + 1000) {
          throw new Error(
            `Expected granite flask to add significant armour. Base: ${baseArmour}, With flask: ${armourWithFlask}`
          );
        }

        console.log(`   ✓ Armour: ${baseArmour} → ${armourWithFlask} (+${armourWithFlask - baseArmour})`);
      },
    },

    {
      name: 'Multiple flasks can be active simultaneously',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        // Get base stats
        let stats = await runtime.getBuildStats();
        const baseCrit = stats['CritChance'] || 0;
        const baseArmour = stats['Armour'] || 0;

        // Equip multiple flasks
        await runtime.addFlask(1, DIAMOND_FLASK);
        await runtime.addFlask(2, GRANITE_FLASK);

        stats = await runtime.getBuildStats();
        const critWithFlasks = stats['CritChance'] || 0;
        const armourWithFlasks = stats['Armour'] || 0;

        // Both should be increased
        if (critWithFlasks <= baseCrit) {
          throw new Error('Diamond flask effect not applied');
        }
        if (armourWithFlasks <= baseArmour + 1000) {
          throw new Error('Granite flask effect not applied');
        }

        console.log(`   ✓ Multiple flasks active: Crit ${baseCrit}%→${critWithFlasks}%, Armour ${baseArmour}→${armourWithFlasks}`);
      },
    },

    {
      name: 'Removing flask should remove all bonuses',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        // Equip granite flask
        await runtime.addFlask(1, GRANITE_FLASK);

        let stats = await runtime.getBuildStats();
        const armourWith = stats['Armour'] || 0;

        // Remove flask
        await runtime.removeFlask(1);

        stats = await runtime.getBuildStats();
        const armourWithout = stats['Armour'] || 0;

        // Armour should drop significantly
        if (armourWithout >= armourWith - 1000) {
          throw new Error(
            `Expected armour to drop after removing flask. With: ${armourWith}, Without: ${armourWithout}`
          );
        }

        console.log(`   ✓ Armour with flask: ${armourWith}, after removal: ${armourWithout}`);
      },
    },

    {
      name: 'getFlasks should list all equipped flasks',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        // Equip multiple flasks
        await runtime.addFlask(1, DIAMOND_FLASK);
        await runtime.addFlask(3, GRANITE_FLASK);

        const flasks = await runtime.getFlasks();

        if (flasks.length !== 2) {
          throw new Error(`Expected 2 flasks, got ${flasks.length}`);
        }

        const diamond = flasks.find(f => f.slot === 1);
        const granite = flasks.find(f => f.slot === 3);

        if (!diamond || !granite) {
          throw new Error('Flasks not found in correct slots');
        }

        if (!diamond.active || !granite.active) {
          throw new Error('Flasks should be active by default');
        }

        console.log(`   ✓ Listed ${flasks.length} flasks: ${diamond.baseName}, ${granite.baseName}`);
      },
    },
  ],
};
```

### 5. Register Tests

Add to `src/tests/test-runner.ts`:

```typescript
import { flaskTests } from './flasks.test.js';

// In the test suites array:
const testSuites = [
  passiveAllocationTests,
  itemEquipmentTests,
  skillGemTests,
  flaskTests, // Add this
];
```

## Expected Outcome

- 6-8 new passing tests for flask functionality
- All existing tests (22) still pass
- Total: 28-30 passing tests

## Testing

```bash
pnpm build && pnpm test
```

All tests should pass before committing.

## Commit Message Template

```
Add flask tests and API

Implements flask equipment and activation management with comprehensive tests:

API Additions (pob-bridge.lua):
- addFlask(slot, itemText) - Equip flask in slots 1-5
- removeFlask(slot) - Remove flask from slot
- setFlaskActive(slot, active) - Enable/disable flask effects
- getFlasks() - List all equipped flasks and states

Runtime Methods (luajit-runtime.ts):
- Flask equipment management
- Flask activation toggling
- Flask listing with active states

Tests (flasks.test.ts):
1. Diamond flask increases crit chance when active
2. Disabling flask removes bonuses
3. Granite flask increases armour
4. Multiple flasks can be active simultaneously
5. Removing flask removes all bonuses
6. getFlasks lists all equipped flasks correctly

All X tests passing.
```
