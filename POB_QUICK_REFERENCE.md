# Path of Building - Quick Reference Card

## File Locations & Line Numbers

### Passive Tree Operations
| Operation | File | Class | Line | Method |
|-----------|------|-------|------|--------|
| Allocate Node | Classes/PassiveSpec.lua | PassiveSpecClass | 680 | `AllocNode(node, altPath)` |
| Deallocate Node | Classes/PassiveSpec.lua | PassiveSpecClass | 712 | `DeallocNode(node)` |
| Count Allocated | Classes/PassiveSpec.lua | PassiveSpecClass | 732 | `CountAllocNodes()` |
| Select Class | Classes/PassiveSpec.lua | PassiveSpecClass | 546 | `SelectClass(classId)` |
| Select Ascendancy | Classes/PassiveSpec.lua | PassiveSpecClass | 583 | `SelectAscendClass(ascendClassId)` |
| Reset All Nodes | Classes/PassiveSpec.lua | PassiveSpecClass | 667 | `ResetNodes()` |

### Item Operations
| Operation | File | Class | Line | Method |
|-----------|------|-------|------|--------|
| Add Item | Classes/ItemsTab.lua | ItemsTabClass | 1403 | `AddItem(item, noAutoEquip, index)` |
| Delete Item | Classes/ItemsTab.lua | ItemsTabClass | 1492 | `DeleteItem(item, deferUndoState)` |
| Equip Item | Classes/ItemsTab.lua | ItemsTabClass | 1333 | `EquipItemInSet(item, itemSetId)` |
| Get Item Slot | Classes/ItemsTab.lua | ItemsTabClass | 1909 | `GetEquippedSlotForItem(item)` |
| New Item Set | Classes/ItemsTab.lua | ItemsTabClass | 1286 | `NewItemSet(itemSetId)` |
| Set Active Set | Classes/ItemsTab.lua | ItemsTabClass | 1304 | `SetActiveItemSet(itemSetId)` |
| Parse Item | Classes/Item.lua | ItemClass | 291 | `ParseRaw(raw, rarity, highQuality)` |

### Skill/Gem Operations
| Operation | File | Class | Line | Method |
|-----------|------|-------|------|--------|
| Set Active Skill Set | Classes/SkillsTab.lua | SkillsTabClass | 1322 | `SetActiveSkillSet(skillSetId)` |
| Create Gem Slot | Classes/SkillsTab.lua | SkillsTabClass | 598 | `CreateGemSlot(index)` |
| Copy Socket Group | Classes/SkillsTab.lua | SkillsTabClass | 548 | `CopySocketGroup(socketGroup)` |
| Paste Socket Group | Classes/SkillsTab.lua | SkillsTabClass | 562 | `PasteSocketGroup(testInput)` |
| Process Socket Group | Classes/SkillsTab.lua | SkillsTabClass | 1063 | `ProcessSocketGroup(socketGroup)` |
| Update Gem Slots | Classes/SkillsTab.lua | SkillsTabClass | 985 | `UpdateGemSlots()` |

### Build Operations
| Operation | File | Class | Line | Method |
|-----------|------|-------|------|--------|
| Recalculate | Modules/Build.lua | buildMode | 1147 | `OnFrame(inputEvents)` |
| Load Build | Modules/Build.lua | buildMode | 920 | `Load(xml, fileName)` |
| Save Build | Modules/Build.lua | buildMode | 960 | `Save(xml)` |
| Load DB File | Modules/Build.lua | buildMode | 1860 | `LoadDBFile()` |
| Save DB File | Modules/Build.lua | buildMode | 1902 | `SaveDBFile()` |

---

## Data Structures Quick Access

### Passive Node Object
```lua
node = {
    id = number,              -- Unique node ID
    name = string,            -- Display name
    type = string,            -- "Keystone", "Notable", "Normal", "Mastery", "ClassStart"
    alloc = boolean,          -- Currently allocated
    path = {node, ...},       -- Path from class start
    depends = {node, ...},    -- Dependent nodes
    linked = {node, ...},     -- Adjacent nodes
    ascendancyName = string   -- Ascendancy name (if applicable)
}
```

### Item Object
```lua
item = {
    name = string,
    rarity = "NORMAL|MAGIC|RARE|UNIQUE|RELIC",
    quality = number,
    level = number,
    mods = {string, ...},
    implicitMods = {string, ...},
    enchantMods = {string, ...},
    craftedMods = {string, ...},
    modList = ModList,
    -- ... many other properties
}
```

### Socket Group Object
```lua
socketGroup = {
    enabled = boolean,
    includeInFullDPS = boolean,
    label = string,
    slot = string,            -- "Weapon 1", "Helmet", etc.
    source = string,          -- "Item:1:ItemName" or nil
    mainActiveSkill = number,
    mainActiveSkillCalcs = number,
    gemList = {gemInstance, ...}
}
```

### Gem Instance Object
```lua
gemInstance = {
    nameSpec = string,        -- Display name
    gemId = string,           -- "Metadata/Items/Gems/SkillGemXXX"
    skillId = string,         -- "SkillName" or nil
    level = number,           -- 1-20+
    quality = number,         -- 0-20+
    qualityId = string,       -- "Default", "Alternate1", "Alternate2", "Alternate3"
    enabled = boolean,
    enableGlobal1 = boolean,
    enableGlobal2 = boolean,
    count = number
}
```

### Build Object Key Properties
```lua
build = {
    spec = PassiveSpec,       -- Passive tree
    itemsTab = ItemsTab,      -- Items management
    skillsTab = SkillsTab,    -- Skills management
    calcsTab = CalcsTab,      -- Calculations & output
    configTab = ConfigTab,    -- Config options
    
    characterLevel = number,  -- 1-100
    targetVersion = string,   -- "3_0", "3_25", etc.
    bandit = string,          -- "None", "Labyinth", "Kill All"
    pantheonMajorGod = string,
    pantheonMinorGod = string,
    
    modFlag = boolean,        -- Has unsaved changes
    buildFlag = boolean,      -- Needs recalculation
    unsaved = boolean,        -- Display unsaved indicator
    
    calcsTab.mainOutput = {   -- Calculated stats
        Life = number,
        EnergyShield = number,
        Armour = number,
        TotalDPS = number,
        CombinedDPS = number,
        ... (100+ properties)
    }
}
```

---

## Item Slot Names

```lua
-- Main Slots
"Weapon 1", "Weapon 2"
"Helmet", "Body Armour", "Gloves", "Boots"
"Amulet"

-- Rings (can equip up to 3)
"Ring 1", "Ring 2", "Ring 3"

-- Other
"Belt"

-- Flasks
"Flask 1", "Flask 2", "Flask 3", "Flask 4", "Flask 5"

-- Alternate equipment
"Weapon 1 Swap", "Weapon 2 Swap"

-- New slots (maps, etc.)
"Graft 1", "Graft 2"
```

---

## Common Workflow Sequences

### Allocate Multiple Passives
```lua
local nodeIds = {30335, 33988, 47175}
for _, nodeId in ipairs(nodeIds) do
    local node = build.spec.nodes[nodeId]
    if node then
        build.spec:AllocNode(node)
    end
end
build.buildFlag = true
```

### Equip Complete Gear Set
```lua
local gearSet = {
    Helmet = "itemRawText1",
    ["Body Armour"] = "itemRawText2",
    Gloves = "itemRawText3",
    Boots = "itemRawText4"
}

for slotName, itemRaw in pairs(gearSet) do
    local item = new("Item", itemRaw)
    local itemSet = build.itemsTab.itemSets[build.itemsTab.activeItemSetId]
    if itemSet then
        itemSet.items[slotName] = item
    end
end
build.itemsTab.modFlag = true
build.buildFlag = true
```

### Setup Complete Skill
```lua
local socketGroup = {
    enabled = true,
    includeInFullDPS = true,
    label = "Main Skill",
    slot = "Weapon 1",
    gemList = {
        -- Main active skill
        {nameSpec = "Fireball", gemId = "Meta.../Fireball", 
         skillId = "Fireball", level = 20, quality = 20, 
         qualityId = "Default", enabled = true, enableGlobal1 = true, 
         enableGlobal2 = true, count = 1},
        -- Support gems
        {nameSpec = "Spell Echo", gemId = "Meta.../SupportGemEcho",
         level = 20, quality = 0, qualityId = "Default", 
         enabled = true, enableGlobal1 = true, enableGlobal2 = true, count = 1},
    },
    mainActiveSkill = 1,
    mainActiveSkillCalcs = 1
}
table.insert(build.skillsTab.socketGroupList, socketGroup)
build.skillsTab:ProcessSocketGroup(socketGroup)
build.skillsTab.modFlag = true
build.buildFlag = true
```

---

## Recalculation System

### Automatic Recalculation
All modifications automatically set `build.buildFlag = true`, which triggers:
- Next frame: `build:OnFrame()` called
- Clears calculation cache
- Calls `build.calcsTab:BuildOutput()`
- Updates all output statistics

### Manual Recalculation Trigger
```lua
-- Trigger immediate recalculation
build.buildFlag = true
build:OnFrame({})  -- Processes pending calculations
```

### Accessing Calculated Output
```lua
local output = build.calcsTab.mainOutput

-- Key statistics
local totalLife = output.Life
local totalDPS = output.TotalDPS
local combinedDPS = output.CombinedDPS
local armour = output.Armour
local evasion = output.Evasion

-- Resistances
local fireRes = output.FireResist
local coldRes = output.ColdResist
local lightRes = output.LightningResist
local chaosRes = output.ChaosResist

-- Charges
local maxPower = output.PowerChargesMax
local maxFrenzy = output.FrenzyChargesMax
local maxEndurance = output.EnduranceChargesMax

-- Attributes
local str = output.Str
local dex = output.Dex
local int = output.Int
```

---

## Validation Patterns

### Validate Node Can Be Allocated
```lua
local function CanAllocateNode(spec, nodeId)
    local node = spec.nodes[nodeId]
    if not node then return false, "Node not found" end
    if spec.allocNodes[nodeId] then return false, "Already allocated" end
    if not node.path or #node.path == 0 then 
        return false, "No path to class start" 
    end
    return true
end
```

### Validate Item Fits Slot
```lua
local function CanEquipItem(itemsTab, item, slotName)
    local itemSet = itemsTab.itemSets[itemsTab.activeItemSetId]
    if not itemSet then return false, "No active item set" end
    return itemsTab:IsItemValidForSlot(item, slotName, itemSet)
end
```

### Validate Gem Can Be Added
```lua
local function CanAddGem(gem)
    if not gem.gemId then return false, "No gem ID" end
    if not gem.level or gem.level < 1 then return false, "Invalid level" end
    if not gem.nameSpec or gem.nameSpec == "" then return false, "No name" end
    return true
end
```

---

## Common Queries

### Get Total Allocated Points
```lua
local used, ascUsed, secondaryAscUsed, sockets = build.spec:CountAllocNodes()
print("Allocated: " .. used .. " regular + " .. ascUsed .. " ascendancy")
```

### Get All Allocated Keystones
```lua
local keystones = {}
for _, node in pairs(build.spec.allocNodes) do
    if node.type == "Keystone" then
        table.insert(keystones, node)
    end
end
```

### Find Current Helmet
```lua
local itemSet = build.itemsTab.itemSets[build.itemsTab.activeItemSetId]
local helmet = itemSet.items["Helmet"]
if helmet then
    print("Helmet: " .. helmet.name)
end
```

### List All Equipped Items
```lua
local itemSet = build.itemsTab.itemSets[build.itemsTab.activeItemSetId]
for slotName, item in pairs(itemSet.items) do
    if item then
        print(slotName .. ": " .. item.name)
    end
end
```

### Get Main Active Skill
```lua
local socketGroup = build.skillsTab.socketGroupList[1]
if socketGroup then
    local mainGem = socketGroup.gemList[socketGroup.mainActiveSkill]
    if mainGem then
        print("Main skill: " .. mainGem.nameSpec .. " (Lvl " .. mainGem.level .. ")")
    end
end
```

### Count Total Gems
```lua
local totalGems = 0
for _, socketGroup in ipairs(build.skillsTab.socketGroupList) do
    if socketGroup.enabled then
        totalGems = totalGems + #socketGroup.gemList
    end
end
```

---

## XML Examples

### Minimal Build XML
```xml
<?xml version="1.0" encoding="UTF-8"?>
<PathOfBuilding>
    <Build level="70" targetVersion="3_0" className="Marauder" 
           ascendClassName="Berserker" bandit="None" 
           pantheonMajorGod="None" pantheonMinorGod="None"/>
    <Tree activeSpec="1">
        <Spec classId="1" ascendClassId="2" treeVersion="3_0"
              nodes="30335,33988,47175"/>
    </Tree>
    <Skills>
        <Skill enabled="true" slot="Weapon 1">
            <Gem nameSpec="Fireball" gemId="Metadata/Items/Gems/SkillGemFireball" 
                 level="20" quality="20" enabled="true" qualityId="Default"/>
        </Skill>
    </Skills>
</PathOfBuilding>
```

---

## Key Constants

### Node Types
- "Keystone" - Powerful unique nodes
- "Notable" - Two-passive notable nodes
- "Normal" - One-passive nodes
- "Mastery" - Mastery nodes (select effects)
- "ClassStart" - Class starting point
- "AscendClassStart" - Ascendancy starting point
- "Socket" - Jewel socket
- "Expansion" - Cluster jewel node

### Item Rarity
- "NORMAL"
- "MAGIC"
- "RARE"
- "UNIQUE"
- "RELIC"

### Gem Quality IDs
- "Default" - Standard gem
- "Alternate1" - Anomalous (usually speed)
- "Alternate2" - Divergent (usually changed behavior)
- "Alternate3" - Phantasmal (usually utility)

### PoE Versions
- "3_0" (Patch 3.0)
- "3_13" (Patch 3.13)
- "3_25" (Current patch)

---

## Performance Tips

1. **Batch Modifications**: Set `build.buildFlag = false`, make changes, then set to `true` once
2. **Cache Node References**: Store `spec.nodes[id]` instead of looking up repeatedly
3. **Avoid Repeated Allocations**: Check `spec.allocNodes[id]` before allocating
4. **Use Output Cache**: `calcsTab.mainOutput` is already calculated, don't recalc manually
5. **Minimize UndoStates**: Call `AddUndoState()` after batch operations, not each change

