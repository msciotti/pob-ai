# Path of Building - Advanced Implementation Patterns

## Complete Implementation Examples

### Example 1: Complete Passive Tree Modification Workflow

```lua
-- Access the build's passive spec
local spec = build.spec
local tree = spec.tree

-- Find a node by ID
local targetNodeId = 30335
local targetNode = spec.nodes[targetNodeId]

-- Check if the node can be allocated
if targetNode and targetNode.path then
    -- Check if there's a valid path from class start
    if #targetNode.path > 0 then
        -- Allocate the node (this allocates all nodes along the path)
        spec:AllocNode(targetNode)
        
        -- Check allocation status
        local used, ascUsed, secondaryAscUsed, sockets = spec:CountAllocNodes()
        print(string.format("Allocated: %d points, %d ascendancy, %d secondary, %d sockets",
                          used, ascUsed, secondaryAscUsed, sockets))
        
        -- Trigger recalculation
        build.buildFlag = true
    end
end

-- To deallocate a node:
if spec.allocNodes[targetNodeId] then
    spec:DeallocNode(spec.allocNodes[targetNodeId])
    build.buildFlag = true
end
```

### Example 2: Item Management - Creating and Equipping

```lua
-- Create a new item from raw text
local itemRaw = [[Rarity: Rare
Crown of the Tyrant
Leather Crown
--------
Requirements:
Level: 60
Int: 134
--------
+40 to maximum Mana
40% increased Spell Damage
+2 to Level of Socketed Support Gems
--------
30% increased Mana Regeneration Rate
]]

local newItem = new("Item", itemRaw)

-- Get the current item set
local itemsTab = build.itemsTab
local currentSet = itemsTab.itemSets[itemsTab.activeItemSetId]

-- Find where this item should go
local validSlots = {"Helmet", "Body Armour", "Gloves", "Boots"}
for _, slotName in ipairs(validSlots) do
    if itemsTab:IsItemValidForSlot(newItem, slotName, currentSet) then
        -- Add the item to the build
        itemsTab:AddItem(newItem, false)  -- false = auto-equip
        
        -- Manually set which slot (optional, as AddItem auto-equips)
        currentSet.items[slotName] = newItem
        break
    end
end

-- Create undo state
itemsTab:AddUndoState()
build.buildFlag = true
```

### Example 3: Skill Setup - Adding Support Gems

```lua
-- Get or create a socket group
local skillsTab = build.skillsTab
local socketGroup = skillsTab.socketGroupList[1]

-- If socket group doesn't exist, create one
if not socketGroup then
    socketGroup = {
        enabled = true,
        includeInFullDPS = true,
        label = "Main Skill",
        slot = "Weapon 1",
        gemList = {},
        mainActiveSkill = 1,
        mainActiveSkillCalcs = 1
    }
    table.insert(skillsTab.socketGroupList, socketGroup)
end

-- Add main skill (first gem)
socketGroup.gemList[1] = {
    nameSpec = "Fireball",
    gemId = "Metadata/Items/Gems/SkillGemFireball",
    skillId = "Fireball",
    level = 20,
    quality = 20,
    qualityId = "Default",
    enabled = true,
    enableGlobal1 = true,
    enableGlobal2 = true,
    count = 1
}

-- Add support gems
local supportGems = {
    { name = "Spell Echo", id = "Metadata/Items/Gems/SupportGemEchoMelee" },
    { name = "Critical Strike Chance", id = "Metadata/Items/Gems/SupportGemCritical" },
    { name = "Increased Spell Damage", id = "Metadata/Items/Gems/SupportGemDamageSpell" }
}

for i, gemData in ipairs(supportGems) do
    socketGroup.gemList[i + 1] = {
        nameSpec = gemData.name,
        gemId = gemData.id,
        skillId = nil,
        level = 20,
        quality = 0,
        qualityId = "Default",
        enabled = true,
        enableGlobal1 = true,
        enableGlobal2 = true,
        count = 1
    }
end

-- Process the socket group to update calculations
skillsTab:ProcessSocketGroup(socketGroup)
skillsTab:AddUndoState()
build.buildFlag = true
```

### Example 4: Batch Build Modifications

```lua
-- Function to modify multiple aspects of a build
function ModifyBuild(build, modifications)
    -- Store initial state for undo
    local initialState = {
        specModFlag = build.spec.modFlag,
        itemsModFlag = build.itemsTab.modFlag,
        skillsModFlag = build.skillsTab.modFlag
    }
    
    -- Modify passive tree
    if modifications.passives then
        for _, nodeId in ipairs(modifications.passives) do
            local node = build.spec.nodes[nodeId]
            if node then
                build.spec:AllocNode(node)
            end
        end
        build.spec.modFlag = true
    end
    
    -- Modify items
    if modifications.items then
        for slotName, itemRaw in pairs(modifications.items) do
            if itemRaw then
                local newItem = new("Item", itemRaw)
                local itemSet = build.itemsTab.itemSets[build.itemsTab.activeItemSetId]
                if itemSet then
                    itemSet.items[slotName] = newItem
                end
            end
        end
        build.itemsTab.modFlag = true
    end
    
    -- Modify skills
    if modifications.skills then
        build.skillsTab.socketGroupList = modifications.skills
        build.skillsTab.modFlag = true
    end
    
    -- Modify character settings
    if modifications.characterLevel then
        build.characterLevel = m_min(m_max(modifications.characterLevel, 1), 100)
    end
    if modifications.bandit then
        build.bandit = modifications.bandit
    end
    if modifications.pantheonMajor then
        build.pantheonMajorGod = modifications.pantheonMajor
    end
    if modifications.pantheonMinor then
        build.pantheonMinorGod = modifications.pantheonMinor
    end
    
    -- Trigger full recalculation
    build.buildFlag = true
    
    return initialState
end
```

---

## XML Load/Save Patterns

### Example 5: Saving Build to XML

```lua
-- Create XML document
local xml = { }

-- Build element
xml.attrib = {
    level = tostring(build.characterLevel),
    targetVersion = build.targetVersion,
    pantheonMajorGod = build.pantheonMajorGod,
    bandit = build.bandit,
    className = "Marauder",  -- From class data
    ascendClassName = "Berserker",  -- From ascendancy data
    mainSocketGroup = "1",
    viewMode = build.viewMode,
    pantheonMinorGod = build.pantheonMinorGod
}

-- Save passive spec
local specXml = { elem = "Tree", attrib = { activeSpec = "1" } }
local specNode = { 
    elem = "Spec",
    attrib = {
        classId = tostring(build.spec.curClassId),
        ascendClassId = tostring(build.spec.curAscendClassId),
        treeVersion = build.spec.treeVersion,
        nodes = table.concat(GetAllocatedNodeIds(build.spec), ",")
    }
}
table.insert(specXml, specNode)

-- Save items
if build.itemsTab then
    local itemsXml = build.itemsTab:Save({})
    table.insert(xml, itemsXml)
end

-- Save skills
if build.skillsTab then
    local skillsXml = build.skillsTab:Save({})
    table.insert(xml, skillsXml)
end

return xml
```

### Example 6: Loading Build from XML

```lua
function LoadBuildFromXML(xmlString, buildName)
    -- Parse XML
    local xml = ParseXML(xmlString)
    
    -- Create new build
    local build = new("Build", nil, buildName, xmlString)
    
    -- Load passive tree specification
    if xml["Tree"] then
        local treeXml = xml["Tree"]
        for _, spec in ipairs(treeXml) do
            if spec.elem == "Spec" then
                local nodes = {}
                for hash in spec.attrib.nodes:gmatch("%d+") do
                    table.insert(nodes, tonumber(hash))
                end
                build.spec:ImportFromNodeList(
                    tonumber(spec.attrib.classId),
                    tonumber(spec.attrib.ascendClassId),
                    0,
                    nodes,
                    {},
                    {},
                    spec.attrib.treeVersion
                )
            end
        end
    end
    
    -- Load items
    if xml["Items"] then
        build.itemsTab:Load(xml["Items"], buildName)
    end
    
    -- Load skills
    if xml["Skills"] then
        build.skillsTab:Load(xml["Skills"], buildName)
    end
    
    -- Trigger initial calculation
    build.buildFlag = true
    build:OnFrame({})
    
    return build
end
```

---

## Performance Patterns

### Example 7: Batch Operations with Minimal Recalculations

```lua
-- INEFFICIENT: Recalculates after each change
for _, nodeId in ipairs(nodeIds) do
    local node = build.spec.nodes[nodeId]
    if node then
        build.spec:AllocNode(node)
        build.buildFlag = true  -- RECALCS EVERY ITERATION
    end
end

-- EFFICIENT: Single recalculation after all changes
-- Temporarily disable auto-recalc
local wasBuildFlag = build.buildFlag
build.buildFlag = false

for _, nodeId in ipairs(nodeIds) do
    local node = build.spec.nodes[nodeId]
    if node then
        build.spec:AllocNode(node)
    end
end

-- Single recalculation
build.buildFlag = true
build:OnFrame({})
```

### Example 8: Monitoring Calculation Output

```lua
-- Store previous output for comparison
local previousOutput = {}

function MonitorBuildChanges(build)
    local currentOutput = build.calcsTab.mainOutput
    local changes = {}
    
    -- Compare all output values
    for key, newValue in pairs(currentOutput) do
        local oldValue = previousOutput[key]
        if oldValue ~= newValue then
            if type(newValue) == "number" and type(oldValue) == "number" then
                local percentChange = (newValue - oldValue) / oldValue * 100
                table.insert(changes, {
                    stat = key,
                    old = oldValue,
                    new = newValue,
                    change = percentChange
                })
            else
                table.insert(changes, {
                    stat = key,
                    old = oldValue,
                    new = newValue
                })
            end
        end
    end
    
    -- Update stored output
    previousOutput = CopyTable(currentOutput)
    
    return changes
end
```

---

## Data Access Patterns

### Example 9: Node Queries and Filtering

```lua
-- Find all allocated keystones
function GetAllocatedKeystones(spec)
    local keystones = {}
    for _, node in pairs(spec.allocNodes) do
        if node.type == "Keystone" then
            table.insert(keystones, node)
        end
    end
    return keystones
end

-- Find nodes by name pattern
function FindNodesByName(spec, pattern)
    local matches = {}
    for _, node in pairs(spec.nodes) do
        if node.name and node.name:match(pattern) then
            table.insert(matches, node)
        end
    end
    return matches
end

-- Get all nodes allocated in a specific tree region
function GetNodesInRegion(spec, classId)
    local regionNodes = {}
    for _, node in pairs(spec.allocNodes) do
        -- Nodes belong to a class if they're in that area
        if node.group and node.group.classId == classId then
            table.insert(regionNodes, node)
        end
    end
    return regionNodes
end
```

### Example 10: Item Queries

```lua
-- Get all items in a specific slot category
function GetItemsInSlots(itemsTab, slots)
    local items = {}
    local itemSet = itemsTab.itemSets[itemsTab.activeItemSetId]
    
    for _, slotName in ipairs(slots) do
        local item = itemSet.items[slotName]
        if item then
            table.insert(items, { slot = slotName, item = item })
        end
    end
    
    return items
end

-- Get total item rarity count
function CountItemsByRarity(itemsTab)
    local itemSet = itemsTab.itemSets[itemsTab.activeItemSetId]
    local rarityCount = { NORMAL = 0, MAGIC = 0, RARE = 0, UNIQUE = 0, RELIC = 0 }
    
    for _, item in pairs(itemSet.items) do
        if item.rarity then
            rarityCount[item.rarity] = (rarityCount[item.rarity] or 0) + 1
        end
    end
    
    return rarityCount
end
```

### Example 11: Skill/Gem Queries

```lua
-- Find main active skill gem
function GetMainActiveSkill(skillsTab)
    local socketGroup = skillsTab.socketGroupList[1]
    if socketGroup and socketGroup.gemList[socketGroup.mainActiveSkill] then
        return socketGroup.gemList[socketGroup.mainActiveSkill]
    end
    return nil
end

-- Count total support gems
function CountSupportGems(skillsTab)
    local count = 0
    for _, socketGroup in ipairs(skillsTab.socketGroupList) do
        if socketGroup.enabled then
            -- First gem is active, rest are supports
            count = count + #socketGroup.gemList - 1
        end
    end
    return count
end

-- Find gems matching criteria
function FindGems(skillsTab, criteria)
    local found = {}
    for _, socketGroup in ipairs(skillsTab.socketGroupList) do
        for _, gem in ipairs(socketGroup.gemList) do
            if gem.nameSpec and gem.nameSpec:match(criteria.name or "") then
                if (criteria.minLevel == nil or gem.level >= criteria.minLevel) then
                    if (criteria.maxLevel == nil or gem.level <= criteria.maxLevel) then
                        table.insert(found, gem)
                    end
                end
            end
        end
    end
    return found
end
```

---

## Error Handling Patterns

### Example 12: Safe Build Modifications

```lua
function SafeAllocateNode(build, nodeId)
    -- Validate inputs
    if not build or not build.spec then
        return false, "Invalid build object"
    end
    
    if not nodeId or type(nodeId) ~= "number" then
        return false, "Invalid node ID"
    end
    
    -- Check if node exists
    local node = build.spec.nodes[nodeId]
    if not node then
        return false, string.format("Node %d not found", nodeId)
    end
    
    -- Check if already allocated
    if build.spec.allocNodes[nodeId] then
        return false, string.format("Node %d already allocated", nodeId)
    end
    
    -- Check if node has valid path
    if not node.path or #node.path == 0 then
        return false, string.format("Node %d has no valid path from class start", nodeId)
    end
    
    -- Perform allocation
    local success, err = pcall(function()
        build.spec:AllocNode(node)
        build.buildFlag = true
    end)
    
    if not success then
        return false, string.format("Error allocating node: %s", err)
    end
    
    return true, "Node allocated successfully"
end

-- Usage
local success, message = SafeAllocateNode(build, 30335)
if success then
    print("Success: " .. message)
else
    print("Error: " .. message)
end
```

---

## Utility Functions

### Example 13: Helper Functions for Common Tasks

```lua
-- Convert allocated nodes to ID list
function GetAllocatedNodeIds(spec)
    local ids = {}
    for nodeId in pairs(spec.allocNodes) do
        table.insert(ids, tostring(nodeId))
    end
    table.sort(ids, function(a, b) return tonumber(a) < tonumber(b) end)
    return ids
end

-- Deep copy a table
function CopyTable(tbl)
    if type(tbl) ~= "table" then
        return tbl
    end
    local result = {}
    for k, v in pairs(tbl) do
        result[k] = CopyTable(v)
    end
    return result
end

-- Merge two tables
function MergeTables(t1, t2)
    local result = CopyTable(t1)
    for k, v in pairs(t2) do
        result[k] = v
    end
    return result
end

-- Check if all elements in array
function TableContainsAll(array, elements)
    for _, elem in ipairs(elements) do
        local found = false
        for _, arrayElem in ipairs(array) do
            if arrayElem == elem then
                found = true
                break
            end
        end
        if not found then
            return false
        end
    end
    return true
end
```

---

## Key Implementation Checklist

When building the TypeScript MCP wrapper, ensure you:

1. **Passive Tree**
   - [ ] Expose `allocNodes` map (nodeId -> boolean)
   - [ ] Provide `allocNode(nodeId)` and `deallocNode(nodeId)` methods
   - [ ] Support `countAllocNodes()` to get point usage
   - [ ] Handle path validation before allocation

2. **Items**
   - [ ] Support item parsing from raw text
   - [ ] Expose slot names as constants
   - [ ] Provide `addItem()`, `deleteItem()`, `equipItemInSet()`
   - [ ] Allow querying current item in slot

3. **Skills/Gems**
   - [ ] Support gem specification by nameSpec and gemId
   - [ ] Allow setting gem level/quality with validation
   - [ ] Support multiple socket groups
   - [ ] Handle active skill vs support gem distinction

4. **Build State**
   - [ ] Expose `buildFlag` to trigger recalculation
   - [ ] Provide `recalculate()` method for immediate calculation
   - [ ] Expose `calcsTab.mainOutput` with all stats
   - [ ] Support XML import/export

5. **Error Handling**
   - [ ] Validate all node IDs exist before allocation
   - [ ] Check path connectivity
   - [ ] Validate item slots exist
   - [ ] Handle gem ID lookups with fallbacks

