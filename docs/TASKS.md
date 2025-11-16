# MVP Task Breakdown

**Last Updated:** 2025-11-16

## Current Status

### ✅ Complete
- LuaJIT runtime with subprocess wrapper
- Full API implementation (15+ methods)
- Passive tree allocation with auto-pathing
- Item equipment system
- Skill gem and jewel socket management
- Comprehensive test suite (4 test files, 15+ tests)
- Auto-downloading PoB bundling
- Config system with PoB detection

### 🚧 In Progress
- None (awaiting task assignment)

### ❌ Blocked
- Everything is blocked by **P0: Fix TypeScript Config** (see below)

### 🎯 Not Started (Critical Path to MVP)
- MCP server implementation
- MCP tool definitions
- Integration testing with Claude Desktop

---

## Prerequisites: MUST FIX FIRST

### P0: Fix TypeScript Config Build Issue

**Problem:** TypeScript can't find Node.js built-in types (`console`, `fs/promises`, etc.)

**Root Cause:** `tsconfig.json` has `"lib": ["ES2022"]` but needs DOM types for `console`

**Solution:** Add types to lib array

**File:** `tsconfig.json`

**Change:**
```json
{
  "compilerOptions": {
    "lib": ["ES2022", "DOM"]  // Add "DOM" here
  }
}
```

**Verification:**
```bash
pnpm build  # Should compile without errors
pnpm test   # Should run and pass all tests
```

**Estimated Time:** 5 minutes

**Assignable To:** Anyone

**Blocks:** All other tasks

---

## Track 1: MCP Server Implementation (Critical Path)

These tasks must be done **sequentially** as each depends on the previous.

### Task 1.1: Create MCP Server Boilerplate

**Description:** Set up the basic MCP server with SDK initialization and lifecycle handlers

**Files to Create:**
- `src/mcp/server.ts` - Main MCP server class
- `src/index.ts` - Entry point that starts the server

**Requirements:**
1. Initialize MCP server with `@modelcontextprotocol/sdk`
2. Add server info (name, version)
3. Implement `start()` and `stop()` lifecycle methods
4. Add basic error handling and logging
5. Test connection with MCP inspector

**Reference:**
- MCP SDK docs: https://modelcontextprotocol.io/docs
- Similar servers: Check MCP examples repo

**Acceptance Criteria:**
- `pnpm start` launches the MCP server
- Server responds to MCP inspector connection
- Graceful shutdown on SIGINT/SIGTERM

**Estimated Time:** 3-4 hours

**Assignable To:** Engineer with MCP experience

**Depends On:** P0 (TypeScript config fix)

**Blocks:** Task 1.2, 1.3, 1.4

---

### Task 1.2: Implement MCP Tool: `load_build`

**Description:** Expose build loading via MCP tool

**File to Modify:** `src/mcp/server.ts`

**API to Wrap:** `LuaJITRuntime.importFromCode()` or `loadBuildFromXML()`

**Tool Definition:**
```typescript
{
  name: "load_build",
  description: "Load a Path of Building build from pastebin code or XML",
  inputSchema: {
    type: "object",
    properties: {
      source: {
        type: "string",
        description: "Pastebin code or full XML string"
      },
      buildName: {
        type: "string",
        description: "Optional name for this build",
        default: "Imported Build"
      }
    },
    required: ["source"]
  }
}
```

**Implementation:**
1. Detect if `source` is pastebin code or XML
2. Call appropriate runtime method
3. Return success message or error
4. Handle Lua errors gracefully

**Success Response:**
```json
{
  "success": true,
  "message": "Build 'Imported Build' loaded successfully",
  "buildName": "Imported Build"
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Failed to parse build XML: invalid format"
}
```

**Acceptance Criteria:**
- Can load build from pastebin code
- Can load build from XML string
- Returns clear error messages
- Test with real pastebin URLs

**Estimated Time:** 2-3 hours

**Assignable To:** Same engineer as Task 1.1

**Depends On:** Task 1.1

**Blocks:** None (can parallelize with 1.3)

---

### Task 1.3: Implement MCP Tool: `allocate_passive`

**Description:** Expose passive node allocation via MCP tool

**File to Modify:** `src/mcp/server.ts`

**API to Wrap:** `LuaJITRuntime.allocatePassive(nodeName, autoPath)`

**Tool Definition:**
```typescript
{
  name: "allocate_passive",
  description: "Allocate a passive tree node by name (e.g., 'Resolute Technique')",
  inputSchema: {
    type: "object",
    properties: {
      nodeName: {
        type: "string",
        description: "Display name of the passive node (case-sensitive)"
      },
      autoPath: {
        type: "boolean",
        description: "Automatically allocate path nodes (default: true)",
        default: true
      }
    },
    required: ["nodeName"]
  }
}
```

**Implementation:**
1. Call `runtime.allocatePassive(nodeName, autoPath)`
2. Immediately call `runtime.getBuildStats()` to get updated stats
3. Return both success message and stat changes

**Success Response:**
```json
{
  "success": true,
  "message": "Allocated 'Resolute Technique'",
  "nodeName": "Resolute Technique",
  "pathNodesAllocated": 3,
  "statsChanged": {
    "CritChance": {"before": 5, "after": 0},
    "Accuracy": {"before": 2534, "after": 3812}
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Node 'Invalid Name' not found in passive tree"
}
```

**Acceptance Criteria:**
- Can allocate keystone nodes
- Can allocate normal nodes
- Auto-pathing works correctly
- Returns stat deltas
- Clear errors for invalid nodes

**Estimated Time:** 3-4 hours

**Assignable To:** Same engineer as Task 1.1/1.2

**Depends On:** Task 1.1

**Blocks:** None

---

### Task 1.4: Implement MCP Tool: `get_build_stats`

**Description:** Expose build stat queries via MCP tool

**File to Modify:** `src/mcp/server.ts`

**API to Wrap:** `LuaJITRuntime.getBuildStats()`

**Tool Definition:**
```typescript
{
  name: "get_build_stats",
  description: "Get all calculated stats for the current build",
  inputSchema: {
    type: "object",
    properties: {
      categories: {
        type: "array",
        items: { type: "string" },
        description: "Optional: filter by categories (offense, defense, all)",
        default: ["all"]
      }
    }
  }
}
```

**Implementation:**
1. Call `runtime.getBuildStats()`
2. Format stats for LLM consumption (group by category)
3. Return structured data

**Success Response:**
```json
{
  "success": true,
  "stats": {
    "offense": {
      "TotalDPS": 125000,
      "CritChance": 5,
      "CritMultiplier": 150
    },
    "defense": {
      "Life": 4500,
      "EnergyShield": 0,
      "Armor": 12000,
      "Evasion": 500
    },
    "character": {
      "Level": 90,
      "Str": 150,
      "Dex": 100,
      "Int": 200
    }
  }
}
```

**Acceptance Criteria:**
- Returns all major stat categories
- Stats are properly typed (numbers, not strings)
- Handles empty builds gracefully
- Performance: < 100ms response time

**Estimated Time:** 2-3 hours

**Assignable To:** Can parallelize with Task 1.3 (different engineer)

**Depends On:** Task 1.1

**Blocks:** None

---

### Task 1.5: Add MCP Error Handling & Formatting

**Description:** Wrap Lua errors into LLM-friendly error messages

**File to Modify:** `src/mcp/server.ts`

**Requirements:**
1. Catch all Lua subprocess errors
2. Parse error messages for common issues
3. Provide actionable error messages
4. Add logging for debugging

**Common Errors to Handle:**
- "Node not found" → Suggest similar node names
- "No build loaded" → Prompt to load build first
- "LuaJIT not found" → Installation instructions
- Subprocess crashed → Automatic restart

**Example Error Transformation:**
```
Lua Error: "attempt to index nil value (field 'spec')"
→
LLM Error: "No build is currently loaded. Please use load_build first."
```

**Acceptance Criteria:**
- All error types have friendly messages
- Errors include suggestions when possible
- Stack traces logged but not sent to LLM
- No crashes on malformed input

**Estimated Time:** 2-3 hours

**Assignable To:** Same engineer as Task 1.1-1.3

**Depends On:** Tasks 1.2, 1.3, 1.4

**Blocks:** None

---

## Track 2: Testing & Documentation (Parallel to Track 1)

These tasks can be done **in parallel** with Track 1 by a different engineer.

### Task 2.1: Verify Existing Test Suite

**Description:** Fix and verify all existing tests pass

**Files to Check:**
- `src/tests/passive-allocation.test.ts`
- `src/tests/item-equip.test.ts`
- `src/tests/skill-gems.test.ts`
- `src/tests/jewels.test.ts`

**Requirements:**
1. Run `pnpm test` after TypeScript config fix
2. Verify all tests pass
3. Fix any failing tests
4. Document what each test validates

**Deliverable:** Add `src/tests/README.md` explaining test structure

**Acceptance Criteria:**
- `pnpm test` runs without errors
- All tests pass consistently
- README explains how to add new tests

**Estimated Time:** 1-2 hours

**Assignable To:** QA-focused engineer

**Depends On:** P0 (TypeScript config fix)

**Blocks:** Task 2.2

---

### Task 2.2: Create MCP Integration Test

**Description:** End-to-end test that validates MVP workflow

**File to Create:** `src/tests/mcp-integration.test.ts`

**Test Scenario:**
1. Start MCP server
2. Call `load_build` with test pastebin code
3. Call `get_build_stats` and verify initial stats
4. Call `allocate_passive` with "Resolute Technique"
5. Call `get_build_stats` and verify crit = 0%
6. Stop MCP server

**Requirements:**
- Use real MCP client to call tools
- Verify JSON responses match schemas
- Test error cases (invalid node, no build, etc.)
- Clean up resources after test

**Acceptance Criteria:**
- Test passes consistently
- Covers happy path and error cases
- Can run standalone: `node dist/tests/mcp-integration.test.js`

**Estimated Time:** 3-4 hours

**Assignable To:** Same engineer as Task 2.1

**Depends On:** Task 2.1, Task 1.4 (all MCP tools implemented)

**Blocks:** None

---

### Task 2.3: Update README for MVP

**Description:** Rewrite README.md for quick start

**File to Modify:** `README.md`

**Structure:**
```markdown
# Path of Building MCP Server

MCP server that gives LLMs access to Path of Building calculations.

## Quick Start

[Installation steps]
[Running the server]
[Testing with Claude Desktop]

## Project Structure

[Brief tour of src/ folders]

## Development

[Build, test, watch commands]

## Contributing

See docs/TASKS.md for current work
```

**Requirements:**
- Remove all status claims ("95% complete")
- Focus on "how to use" not "how we built it"
- Clear prerequisites (Node.js, pnpm)
- Test instructions for Claude Desktop
- Link to docs/ for details

**Acceptance Criteria:**
- A new user can get running in < 5 minutes
- No outdated information
- Links to relevant docs

**Estimated Time:** 1 hour

**Assignable To:** Technical writer or Task 2.1 engineer

**Depends On:** None (can start anytime)

**Blocks:** None

---

## Track 3: Polish (After MVP Works)

These are **post-MVP** tasks. Don't start until MVP is validated.

### Task 3.1: Add Build Caching
- Cache loaded builds with 30min TTL
- LRU eviction at 100 builds
- File: `src/cache/build-cache.ts`

### Task 3.2: Add More MCP Tools
- `deallocate_passive` - Remove allocated nodes
- `get_node_info` - Query specific node details
- `list_allocated_nodes` - Get all allocated nodes

### Task 3.3: Better Stat Formatting
- Group stats by category (offense/defense/utility)
- Add stat descriptions for LLMs
- Include breakpoints (e.g., "5% below 90% max res")

### Task 3.4: Resource Limits
- Max concurrent PoB processes
- Request rate limiting
- Memory usage monitoring

---

## Definition of Done: MVP

The MVP is **complete** when:

1. ✅ `pnpm build` compiles without errors
2. ✅ `pnpm test` passes all tests
3. ✅ `pnpm start` launches MCP server
4. ✅ Can connect via Claude Desktop
5. ✅ Can execute this workflow via MCP:
   - Load build from pastebin
   - Allocate "Resolute Technique"
   - Get stats showing crit = 0%
6. ✅ Integration test passes
7. ✅ README has clear setup instructions

**Estimated Total Time to MVP:** 15-20 hours of engineering work

**Parallelization:** With 2 engineers (Track 1 + Track 2), can complete in 2-3 days

---

## How to Pick Up a Task

1. Find a task with no dependencies (or all dependencies complete)
2. Read the task requirements and acceptance criteria
3. Check the reference docs (API_REFERENCE.md, POB_INTERNALS.md)
4. Create a feature branch: `git checkout -b feature/task-name`
5. Implement, test locally
6. Create PR with task number in title
7. Mark task as complete when merged

## Questions?

- Architecture decisions: See `docs/ARCHITECTURE.md`
- API usage: See `docs/API_REFERENCE.md`
- PoB internals: See `docs/POB_INTERNALS.md`
- MVP scope: See `docs/MVP.md`
