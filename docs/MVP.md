# MVP: Path of Building MCP Server

## Problem Statement

Path of Exile builds are extremely complex with hundreds of interactions between passive tree, items, gems, and character stats. LLMs can't effectively help players optimize builds because they can't access Path of Building's calculation engine.

## Solution

An MCP server that exposes Path of Building's headless calculation engine to LLMs, enabling AI assistants to:
- Load and analyze builds
- Modify passive tree allocations
- Calculate real stat changes
- Explain optimization tradeoffs

## MVP Scope

The minimum viable product enables an LLM to perform this workflow:

1. **Load a build** from pastebin code or XML
2. **Allocate a passive node** (e.g., "Resolute Technique")
3. **Get calculated stats** (DPS, Life, ES, Crit Chance, etc.)
4. **Explain the outcome** to the user

### MVP Features (In Scope)

- **Build Import**: Load from pastebin code or XML string
- **Passive Allocation**: Allocate single nodes with automatic pathing
- **Stat Queries**: Get all calculated build stats
- **MCP Protocol**: 3 core tools exposed via MCP

### Explicitly Out of Scope for MVP

These are valuable but **not required** for the first working version:

- ❌ Item equipment/modification
- ❌ Skill gem changes
- ❌ Multiple passive allocations in one call
- ❌ Build comparison
- ❌ poe.ninja integration
- ❌ Build optimization suggestions
- ❌ Tree pathfinding visualization
- ❌ Build caching (can run stateless)
- ❌ Multiple concurrent builds

## Success Criteria

The MVP is complete when an LLM can:

1. Load this build: `https://pastebin.com/uCLE0msa`
2. Allocate "Resolute Technique" keystone
3. Retrieve stats showing crit chance changed from 5% → 0%
4. Explain to the user why this happened

**Acceptance test:**
```
User: "Load my build from pastebin.com/uCLE0msa and allocate Resolute Technique"
LLM: [Uses MCP tools to load, allocate, get stats]
LLM: "I've allocated Resolute Technique. Your crit chance is now 0% (was 5%)
      because Resolute Technique gives you 'Your hits can't be Critical
      Strikes' in exchange for accuracy benefits."
```

## Technical Constraints

1. **Must use actual PoB code** - No reimplementation. We wrap the real PoB calculation engine.
2. **Cross-platform** - Must work on macOS, Linux, and Windows
3. **No GUI dependencies** - Runs headless via LuaJIT subprocess
4. **Stateless for MVP** - Each request is independent (simplifies implementation)

## Post-MVP Roadmap

Features to add after MVP is proven:

1. **Item operations** - Equip/unequip items, modify gear
2. **Skill gem management** - Change active skills and supports
3. **Build caching** - Store loaded builds with TTL for performance
4. **Batch operations** - Allocate multiple nodes, compare configurations
5. **poe.ninja integration** - Compare to top builds, get meta insights
6. **Tree optimization** - Suggest efficient pathing, identify wasted points

## Non-Goals

These are explicitly **not** part of this project:

- Building a PoB GUI alternative
- Creating a web-hosted build service
- Real-time game integration
- Trading/economy features
- Character management beyond builds
