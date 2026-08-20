# poe-ai

An intelligence layer for Path of Exile that exposes vetted, patch-versioned game knowledge to LLMs via the [Model Context Protocol](https://modelcontextprotocol.io/) (MCP).

Instead of scraping wikis or guessing, LLMs get access to authoritative tools: Path of Building calculations, the official PoE wiki, poe.ninja economy data, and local RePoE crafting data. The server is built around a plugin ecosystem — each data source is a separate package that can be installed (and its data downloaded) independently, so you only pay for what you use.

## Quick Start

### Prerequisites

- **Node.js** >= 18
- A compiler is only needed if you enable `@poe-ai/plugin-pob` **and** don't have a system LuaJIT — see [the droplet path](#minimal-footprint--droplet-path) below.

### Install, initialize, connect

```bash
npm install -g @poe-ai/core
poe-ai init
```

`poe-ai init` walks you through:

1. **Which plugins to enable** (prompted interactively, or pass `--plugins=pob,wiki,ninja,...`).
2. **Your league** — resolved live from poe.ninja if `@poe-ai/plugin-ninja` is enabled, otherwise prompted (or `--league="Settlers of Kalguur"`).
3. Writing `~/.config/poe-ai/config.json` (never overwrites an existing one without `--force` — shows what would change instead).
4. Downloading exactly what the enabled plugins need — nothing more. Only `@poe-ai/plugin-pob` (pob-data + LuaJIT) and `@poe-ai/plugin-crafting` (RePoE game data) need anything downloaded at all; everything else works from the installed package alone.

It finishes by printing the connection snippet:

```jsonc
// .mcp.json / Claude Desktop MCP config
{
  "mcpServers": {
    "poe-ai": { "command": "poe-ai-mcp" }
  }
}
```

or, via the Claude Code CLI:

```bash
claude mcp add poe-ai -- poe-ai-mcp
```

Non-interactive example (e.g. for a script or CI):

```bash
poe-ai init --yes --plugins=pob,wiki --league="Settlers of Kalguur"
```

### Minimal-footprint / droplet path

For a small cloud box that only needs prices, wiki lookups, and crafting knowledge — no Path of Building calc, no compiler at all:

```bash
npm install -g @poe-ai/core
poe-ai init --yes --plugins=wiki,ninja,crafting
```

Measured on a fresh install: **~52MB total, zero compiler invocations** (no `gcc`/`make` ever runs for this plugin set).

If you *do* want `@poe-ai/plugin-pob` on a droplet, install a system LuaJIT first so `poe-ai init` skips building one from source entirely:

```bash
apt install luajit   # Debian/Ubuntu
poe-ai init --yes --plugins=pob,wiki
```

`poe-ai init` detects a working LuaJIT on `PATH` (checked via `require("ffi")`, not a version number — any LuaJIT 2.x from apt/brew/source has everything the bridge needs) and only falls back to a from-source build (needs `make` + `gcc`/`clang`) if none is found. With `plugin-pob` enabled, `pob-data` is pruned to the current patch's passive tree by default (~40MB, down from ~550MB for every historical tree) — set `POE_AI_ALL_TREES=1` before re-running `download-pob.js` if you need to load a build saved on an old patch; a build that needs a tree that isn't present gets a clear error naming the missing version instead of a crash.

Measured on a fresh install with `plugin-pob` + `plugin-wiki` enabled and LuaJIT built from source: **~304MB total**, 11 MCP tools.

### Development (working in this monorepo)

```bash
git clone <this-repo>
cd poe-ai
pnpm install
pnpm --filter @poe-ai/core build
pnpm --filter @poe-ai/plugin-pob run setup   # pob-data + LuaJIT — not run by install anymore
node packages/core/dist/cli/main.js init
```

```bash
# Build all packages
pnpm -r build

# Run all tests
pnpm -r test

# Run core MCP server tests only (no external deps)
pnpm --filter @poe-ai/core test

# Run PoB integration tests (after `pnpm --filter @poe-ai/plugin-pob run setup`)
pnpm --filter @poe-ai/plugin-pob test
```

## Available Plugins

| Plugin | Tools | Downloads at init | Description |
|--------|-------|--------------------|--------------|
| `@poe-ai/plugin-pob` | `load_build`, `get_build_stats`, `allocate_passive`, `deallocate_passive`, `list_allocated_nodes`, `get_build_summary`, `compare_builds` | pob-data + LuaJIT | Path of Building integration via LuaJIT subprocess. |
| `@poe-ai/plugin-wiki` | `wiki_lookup`, `get_passive_info`, `get_item_info`, `get_skill_info` | none | Official PoE wiki via MediaWiki API. |
| `@poe-ai/plugin-ninja` | `get_item_price` | none | poe.ninja economy data (currency, uniques, maps, gems, ...). |
| `@poe-ai/plugin-wealth` | `get_stash_value` | none | Stash + character wealth tracking. |
| `@poe-ai/plugin-crafting` | `crafting_fossil_info`, `crafting_essence_info`, `crafting_mod_lookup`, `crafting_harvest_options`, `crafting_influenced_mods` | RePoE game data (`@poe-ai/game-data`) | Fossils, essences, influenced mods, harvest crafting from local RePoE data. |
| `@poe-ai/plugin-archetypes` | `list_archetypes`, `archetype_info`, `identify_archetype` | none | Patch-versioned build archetype knowledge base + deterministic classifier. `identify_archetype` uses `@poe-ai/plugin-pob` if it's also enabled and loaded; degrades gracefully otherwise. |

## Config Reference

`~/.config/poe-ai/config.json` (written by `poe-ai init`):

| Field | Type | Description |
|-------|------|--------------|
| `league` | string | Current league name, e.g. `"Settlers of Kalguur"` |
| `patchVersion` | string | PoE patch semver, e.g. `"3.26.0"` |
| `hardcore` | boolean | Affects economy data context |
| `ssf` | boolean | Solo Self-Found — affects economy data (no trade access) |
| `plugins` | string[] | Ordered list of plugin package names to load |
| `cacheTtlMs` | number | Optional. Cache TTL in milliseconds (default: 5 minutes) |

## Community Plugins

Community plugins use the naming convention `poe-ai-plugin-*` (unprefixed, no `@poe-ai/` scope). To load one, install it and add it to your `plugins` array:

```bash
npm install -g poe-ai-plugin-something
```

```jsonc
{
  "plugins": ["@poe-ai/plugin-pob", "poe-ai-plugin-something"]
}
```

See [PLUGIN_GUIDE.md](./PLUGIN_GUIDE.md) for step-by-step instructions on building your own plugin.

## Project Structure

```
packages/
  core/               @poe-ai/core               — MCP server, plugin loader, poe-ai/poe-ai-mcp CLIs
  game-data/          @poe-ai/game-data          — local RePoE game-data loaders (mods, items, fossils, ...)
  plugin-pob/         @poe-ai/plugin-pob         — Path of Building integration (LuaJIT subprocess)
  plugin-wiki/        @poe-ai/plugin-wiki        — official PoE wiki via MediaWiki API
  plugin-ninja/       @poe-ai/plugin-ninja       — poe.ninja economy data
  plugin-wealth/      @poe-ai/plugin-wealth      — stash + character wealth tracking
  plugin-crafting/    @poe-ai/plugin-crafting    — crafting knowledge (local RePoE data)
  plugin-archetypes/  @poe-ai/plugin-archetypes  — build archetype knowledge base + classifier
  integration-tests/  (private)                  — stdio/HTTP MCP e2e suite
```

## License

MIT

## Credits

Built on top of [Path of Building Community Fork](https://github.com/PathOfBuildingCommunity/PathOfBuilding).
