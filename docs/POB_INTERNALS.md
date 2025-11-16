# Path of Building Internals

This document provides essential PoB knowledge for contributors who need to extend or debug the integration.

## When to Read This

You probably don't need this document unless you're:
- Adding new API methods to `pob-bridge.lua`
- Debugging why PoB calculations are wrong
- Understanding how PoB data structures work
- Extending beyond the current MVP scope

For normal development, use `API_REFERENCE.md` instead.

---

## PoB Architecture Overview

**Key Directories in PoB:**
- `/src/Modules/` - Core game logic (Build, CalcPerform, ModParser)
- `/src/Classes/` - Data structures (PassiveSpec, Item, SkillsTab, ItemsTab)
- `/spec/` - Test specifications and example builds
- `/Data/` - Game data files (passives, items, gems, etc.)

**Main Entry Point:**
- `HeadlessWrapper.lua` - CLI interface (what we use)
- `Launch.lua` - Initializes PoB environment and loads all modules

---

## Data Structures

### Passive Node

```lua
node = {
  id = number,              -- Unique node ID (e.g., 30335)
  name = string,            -- Display name (e.g., "Resolute Technique")
  type = string,            -- "Keystone", "Notable", "Normal", "Mastery", "ClassStart"
  alloc = boolean,          -- Currently allocated
  path = {node, ...},       -- Path from class start to this node
  depends = {node, ...},    -- Nodes that depend on this node being allocated
  linked = {node, ...},     -- Adjacent nodes in the tree
  ascendancyName = string,  -- Ascendancy name if applicable
  isKeystone = boolean,
  isNotable = boolean,
  isJewelSocket = boolean,
}
```

**Access:** `build.spec.nodes[nodeId]` or `build.spec.allocNodes[nodeId]` for allocated ones

### Item

```lua
item = {
  name = string,
  rarity = "NORMAL|MAGIC|RARE|UNIQUE|RELIC",
  quality = number,
  level = number,
  mods = {string, ...},           -- Explicit mods
  implicitMods = {string, ...},   -- Implicit mods
  enchantMods = {string, ...},    -- Enchantments
  craftedMods = {string, ...},    -- Crafted mods
  sockets = {{color = "R|G|B|W", group = number}, ...},
  -- ... many other properties
}
```

**Creation:** `new("Item", rawItemText)`

### Socket Group (Skills)

```lua
socketGroup = {
  enabled = boolean,
  includeInFullDPS = boolean,
  label = string,              -- "Main Skill", etc.
  slot = string,               -- "Weapon 1", "Body Armour", etc.
  gemList = {
    {
      nameSpec = string,       -- Gem name
      level = number,
      quality = number,
      enabled = boolean,
      skillId = string,
    },
    ...
  },
  mainActiveSkill = number,    -- Index in gemList
  mainActiveSkillCalcs = number,
}
```

**Access:** `build.skillsTab.socketGroupList[index]`

---

## Key PoB Classes and Methods

### PassiveSpec (`src/Classes/PassiveSpec.lua`)

**Purpose:** Manages passive tree state for a build

**Key Methods:**
```lua
-- Allocate a node (also allocates path nodes)
spec:AllocNode(node, altPath)

-- Deallocate a node (and dependents)
spec:DeallocNode(node)

-- Count allocated nodes
local used, ascUsed, secondaryAscUsed, sockets = spec:CountAllocNodes()

-- Change character class
spec:SelectClass(classId)

-- Change ascendancy
spec:SelectAscendClass(ascendClassId)

-- Rebuild all paths and dependencies
spec:BuildAllDependsAndPaths()

-- Reset all allocations
spec:ResetNodes()
```

**Important Fields:**
- `spec.nodes` - All nodes in tree (indexed by nodeId)
- `spec.allocNodes` - Currently allocated nodes (indexed by nodeId)
- `spec.tree` - Reference to tree data

### ItemsTab (`src/Classes/ItemsTab.lua`)

**Purpose:** Manages items and equipment

**Key Methods:**
```lua
-- Add item to build
itemsTab:AddItem(item, noAutoEquip, index)

-- Delete item
itemsTab:DeleteItem(item, deferUndoState)

-- Equip item in active set
itemsTab:EquipItemInSet(item, itemSetId)

-- Check if item can go in slot
itemsTab:IsItemValidForSlot(item, slotName, itemSet)

-- Create new item set
itemsTab:NewItemSet(itemSetId)

-- Switch active item set
itemsTab:SetActiveItemSet(itemSetId)
```

**Item Slots:**
```lua
"Weapon 1", "Weapon 2", "Weapon 1 Swap", "Weapon 2 Swap",
"Helmet", "Body Armour", "Gloves", "Boots",
"Amulet", "Ring 1", "Ring 2", "Belt",
"Flask 1", "Flask 2", "Flask 3", "Flask 4", "Flask 5"
```

### SkillsTab (`src/Classes/SkillsTab.lua`)

**Purpose:** Manages skills and gem setups

**Key Methods:**
```lua
-- Set active skill set
skillsTab:SetActiveSkillSet(skillSetId)

-- Create gem slot
skillsTab:CreateGemSlot(index)

-- Copy socket group
skillsTab:CopySocketGroup(socketGroup)

-- Paste socket group
skillsTab:PasteSocketGroup(testInput)

-- Process socket group (validates and builds skills)
skillsTab:ProcessSocketGroup(socketGroup)

-- Update gem data
skillsTab:UpdateGemSlots()
```

### Build (`src/Modules/Build.lua`)

**Purpose:** Main build coordinator

**Key Methods:**
```lua
-- Load build from XML
build:Load(xml, fileName)

-- Save build to XML
build:Save(xml)

-- Trigger recalculation
build.buildFlag = true
```

**Important Fields:**
- `build.spec` - PassiveSpec instance
- `build.itemsTab` - ItemsTab instance
- `build.skillsTab` - SkillsTab instance
- `build.calcsTab` - CalcsTab instance
- `build.calcsTab.mainOutput` - Calculated stats (500+ fields)

---

## Calculations

### How Calculations Work

1. Modify build (allocate passive, equip item, etc.)
2. Set `build.buildFlag = true`
3. Next frame, PoB calls `build.calcsTab:BuildOutput()`
4. Results available in `build.calcsTab.mainOutput`

### Accessing Stats

```lua
local output = build.calcsTab.mainOutput

-- Common stats:
output.TotalDPS          -- Total DPS
output.AverageDamage     -- Average hit damage
output.CritChance        -- Crit chance %
output.Life              -- Maximum life
output.EnergyShield      -- Maximum ES
output.Armor             -- Armor rating
output.Evasion           -- Evasion rating
output.FireResist        -- Fire resistance %
output.ColdResist        -- Cold resistance %
output.LightningResist   -- Lightning resistance %
output.ChaosResist       -- Chaos resistance %
output.Str               -- Total Strength
output.Dex               -- Total Dexterity
output.Int               -- Total Intelligence
```

**Note:** There are 500+ possible output fields. Not all builds will have all fields (e.g., attack builds won't have `SpellCritChance`).

---

## Common Patterns

### Finding a Node by Name

```lua
function findNodeByName(nodeName)
  for nodeId, node in pairs(build.spec.nodes) do
    if node.name == nodeName then
      return node
    end
  end
  return nil
end
```

### Checking if Node is Allocated

```lua
local node = build.spec.nodes[nodeId]
if node and node.alloc then
  print("Node is allocated")
end
```

### Iterating Allocated Nodes

```lua
for nodeId, node in pairs(build.spec.allocNodes) do
  print(string.format("%s (%d): %s", node.name, nodeId, node.type))
end
```

### Parsing Item Text

```lua
local itemText = [[Rarity: UNIQUE
Tabula Rasa
Simple Robe
]]

local item = new("Item", itemText)
if item then
  print("Parsed item: " .. item.name)
end
```

### Getting All Stats After Change

```lua
-- Make a change
build.spec:AllocNode(node)
build.buildFlag = true

-- Wait for recalc (happens on next frame)
-- In our subprocess model, we call BuildOutput() directly:
build.calcsTab:BuildOutput()

-- Now access stats
local stats = build.calcsTab.mainOutput
print("DPS: " .. (stats.TotalDPS or 0))
```

---

## Gotchas and Important Notes

### 1. Path Rebuilding

After allocating nodes, always rebuild paths:
```lua
build.spec:BuildAllDependsAndPaths()
```

Without this, dependent nodes may not be accessible.

### 2. Build Flag

Manual changes require setting:
```lua
build.buildFlag = true
```

Then calling:
```lua
build.calcsTab:BuildOutput()
```

In the GUI, this happens automatically on each frame. In headless mode, we trigger it explicitly.

### 3. Node IDs vs Names

- **Node IDs** are numeric (e.g., `30335`)
- **Node names** are strings (e.g., `"Resolute Technique"`)
- Names can change between PoB versions
- IDs are more stable but less readable

For our API, we use names for better LLM usability.

### 4. Item Slot Names

Slot names are **case-sensitive** and must match exactly:
- ✅ `"Body Armour"` (British spelling)
- ❌ `"Body Armor"` (American spelling)
- ❌ `"body armour"` (lowercase)

### 5. Gem Names

Gem names must match exactly as they appear in PoB data files:
- ✅ `"Greater Multiple Projectiles Support"`
- ❌ `"GMP"` (abbreviation not recognized)
- ❌ `"Greater Multiple Projectiles"` (missing "Support")

### 6. Stats May Be Nil

Not all stats exist for all builds:
```lua
local dps = output.TotalDPS or 0  -- Safe access
```

Always provide defaults or check for nil.

### 7. Multiple Active Skills

A build can have multiple socket groups but only one is "active" for calculations. Check:
```lua
socketGroup.enabled and socketGroup.includeInFullDPS
```

---

## Testing Your Changes

### Using PoB's Built-in Tests

PoB has tests in `/spec/System/TestBuilds_spec.lua`. These show how PoB's own tests work:

```lua
describe("TestBuilds", function()
  it("Resolute Technique should set crit to 0", function()
    local build = runCallback(newBuild)
    build.spec:AllocNode(build.spec.nodes[30335]) -- Resolute Technique
    build.buildFlag = true
    build.calcsTab:BuildOutput()

    assert.are.equal(0, build.calcsTab.mainOutput.CritChance)
  end)
end)
```

### Testing in Headless Mode

Our `pob-bridge.lua` script can be tested standalone:

```bash
cd pob-data/PathOfBuilding
../../pob-data/luajit/src/luajit ../../scripts/pob-bridge.lua . ../../pob-data/lua
```

Then send JSON commands via stdin:
```json
{"command":"newBuild","params":{}}
{"command":"getBuildStats","params":{}}
```

---

## Useful References

**Official PoB:**
- GitHub: https://github.com/PathOfBuildingCommunity/PathOfBuilding
- Wiki: https://github.com/PathOfBuildingCommunity/PathOfBuilding/wiki

**Data Files:**
- `Data/3_0/Bases.lua` - Base item types
- `Data/3_0/Gems.lua` - Gem definitions
- `Data/3_0/PassiveTreeData.lua` - Passive tree structure
- `Data/3_0/ModData.lua` - Modifier definitions

**Key Source Files:**
- `src/Modules/CalcPerform.lua` - Main calculation engine
- `src/Modules/ModParser.lua` - Parses mod text into effects
- `src/Classes/PassiveSpec.lua` - Passive tree logic
- `src/Classes/Item.lua` - Item parsing and handling

---

## When You Need to Modify pob-bridge.lua

The Lua bridge (`scripts/pob-bridge.lua`) translates JSON commands to PoB API calls. When adding new functionality:

1. **Read this document** to understand PoB's APIs
2. **Find similar code** in pob-bridge.lua as reference
3. **Add new command handler** following existing pattern
4. **Test manually** with standalone LuaJIT
5. **Add TypeScript wrapper** in `luajit-runtime.ts`
6. **Add test** in appropriate test suite

**Example command handler:**
```lua
commands.myNewCommand = function(params)
  local result = build.spec:SomeMethod(params.value)
  return {
    success = true,
    result = result,
    message = "Operation completed"
  }
end
```

---

## Performance Notes

- **Build loading:** ~200-500ms (XML parsing + tree build)
- **Passive allocation:** ~50ms (includes path rebuild)
- **Stat calculation:** ~50-100ms (depends on build complexity)
- **Memory per build:** ~50-100MB

These are acceptable for MVP. For production with many concurrent builds, consider build caching or process pooling.
