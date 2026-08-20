# poe-ai

An intelligence layer for Path of Exile that exposes vetted, patch-versioned game knowledge to LLMs via the [Model Context Protocol](https://modelcontextprotocol.io/) (MCP).

Instead of scraping wikis or guessing, LLMs get access to authoritative tools: Path of Building calculations, the official PoE wiki, and poe.ninja economy data. The server is built around a plugin ecosystem — each data source is a separate package that can be developed and published independently.

## Quick Start

### Prerequisites

- **Node.js** >= 18
- **pnpm** (`npm install -g pnpm`)
- **LuaJIT** — required only for `@poe-ai/plugin-pob` (auto-built during `pnpm install`)

### Install and configure

```bash
git clone <this-repo>
cd poe-ai
pnpm install
```

Create your config file at `~/.config/poe-ai/config.json`:

```jsonc
{
  "league": "Settlers of Kalguur",
  "patchVersion": "3.26.0",
  "hardcore": false,
  "ssf": false,
  "plugins": ["@poe-ai/plugin-pob", "@poe-ai/plugin-wiki"]
}
```

### Run the server

```bash
pnpm --filter @poe-ai/core start
```

The MCP server listens on `http://localhost:3000/mcp` by default. Set `PORT` to override.

### Connect to Claude Desktop

Add to your Claude Desktop MCP config:

```json
{
  "mcpServers": {
    "poe-ai": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

## Available Plugins

| Plugin | Tools | Description |
|--------|-------|-------------|
| `@poe-ai/plugin-pob` | `load_build`, `get_build_stats`, `allocate_passive` | Path of Building integration via LuaJIT subprocess. Requires LuaJIT. |
| `@poe-ai/plugin-wiki` | `wiki_lookup`, `get_passive_info`, `get_item_info`, `get_skill_info` | Official PoE wiki via MediaWiki API. No external runtime required. |
| `@poe-ai/plugin-archetypes` | `list_archetypes`, `archetype_info`, `identify_archetype` | Patch-versioned build archetype knowledge base + deterministic classifier. `identify_archetype` uses `@poe-ai/plugin-pob` if loaded; degrades gracefully otherwise. |

## Config Reference

All fields are required unless noted:

| Field | Type | Description |
|-------|------|-------------|
| `league` | string | Current league name, e.g. `"Settlers of Kalguur"` |
| `patchVersion` | string | PoE patch semver, e.g. `"3.26.0"` |
| `hardcore` | boolean | Affects economy data context |
| `ssf` | boolean | Solo Self-Found — affects economy data (no trade access) |
| `plugins` | string[] | Ordered list of plugin package names to load |
| `cacheTtlMs` | number | Optional. Cache TTL in milliseconds (default: 5 minutes) |

## Community Plugins

Community plugins use the naming convention `poe-ai-plugin-*` (unprefixed, no `@poe-ai/` scope). To load one, add it to your `plugins` array after installing it:

```bash
npm install -g poe-ai-plugin-ninja
```

```jsonc
{
  "plugins": ["@poe-ai/plugin-pob", "poe-ai-plugin-ninja"]
}
```

See [PLUGIN_GUIDE.md](./PLUGIN_GUIDE.md) for step-by-step instructions on building your own plugin.

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm -r build

# Run all tests
pnpm -r test

# Run core MCP server tests only (no external deps)
pnpm --filter @poe-ai/core test

# Run PoB integration tests (requires LuaJIT — built during pnpm install)
pnpm --filter @poe-ai/plugin-pob test
```

## Project Structure

```
packages/
  core/          @poe-ai/core        — MCP server + shared plugin infrastructure
  plugin-pob/    @poe-ai/plugin-pob        — Path of Building integration (LuaJIT subprocess)
  plugin-wiki/   @poe-ai/plugin-wiki       — Official PoE wiki via MediaWiki API
  plugin-archetypes/ @poe-ai/plugin-archetypes — Build archetype knowledge base + classifier
```

## License

MIT

## Credits

Built on top of [Path of Building Community Fork](https://github.com/PathOfBuildingCommunity/PathOfBuilding).
