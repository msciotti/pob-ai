# poe-ai — Claude Context

## What This Project Is

An intelligence layer for Path of Exile that exposes vetted, patch-versioned game knowledge to LLMs via the Model Context Protocol (MCP). Instead of scraping the web (which has outdated and incorrect info), this gives Claude access to authoritative tools: Path of Building calculations, the official PoE wiki, poe.ninja economy data, etc.

## Architecture

This is a **pnpm monorepo** with a plugin system:

```
packages/
  core/          @poe-ai/core      — MCP server + shared infrastructure
  plugin-pob/    @poe-ai/plugin-pob — Path of Building integration (LuaJIT subprocess)
  plugin-wiki/   @poe-ai/plugin-wiki — Official PoE wiki via MediaWiki API
```

Community contributors publish `poe-ai-plugin-*` packages to npm. The core server loads plugins listed in `~/.config/poe-ai/config.json` via dynamic import.

## The Plugin Contract (`PoEPlugin` interface)

**This is the most important invariant in the codebase.** Defined in `packages/core/src/types.ts`.

Rules that must never be violated:
- Every plugin must export a `default` that satisfies `PoEPlugin`
- `initialize(ctx)` must complete before any tool handler runs
- `plugin-pob` sets `ctx.pobRuntime` during `initialize()` — other plugins that depend on it must handle `pobRuntime` being undefined gracefully
- Tool handlers must return `ToolResult` (`{ content: [{ type: 'text', text: string }] }`)
- `patchCompatibility` must be a valid semver range string

**Changes to `packages/core/src/types.ts` are breaking changes** — they affect every plugin. Flag any PR that modifies this file.

## Code Conventions

- **All relative imports must use `.js` extensions** (required for Node16 ESM): `import { foo } from './bar.js'`
- Cache keys must include `patchVersion` when caching game data (content changes per patch)
- Tool names are `snake_case`: `load_build`, `get_currency_price`, `wiki_lookup`
- Plugin packages use `@poe-ai/` scope for first-party, unprefixed `poe-ai-plugin-*` for community

## What to Focus On in Reviews

### Always flag
- Missing `.js` extension on relative imports
- Plugin `default` export missing or not implementing `PoEPlugin`
- Tool handler not returning proper `ToolResult` shape
- Cache keys that include game data but omit `patchVersion`
- `ctx.pobRuntime` accessed without a null check (it's optional — only set if plugin-pob is loaded)
- Changes to `packages/core/src/types.ts` without clear justification

### Usually flag
- HTTP calls in plugins that bypass `ctx.http` (they'd skip rate limiting)
- Hardcoded league names or patch versions (should come from `ctx.leagueState`)
- Missing error handling in `initialize()` (a plugin crash on startup takes down the server)

### Skip
- Formatting/whitespace (no formatter configured yet)
- Test coverage gaps for pure utility functions
- Lua code in `packages/plugin-pob/scripts/` — this is adapted from Path of Building and intentionally not idiomatic

## Path of Building Notes

The PoB integration runs Path of Building's actual Lua code via a LuaJIT subprocess. `pob-bridge.lua` is a JSON API shim over stdin/stdout. Key facts:
- Item slot "Body Armour" uses British spelling
- Always call `BuildAllDependsAndPaths()` after allocating passives
- Stat keys like `TotalDPS`, `Life`, `CritChance` — not all stats exist for every build
- Build loading is ~200-500ms; calculations are ~50ms

## Running Tests

```bash
# From repo root
pnpm -r test           # all packages
pnpm --filter @poe-ai/plugin-pob test   # pob integration tests (requires LuaJIT)
pnpm --filter @poe-ai/core test:mcp     # core unit tests (no external deps)
```
