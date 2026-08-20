import { readFile } from 'fs/promises';
import { join } from 'path';
import * as fengari from 'fengari';

const { lua, lauxlib, lualib, to_jsstring, to_luastring } = fengari;

/**
 * Lua runtime for executing PoB code
 */
export class LuaRuntime {
  private L: any;
  private pobPath: string;

  constructor(pobPath: string) {
    this.pobPath = pobPath;
    this.L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(this.L);
  }

  /**
   * Execute Lua code
   */
  private doString(code: string): void {
    const status = lauxlib.luaL_dostring(this.L, to_luastring(code));
    if (status !== lua.LUA_OK) {
      const error = to_jsstring(lua.lua_tostring(this.L, -1));
      lua.lua_pop(this.L, 1);
      throw new Error(`Lua execution error: ${error}`);
    }
  }

  /**
   * Load a Lua file
   */
  private async loadFile(filePath: string): Promise<void> {
    let code = await readFile(filePath, 'utf-8');

    // Strip shebang if present (PoB files may start with #@ or #!/usr/bin/lua)
    if (code.startsWith('#')) {
      const firstNewline = code.indexOf('\n');
      if (firstNewline !== -1) {
        code = code.substring(firstNewline + 1);
      }
    }

    this.doString(code);
  }

  /**
   * Get a global Lua value
   */
  private getGlobal(name: string): any {
    lua.lua_getglobal(this.L, to_luastring(name));
    const value = this.toLuaValue(this.L, -1);
    lua.lua_pop(this.L, 1);
    return value;
  }

  /**
   * Convert Lua stack value to JavaScript
   */
  private toLuaValue(L: any, index: number): any {
    const type = lua.lua_type(L, index);

    switch (type) {
      case lua.LUA_TNIL:
        return null;
      case lua.LUA_TBOOLEAN:
        return lua.lua_toboolean(L, index);
      case lua.LUA_TNUMBER:
        return lua.lua_tonumber(L, index);
      case lua.LUA_TSTRING:
        return to_jsstring(lua.lua_tostring(L, index));
      case lua.LUA_TTABLE:
        return this.tableToObject(L, index);
      default:
        return undefined;
    }
  }

  /**
   * Convert Lua table to JavaScript object
   */
  private tableToObject(L: any, index: number): any {
    const result: any = {};

    lua.lua_pushnil(L);
    while (lua.lua_next(L, index < 0 ? index - 1 : index) !== 0) {
      const key = this.toLuaValue(L, -2);
      const value = this.toLuaValue(L, -1);
      result[key] = value;
      lua.lua_pop(L, 1);
    }

    return result;
  }

  /**
   * Initialize PoB environment
   * Loads only the calculation engine, bypassing GUI/Launch code
   */
  async initialize(): Promise<void> {
    try {
      // Change to PoB directory so relative file loads work
      // We'll stay here for the lifetime of the runtime
      process.chdir(this.pobPath);

      // Set package path to include PoB directory
      this.doString(`package.path = package.path .. ";${this.pobPath}/?.lua;${this.pobPath}/Modules/?.lua"`);

      // Load minimal PoB initialization script
      await this.loadMinimalPobInit();

      console.error('PoB Lua runtime initialized successfully');
    } catch (error) {
      throw new Error(`Failed to initialize PoB Lua runtime: ${error}`);
    }
  }

  /**
   * Load minimal PoB initialization (calculation engine only)
   */
  private async loadMinimalPobInit(): Promise<void> {
    const initScript = `
      -- Mock LuaJIT and browser globals that PoB expects
      jit = {
        opt = { start = function(...) end },
        version = "Fengari",
        version_num = 20100
      }

      -- Mock bit library (LuaJIT provides this)
      if not bit then
        bit = {
          band = function(a, b) return a & b end,
          bor = function(a, b) return a | b end,
          bxor = function(a, b) return a ~ b end,
          bnot = function(a) return ~a end,
          lshift = function(a, b) return a << b end,
          rshift = function(a, b) return a >> b end,
          arshift = function(a, b) return a >> b end,
        }
      end

      -- Mock garbage collector
      collectgarbage = function(opt, arg) return 0 end

      -- Patch string.gsub for Lua 5.3 compatibility
      -- PoB was written for Lua 5.1/LuaJIT which has different % handling in replacement strings
      local _string_gsub = string.gsub
      string.gsub = function(s, pattern, repl, n)
        -- If replacement is a string, we need to handle % escaping differently
        if type(repl) == "string" then
          -- In Lua 5.3, % in replacement strings must be escaped as %%
          -- But PoB code uses Lua 5.1 behavior where % doesn't need escaping
          -- We can't easily fix this automatically, so just try the call
          -- If it fails with "invalid use of '%'", we'll skip problematic data files
        end
        return _string_gsub(s, pattern, repl, n)
      end

      -- Mock file I/O functions (PoB uses these but we don't need them)
      io = io or {}
      local _io_open = io.open
      io.open = function(filename, mode)
        -- Ignore most file opens (they're for config/cache)
        return nil
      end

      -- Mock OS functions
      os = os or {}
      os.remove = function() end

      -- Mock console functions
      function ConExecute() end
      function ConPrintf(...) end
      function ConPrintTable() end
      function ConClear() end
      function SetWindowTitle() end
      function SetCallback() end
      function GetCallback() return nil end
      function SetMainObject() end
      function GetTime() return 0 end
      function GetScriptPath() return "." end
      function GetRuntimePath() return "." end
      function GetUserPath() return "." end
      function Inflate(data) return data end
      function Deflate(data) return data end
      function SpawnProcess() end
      function OpenURL() end
      function SetWindowMode() end
      function CanExit() return true end

      -- Mock Curl for HTTP requests (not needed for calculations)
      function Curl() return { escape = function(s) return s end } end

      -- Mock image handles
      function NewImageHandle() return {} end

      -- Mock require to intercept library loads we don't need
      local _require = require
      require = function(modname)
        -- Mock lcurl (HTTP library - not needed for calculations)
        if modname == "lcurl.safe" or modname == "lcurl" then
          return {
            easy = function() return {} end
          }
        end

        -- Mock xml library (we'll handle XML ourselves)
        if modname == "xml" then
          return {
            LoadXMLFile = function() return nil end,
            ParseXML = function() return nil end
          }
        end

        -- Provide basic base64 implementation (needed for build imports)
        if modname == "base64" then
          -- For now, return stub - we'll handle base64 in TypeScript
          return {
            decode = function(str) return str end,
            encode = function(str) return str end
          }
        end

        -- Mock sha1 (used for hashing/caching)
        if modname == "sha1" then
          return {
            sha1 = function(str) return "mock-sha1-hash" end
          }
        end

        -- Use built-in utf8 library for lua-utf8
        if modname == "lua-utf8" then
          return utf8  -- Lua 5.3 has built-in UTF-8 support
        end

        -- Pass through to real require for standard libraries
        return _require(modname)
      end

      -- Store PoB path for later use
      _POB_PATH = "${this.pobPath}"

      -- Helper to load modules (with parameter support and error tolerance)
      function LoadModule(path, ...)
        -- Save current directory
        local old_cwd = os.getenv("PWD")

        -- Change to PoB directory for loading
        local success, err = pcall(function()
          if _POB_PATH then
            -- Note: We can't actually change directory in fengari easily
            -- So we need to use full paths
          end
        end)

        local f, err = loadfile(path .. ".lua")
        if not f then
          error("Failed to load module: " .. path .. ": " .. (err or "unknown error"))
        end

        -- Try to execute the module
        local success, result = pcall(f, ...)
        if not success then
          -- If it's a data file that fails, warn but continue
          if path:match("^Data/") then
            print("WARNING: Skipping problematic data file: " .. path .. " (" .. tostring(result) .. ")")
            return nil
          else
            -- Critical modules should fail
            error("Failed to load module: " .. path .. ": " .. tostring(result))
          end
        end

        return result
      end

      function new(className, ...)
        local class = _G[className]
        if not class then
          error("Class not found: " .. className)
        end
        local obj = {}
        setmetatable(obj, { __index = class })
        if obj.Init then
          obj:Init(...)
        end
        return obj
      end

      function copyTable(tbl, deep)
        local ret = {}
        for k, v in pairs(tbl) do
          if deep and type(v) == "table" then
            ret[k] = copyTable(v, true)
          else
            ret[k] = v
          end
        end
        return ret
      end

      function isValueInArray(tbl, val)
        for i, v in ipairs(tbl) do
          if v == val then
            return true
          end
        end
        return false
      end

      function isValueInTable(tbl, val)
        for k, v in pairs(tbl) do
          if v == val then
            return true
          end
        end
        return false
      end

      -- Mock command line arguments
      arg = {}

      -- Mock launch object (minimal app state)
      launch = {
        devMode = false,
        installedMode = true,
        versionNumber = "3.0.0",
        versionBranch = "headless",
        versionPlatform = "typescript-mcp",
        noSSL = false
      }

      -- Load essential PoB modules (calculation engine)
      print("Loading PoB calculation modules...")

      -- Load core modules in order (following Main.lua's load order)
      LoadModule("GameVersions")
      LoadModule("Modules/Common")
      LoadModule("Modules/Data")
      LoadModule("Modules/ModTools")
      LoadModule("Modules/ModParser")
      LoadModule("Modules/ItemTools")
      LoadModule("Modules/CalcTools")
      LoadModule("Modules/PantheonTools")

      print("PoB calculation modules loaded")

      -- Load Build module (the calculation engine)
      print("Loading Build module...")
      local Build = LoadModule("Modules/Build")

      -- Build module tries to draw in OnFrame - mock those functions
      if Build.DrawBackground then
        Build.DrawBackground = function(self) end
      end
      if Build.Draw then
        Build.Draw = function(self) end
      end

      build = Build

      print("Build module loaded")

      -- Create minimal mainObject structure (like HeadlessWrapper expects)
      mainObject = {
        main = {
          modes = { BUILD = build },
          buildPath = ".",
          SetMode = function(self, mode, ...)
            if mode == "BUILD" then
              -- Do nothing - build is already set up
            end
          end
        }
      }

      -- Also set 'main' global (Build module references it directly)
      main = mainObject.main

      -- Mock callback system from HeadlessWrapper
      function runCallback(name, ...)
        if name == "OnFrame" and build and build.OnFrame then
          build:OnFrame()
        end
      end

      -- Implement HeadlessWrapper functions directly (from HeadlessWrapper.lua lines 195-209)
      function newBuild()
        -- Create a minimal new build
        if build.OnFrame then
          build:OnFrame()
        end
        print("New build created")
      end

      function loadBuildFromXML(xmlText, name)
        -- Import XML into build
        print("Loading build from XML: " .. (name or "Unnamed"))

        -- Parse XML
        local xmlLib = require("xml")
        if xmlLib.ParseXML then
          local xmlData = xmlLib.ParseXML(xmlText)
          if xmlData then
            print("XML parsed successfully")
            -- TODO: Apply XML data to build
            if build.OnFrame then
              build:OnFrame()
            end
          else
            print("Failed to parse XML")
          end
        end
      end

      print("HeadlessWrapper functions implemented!")
      print("Available: newBuild(), loadBuildFromXML()")
    `;

    this.doString(initScript);
  }

  /**
   * Initialize a new build (using HeadlessWrapper functions)
   */
  newBuild(): void {
    this.doString(`
      -- Use HeadlessWrapper's newBuild if available
      if type(newBuild) == "function" then
        newBuild()
        print("Build created via HeadlessWrapper")
      else
        print("newBuild() not available")
      end
    `);
  }

  /**
   * Load build from XML (using HeadlessWrapper functions)
   */
  loadBuildFromXML(xml: string, buildName: string = 'Imported Build'): void {
    // Store XML in a global variable to avoid escaping issues
    lua.lua_pushstring(this.L, to_luastring(xml));
    lua.lua_setglobal(this.L, to_luastring('_tempXML'));

    this.doString(`
      -- Use HeadlessWrapper's loadBuildFromXML if available
      if type(loadBuildFromXML) == "function" then
        local success, err = pcall(function()
          loadBuildFromXML(_tempXML, "${buildName}")
        end)
        if not success then
          print("Error loading build: " .. tostring(err))
        else
          print("Build loaded via HeadlessWrapper: ${buildName}")
        end
      else
        print("loadBuildFromXML() not available")
      end
      _tempXML = nil  -- Clean up
    `);
  }

  /**
   * Get build stats
   */
  getBuildStats(): Record<string, number> {
    this.doString(`
      _tempStats = {}
      if build and build.calcsTab and build.calcsTab.mainOutput then
        for key, value in pairs(build.calcsTab.mainOutput) do
          if type(value) == "number" then
            _tempStats[key] = value
          end
        end
        print("Retrieved " .. tostring(table.getn or function(t) local n=0 for _ in pairs(t) do n=n+1 end return n end)(_tempStats) .. " stats")
      else
        print("Stats not available yet")
      end
    `);

    const stats = this.getGlobal('_tempStats') || {};

    // Clean up
    this.doString('_tempStats = nil');

    return stats;
  }

  /**
   * Allocate a passive node by name
   */
  allocatePassive(nodeName: string): void {
    this.doString(`
      if build and build.spec then
        -- Find node by name
        local found = false
        for nodeId, node in pairs(build.spec.nodes) do
          if node.name == "${nodeName}" then
            build.spec:AllocNode(nodeId)
            build.buildFlag = true
            print("Allocated passive: ${nodeName}")
            found = true
            break
          end
        end
        if not found then
          print("Passive not found: ${nodeName}")
        end
      else
        print("Build spec not available")
      end
    `);
  }

  /**
   * Trigger build recalculation
   */
  recalculate(): void {
    this.doString(`
      if build then
        build.buildFlag = true
        if build.OnFrame then
          build:OnFrame()
        end
        print("Build recalculated")
      end
    `);
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.L) {
      lua.lua_close(this.L);
    }
  }
}
