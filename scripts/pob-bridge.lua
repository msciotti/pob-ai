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

-- API functions
local api = {}

function api.newBuild()
  newBuild()
  return {success = true, message = "Build created"}
end

function api.loadBuildFromXML(params)
  local xml = params.xml
  local name = params.name or "Imported Build"

  loadBuildFromXML(xml, name)

  -- Trigger calculation after loading using callback (safer than direct call)
  local success, err = pcall(function()
    runCallback("OnFrame")
  end)

  if not success then
    print("Warning: OnFrame failed after load: " .. tostring(err))
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

function api.allocatePassive(params)
  local nodeName = params.nodeName

  if not build or not build.spec then
    return {success = false, error = "Build not initialized"}
  end

  -- Find node by name
  for nodeId, node in pairs(build.spec.nodes) do
    if node.name == nodeName then
      build.spec:AllocNode(node)
      build.buildFlag = true

      -- Trigger recalculation using runCallback (HeadlessWrapper's method)
      inputEvents = {}  -- Refresh for this frame
      runCallback("OnFrame")

      return {success = true, message = "Allocated: " .. nodeName}
    end
  end

  return {success = false, error = "Passive not found: " .. nodeName}
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
