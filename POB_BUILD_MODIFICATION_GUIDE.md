# Path of Building - Programmatic Build Modification Guide

## Repository Structure

### Key Directories
- `/src/Modules/` - Core game logic modules (Build, Skills, Items, Calcs)
- `/src/Classes/` - UI and data structure classes (PassiveSpec, Item, SkillsTab, ItemsTab)
- `/spec/` - Test specifications and example builds

### Main Entry Points
- `Build.lua` - Main build manager (located in Modules/)
- `PassiveSpec.lua` - Passive tree management
- `SkillsTab.lua` - Skills/gems management
- `ItemsTab.lua` - Items/gear management

---

## 1. PASSIVE TREE NODE ALLOCATION/DEALLOCATION

### Key Classes
- **PassiveSpec.lua**: Manages individual passive tree specifications
- **PassiveTree.lua**: Handles passive tree data loading

### Data Structure

```lua
-- PassiveSpec initialization in Classes/PassiveSpec.lua (line 30-84)
self.allocNodes = { }       -- List of currently allocated nodes (key: nodeId)
self.allocSubgraphNodes = { }  -- Nodes allocated in cluster jewels
self.allocExtendedNodes = { }  -- Cluster nodes to allocate
self.masterySelections = { }   -- Key: mastery nodeId, value: effect ID

-- Node object structure
self.nodes[nodeId] = {
    linked = { },           -- Adjacent connected nodes
    power = { },            -- Power effects for the node
    id = nodeId,            -- Unique node identifier
    name = "nodeName",      -- Display name
    type = "Keystone|Notable|Normal|Mastery|ClassStart|AscendClassStart|Socket",
    alloc = false,          -- Currently allocated flag
    path = { },             -- Path from class start to this node
    depends = { },          -- Nodes that depend on this node
    intuitiveLeapLikesAffecting = { }, -- Intuitive Leap radius
}
```

### Allocating a Node

**File**: `/tmp/pob-repo/src/Classes/PassiveSpec.lua`
**Line**: 680

```lua
function PassiveSpecClass:AllocNode(node, altPath)
    -- node: the node object to allocate
    -- altPath: optional alternative path (table of node objects)
    
    if not node.path then
        -- Node cannot be connected to the tree as there is no possible path
        return
    end

    -- Allocate all nodes along the path
    if #node.intuitiveLeapLikesAffecting > 0 then
        node.alloc = true
        self.allocNodes[node.id] = node
    else
        for _, pathNode in ipairs(altPath or node.path) do
            pathNode.alloc = true
            self.allocNodes[pathNode.id] = pathNode
        end
    end

    if node.isMultipleChoiceOption then
        -- For multiple choice passives, make sure no other choices are allocated
        local parent = node.linked[1]
        for _, optNode in ipairs(parent.linked) do
            if optNode.isMultipleChoiceOption and optNode.alloc and optNode ~= node then
                optNode.alloc = false
                self.allocNodes[optNode.id] = nil
            end
        end
    end

    -- Rebuild all dependencies and paths for all allocated nodes
    self:BuildAllDependsAndPaths()
end
```

### Deallocating a Node

**File**: `/tmp/pob-repo/src/Classes/PassiveSpec.lua`
**Line**: 712-729

```lua
function PassiveSpecClass:DeallocSingleNode(node)
    node.alloc = false
    self.allocNodes[node.id] = nil
    if node.type == "Mastery" then
        self:AddMasteryEffectOptionsToNode(node)
        self.masterySelections[node.id] = nil
    end
end

-- Deallocate the given node, and all nodes which depend on it 
-- (i.e. which are only connected to the tree through this node)
function PassiveSpecClass:DeallocNode(node)
    for _, depNode in ipairs(node.depends) do
        self:DeallocSingleNode(depNode)
    end

    -- Rebuild all paths and dependencies for all allocated nodes
    self:BuildAllDependsAndPaths()
end
```

### Getting Node Counts

**File**: `/tmp/pob-repo/src/Classes/PassiveSpec.lua`
**Line**: 732-752

```lua
function PassiveSpecClass:CountAllocNodes()
    local used, ascUsed, secondaryAscUsed, sockets = 0, 0, 0, 0
    for _, node in pairs(self.allocNodes) do
        if node.type ~= "ClassStart" and node.type ~= "AscendClassStart" then
            if node.ascendancyName then
                if not node.isMultipleChoiceOption then
                    ascUsed = ascUsed + 1
                    if self.tree.secondaryAscendNameMap and self.tree.secondaryAscendNameMap[node.ascendancyName] then
                        secondaryAscUsed = secondaryAscUsed + 1
                    end
                end
            else
                used = used + 1
            end
            if node.type == "Socket" then
                sockets = sockets + 1
            end
        end
    end
    return used, ascUsed, secondaryAscUsed, sockets
end
```

### Node Identifiers

Node identifiers are **numeric IDs** that uniquely identify each node in the passive tree:
- Example: `30335, 33988, 47175` (from test build XML)
- Stored in: `node.id`
- Node names are accessible via: `node.name` (e.g., "Ritual of Flesh", "Life")

### Key Methods in PassiveSpec

| Method | Purpose |
|--------|---------|
| `AllocNode(node, altPath)` | Allocate a passive node |
| `DeallocNode(node)` | Deallocate a node and its dependents |
| `DeallocSingleNode(node)` | Deallocate only this node |
| `CountAllocNodes()` | Get counts of allocated nodes |
| `SelectClass(classId)` | Change character class |
| `SelectAscendClass(ascendClassId)` | Change ascendancy class |
| `BuildAllDependsAndPaths()` | Rebuild path calculations |
| `ResetNodes()` | Clear all allocated nodes |
| `GetJewel(itemId)` | Get jewel equipped at node |

---

## 2. ITEM MODIFICATION

### Key Classes
- **ItemsTab.lua**: UI and item management (Classes/)
- **Item.lua**: Individual item class (Classes/)
- **Build.lua**: Build-level item references (Modules/)

### Data Structure

```lua
-- From Classes/ItemsTab.lua (line 69-73, 1304+)
self.items = { }            -- All items in the build
self.itemOrderList = { }    -- Order of items
self.itemSets = { }         -- Item sets by ID
self.itemSetOrderList = { } -- Order of item sets
self.activeItemSetId = 0    -- Currently active set

-- ItemSet structure
local itemSet = {
    id = itemSetId,
    socketGroupList = { },
    title = "Set Name",
    items = { [slotName] = item, ... }
}

-- Item slot names (line 33)
local baseSlots = {
    "Weapon 1", "Weapon 2", 
    "Helmet", "Body Armour", "Gloves", "Boots",
    "Amulet", "Ring 1", "Ring 2", "Ring 3", "Belt",
    "Flask 1", "Flask 2", "Flask 3", "Flask 4", "Flask 5",
    "Graft 1", "Graft 2"
}
```

### Adding/Replacing Items

**File**: `/tmp/pob-repo/src/Classes/ItemsTab.lua`
**Line**: 1333-1364

```lua
function ItemsTabClass:EquipItemInSet(item, itemSetId)
    -- item: Item object to equip
    -- itemSetId: ID of the item set to equip in
    
    if not itemSetId then
        itemSetId = self.activeItemSetId
    end
    
    local itemSet = self.itemSets[itemSetId]
    if not itemSet then
        return
    end
    
    local slot = self:GetEquippedSlotForItem(item)
    if slot then
        itemSet.items[slot] = item
        self:AddUndoState()
        self.build.buildFlag = true
    end
end

-- Add a new item to the build
function ItemsTabClass:AddItem(item, noAutoEquip, index)
    -- item: Item object to add
    -- noAutoEquip: if true, don't automatically equip
    -- index: position in item list
    
    if not item.name then
        return
    end
    
    t_insert(self.items, index or #self.items + 1, item)
    
    if not noAutoEquip then
        self:EquipItemInSet(item, self.activeItemSetId)
    end
    
    self:AddUndoState()
    self.build.buildFlag = true
end
```

### Item Structure

**File**: `/tmp/pob-repo/src/Classes/Item.lua`
**Line**: 53-57

```lua
local ItemClass = newClass("Item", function(self, raw, rarity, highQuality)
    if raw then
        self:ParseRaw(sanitiseText(raw), rarity, highQuality)
    end	
end)

-- Item properties after parsing
item = {
    name = "Item Name",
    rarity = "NORMAL|MAGIC|RARE|UNIQUE|RELIC",
    quality = 20,
    level = 86,
    mods = { },              -- Array of mod strings
    implicitMods = { },
    enchantMods = { },
    craftedMods = { },
    modData = { },           -- Parsed mod data
    modList = { },           -- ModList for calculations
    -- ... many other properties
}
```

### Item Slot Identifiers

Item slots are identified by **string names**:
- Main slots: "Weapon 1", "Weapon 2", "Helmet", "Body Armour", "Gloves", "Boots", "Amulet"
- Rings: "Ring 1", "Ring 2", "Ring 3"
- Other: "Belt", "Flask 1-5", "Graft 1-2"
- Swap weapons: "Weapon 1 Swap", "Weapon 2 Swap"

### Getting Item from Slot

**File**: `/tmp/pob-repo/src/Classes/ItemsTab.lua`
**Line**: 1909-1926

```lua
function ItemsTabClass:GetEquippedSlotForItem(item)
    -- Find which slot an item is equipped in
    local itemSet = self.itemSets[self.activeItemSetId]
    if not itemSet then
        return
    end
    for slotName, equippedItem in pairs(itemSet.items) do
        if equippedItem == item then
            return slotName
        end
    end
end
```

### Key Methods in ItemsTab

| Method | Purpose |
|--------|---------|
| `AddItem(item, noAutoEquip, index)` | Add item to build |
| `DeleteItem(item, deferUndoState)` | Remove item from build |
| `EquipItemInSet(item, itemSetId)` | Equip item in a set |
| `SetActiveItemSet(itemSetId)` | Switch active item set |
| `NewItemSet(itemSetId)` | Create new item set |
| `GetEquippedSlotForItem(item)` | Find slot for item |
| `IsItemValidForSlot(item, slotName, itemSet)` | Check if item fits slot |
| `PopulateSlots()` | Update all slot data |

---

## 3. SKILL/GEM CONFIGURATION

### Key Classes
- **SkillsTab.lua**: Skills/gems management (Classes/)
- **GemSelectControl.lua**: Gem selection UI (Classes/)

### Data Structures

```lua
-- SkillsTab initialization (Classes/SkillsTab.lua, line 80+)
self.socketGroupList = { }   -- List of socket groups
self.skillSets = { }         -- All skill sets by ID
self.skillSetOrderList = { } -- Order of skill sets
self.activeSkillSetId = 0    -- Currently active skill set

-- Socket Group structure
local socketGroup = {
    enabled = true,
    includeInFullDPS = true,
    groupCount = nil,
    label = "Label",
    slot = "Weapon 1",         -- Item slot socket group is in
    source = "Item:1:ItemName", -- Source item (if from item)
    mainActiveSkill = 1,       -- Index of main active skill
    mainActiveSkillCalcs = 1,  -- Index for calcs
    gemList = { }              -- List of gem instances
}

-- Gem Instance structure
local gemInstance = {
    nameSpec = "Gem Name",
    gemId = "Metadata/Items/Gems/SkillGemFrostbolt",
    skillId = "Frostbolt",     -- Skill ID
    level = 20,
    quality = 0,
    qualityId = "Default|Alternate1|Alternate2|Alternate3",
    enabled = true,
    enableGlobal1 = true,
    enableGlobal2 = true,
    count = 1,
    gemData = { },
    skillData = { }
}
```

### Modifying Gems in a Socket Group

**File**: `/tmp/pob-repo/src/Classes/SkillsTab.lua`
**Line**: 598-710

```lua
-- Example: Creating a gem slot with modification callback
slot.nameSpec = new("GemSelectControl", 
    { "LEFT", slot.delete, "RIGHT" }, 
    { 2, 0, 300, 20 }, 
    self, 
    index, 
    function(gemId, qualityId, addUndo)
        if not self.displayGroup then
            return
        end
        
        local gemInstance = self.displayGroup.gemList[index]
        if not gemInstance then
            -- Create new gem instance
            gemInstance = {
                nameSpec = "",
                level = 1,
                quality = self.defaultGemQuality or 0,
                qualityId = "Default",
                enabled = true,
                enableGlobal1 = true,
                enableGlobal2 = true,
                count = 1,
                new = true
            }
            self.displayGroup.gemList[index] = gemInstance
        elseif gemId == gemInstance.gemId then
            if addUndo then
                self:AddUndoState()
            end
            return
        end
        
        -- Update gem
        gemInstance.gemId = gemId
        gemInstance.skillId = nil
        self:ProcessSocketGroup(self.displayGroup)
        
        -- Constraint gem level
        gemInstance.level = self:ProcessGemLevel(gemInstance.gemData)
        gemInstance.naturalMaxLevel = gemInstance.level
        
        -- Update quality ID
        slot.qualityId.list = self:getGemAltQualityList(gemInstance.gemData)
        slot.qualityId:SelByValue(qualityId or "Default", "type")
        gemInstance.qualityId = qualityId or "Default"
        
        if addUndo then
            self:AddUndoState()
        end
        self.build.buildFlag = true
    end, 
    true
)
```

### Setting Gem Level

**File**: `/tmp/pob-repo/src/Classes/SkillsTab.lua`
**Line**: 693-710

```lua
slot.level = new("EditControl", 
    { "LEFT", slot.nameSpec, "RIGHT" }, 
    { 2, 0, 60, 20 }, 
    nil, nil, "%D", 2, 
    function(buf)
        local gemInstance = self.displayGroup.gemList[index]
        if not gemInstance then
            gemInstance = {
                nameSpec = "",
                level = self.defaultGemLevel or 20,
                quality = self.defaultGemQuality or 0,
                qualityId = "Default",
                enabled = true,
                enableGlobal1 = true,
                enableGlobal2 = true,
                count = 1,
                new = true
            }
            self.displayGroup.gemList[index] = gemInstance
        end
        
        -- Set level with constraints
        gemInstance.level = tonumber(buf) or 
                          self.displayGroup.gemList[index].naturalMaxLevel or 
                          self:ProcessGemLevel(gemInstance.gemData) or 20
        
        self:ProcessSocketGroup(self.displayGroup)
        self:AddUndoState()
        self.build.buildFlag = true
    end
)
```

### Removing a Gem

**File**: `/tmp/pob-repo/src/Classes/SkillsTab.lua`
**Line**: 603-620

```lua
slot.delete = new("ButtonControl", nil, {0, 0, 20, 20}, "x", function()
    -- Remove gem at index
    t_remove(self.displayGroup.gemList, index)
    
    -- Update all subsequent gem slot controls
    for index2 = index, #self.displayGroup.gemList do
        local gemInstance = self.displayGroup.gemList[index2]
        self.gemSlots[index2].nameSpec:SetText(gemInstance.nameSpec)
        self.gemSlots[index2].level:SetText(gemInstance.level)
        self.gemSlots[index2].quality:SetText(gemInstance.quality)
        self.gemSlots[index2].qualityId.list = self:getGemAltQualityList(gemInstance.gemData)
        self.gemSlots[index2].qualityId:SelByValue(gemInstance.qualityId, "type")
        self.gemSlots[index2].enabled.state = gemInstance.enabled
        self.gemSlots[index2].enableGlobal1.state = gemInstance.enableGlobal1
        self.gemSlots[index2].enableGlobal2.state = gemInstance.enableGlobal2
        self.gemSlots[index2].count:SetText(gemInstance.count or 1)
    end
    
    self:AddUndoState()
    self.build.buildFlag = true
end)
```

### Copying/Pasting Socket Groups

**File**: `/tmp/pob-repo/src/Classes/SkillsTab.lua`
**Line**: 548-597

```lua
function SkillsTabClass:CopySocketGroup(socketGroup)
    -- Copy socket group to clipboard
    local skillText = ""
    if socketGroup.label and socketGroup.label:match("%S") then
        skillText = skillText .. "Label: " .. socketGroup.label .. "\r\n"
    end
    if socketGroup.slot then
        skillText = skillText .. "Slot: " .. socketGroup.slot .. "\r\n"
    end
    for _, gemInstance in ipairs(socketGroup.gemList) do
        skillText = skillText .. gemInstance.nameSpec
        if gemInstance.level then
            skillText = skillText .. " (Lvl " .. gemInstance.level .. ")"
        end
        if gemInstance.quality and gemInstance.quality > 0 then
            skillText = skillText .. " (Q" .. gemInstance.quality .. ")"
        end
        skillText = skillText .. "\r\n"
    end
    
    SetClipboardText(skillText)
end

function SkillsTabClass:PasteSocketGroup(testInput)
    -- Parse and paste socket group from clipboard
    local newGroup = { label = "", enabled = true, gemList = { } }
    
    for line in (testInput .. "\n"):gmatch("([^\n]*)\n") do
        line = line:gsub("^%s+", ""):gsub("%s+$", "")
        if line ~= "" and line:sub(1, 6) ~= "Label:" and line:sub(1, 5) ~= "Slot:" then
            t_insert(newGroup.gemList, {
                nameSpec = line,
                level = 1,
                quality = 0,
                qualityId = "Default",
                enabled = true,
                enableGlobal1 = true,
                enableGlobal2 = true,
                count = 1,
                new = true
            })
        end
    end
    
    if #newGroup.gemList > 0 then
        t_insert(self.socketGroupList, newGroup)
        self:AddUndoState()
        self.build.buildFlag = true
    end
end
```

### Key Methods in SkillsTab

| Method | Purpose |
|--------|---------|
| `SetActiveSkillSet(skillSetId)` | Switch active skill set |
| `NewSkillSet(skillSetId)` | Create new skill set |
| `CopySocketGroup(socketGroup)` | Copy socket group |
| `PasteSocketGroup(testInput)` | Paste socket group from text |
| `ProcessSocketGroup(socketGroup)` | Recalc socket group |
| `ProcessGemLevel(gemData)` | Validate gem level |
| `UpdateGemSlots()` | Refresh gem UI slots |
| `FindSkillGem(nameSpec)` | Search for gem by name |

---

## 4. BUILD OBJECT STRUCTURE

### Main Build Object

**File**: `/tmp/pob-repo/src/Modules/Build.lua`
**Line**: 59-100

```lua
function buildMode:Init(dbFileName, buildName, buildXML, convertBuild, importLink)
    self.dbFileName = dbFileName
    self.buildName = buildName
    self.importLink = importLink
    
    -- Core state
    self.modFlag = false           -- Indicates if build has unsaved changes
    self.buildFlag = false         -- Indicates if build needs recalculation
    self.unsaved = false           -- Shows if build has unsaved changes
    self.targetVersion = liveTargetVersion  -- PoE version target
    self.characterLevel = 1        -- Character level
    self.bandit = "None"           -- Bandit quest choice
    self.pantheonMajorGod = "None" -- Pantheon major god
    self.pantheonMinorGod = "None" -- Pantheon minor god
    
    -- Sub-objects (created later)
    self.spec = nil                -- PassiveSpec object
    self.itemsTab = nil            -- ItemsTab object
    self.skillsTab = nil           -- SkillsTab object
    self.calcsTab = nil            -- Calcs object
    self.configTab = nil           -- Config object
    self.treeTab = nil             -- TreeTab object
    
    -- XML loading
    self.xmlSectionList = { }
    self.timelessData = {
        jewelType = { },
        conquerorType = { },
        devotionVariant1 = 1,
        devotionVariant2 = 1,
        jewelSocket = { },
        fallbackWeightMode = { },
        searchList = "",
        sharedResults = { }
    }
end
```

### Key Build Properties

| Property | Type | Purpose |
|----------|------|---------|
| `spec` | PassiveSpec | Passive tree configuration |
| `itemsTab` | ItemsTab | Item management |
| `skillsTab` | SkillsTab | Skills/gems management |
| `calcsTab` | Calcs | Damage calculations |
| `configTab` | ConfigTab | Config options |
| `modFlag` | bool | Unsaved changes flag |
| `buildFlag` | bool | Needs recalculation flag |
| `characterLevel` | number | Character level (1-100) |
| `targetVersion` | string | PoE version (e.g., "3_0") |
| `outputRevision` | number | Output cache revision |
| `calcsTab.mainOutput` | table | Main calculated output |

### Build Sub-Objects

```lua
-- Accessing components
local build = ...

-- Passive tree
local nodes = build.spec.allocNodes       -- Allocated passive nodes
local nodeCount = build.spec:CountAllocNodes()

-- Items
local itemSet = build.itemsTab.itemSets[build.itemsTab.activeItemSetId]
local item = itemSet.items["Helmet"]

-- Skills
local socketGroup = build.skillsTab.socketGroupList[1]
local gems = socketGroup.gemList

-- Calculations
local output = build.calcsTab.mainOutput
local totalDPS = output.TotalDPS
local life = output.Life
```

---

## 5. RECALCULATION AND UPDATE TRIGGERS

### Build Recalculation System

**File**: `/tmp/pob-repo/src/Modules/Build.lua`
**Line**: 1147-1156

```lua
function buildMode:OnFrame(inputEvents)
    -- ... input processing ...
    
    if self.buildFlag then
        -- Wipe Global Cache
        wipeGlobalCache()

        -- Rebuild calculation output tables
        self.outputRevision = self.outputRevision + 1
        self.buildFlag = false
        self.calcsTab:BuildOutput()  -- Main calculation function
        self:RefreshStatList()
    end
    
    -- ... continue drawing ...
end
```

### Triggering Recalculation

Any modification automatically sets flags:

```lua
-- After modifying passive tree
build.spec.modFlag = true   -- Mark spec as modified
build.buildFlag = true      -- Trigger rebuild

-- After modifying items
build.itemsTab.modFlag = true
build.buildFlag = true

-- After modifying skills
build.skillsTab.modFlag = true
build.buildFlag = true

-- On next frame:
-- if self.buildFlag then
--     self.calcsTab:BuildOutput()  -- Recalculates everything
-- end
```

### Output Calculation

**File**: `/tmp/pob-repo/src/Modules/Calcs.lua`
**Line**: 73-80

```lua
local function getCalculator(build, fullInit, modFunc)
    -- Initialise environment
    local env, cachedPlayerDB, cachedEnemyDB, cachedMinionDB = calcs.initEnv(build, "CALCULATOR")

    -- Run base calculation pass
    calcs.perform(env)
    
    -- Calculate full DPS including all effects
    local fullDPS = calcs.calcFullDPS(build, "CALCULATOR", {}, { 
        cachedPlayerDB = cachedPlayerDB, 
        cachedEnemyDB = cachedEnemyDB, 
        cachedMinionDB = cachedMinionDB, 
        env = nil 
    })
    
    env.player.output.SkillDPS = fullDPS.skills
    -- ... more calculations ...
end
```

### Main Output Properties

Calculated values are stored in `build.calcsTab.mainOutput`:

```lua
-- Core stats
output.Life                 -- Total life
output.EnergyShield        -- Total energy shield
output.Armour              -- Total armour
output.Evasion             -- Evasion rating

-- Damage metrics
output.TotalDPS            -- Total hit damage per second
output.TotalDot            -- Total damage over time
output.CombinedDPS         -- Combined hit + dot
output.AverageDamage       -- Average hit damage
output.CritChance          -- Critical strike chance
output.CritMultiplier      -- Critical multiplier

-- Resistances
output.FireResist          -- Fire resistance
output.ColdResist          -- Cold resistance
output.LightningResist     -- Lightning resistance
output.ChaosResist         -- Chaos resistance

-- Attributes
output.Str                 -- Strength
output.Dex                 -- Dexterity
output.Int                 -- Intelligence

-- Charges
output.PowerChargesMax     -- Max power charges
output.FrenzyChargesMax    -- Max frenzy charges
output.EnduranceChargesMax -- Max endurance charges
```

---

## 6. TEST EXAMPLES

### Loading a Build from XML

**File**: `/tmp/pob-repo/spec/System/TestBuilds_spec.lua`

```lua
local buildList = fetchBuilds("../spec/TestBuilds")
for buildName, testBuild in pairs(buildList) do
    -- Load build from XML string
    loadBuildFromXML(testBuild.xml, buildName)
    
    -- Access build
    local build = ... -- global build object
    
    -- Verify output values
    for key, value in pairs(testBuild.output) do
        local result = build.calcsTab.mainOutput[key]
        assert.are.same(round(value, 4), round(result or 0, 4))
    end
end
```

### Example Build XML Structure

**File**: `/tmp/pob-repo/spec/TestBuilds/3.13/Dual Savior.lua`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<PathOfBuilding>
    <Build level="1" targetVersion="3_0" pantheonMajorGod="None" 
           bandit="None" className="Marauder" ascendClassName="Berserker" 
           mainSocketGroup="3" viewMode="TREE" pantheonMinorGod="None">
        <!-- PlayerStats for UI persistence -->
        <PlayerStat stat="Life" value="92"/>
        <PlayerStat stat="Armour" value="0"/>
        <!-- ... more stats ... -->
    </Build>
    
    <Import/>
    
    <Calcs>
        <!-- Config sections -->
        <Input name="skill_number" number="2"/>
        <Section collapsed="false" id="SkillSelect"/>
    </Calcs>
    
    <!-- Skills/Gems -->
    <Skills sortGemsByDPS="true" defaultGemLevel="nil">
        <Skill mainActiveSkill="1" enabled="true" slot="Weapon 1">
            <Gem nameSpec="Double Strike" level="20" quality="12" 
                 gemId="Metadata/Items/Gems/SkillGemDoubleStrike" 
                 enabled="true" qualityId="Default"/>
            <Gem nameSpec="Cyclone" level="20" quality="0" enabled="false"/>
        </Skill>
    </Skills>
    
    <!-- Passive Tree -->
    <Tree activeSpec="1">
        <Spec classId="1" ascendClassId="2" treeVersion="3_13"
              nodes="30335,33988,47175,32480,29294,40535,58449,31628">
            <!-- Timeless jewel overrides -->
            <EditedNode nodeId="11420" nodeName="Ritual of Flesh">
                8% increased maximum Life
                Regenerate 1% of Life per second
            </EditedNode>
        </Spec>
    </Tree>
    
    <!-- Items (if any) -->
    <!-- ... -->
</PathOfBuilding>
```

---

## 7. TypeScript Wrapper Recommendations

Based on the codebase analysis, here's what to expose:

### Core API Classes

```typescript
class Build {
    spec: PassiveSpec
    itemsTab: ItemsTab
    skillsTab: SkillsTab
    calcsTab: CalcsTab
    
    characterLevel: number
    targetVersion: string
    bandit: string
    pantheonMajorGod: string
    pantheonMinorGod: string
    
    buildFlag: boolean  // Needs recalculation
    modFlag: boolean    // Has unsaved changes
    
    recalculate(): void
    save(): string  // Returns XML
    load(xml: string): void
}

class PassiveSpec {
    allocNodes: Map<number, PassiveNode>
    jewels: Map<number, Item>
    masterySelections: Map<number, number>
    
    allocNode(nodeId: number, altPath?: number[]): void
    deallocNode(nodeId: number): void
    countAllocNodes(): { used: number, ascUsed: number, secondaryAscUsed: number }
    selectClass(classId: number): void
    selectAscendClass(ascendClassId: number): void
    resetNodes(): void
}

interface PassiveNode {
    id: number
    name: string
    type: "Keystone" | "Notable" | "Normal" | "Mastery" | "ClassStart"
    alloc: boolean
    path: PassiveNode[]
    depends: PassiveNode[]
}

class ItemsTab {
    items: Item[]
    itemSets: Map<number, ItemSet>
    activeItemSetId: number
    
    addItem(item: Item): void
    deleteItem(item: Item): void
    equipItemInSet(item: Item, setId: number): void
    getEquippedSlotForItem(item: Item): string
    setActiveItemSet(setId: number): void
}

interface ItemSet {
    id: number
    title: string
    items: Map<string, Item>
}

class SkillsTab {
    socketGroupList: SocketGroup[]
    skillSets: Map<number, SkillSet>
    activeSkillSetId: number
    
    setActiveSkillSet(setId: number): void
    newSkillSet(setId?: number): SkillSet
}

interface SocketGroup {
    label: string
    slot: string
    enabled: boolean
    gemList: GemInstance[]
    mainActiveSkill: number
}

interface GemInstance {
    nameSpec: string
    gemId: string
    skillId: string
    level: number
    quality: number
    qualityId: "Default" | "Alternate1" | "Alternate2" | "Alternate3"
    enabled: boolean
}

class CalcsTab {
    mainOutput: Readonly<{
        Life: number
        EnergyShield: number
        Armour: number
        TotalDPS: number
        CombinedDPS: number
        [key: string]: number | string | boolean
    }>
    
    buildOutput(): void
}
```

### Operation Examples

```typescript
// Allocate passive
build.spec.allocNode(30335)
build.recalculate()

// Add item
const item = new Item()
item.parseRaw("Item text here")
build.itemsTab.addItem(item)
build.recalculate()

// Modify gem
const socketGroup = build.skillsTab.socketGroupList[0]
socketGroup.gemList[0].nameSpec = "New Gem"
socketGroup.gemList[0].level = 21
build.recalculate()

// Get results
const dps = build.calcsTab.mainOutput.TotalDPS
const life = build.calcsTab.mainOutput.Life
```

---

## Summary

**Key Points for MCP Integration:**

1. **Passive Tree**: Node allocation uses numeric IDs, stored in `build.spec.allocNodes`
2. **Items**: Slot names are strings (e.g., "Helmet", "Body Armour"), items stored in `build.itemsTab.itemSets[id].items`
3. **Gems**: Stored in arrays within socket groups, identified by nameSpec/gemId
4. **Recalculation**: Automatic when `buildFlag = true`, triggered by any modification
5. **Output**: All calculated values in `build.calcsTab.mainOutput`
6. **XML Format**: Standard PoB format with Build, Skills, Tree, Items sections
7. **Undo System**: All components inherit from UndoHandler for undo/redo support

