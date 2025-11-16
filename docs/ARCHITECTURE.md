# Architecture

## Overview

Local-only MCP server that runs Path of Building as a LuaJIT subprocess and exposes its calculation engine via MCP tools.

## Key Architectural Decisions

### 1. LuaJIT Subprocess (Not fengari)

**Decision:** Run PoB in a LuaJIT subprocess, communicate via JSON over stdin/stdout

**Alternatives Considered:**
- **fengari** (pure JavaScript Lua VM): Would require mocking the entire GUI layer. Every PoB update could break our mocks. Extremely brittle.
- **Reimplementation**: Rewrite PoB's calculation engine in TypeScript. Would drift from PoB immediately and require massive maintenance.

**Rationale:**
- Uses **actual PoB code** = 100% calculation accuracy
- PoB team maintains it, we get updates automatically
- HeadlessWrapper.lua exists specifically for CLI usage
- Clean separation of concerns, easy to debug
- Can test Lua scripts standalone

**Trade-offs:**
- Requires LuaJIT installation (but we bundle it on install)
- Subprocess overhead (minimal for our use case)

### 2. Local-Only Architecture

**Decision:** Run entirely on user's machine, no hosted service

**Alternatives Considered:**
- **Hosted calculation service**: Python/FastAPI service that runs PoB calculations in cloud

**Rationale:**
- **Much simpler** - No infrastructure, deployment, scaling concerns
- **No hosting costs** - Free to run
- **Better UX** - Access user's saved builds, no data duplication
- **Faster** - No network latency
- **Privacy** - Builds stay local

**Trade-offs:**
- Users must install dependencies (but automated via `pnpm install`)
- Can't share computation across users (not needed for MVP)

### 3. Stateless for MVP

**Decision:** Each MCP request creates fresh state, no build caching

**Rationale:**
- **Simpler implementation** - No cache invalidation, TTL management, memory limits
- **Good enough for MVP** - Loading a build takes ~200-500ms, acceptable for demo
- **Easier debugging** - No state consistency issues

**Post-MVP:** Add caching with 30min TTL, 100 build max, LRU eviction once performance becomes an issue.

### 4. TypeScript + pnpm

**Decision:** TypeScript for the MCP server, pnpm for package management

**Rationale:**
- TypeScript gives us type safety when working with PoB's complex data structures
- Excellent async/await support for subprocess communication
- pnpm is faster and more efficient than npm
- MCP SDK has great TypeScript support

### 5. Automatic PoB Bundling

**Decision:** Download PoB source automatically on `pnpm install`

**Rationale:**
- Users don't need PoB installed separately
- We control which PoB version we're compatible with
- Eliminates "works on my machine" issues
- Still detect local PoB installations if users want to use their own

## Data Flow

```
┌─────────────────────────────────────────────────────┐
│                   LLM (Claude)                      │
│                                                     │
└─────────────────┬───────────────────────────────────┘
                  │ MCP Protocol
                  ↓
┌─────────────────────────────────────────────────────┐
│            TypeScript MCP Server                    │
│  - Tool handlers (load_build, allocate_passive)    │
│  - Request validation & error formatting           │
│  - LuaJITRuntime wrapper                          │
└─────────────────┬───────────────────────────────────┘
                  │ spawn subprocess
                  ↓
┌─────────────────────────────────────────────────────┐
│              LuaJIT Process                         │
│  - pob-bridge.lua (JSON API)                       │
│  - Loads HeadlessWrapper.lua                       │
│  - Communicates via stdin/stdout                   │
└─────────────────┬───────────────────────────────────┘
                  │ loads & calls
                  ↓
┌─────────────────────────────────────────────────────┐
│        Path of Building (Lua)                       │
│  - HeadlessWrapper.lua (headless mode)             │
│  - Full calculation engine                          │
│  - All game data files                             │
└─────────────────────────────────────────────────────┘
```

**JSON Communication Example:**
```
TypeScript → Lua:
{"command": "allocatePassive", "params": {"nodeName": "Resolute Technique"}}

Lua → TypeScript:
{"success": true, "message": "Allocated Resolute Technique"}
```

## Project Structure

```
pob-ai/
├── src/
│   ├── mcp/                    # MCP server (NOT YET IMPLEMENTED)
│   │   └── server.ts           # MCP protocol handler
│   ├── pob/
│   │   ├── luajit-runtime.ts   # ✅ Subprocess wrapper (DONE)
│   │   ├── detector.ts         # ✅ PoB path detection (DONE)
│   │   ├── passive-tree-utils.ts # ✅ Tree pathfinding (DONE)
│   │   └── index.ts            # Exports
│   ├── config/
│   │   └── index.ts            # ✅ Config loading (DONE)
│   ├── types/
│   │   └── pob.ts              # TypeScript type definitions
│   ├── tests/                  # ✅ Test suite (DONE)
│   │   ├── passive-allocation.test.ts
│   │   ├── item-equip.test.ts
│   │   ├── skill-gems.test.ts
│   │   └── jewels.test.ts
│   └── mvp-test.ts             # ✅ MVP demo script (DONE)
├── scripts/
│   ├── download-pob.js         # ✅ Auto-downloads PoB (DONE)
│   ├── download-luajit.js      # ✅ Builds bundled LuaJIT (DONE)
│   └── pob-bridge.lua          # ✅ Lua JSON API (DONE)
├── docs/
│   ├── MVP.md                  # This file
│   ├── ARCHITECTURE.md         # This file
│   ├── TASKS.md                # Work breakdown
│   ├── API_REFERENCE.md        # LuaJITRuntime API docs
│   └── POB_INTERNALS.md        # PoB knowledge for contributors
├── pob-data/                   # Downloaded PoB source
└── test-data/                  # Sample builds for testing
```

## Technology Stack

**Runtime:**
- Node.js 18+ (for MCP server)
- LuaJIT (for running PoB)
- Path of Building (Lua source)

**Languages:**
- TypeScript (MCP server)
- Lua (PoB integration bridge)

**Key Libraries:**
- `@modelcontextprotocol/sdk` - MCP protocol
- `child_process` - Subprocess management (built-in)
- `readline` - JSON line protocol (built-in)

**Development:**
- pnpm - Package management
- TypeScript compiler
- Custom test runner

## Why This Works

1. **PoB is pure Lua** - No binary dependencies, runs anywhere LuaJIT runs
2. **HeadlessWrapper exists** - PoB team built this for testing, we just use it
3. **JSON is universal** - Easy to parse in both Lua and TypeScript
4. **Subprocess isolation** - PoB crashes don't kill the MCP server
5. **Battle-tested** - PoB's calculations are used by millions of players

## Known Limitations

1. **Subprocess startup time** - ~200-500ms to initialize PoB (acceptable for MVP)
2. **No concurrent builds** - One build at a time per runtime instance (fine for single-user)
3. **Memory usage** - Each PoB instance uses ~50-100MB RAM (reasonable)
4. **LuaJIT requirement** - Users need build tools, but we automate this

## Future Optimizations

**Post-MVP, we can optimize:**
- Pool of reusable PoB processes
- Build caching with TTL
- Incremental calculations (only recalc what changed)
- Shared memory for game data
- WebAssembly PoB port (ambitious)
