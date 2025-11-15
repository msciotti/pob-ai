# Path of Building MCP - Technical Architecture

**Status**: ✅ Planning Complete - Ready for Implementation
**Last Updated**: 2025-11-15

## Overview
MCP server that provides a data layer between LLMs and Path of Building, enabling natural language build advice backed by real simulation calculations.

---

## Core Requirements

### Functional Requirements
- Load and parse Path of Building builds (pastebin codes, XML files)
- Execute simulations for build changes (passives, items, skills)
- Calculate stat deltas between configurations
- Compare current builds to target/benchmark builds
- Query poe.ninja for top build examples
- Return numerical results for damage, defense, and other stats

### Non-Functional Requirements
- Serverless/easily scalable architecture (CF Workers, Lambda, GCP Functions)
- Minimize token overhead where possible
- No UI - pure data layer for LLM consumption
- Interface with existing PoB CLI (avoid recreating calculation logic)

---

## Architecture Summary

### ✅ Final Design: Local-Only MCP Server

**What we're building**:
A single TypeScript MCP server that runs locally on the user's machine, detects their Path of Building installation, and provides LLM-friendly tools for build analysis and optimization.

**Key decisions made**:
1. **No hosted service** - Everything runs locally (simpler, cheaper, better UX)
2. **TypeScript** - Developer familiarity, excellent for async I/O
3. **fengari Lua runtime** - Pure JS, cross-platform, no compilation needed
4. **Detect local PoB** - Use user's existing installation and saved builds
5. **Config file fallback** - Auto-detect with manual override option
6. **Hard fail if PoB missing** - Clear error message with setup instructions
7. **Build caching** - 30min TTL, 100 build max, LRU eviction
8. **pnpm + TypeScript tooling** - Modern, efficient development setup

**What's eliminated**:
- ❌ Hosted PoB calculation service (Python + FastAPI)
- ❌ Docker containers and cloud infrastructure
- ❌ REST API between services
- ❌ Complex deployment and scaling concerns

**What's gained**:
- ✅ Much simpler architecture
- ✅ No hosting costs
- ✅ Access to user's saved builds
- ✅ No data duplication
- ✅ Works with user's existing workflow
- ✅ Faster (no network latency)

---

## Path of Building Interface (Research Findings)

### HeadlessWrapper Discovery
PoB includes **HeadlessWrapper.lua** that enables headless execution without GUI. This is our programmatic interface!

**Key Functions**:
```lua
-- Create new build
newBuild()

-- Load from XML (pastebin codes are XML)
loadBuildFromXML(xmlText, buildName)

-- Load from JSON
loadBuildFromJSON(itemsJSON, skillsJSON)

-- Access build object
build = mainObject.main.modes["BUILD"]
```

**Calculation Output Access**:
```lua
build.calcsTab.mainOutput  -- Contains 500+ calculated stats
```

**Available Stats** (examples from test builds):
- **Damage**: TotalDPS, AverageDamage, CombinedDPS, TotalDot, IgniteDPS, etc.
- **Defense**: Life, EnergyShield, Armor, Evasion, resistances, block chance
- **Attributes**: Str, Dex, Int
- **Ailments**: Chill, Freeze, Shock, Ignite chance/effectiveness
- **Charges**: Endurance, Power, Frenzy charges and max values

**Runtime Requirements**:
- Lua 5.1 or LuaJIT
- PoB source files (all pure Lua)
- Game data files from PoB Assets/Data directories

---

## Architecture Decisions

### 1. Path of Building Execution Environment
**Status**: ✅ PROPOSED

**Recommended: Option B - Dedicated PoB Service**

Since PoB is pure Lua with HeadlessWrapper, we should:

1. **PoB Calculation Service** (Python/FastAPI or Node.js/Express)
   - Embeds Lua runtime (via lupa in Python or fengari/luajit in Node)
   - Loads PoB source files and HeadlessWrapper at startup
   - Exposes HTTP API for build operations
   - Runs on Cloud Run, ECS, or similar container platform
   - Stateful (keeps builds in memory with TTL)

2. **MCP Server** (Python or TypeScript)
   - Lightweight, can run anywhere (local, serverless, etc.)
   - Implements MCP protocol
   - Calls PoB service HTTP API
   - Handles poe.ninja integration
   - Formats responses for LLMs

**Why this approach:**
- ✅ Keeps Lua runtime warm (no cold start per calculation)
- ✅ MCP server stays lightweight and portable
- ✅ PoB service can scale independently
- ✅ Simpler than trying to bundle Lua in serverless
- ✅ Build state management is clearer
- ❌ Requires managing one additional service (acceptable tradeoff)

**Alternative considered**: Full serverless with Lua in container
- Would require packaging entire Lua runtime + PoB in Lambda/Cloud Run
- Cold starts would hurt calculation performance
- More complex deployment

---

### 2. MCP Tool Interface Design
**Status**: ✅ PROPOSED

**Core Philosophy**: Provide **low-level primitives** that LLMs can compose. Let the LLM handle interpretation and strategy.

**Proposed MCP Tools**:

```typescript
// Load a build from pastebin code or XML
load_build(build_data: string)
  → Returns: {
      build_id: string,
      character: { class, ascendancy, level },
      stats: { Life, EnergyShield, TotalDPS, ... } // Key stats
    }

// Get all calculated stats for a build
get_build_stats(build_id: string, stat_filter?: string[])
  → Returns: {
      stats: Record<string, number>  // All 500+ stats or filtered subset
    }

// Create a snapshot/fork of a build for comparison
fork_build(build_id: string)
  → Returns: { new_build_id: string }

// Modify build (passives, items, gems, config)
modify_build(
  build_id: string,
  modification: {
    type: "allocate_passive" | "deallocate_passive" | "replace_item" | "set_gem" | "set_config",
    params: Record<string, any>
  }
)
  → Returns: {
      success: boolean,
      updated_stats: Record<string, number>
    }

// Compare two builds (stat diff)
compare_builds(build_id_a: string, build_id_b: string, stats?: string[])
  → Returns: {
      diff: Record<string, { before: number, after: number, delta: number }>
    }

// Search poe.ninja for builds
search_poe_ninja(
  skill?: string,
  ascendancy?: string,
  sort_by?: "dps" | "ehp",
  limit?: number
)
  → Returns: {
      builds: Array<{ character_name, build_url, pastebin_code, ... }>
    }

// Get build as XML for export
export_build(build_id: string)
  → Returns: { xml: string }
```

**Why low-level tools?**
- ✅ LLM can compose operations ("fork, modify, compare" pattern)
- ✅ Keeps MCP server simple and focused
- ✅ LLM handles natural language interpretation
- ✅ More flexible for diverse query types
- ✅ Easier to test and maintain

**Example LLM flow**:
```
User: "How much DPS would I gain by allocating Iron Will?"

LLM reasoning:
1. load_build(pastebin_code) → build_id_1
2. fork_build(build_id_1) → build_id_2
3. modify_build(build_id_2, {type: "allocate_passive", params: {node_name: "Iron Will"}})
4. compare_builds(build_id_1, build_id_2, stats: ["TotalDPS"])
5. Return: "You would gain X DPS"
```

---

### 3. State Management
**Status**: ✅ DECIDED

**Approach: Stateful with TTL in PoB Service**

**Implementation**:
- **PoB Service** maintains in-memory build cache
  - `build_id` → Lua build object mapping
  - TTL: 30 minutes (configurable)
  - LRU eviction if memory pressure

- **MCP Server** is stateless
  - Just passes build_ids between calls
  - No build state stored locally

**Benefits**:
- ✅ Efficient for multi-step operations (fork → modify → compare)
- ✅ Avoids re-parsing XML on every operation
- ✅ Build object stays in Lua memory (fast access)
- ✅ Simple build_id references in MCP tools
- ✅ PoB service can scale horizontally with sticky sessions or shared cache (Redis)

**Tradeoffs**:
- ❌ Builds expire after TTL (acceptable - user can reload)
- ❌ Need session affinity or distributed cache for multi-instance scaling (future optimization)

---

### 4. Natural Language Interpretation
**Status**: ✅ DECIDED

**Approach: LLM Client handles all interpretation**

**Rationale**:
The LLM client (Claude, GPT, etc.) should interpret user intent and compose MCP tool calls. The MCP layer only executes structured commands.

**Why**:
- ✅ Aligns with MCP philosophy (MCPs are data layers, not AI systems)
- ✅ Keeps token costs on the client side (per product requirement)
- ✅ Leverages the LLM's domain knowledge and reasoning
- ✅ MCP server stays simple and testable
- ✅ Works with any LLM client

**Example Flow**:
```
User → "My damage feels low. What should I change?"
         ↓
LLM Client (Claude):
  1. Reasons: Need to check build stats and compare to benchmarks
  2. Calls: get_build_stats(build_id)
  3. Analyzes: Low crit chance, missing damage auras
  4. Calls: search_poe_ninja(skill="X", ascendancy="Y")
  5. Compares: User build vs top builds
  6. Suggests: Specific improvements with simulated impacts
         ↓
User ← "Your crit chance is 5% vs 75% on top builds. Allocating
        these nodes would increase your DPS by 50k..."
```

MCP tools just provide the data; LLM does the thinking.

---

### 5. Technology Stack
**Status**: ✅ DECIDED - MAJOR SIMPLIFICATION

**Architecture Change**: ✅ LOCAL-ONLY APPROACH
After discussion, we're **eliminating the hosted PoB service** entirely. The MCP server will interface directly with the user's local PoB installation.

**Why this is better**:
- ✅ No hosted service to manage (simpler, cheaper)
- ✅ No data duplication - uses user's existing PoB data
- ✅ Can access user's saved builds from PoB
- ✅ Faster (no network hop to remote service)
- ✅ Works with user's existing PoB workflow
- ✅ User continues using PoB GUI as normal

**MCP Server** (this is now the only service!):
- **Language**: TypeScript (developer familiarity, excellent async I/O)
- **Framework**: `@modelcontextprotocol/sdk` TypeScript package
- **Lua runtime**: `fengari` (pure JavaScript Lua 5.3 VM) ✅
  - Cross-platform, no compilation needed
  - Simpler user installation experience
  - Can optimize with native bindings later if performance becomes an issue
- **PoB integration**: Detect and load from user's local PoB installation
  - Find PoB install directory (platform-specific detection)
  - Load HeadlessWrapper.lua from detected installation
  - Access user's saved builds
- **Configuration**: ✅
  - Priority: Config file > Auto-detect
  - Config location: `~/.config/pob-mcp/config.json`
  - CLI for setup: `pob-mcp configure --pob-path="/path"`
  - Auto-detect if no config or config doesn't specify path
- **Error handling**: ✅
  - PoB not found: Hard fail with helpful error message and setup instructions
  - Optional: Bundle PoB source as fallback (future enhancement)
- **Build cache**: In-memory with TTL ✅
  - TTL: 30 minutes (configurable in config file)
  - Max builds: 100 (prevents memory leaks)
  - Eviction: LRU (Least Recently Used) when limit reached
  - Build IDs: UUID v4 for uniqueness
- **Web client**: `axios` or `fetch` for poe.ninja API
- **Runtime**: Node.js
- **Deployment**: User installs locally (npm package)
- **Development tooling**: ✅
  - Package manager: `pnpm` (faster, efficient)
  - Build: TypeScript compiler (`tsc`)
  - Testing: `vitest` or `jest`
  - Linting: `eslint` + `prettier`
- **Project structure**: ✅
  ```
  src/
  ├── mcp/          # MCP protocol & tools
  ├── pob/          # PoB detection & Lua integration
  ├── cache/        # Build caching
  ├── config/       # Configuration management
  └── utils/        # Shared utilities
  ```

**poe.ninja Integration**:
- HTTP client in MCP server
- Public API at poe.ninja (no auth needed for public data)

**~~PoB Service API Design~~**: ❌ NO LONGER NEEDED
The hosted service is eliminated. MCP server interfaces directly with Lua.

**Infrastructure** (Simplified!):
```
┌─────────────────────────────────────────┐
│         User's Machine                  │
│                                         │
│  ┌─────────────────┐                   │
│  │  LLM Client     │                   │
│  │ (Claude Desktop)│                   │
│  └────────┬────────┘                   │
│           │ MCP Protocol                │
│           │                             │
│  ┌────────▼─────────────────────┐      │
│  │   MCP Server (TypeScript)    │      │
│  │   - Lua runtime (fengari)    │──────┼──> poe.ninja API
│  │   - Build cache (memory)     │ HTTP │    (cloud)
│  └────────┬─────────────────────┘      │
│           │ Loads Lua files            │
│           │                             │
│  ┌────────▼────────────────────┐       │
│  │  Local PoB Installation     │       │
│  │  - HeadlessWrapper.lua      │       │
│  │  - Calculation engine       │       │
│  │  - User's saved builds      │       │
│  └─────────────────────────────┘       │
│                                         │
└─────────────────────────────────────────┘
```

---

## Data Flow

```
┌──────────┐
│   User   │ "My damage feels low. What should I change?"
└────┬─────┘
     │
     ▼
┌─────────────────────────────────────────┐
│          LLM Client (Claude)            │
│  - Interprets question                  │
│  - Plans tool calls                     │
│  - Reasons about results                │
└────┬────────────────────────────────┬───┘
     │ MCP Protocol                   │
     ▼                                │
┌─────────────────────────┐           │
│   MCP Server (Local)    │           │
│  - load_build()         │           │
│  - get_build_stats()    │           │
│  - fork_build()         │           │
│  - modify_build()       │           │
│  - compare_builds()     │           │
│  - search_poe_ninja()   │──────────▶│ poe.ninja
│  - list_saved_builds()  │    HTTP   │   API
└────┬────────────────────┘           │
     │ Loads Lua                      │
     ▼                                │
┌─────────────────────────┐           │
│  User's PoB Install     │           │
│  - HeadlessWrapper.lua  │           │
│  - Calculation engine   │           │
│  - Saved builds         │           │
└─────────────────────────┘           │
                                      │
                                      ▼
                              Returns JSON data
```

---

## Open Questions & Decisions Needed

### ✅ Resolved
1. ~~**PoB CLI Capabilities**~~ - HeadlessWrapper.lua provides programmatic interface
2. ~~**Build data format**~~ - XML (pastebin codes are XML)
3. ~~**Architecture approach**~~ - Local-only MCP server, no hosted service
4. ~~**MCP Server language**~~ - TypeScript (developer familiarity)
5. ~~**Deployment model**~~ - User installs locally
6. ~~**Scaling/hosting concerns**~~ - N/A, everything runs locally

### 🤔 Still Open → ✅ All Resolved for MVP!

1. ~~**PoB Installation Detection**~~ ✅ RESOLVED (MVP-Critical):
   - **Windows**: Check `C:\ProgramData\Path of Building` and `%LOCALAPPDATA%\Programs\Path of Building`
   - **macOS**: Check `/Applications/Path of Building.app`
   - **Linux**: Defer to config file (Wine setup complex, not MVP-critical)
   - **Fallback**: Config file at `~/.config/pob-mcp/config.json` for manual path specification
   - **Not found**: Hard fail with error message instructing user to configure path
   - **Implementation**: Try platform paths first, then check config, then fail gracefully

2. ~~**PoB Saved Builds Location**~~ 🚫 DEFERRED (Not MVP-Critical):
   - **Location**: `%USERPROFILE%\Documents\Path of Building\Builds` (Windows)
   - **Format**: XML files
   - **Decision**: Skip `list_saved_builds()` tool for MVP - users can provide pastebin codes
   - **Phase**: Implement in Phase 2 (optional enhancement)

3. ~~**Lua Runtime for Node.js**~~ ✅ RESOLVED:
   - **Decision**: Use **fengari** (pure JS Lua 5.3 VM)
   - **Rationale**: Cross-platform, no compilation, simpler installation
   - **Tradeoff**: Slower than native, but acceptable for MVP
   - **Future**: Can optimize with native bindings if performance issues arise

4. ~~**PoB Modification Interface**~~ ✅ RESOLVED:
   - Passive tree: `PassiveSpec:AllocNode()` / `DeallocNode()` (Classes/PassiveSpec.lua:680/712)
   - Items: `ItemsTab:AddItem()` / `EquipItemInSet()` / `DeleteItem()` (Classes/ItemsTab.lua)
   - Skills: Socket groups with gem arrays, `ProcessSocketGroup()` (Classes/SkillsTab.lua)
   - Recalculation: Set `build.buildFlag = true`, call `build:OnFrame()` (Modules/Build.lua)
   - Full API documentation: `POB_BUILD_MODIFICATION_GUIDE.md` (28KB)
   - TypeScript wrapper design: `TYPESCRIPT_WRAPPER_API_DESIGN.md`

5. ~~**PoB Version Compatibility**~~ 🚫 DEFERRED (Not MVP-Critical):
   - **Decision**: Target latest PoB Community Fork version only
   - **Documentation**: Document required PoB version in README
   - **Phase**: Add version detection and compatibility matrix in Phase 4 (Polish)
   - **Rationale**: Keep MVP simple, iterate based on user feedback

6. ~~**poe.ninja API limits**~~ 🚫 DEFERRED (Implement Basic First):
   - **MVP approach**: Simple HTTP calls with basic in-memory cache (30min TTL, same as builds)
   - **Rate limiting**: Add throttling only if we hit limits during testing
   - **Phase**: Detailed rate limit research and optimization in Phase 3
   - **Rationale**: Don't over-engineer before we know actual usage patterns

---

## Implementation Roadmap (Updated for Local Architecture)

### Phase 1: PoB Integration & Proof of Concept (Week 1-2)
**Goal**: Validate that we can detect PoB and load builds via Lua

1. **PoB Installation Detection**
   - [ ] Research PoB installation paths on Windows/Mac/Linux
   - [ ] Research where PoB stores saved builds
   - [ ] Implement detection logic with platform-specific paths
   - [ ] Create config file fallback for manual path specification
   - [ ] Test detection on multiple platforms

2. **Lua Runtime Setup**
   - [ ] Evaluate `fengari` vs `node-lua` for compatibility
   - [ ] Set up TypeScript project with chosen Lua runtime
   - [ ] Load HeadlessWrapper.lua from detected PoB installation
   - [ ] Test basic Lua execution (call newBuild(), loadBuildFromXML())
   - [ ] Verify we can access `build.calcsTab.mainOutput`
   - [ ] Test with example builds from PoB test suite

3. **Build Modification Research**
   - [ ] Explore PoB's Lua code for build mutation APIs
   - [ ] Document how to: allocate/deallocate passives, change items, modify gems
   - [ ] Create TypeScript wrapper functions for common operations

### Phase 2: Core MCP Server (Week 2-3)
**Goal**: Build functional MCP server with basic tools

4. **MCP Server Setup**
   - [ ] Initialize TypeScript MCP project with `@modelcontextprotocol/sdk`
   - [ ] Implement MCP protocol handler
   - [ ] Set up build cache (in-memory with TTL)
   - [ ] Add configuration management (detect vs manual path)

5. **Core MCP Tools**
   - [ ] Implement `load_build` (from XML or pastebin)
   - [ ] Implement `list_saved_builds` (read from PoB save directory)
   - [ ] Implement `get_build_stats` (with optional stat filtering)
   - [ ] Implement `fork_build` (clone build in cache)
   - [ ] Test with Claude Desktop locally

6. **Build Manipulation Tools**
   - [ ] Implement `modify_build` (based on research from step 3)
   - [ ] Implement `compare_builds` (stat diff)
   - [ ] Implement `export_build` (return XML)
   - [ ] Write unit and integration tests

### Phase 3: poe.ninja Integration (Week 3-4)
**Goal**: Enable build comparison against top builds

7. **poe.ninja API Client**
   - [ ] Research poe.ninja API endpoints and data structure
   - [ ] Implement `search_poe_ninja` MCP tool
   - [ ] Add local caching layer (in-memory with TTL)
   - [ ] Handle rate limiting gracefully
   - [ ] Test with various search queries

### Phase 4: Polish & Package (Week 4-5)
**Goal**: Production-ready npm package

8. **Packaging & Distribution**
   - [ ] Create npm package with proper dependencies
   - [ ] Add CLI for setup/configuration (`pob-mcp configure`)
   - [ ] Write installation guide (npm install + Claude Desktop config)
   - [ ] Handle cross-platform differences (Windows/Mac/Linux)
   - [ ] Add version checking for PoB compatibility

9. **Documentation & Testing**
   - [ ] Write comprehensive README with setup instructions
   - [ ] Create example queries and expected behaviors
   - [ ] End-to-end testing with real PoE builds
   - [ ] Add error handling documentation (PoB not found, etc.)
   - [ ] Record demo video showing setup and usage

10. **Optional Enhancements**
   - [ ] Fallback to bundled PoB source if local install not found
   - [ ] Watch PoB save directory for new builds (live updates)
   - [ ] Add PoB version compatibility matrix
   - [ ] Publish to npm registry

---

## References

### External Resources
- [Path of Building Repository](https://github.com/PathOfBuildingCommunity/PathOfBuilding)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [poe.ninja API](https://poe.ninja/)
- [fengari (Lua VM for JavaScript)](https://fengari.io/)

### Project Documentation
- `Path of Building MCP.txt` - Original product requirements document
- `TECHNICAL_ARCHITECTURE.md` - This file (architecture & decisions)
- `POB_BUILD_MODIFICATION_GUIDE.md` - Complete PoB API reference (28KB)
- `POB_ADVANCED_PATTERNS.md` - Code examples & implementation patterns (16KB)
- `POB_QUICK_REFERENCE.md` - Quick lookup reference (12KB)
- `README_POB_ANALYSIS.md` - PoB codebase analysis & navigation (11KB)
- `TYPESCRIPT_WRAPPER_API_DESIGN.md` - TypeScript wrapper API design
