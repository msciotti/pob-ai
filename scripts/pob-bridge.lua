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

-- Load HeadlessWrapper (this loads all of PoB)
print(json.encode({status = "loading", message = "Loading PoB..."}))
io.flush()
dofile(pobPath .. "/HeadlessWrapper.lua")

-- Initialize inputEvents as empty table for headless mode
inputEvents = {}

print(json.encode({status = "ready", message = "PoB loaded successfully"}))
io.flush()

-- Helper function to refresh the build reference after loading a new build
function refreshBuild()
  -- Access the main object through the global mainObject set by SetMainObject in HeadlessWrapper
  -- We need to use _G to access globals set in HeadlessWrapper's scope
  local mo = rawget(_G, "mainObject")
  if not mo then
    -- Try to access through the build object's parent reference
    if build and build.main and build.main.modes then
      build = build.main.modes["BUILD"]
    end
  else
    if mo.main and mo.main.modes then
      build = mo.main.modes["BUILD"]
    end
  end
end

-- API functions
local api = {}

function api.newBuild()
  newBuild()
  return {success = true, message = "Build created"}
end

function api.loadBuildFromXML(params)
  local xml = params.xml
  local name = params.name or "Imported Build"

  -- IMPORTANT: loadBuildFromXML doesn't reset the build state, it loads into existing build
  -- To ensure a fresh build with no passive allocations, we need to call newBuild() first
  -- then load the XML
  newBuild()
  loadBuildFromXML(xml, name)

  -- Refresh build reference to ensure we have the latest build instance
  if refreshBuild then
    refreshBuild()
  end

  -- Trigger calculation directly
  if build and build.calcsTab and build.calcsTab.BuildOutput then
    build.calcsTab:BuildOutput()
  end

  return {success = true, message = "Build loaded: " .. name}
end

function api.importFromCode(params)
  local code = params.code
  local name = params.name or "Imported Build"

  -- Decode pastebin code: reverse URL-safe encoding, base64 decode, then inflate
  -- Based on ImportTab.lua:294
  local buf = code:gsub("-","+"):gsub("_","/")
  local decoded = common.base64.decode(buf)
  local xmlText = Inflate(decoded)

  -- Now load the XML
  loadBuildFromXML(xmlText, name)

  -- Trigger calculation
  local success, err = pcall(function()
    runCallback("OnFrame")
  end)

  if not success then
    print("Warning: OnFrame failed after import: " .. tostring(err))
  end

  return {success = true, message = "Build imported: " .. name}
end

function api.getStats()
  if not build then
    return {success = false, error = "No build loaded"}
  end

  -- Try to trigger calculation if not done yet
  if not build.calcsTab or not build.calcsTab.mainOutput then
    local success, err = pcall(function()
      runCallback("OnFrame")
    end)
    if not success then
      return {success = false, error = "Failed to calculate: " .. tostring(err)}
    end
  end

  -- Check again after calculation attempt
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

      -- Trigger recalculation directly (mainObject:OnFrame hangs in headless mode)
      if build.calcsTab and build.calcsTab.BuildOutput then
        build.calcsTab:BuildOutput()
      end

      return {
        success = true,
        message = "Allocated: " .. nodeName,
        pathLength = #node.path,
        nodesAllocated = #node.path
      }
    end
  end

  return {success = false, error = "Passive not found: " .. nodeName}
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
    local result = api[command](params)
    print(json.encode(result))
  else
    print(json.encode({success = false, error = "Unknown command: " .. tostring(command)}))
  end

  io.flush()

  ::continue::
end
