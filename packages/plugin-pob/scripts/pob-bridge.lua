#!/usr/bin/env luajit
-- PoB Bridge: Provides JSON API over stdin/stdout to HeadlessWrapper

-- Get paths from arguments
local pobPath = arg[1] or "."
local dkjsonPath = arg[2] -- Path to bundled modules (dkjson, base64, xml, etc.)

-- Add bundled modules to package path FIRST so they override any system modules
if dkjsonPath then
  package.path = dkjsonPath .. "/?.lua;" .. dkjsonPath .. "/?/init.lua;" .. package.path
end

-- Add PoB modules to path
package.path = pobPath .. "/?.lua;" .. package.path

-- Add PoB runtime modules (xml, sha1, etc.)
local runtimeLuaPath = pobPath:gsub("/src$", "") .. "/runtime/lua"
package.path = runtimeLuaPath .. "/?.lua;" .. runtimeLuaPath .. "/?/init.lua;" .. package.path

-- Add PoB runtime directory for compiled modules (lua-utf8.so, etc.)
local runtimePath = pobPath:gsub("/src$", "") .. "/runtime"
package.cpath = runtimePath .. "/?.so;" .. package.cpath

-- Load JSON library (dkjson is a pure Lua JSON library)
local success, json = pcall(require, "dkjson")
if not success then
  print(string.format([[{"status":"error","message":"dkjson not found. Tried paths: %s"}]], package.path))
  os.exit(1)
end

-- Mock lua-utf8 module for headless mode (GUI text controls need this, but we don't)
package.preload["lua-utf8"] = function()
  return {
    len = function(s) return #s end,
    sub = string.sub,
    upper = string.upper,
    lower = string.lower,
    reverse = string.reverse,
    byte = string.byte,
    char = string.char,
    find = string.find,
    gmatch = string.gmatch,
    gsub = string.gsub,
    match = string.match,
  }
end

-- Load HeadlessWrapper (this loads all of PoB)
print(json.encode({status = "loading", message = "Loading PoB..."}))
io.flush()
dofile(pobPath .. "/HeadlessWrapper.lua")

-- Initialize inputEvents as empty table for headless mode
inputEvents = {}

print(json.encode({status = "ready", message = "PoB loaded successfully"}))
io.flush()

-- API functions
local api = {}

-- Convert a loaded build (read-only) to a modifiable build
-- This is necessary because loadBuildFromXML/importFromCode create read-only builds
-- Following PoB's test pattern: always use newBuild() for modifiable builds
-- @param preserveState: if false, create a fresh build without preserving any state
local function convertToModifiableBuild(preserveState)
  if not build then
    return {success = false, error = "No build to convert"}
  end

  -- Default to preserving state for backward compatibility
  if preserveState == nil then
    preserveState = true
  end

  -- If not preserving state, just create a fresh build
  if not preserveState then
    newBuild()
    build = launch.main.modes["BUILD"]

    -- Trigger initial calculations for the fresh build
    if build.configTab and build.configTab.BuildModList then
      build.configTab:BuildModList()
    end
    if build.calcsTab and build.calcsTab.BuildOutput then
      build.calcsTab:BuildOutput()
    end

    return {success = true, message = "Fresh build created"}
  end

  -- Extract all build state before creating new build
  local state = {
    characterLevel = build.characterLevel,
    targetVersion = build.targetVersion,
    bandit = build.bandit,
    pantheonMajorGod = build.pantheonMajorGod,
    pantheonMinorGod = build.pantheonMinorGod,
  }

  -- Extract character class and ascendancy
  if build.spec then
    state.className = build.spec.curClassName
    state.ascendClassName = build.spec.curAscendClassName
    state.classId = build.spec.curClassId
    state.ascendClassId = build.spec.curAscendClassId

    -- Extract allocated passives (node IDs)
    state.allocatedNodes = {}
    for nodeId, node in pairs(build.spec.allocNodes) do
      table.insert(state.allocatedNodes, nodeId)
    end

    -- Extract jewels
    state.jewels = {}
    for nodeId, itemId in pairs(build.spec.jewels) do
      if itemId and itemId > 0 then
        state.jewels[nodeId] = itemId
      end
    end
  end

  -- Extract items (we'll re-add them after creating new build)
  state.items = {}
  if build.itemsTab and build.itemsTab.items then
    for _, item in ipairs(build.itemsTab.items) do
      if item and item.raw then
        table.insert(state.items, {
          raw = item.raw,
          id = item.id
        })
      end
    end
  end

  -- Extract active item set
  state.equippedItems = {}
  if build.itemsTab and build.itemsTab.activeItemSet then
    for slotName, slot in pairs(build.itemsTab.activeItemSet) do
      if type(slot) == "table" and slot.selItemId and slot.selItemId > 0 then
        state.equippedItems[slotName] = slot.selItemId
      end
    end
  end

  -- Extract socket groups
  state.socketGroups = {}
  if build.skillsTab and build.skillsTab.socketGroupList then
    for i, group in ipairs(build.skillsTab.socketGroupList) do
      local groupCopy = {
        enabled = group.enabled,
        label = group.label,
        slot = group.slot,
        gemList = {}
      }

      for j, gem in ipairs(group.gemList) do
        table.insert(groupCopy.gemList, {
          nameSpec = gem.nameSpec,
          level = gem.level,
          quality = gem.quality,
          enabled = gem.enabled
        })
      end

      table.insert(state.socketGroups, groupCopy)
    end
  end

  -- Extract config
  state.config = {}
  if build.configTab and build.configTab.configSets and build.configTab.activeConfigSetId then
    local configSet = build.configTab.configSets[build.configTab.activeConfigSetId]
    if configSet and configSet.input then
      for var, value in pairs(configSet.input) do
        state.config[var] = value
      end
    end
  end

  -- Create new modifiable build
  newBuild()

  -- CRITICAL: Update global build reference after newBuild()
  -- newBuild() calls SetMode which creates a new BUILD mode in launch.main.modes["BUILD"],
  -- but doesn't update the global 'build' variable. We MUST refresh it.
  -- 'launch' is a global set by Launch.lua and is the main application object.
  build = launch.main.modes["BUILD"]

  -- Restore character level and version
  if state.characterLevel then
    build.characterLevel = state.characterLevel
  end
  if state.targetVersion then
    build.targetVersion = state.targetVersion
  end

  -- Restore bandit and pantheon
  if state.bandit then
    build.bandit = state.bandit
  end
  if state.pantheonMajorGod then
    build.pantheonMajorGod = state.pantheonMajorGod
  end
  if state.pantheonMinorGod then
    build.pantheonMinorGod = state.pantheonMinorGod
  end

  -- Restore character class and ascendancy
  if build.spec and state.classId then
    build.spec:SelectClass(state.classId)
    if state.ascendClassId then
      build.spec:SelectAscendClass(state.ascendClassId)
    end
  end

  -- Restore items
  local itemIdMap = {}  -- Map old item IDs to new item IDs
  if build.itemsTab and state.items then
    for _, itemData in ipairs(state.items) do
      local newItem = new("Item", itemData.raw)
      if newItem and newItem.base then
        build.itemsTab:AddItem(newItem, true)  -- true = no auto-equip
        itemIdMap[itemData.id] = newItem.id
      end
    end
  end

  -- Restore equipped items
  if build.itemsTab and state.equippedItems then
    for slotName, oldItemId in pairs(state.equippedItems) do
      local newItemId = itemIdMap[oldItemId]
      if newItemId and build.itemsTab.slots[slotName] then
        build.itemsTab.slots[slotName]:SetSelItemId(newItemId)
      end
    end
  end

  -- Restore socket groups
  if build.skillsTab and state.socketGroups then
    for _, groupData in ipairs(state.socketGroups) do
      local socketGroup = {
        enabled = groupData.enabled,
        label = groupData.label,
        slot = groupData.slot,
        includeInFullDPS = false,
        groupCount = 1,
        mainActiveSkill = 1,
        mainActiveSkillCalcs = 1,
        gemList = {}
      }

      for _, gemData in ipairs(groupData.gemList) do
        table.insert(socketGroup.gemList, {
          nameSpec = gemData.nameSpec,
          level = gemData.level,
          quality = gemData.quality,
          enabled = gemData.enabled,
          enableGlobal1 = true,
          enableGlobal2 = false,
          count = 1
        })
      end

      build.skillsTab:ProcessSocketGroup(socketGroup)

      -- Ensure skill sets are initialized
      if not build.skillsTab.activeSkillSetId or build.skillsTab.activeSkillSetId == 0 then
        build.skillsTab:SetActiveSkillSet(1)
      end

      local activeSkillSet = build.skillsTab.skillSets[build.skillsTab.activeSkillSetId]
      if activeSkillSet then
        build.skillsTab.activeSkillSet = activeSkillSet
        table.insert(activeSkillSet.socketGroupList, socketGroup)
        build.skillsTab.socketGroupList = activeSkillSet.socketGroupList
      end
    end
  end

  -- Restore allocated passives
  if build.spec and state.allocatedNodes then
    for _, nodeId in ipairs(state.allocatedNodes) do
      local node = build.spec.nodes[nodeId]
      if node and not node.alloc then
        -- Rebuild paths before allocation
        build.spec:BuildAllDependsAndPaths()
        -- Allocate the node
        build.spec:AllocNode(node)
      end
    end
  end

  -- Restore jewels
  if build.spec and state.jewels then
    for nodeId, oldItemId in pairs(state.jewels) do
      local newItemId = itemIdMap[oldItemId]
      if newItemId then
        build.spec.jewels[nodeId] = newItemId
      end
    end
  end

  -- Restore config
  if build.configTab and state.config then
    local configSet = build.configTab.configSets[build.configTab.activeConfigSetId]
    if configSet then
      for var, value in pairs(state.config) do
        configSet.input[var] = value
      end
    end
  end

  -- Mark build as needing rebuild
  build.modFlag = true
  build.buildFlag = true

  -- Trigger OnFrame to ensure calculations are complete
  runCallback("OnFrame")

  return {success = true}
end

function api.newBuild()
  newBuild()
  return {success = true, message = "Build created"}
end

function api.loadBuildFromXML(params)
  local xml = params.xml
  local name = params.name or "Imported Build"
  local preserveState = params.preserveState
  if preserveState == nil then
    preserveState = true  -- Default to preserving state
  end

  -- Load build from XML. HeadlessWrapper's loadBuildFromXML() calls SetMode()
  -- and OnFrame(), which creates and initializes a new build instance.
  -- The global 'build' variable is already set by HeadlessWrapper.
  loadBuildFromXML(xml, name)

  -- Convert to modifiable build (following PoB's test pattern)
  local convertResult = convertToModifiableBuild(preserveState)
  if not convertResult.success then
    return {success = false, error = "Failed to convert build: " .. (convertResult.error or "unknown error")}
  end

  return {success = true, message = "Build loaded and made modifiable: " .. name}
end

function api.importFromCode(params)
  local code = params.code
  local name = params.name or "Imported Build"
  local preserveState = params.preserveState
  if preserveState == nil then
    preserveState = true  -- Default to preserving state for backward compatibility
  end

  -- Decode pastebin code: reverse URL-safe encoding, base64 decode, then inflate
  -- Based on ImportTab.lua:294
  local buf = code:gsub("-","+"):gsub("_","/")
  local decoded = common.base64.decode(buf)
  local xmlText = Inflate(decoded)

  -- Load the decoded XML. HeadlessWrapper's loadBuildFromXML() calls SetMode()
  -- and OnFrame(), which creates and initializes a new build instance.
  -- The global 'build' variable is already set by HeadlessWrapper.
  loadBuildFromXML(xmlText, name)

  -- Convert to modifiable build (following PoB's test pattern)
  local convertResult = convertToModifiableBuild(preserveState)
  if not convertResult.success then
    return {success = false, error = "Failed to convert build: " .. (convertResult.error or "unknown error")}
  end

  return {success = true, message = "Build imported and made modifiable: " .. name}
end

function api.getStats()
  if not build then
    return {success = false, error = "No build loaded"}
  end

  if not build.calcsTab or not build.calcsTab.mainOutput then
    return {success = false, error = "Build calculations not available"}
  end

  local stats = {}
  for key, value in pairs(build.calcsTab.mainOutput) do
    if type(value) == "number" then
      stats[key] = value
    end
  end

  return {success = true, stats = stats}
end

-- Rebuild paths from all allocated nodes to find connectable nodes
function api.rebuildPaths()
  if not build or not build.spec then
    return {success = false, error = "Build not initialized"}
  end

  build.spec:BuildAllDependsAndPaths()
  return {success = true, message = "Paths rebuilt"}
end

-- Get information about a node (for pathfinding/debugging)
function api.getNodeInfo(params)
  local nodeName = params.nodeName

  if not build or not build.spec then
    return {success = false, error = "Build not initialized"}
  end

  for nodeId, node in pairs(build.spec.nodes) do
    if node.name == nodeName then
      local info = {
        id = node.id,
        name = node.name,
        type = node.type,
        isKeystone = node.isKeystone or false,
        isNotable = node.isNotable or false,
        isJewelSocket = node.isJewelSocket or false,
        allocated = node.alloc or false,
        hasPath = node.path ~= nil,
        pathLength = node.path and #node.path or 0
      }
      return {success = true, node = info}
    end
  end

  return {success = false, error = "Node not found: " .. nodeName}
end

-- Get list of all allocated nodes
function api.getAllocatedNodes()
  if not build or not build.spec then
    return {success = false, error = "Build not initialized"}
  end

  local allocatedNodes = {}
  for nodeId, node in pairs(build.spec.allocNodes) do
    table.insert(allocatedNodes, {
      id = node.id,
      name = node.name or "(unnamed)",
      type = node.type
    })
  end

  return {success = true, nodes = allocatedNodes, count = #allocatedNodes}
end

-- Find path to a node (returns path if exists)
function api.findPathToNode(params)
  local nodeName = params.nodeName

  if not build or not build.spec then
    return {success = false, error = "Build not initialized"}
  end

  -- Rebuild paths to ensure we have current pathfinding data
  build.spec:BuildAllDependsAndPaths()

  -- Find the target node
  for nodeId, node in pairs(build.spec.nodes) do
    if node.name == nodeName then
      if not node.path then
        return {success = false, error = "No path available to: " .. nodeName, hasPath = false}
      end

      -- Build path info
      local pathNodes = {}
      for i, pathNode in ipairs(node.path) do
        table.insert(pathNodes, {
          id = pathNode.id,
          name = pathNode.name or "(unnamed)",
          allocated = pathNode.alloc or false
        })
      end

      return {
        success = true,
        hasPath = true,
        pathLength = #node.path,
        path = pathNodes,
        message = "Path found to: " .. nodeName .. " (length: " .. #node.path .. ")"
      }
    end
  end

  return {success = false, error = "Node not found: " .. nodeName}
end

-- Allocate a passive node with automatic pathfinding
function api.allocatePassive(params)
  local nodeName = params.nodeName
  local autoPath = params.autoPath ~= false  -- Default to true
  local debug = params.debug or false  -- Default to false

  if not build or not build.spec then
    return {success = false, error = "Build not initialized"}
  end

  -- Find node by name
  for nodeId, node in pairs(build.spec.nodes) do
    if node.name == nodeName then
      -- If node is already allocated, return success
      if node.alloc then
        return {success = true, message = "Already allocated: " .. nodeName, alreadyAllocated = true}
      end

      -- Rebuild paths if autopathfinding is enabled
      if autoPath then
        build.spec:BuildAllDependsAndPaths()
      end

      -- Check if node has a path
      if not node.path then
        return {
          success = false,
          error = "Cannot allocate " .. nodeName .. ": no path to tree. Try allocating nodes closer to your starting location first.",
          hasPath = false
        }
      end

      -- Allocate the node (this will allocate all nodes along the path)
      build.spec:AllocNode(node)

      -- Mark that modifiers have changed (THIS IS CRITICAL!)
      -- This tells PoB that the modifier database needs to be rebuilt
      build.modFlag = true

      -- Mark build as needing rebuild
      build.buildFlag = true

      -- Directly trigger rebuild to ensure stats are recalculated
      -- Must call BuildModList first, then BuildOutput
      if build.configTab and build.configTab.BuildModList then
        build.configTab:BuildModList()
      end
      if build.calcsTab and build.calcsTab.BuildOutput then
        build.calcsTab:BuildOutput()
      end

      -- Basic response
      local response = {
        success = true,
        message = "Allocated: " .. nodeName,
        pathLength = #node.path,
        nodesAllocated = #node.path
      }

      -- Only include debug info if requested
      if not debug then
        return response
      end

      -- Collect debug info
      local debugInfo = {
        nodeAllocated = node.alloc or false,
        isKeystone = node.isKeystone or false,
        modCount = node.modList and #node.modList or 0,
      }

      -- Get modifiers text
      if node.modList then
        debugInfo.mods = {}
        for i, mod in ipairs(node.modList) do
          -- Mod objects have a 'name' field and other properties
          local modStr = mod.name or "unknown"
          if mod.value then
            modStr = modStr .. " = " .. tostring(mod.value)
          end
          table.insert(debugInfo.mods, modStr)
        end
      end

      -- Check keystoneMod field
      if node.keystoneMod then
        debugInfo.hasKeystoneMod = true
        local ksMod = node.keystoneMod
        debugInfo.keystoneMod = {
          name = ksMod.name or "unknown",
          type = ksMod.type or "unknown",
          value = ksMod.value and tostring(ksMod.value) or "nil"
        }

        -- Check if keystone is in keystoneMap
        if build.spec and build.spec.tree and build.spec.tree.keystoneMap then
          local ksName = ksMod.value
          if build.spec.tree.keystoneMap[ksName] then
            debugInfo.keystoneInMap = true
            local ksMapEntry = build.spec.tree.keystoneMap[ksName]
            debugInfo.keystoneMapMods = ksMapEntry.modList and #ksMapEntry.modList or 0
          else
            debugInfo.keystoneInMap = false
          end
        end
      else
        debugInfo.hasKeystoneMod = false
      end

      -- Get Life after OnFrame
      if build.calcsTab and build.calcsTab.mainOutput then
        debugInfo.lifeAfterAlloc = build.calcsTab.mainOutput["Life"]
        debugInfo.critAfterAlloc = build.calcsTab.mainOutput["CritChance"]
        debugInfo.chaosInocOutput = build.calcsTab.mainOutput["ChaosInoculation"]
      end

      -- Check what's available in calcsTab
      if build.calcsTab then
        debugInfo.hasMainEnv = build.calcsTab.mainEnv ~= nil
        debugInfo.hasMainOutput = build.calcsTab.mainOutput ~= nil

        if build.calcsTab.mainEnv then
          debugInfo.hasModDB = build.calcsTab.mainEnv.modDB ~= nil

          -- Try to check the flags in modDB if it exists
          if build.calcsTab.mainEnv.modDB then
            local modDB = build.calcsTab.mainEnv.modDB

            -- Check Chaos Inoculation flag
            local ciSuccess, ciValue = pcall(function() return modDB:Flag(nil, "ChaosInoculation") end)
            debugInfo.ciFlagCheckSuccess = ciSuccess
            if ciSuccess then
              debugInfo.chaosInocFlag = ciValue or false
            else
              debugInfo.chaosInocFlagError = tostring(ciValue)
            end

            -- Check Resolute Technique flag
            local rtSuccess, rtValue = pcall(function() return modDB:Flag(nil, "NeverCrit") end)
            debugInfo.rtFlagCheckSuccess = rtSuccess
            if rtSuccess then
              debugInfo.resoluteTechniqueFlag = rtValue or false
            else
              debugInfo.resoluteTechniqueFlagError = tostring(rtValue)
            end
          end
        end
      end

      -- Count total allocated passives
      local allocCount = 0
      for nodeId, allocNode in pairs(build.spec.allocNodes) do
        allocCount = allocCount + 1
      end
      debugInfo.totalAllocatedPassives = allocCount

      -- Attach debug info to response
      response.debug = debugInfo
      return response
    end
  end

  return {success = false, error = "Passive not found: " .. nodeName}
end

-- Equip an item from raw item text
function api.equipItem(params)
  local itemText = params.itemText
  local slotName = params.slotName  -- e.g., "Weapon 1", "Helmet", "Body Armour", "Ring 1", etc.

  if not build or not build.itemsTab then
    return {success = false, error = "Build not initialized"}
  end

  if not itemText then
    return {success = false, error = "No item text provided"}
  end

  if not slotName then
    return {success = false, error = "No slot name provided"}
  end

  -- Create item from raw text
  local newItem = new("Item", itemText)
  if not newItem.base then
    return {success = false, error = "Failed to create item from text. Invalid item format."}
  end

  -- Add item to build
  build.itemsTab:AddItem(newItem, true)  -- true = no auto-equip

  -- Equip item in slot using the slots control (not itemSet directly)
  if not build.itemsTab.slots[slotName] then
    return {success = false, error = "Invalid slot name: " .. slotName}
  end

  -- Use the slot control's SetSelItemId method for proper equipping
  build.itemsTab.slots[slotName]:SetSelItemId(newItem.id)

  -- Trigger build recalculation
  -- Must call BuildModList first, then BuildOutput
  if build.configTab and build.configTab.BuildModList then
    build.configTab:BuildModList()
  end
  if build.calcsTab and build.calcsTab.BuildOutput then
    build.calcsTab:BuildOutput()
  end

  return {
    success = true,
    message = "Equipped item in " .. slotName,
    itemId = newItem.id,
    itemName = newItem.name or "Unknown"
  }
end

-- Unequip item from a slot
function api.unequipItem(params)
  local slotName = params.slotName

  if not build or not build.itemsTab then
    return {success = false, error = "Build not initialized"}
  end

  if not slotName then
    return {success = false, error = "No slot name provided"}
  end

  if not build.itemsTab.slots[slotName] then
    return {success = false, error = "Invalid slot name: " .. slotName}
  end

  -- Use the slot control's SetSelItemId method
  build.itemsTab.slots[slotName]:SetSelItemId(0)  -- 0 = no item

  -- Trigger build recalculation
  -- Must call BuildModList first, then BuildOutput
  if build.configTab and build.configTab.BuildModList then
    build.configTab:BuildModList()
  end
  if build.calcsTab and build.calcsTab.BuildOutput then
    build.calcsTab:BuildOutput()
  end

  return {success = true, message = "Unequipped item from " .. slotName}
end

-- Activate or deactivate a flask
function api.activateFlask(params)
  local slotName = params.slotName  -- e.g., "Flask 1", "Flask 2", etc.
  local active = params.active

  if active == nil then
    active = true  -- Default to activating
  end

  if not build or not build.itemsTab then
    return {success = false, error = "Build not initialized"}
  end

  if not slotName then
    return {success = false, error = "No slot name provided"}
  end

  -- Check if slot control exists
  if not build.itemsTab.slots[slotName] then
    return {success = false, error = "Invalid slot name: " .. slotName}
  end

  -- Get the slot control - this is what CalcSetup checks for slot.active
  local slotControl = build.itemsTab.slots[slotName]

  -- Check if there's an item equipped in this slot
  -- Note: In Lua, 0 is truthy, so we need to check both nil and 0
  if not slotControl.selItemId or slotControl.selItemId == 0 then
    return {success = false, error = "No item equipped in " .. slotName}
  end

  -- Validate that the equipped item exists and is actually a flask
  local item = build.itemsTab.items[slotControl.selItemId]
  if not item then
    return {success = false, error = "Item not found in items table for " .. slotName}
  end

  if item.type ~= "Flask" then
    return {success = false, error = "Item in " .. slotName .. " is not a flask (type: " .. (item.type or "unknown") .. ")"}
  end

  -- Set the active state on the slot control itself
  slotControl.active = active

  -- Also set it on the activate control if it exists
  if slotControl.controls and slotControl.controls.activate then
    slotControl.controls.activate.state = active
  end

  -- Trigger build recalculation
  if build.configTab and build.configTab.BuildModList then
    build.configTab:BuildModList()
  end
  if build.calcsTab and build.calcsTab.BuildOutput then
    build.calcsTab:BuildOutput()
  end

  return {
    success = true,
    message = (active and "Activated" or "Deactivated") .. " flask in " .. slotName
  }
end

-- Set custom mods (for testing if custom mods work at all)
function api.setCustomMods(params)
  local mods = params.mods or ""

  if not build or not build.configTab then
    return {success = false, error = "Build not initialized"}
  end

  build.configTab.input.customMods = mods
  build.configTab:BuildModList()

  -- Mark build as needing rebuild
  build.buildFlag = true

  -- Trigger OnFrame to ensure calculations are done
  runCallback("OnFrame")

  return {success = true, message = "Custom mods set"}
end

-- Create a new build (like PoB's tests)
function api.newBuild(params)
  newBuild()  -- Call HeadlessWrapper's newBuild function
  return {success = true, message = "New build created"}
end

-- Get list of all equipped items
function api.getEquippedItems(params)
  if not build or not build.itemsTab then
    return {success = false, error = "Build not initialized"}
  end

  local itemSet = build.itemsTab.activeItemSet
  if not itemSet then
    return {success = false, error = "No active item set"}
  end

  local equippedItems = {}
  for slotName, slot in pairs(itemSet) do
    if type(slot) == "table" and slot.selItemId and slot.selItemId ~= 0 then
      local item = build.itemsTab.items[slot.selItemId]
      if item then
        table.insert(equippedItems, {
          slot = slotName,
          itemId = item.id,
          name = item.name or "Unknown",
          rarity = item.rarity
        })
      end
    end
  end

  return {success = true, items = equippedItems, count = #equippedItems}
end

-- Add a socket group with gems
function api.addSocketGroup(params)
  local label = params.label or "New Group"
  local gems = params.gems or {}  -- Array of {nameSpec, level, quality, enabled}
  local enabled = params.enabled ~= false  -- Default to true
  local slot = params.slot  -- Optional: "Weapon 1", "Body Armour", etc.

  if not build or not build.skillsTab then
    return {success = false, error = "Build not initialized"}
  end

  -- Create socket group
  local socketGroup = {
    enabled = enabled,
    includeInFullDPS = false,
    groupCount = 1,
    label = label,
    slot = slot,
    source = nil,
    mainActiveSkill = 1,
    mainActiveSkillCalcs = 1,
    gemList = {}
  }

  -- Add gems to the group
  for i, gemData in ipairs(gems) do
    local gemInstance = {
      nameSpec = gemData.nameSpec or gemData.name,
      level = gemData.level or 20,
      quality = gemData.quality or 0,
      enabled = gemData.enabled ~= false,  -- Default to true
      enableGlobal1 = true,
      enableGlobal2 = false,
      count = 1
    }
    table.insert(socketGroup.gemList, gemInstance)
  end

  -- Process the socket group (initializes gem data)
  build.skillsTab:ProcessSocketGroup(socketGroup)

  -- Ensure skill sets are initialized
  if not build.skillsTab.activeSkillSetId or build.skillsTab.activeSkillSetId == 0 then
    build.skillsTab:SetActiveSkillSet(1)
  end

  -- Get the active skill set
  local activeSkillSet = build.skillsTab.skillSets[build.skillsTab.activeSkillSetId]
  if not activeSkillSet then
    return {success = false, error = "No active skill set after initialization"}
  end

  -- Update activeSkillSet reference
  build.skillsTab.activeSkillSet = activeSkillSet

  table.insert(activeSkillSet.socketGroupList, socketGroup)

  -- Update socket group list reference
  build.skillsTab.socketGroupList = activeSkillSet.socketGroupList

  -- Trigger build recalculation
  if build.calcsTab and build.calcsTab.BuildOutput then
    build.calcsTab:BuildOutput()
  end

  return {
    success = true,
    message = "Added socket group: " .. label,
    groupIndex = #activeSkillSet.socketGroupList,
    gemCount = #socketGroup.gemList
  }
end

-- Clear all socket groups
function api.clearSocketGroups(params)
  if not build or not build.skillsTab then
    return {success = false, error = "Build not initialized"}
  end

  local activeSkillSet = build.skillsTab.activeSkillSet
  if not activeSkillSet then
    return {success = false, error = "No active skill set"}
  end

  -- Clear all socket groups
  activeSkillSet.socketGroupList = {}
  build.skillsTab.socketGroupList = {}

  -- Trigger build recalculation
  if build.calcsTab and build.calcsTab.BuildOutput then
    build.calcsTab:BuildOutput()
  end

  return {success = true, message = "Cleared all socket groups"}
end

-- Get all socket groups
function api.getSocketGroups(params)
  if not build or not build.skillsTab then
    return {success = false, error = "Build not initialized"}
  end

  local socketGroups = {}
  for i, group in ipairs(build.skillsTab.socketGroupList) do
    local groupInfo = {
      index = i,
      label = group.label or "",
      enabled = group.enabled,
      slot = group.slot,
      gemCount = #group.gemList,
      gems = {}
    }

    for j, gem in ipairs(group.gemList) do
      table.insert(groupInfo.gems, {
        name = gem.nameSpec,
        level = gem.level,
        quality = gem.quality,
        enabled = gem.enabled
      })
    end

    table.insert(socketGroups, groupInfo)
  end

  return {success = true, socketGroups = socketGroups, count = #socketGroups}
end

-- Socket a jewel into a passive tree jewel socket
function api.socketJewel(params)
  local nodeId = params.nodeId
  local itemText = params.itemText

  if not build or not build.spec or not build.itemsTab then
    return {success = false, error = "Build not initialized"}
  end

  if not nodeId then
    return {success = false, error = "No nodeId provided"}
  end

  if not itemText then
    return {success = false, error = "No item text provided"}
  end

  -- Check if node exists and is allocated
  local node = build.spec.nodes[nodeId]
  if not node then
    return {success = false, error = "Node not found: " .. tostring(nodeId)}
  end

  if not node.alloc then
    return {success = false, error = "Node not allocated. Allocate the jewel socket node first."}
  end

  -- Check if node is a jewel socket
  if not node.isJewelSocket then
    return {success = false, error = "Node " .. tostring(nodeId) .. " is not a jewel socket"}
  end

  -- Create item from text
  local newItem = new("Item", itemText)
  if not newItem.base then
    return {success = false, error = "Failed to create item from text. Invalid item format."}
  end

  -- Verify it's a jewel
  if not newItem.jewelData then
    return {success = false, error = "Item is not a jewel"}
  end

  -- Add item to build's item list
  build.itemsTab:AddItem(newItem, true)  -- true = no auto-equip

  -- Socket the jewel
  build.spec.jewels[nodeId] = newItem.id

  -- Trigger build recalculation
  if build.calcsTab and build.calcsTab.BuildOutput then
    build.calcsTab:BuildOutput()
  end

  return {
    success = true,
    message = "Socketed jewel in node " .. tostring(nodeId),
    jewelId = newItem.id,
    jewelName = newItem.name or "Unknown"
  }
end

-- Unsocket a jewel from a passive tree jewel socket
function api.unsocketJewel(params)
  local nodeId = params.nodeId

  if not build or not build.spec then
    return {success = false, error = "Build not initialized"}
  end

  if not nodeId then
    return {success = false, error = "No nodeId provided"}
  end

  -- Check if there's a jewel in this socket
  if not build.spec.jewels[nodeId] or build.spec.jewels[nodeId] == 0 then
    return {success = false, error = "No jewel socketed in node " .. tostring(nodeId)}
  end

  -- Unsocket the jewel (set to 0)
  build.spec.jewels[nodeId] = 0

  -- Trigger build recalculation
  if build.calcsTab and build.calcsTab.BuildOutput then
    build.calcsTab:BuildOutput()
  end

  return {success = true, message = "Unsocketed jewel from node " .. tostring(nodeId)}
end

-- Get all socketed jewels
function api.getSocketedJewels(params)
  if not build or not build.spec or not build.itemsTab then
    return {success = false, error = "Build not initialized"}
  end

  local socketedJewels = {}
  for nodeId, itemId in pairs(build.spec.jewels) do
    if itemId and itemId > 0 then
      local item = build.itemsTab.items[itemId]
      if item then
        local node = build.spec.nodes[nodeId]
        table.insert(socketedJewels, {
          nodeId = nodeId,
          nodeName = node and node.name or "Unknown",
          jewelId = itemId,
          jewelName = item.name or "Unknown"
        })
      end
    end
  end

  return {success = true, jewels = socketedJewels, count = #socketedJewels}
end

-- Get all available jewel sockets (allocated nodes that are jewel sockets)
function api.getAvailableJewelSockets(params)
  if not build or not build.spec then
    return {success = false, error = "Build not initialized"}
  end

  local jewelSockets = {}
  for nodeId, node in pairs(build.spec.nodes) do
    if node.isJewelSocket and node.alloc then
      local hasJewel = build.spec.jewels[nodeId] and build.spec.jewels[nodeId] > 0
      table.insert(jewelSockets, {
        nodeId = nodeId,
        nodeName = node.name or "Jewel Socket",
        hasJewel = hasJewel
      })
    end
  end

  return {success = true, sockets = jewelSockets, count = #jewelSockets}
end

-- Set character level
function api.setCharacterLevel(params)
  local level = params.level

  if not build then
    return {success = false, error = "Build not initialized"}
  end

  if not level or level < 1 or level > 100 then
    return {success = false, error = "Level must be between 1 and 100"}
  end

  build.characterLevel = level

  -- Trigger build recalculation
  if build.calcsTab and build.calcsTab.BuildOutput then
    build.calcsTab:BuildOutput()
  end

  return {success = true, level = level}
end

-- Get character level
function api.getCharacterLevel(params)
  if not build then
    return {success = false, error = "Build not initialized"}
  end

  return {success = true, level = build.characterLevel}
end

-- Set character class
function api.setCharacterClass(params)
  local className = params.className

  if not build or not build.spec then
    return {success = false, error = "Build not initialized"}
  end

  if not className then
    return {success = false, error = "Class name required"}
  end

  -- Validate class name
  local validClasses = {"SCION", "MARAUDER", "RANGER", "WITCH", "DUELIST", "TEMPLAR", "SHADOW"}
  local isValid = false
  local normalizedName = className:upper()
  for _, valid in ipairs(validClasses) do
    if normalizedName == valid then
      isValid = true
      className = valid
      break
    end
  end

  if not isValid then
    return {success = false, error = "Invalid class name. Valid: " .. table.concat(validClasses, ", ")}
  end

  -- Find class ID
  local classId = nil
  for id, class in pairs(build.spec.tree.classes) do
    if class.name:upper() == className then
      classId = id
      break
    end
  end

  if not classId then
    return {success = false, error = "Could not find class ID for: " .. className}
  end

  -- Set the class
  build.spec:SelectClass(classId)

  -- Trigger build recalculation
  if build.calcsTab and build.calcsTab.BuildOutput then
    build.calcsTab:BuildOutput()
  end

  return {success = true, className = build.spec.curClassName}
end

-- Get character class
function api.getCharacterClass(params)
  if not build or not build.spec then
    return {success = false, error = "Build not initialized"}
  end

  return {success = true, className = build.spec.curClassName}
end

-- Set ascendancy
function api.setAscendancy(params)
  local ascendClassName = params.ascendClassName

  if not build or not build.spec then
    return {success = false, error = "Build not initialized"}
  end

  if not ascendClassName then
    return {success = false, error = "Ascendancy class name required"}
  end

  -- Find ascendancy ID
  local ascendClassId = nil
  if build.spec.curClass and build.spec.curClass.classes then
    for id, ascendClass in pairs(build.spec.curClass.classes) do
      if ascendClass.name == ascendClassName then
        ascendClassId = id
        break
      end
    end
  end

  if not ascendClassId then
    return {success = false, error = "Could not find ascendancy: " .. ascendClassName}
  end

  -- Set the ascendancy
  build.spec:SelectAscendClass(ascendClassId)

  -- Trigger build recalculation
  if build.calcsTab and build.calcsTab.BuildOutput then
    build.calcsTab:BuildOutput()
  end

  return {success = true, ascendClassName = build.spec.curAscendClassName}
end

-- Get ascendancy
function api.getAscendancy(params)
  if not build or not build.spec then
    return {success = false, error = "Build not initialized"}
  end

  return {success = true, ascendClassName = build.spec.curAscendClassName or "None"}
end

-- Set bandit reward
function api.setBandit(params)
  local bandit = params.bandit

  if not build then
    return {success = false, error = "Build not initialized"}
  end

  if not bandit then
    return {success = false, error = "Bandit choice required"}
  end

  -- Valid choices: "None", "Alira", "Oak", "Kraityn"
  local validBandits = {"None", "Alira", "Oak", "Kraityn"}
  local isValid = false
  for _, valid in ipairs(validBandits) do
    if bandit == valid then
      isValid = true
      break
    end
  end

  if not isValid then
    return {success = false, error = "Invalid bandit choice. Valid: " .. table.concat(validBandits, ", ")}
  end

  build.bandit = bandit

  -- Trigger build recalculation
  if build.calcsTab and build.calcsTab.BuildOutput then
    build.calcsTab:BuildOutput()
  end

  return {success = true, bandit = bandit}
end

-- Set pantheon
function api.setPantheon(params)
  local major = params.major
  local minor = params.minor

  if not build then
    return {success = false, error = "Build not initialized"}
  end

  if major then
    build.pantheonMajorGod = major
  end

  if minor then
    build.pantheonMinorGod = minor
  end

  -- Trigger build recalculation
  if build.calcsTab and build.calcsTab.BuildOutput then
    build.calcsTab:BuildOutput()
  end

  return {success = true, major = major or build.pantheonMajorGod, minor = minor or build.pantheonMinorGod}
end

-- Set a configuration value
function api.setConfig(params)
  local var = params.var
  local value = params.value

  if not build or not build.configTab then
    return {success = false, error = "Build not initialized"}
  end

  if not var then
    return {success = false, error = "No var provided"}
  end

  if value == nil then
    return {success = false, error = "No value provided"}
  end

  -- Get the active config set
  local configSet = build.configTab.configSets[build.configTab.activeConfigSetId]
  if not configSet then
    return {success = false, error = "No active config set"}
  end

  -- Set the value
  configSet.input[var] = value

  -- Trigger build recalculation
  if build.calcsTab and build.calcsTab.BuildOutput then
    build.calcsTab:BuildOutput()
  end

  return {success = true, message = "Config set: " .. var .. " = " .. tostring(value)}
end

-- Get a configuration value
function api.getConfig(params)
  local var = params.var

  if not build or not build.configTab then
    return {success = false, error = "Build not initialized"}
  end

  if not var then
    return {success = false, error = "No var provided"}
  end

  -- Get the active config set
  local configSet = build.configTab.configSets[build.configTab.activeConfigSetId]
  if not configSet then
    return {success = false, error = "No active config set"}
  end

  local value = configSet.input[var]
  return {success = true, var = var, value = value}
end

-- Get all configuration values
function api.getAllConfig(params)
  if not build or not build.configTab then
    return {success = false, error = "Build not initialized"}
  end

  -- Get the active config set
  local configSet = build.configTab.configSets[build.configTab.activeConfigSetId]
  if not configSet then
    return {success = false, error = "No active config set"}
  end

  local configs = {}
  for var, value in pairs(configSet.input) do
    configs[var] = value
  end

  return {success = true, config = configs}
end

-- Debug: Execute arbitrary Lua code (for testing only)
function api.debugExec(params)
  local code = params.code
  if not code then
    return {success = false, error = "No code provided"}
  end

  local func, err = load(code)
  if not func then
    return {success = false, error = "Lua error: " .. tostring(err)}
  end

  local success, result = pcall(func)
  if not success then
    return {success = false, error = "Execution error: " .. tostring(result)}
  end

  return {success = true, result = result}
end

-- Main loop: read commands from stdin, execute, write results to stdout
while true do
  local line = io.read("*l")
  if not line then break end

  local request = json.decode(line)
  if not request then
    print(json.encode({success = false, error = "Invalid JSON"}))
    goto continue
  end

  local command = request.command
  local params = request.params or {}

  if command == "exit" then
    break
  elseif api[command] then
    local ok, result = pcall(api[command], params)
    if ok then
      print(json.encode(result))
    else
      -- Unhandled Lua error in handler — return error instead of crashing bridge
      print(json.encode({success = false, error = "Internal error: " .. tostring(result)}))
    end
  else
    print(json.encode({success = false, error = "Unknown command: " .. tostring(command)}))
  end

  io.flush()

  ::continue::
end

