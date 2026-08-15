# Plugin Development Guide

This guide walks through building and publishing a community plugin for poe-ai.

## Overview

A **plugin** is an npm package that exports a default object satisfying the `PoEPlugin` interface from `@poe-ai/core`. When the poe-ai server starts, it dynamically imports each plugin listed in the user's config, calls `initialize()` once, then registers all of the plugin's tools with the MCP server.

Plugins receive a shared `PluginContext` that provides HTTP, caching, logging, league state, and optionally the PoB runtime — everything you need without managing your own infrastructure.

## Minimal Working Example

Here is a complete, working plugin stub that exposes a `get_currency_price` tool:

```typescript
// src/index.ts
import { z } from 'zod';
import type { PoEPlugin, PluginTool, PluginContext } from '@poe-ai/core';

// --- Tool definition ---

const getCurrencyPriceTool: PluginTool<{ currencyId: string }> = {
  name: 'get_currency_price',
  description: 'Get the current price of a Path of Exile currency item in Chaos Orbs',
  inputSchema: z.object({
    currencyId: z.string().describe('The currency identifier, e.g. "exalted" or "divine"'),
  }),
  async handler({ currencyId }, ctx: PluginContext) {
    // Include patchVersion in the cache key — prices change each patch
    const cacheKey = `ninja:currency:${ctx.leagueState.patchVersion}:${currencyId}`;
    const cached = ctx.cache.get<number>(cacheKey);
    if (cached !== undefined) {
      return { content: [{ type: 'text', text: `${currencyId}: ${cached}c (cached)` }] };
    }

    // Use ctx.http — it enforces rate limits shared across all plugins
    const data = await ctx.http.get<{ chaosValue: number }>(
      `https://poe.ninja/api/data/currencyoverview`,
      {
        params: {
          league: ctx.leagueState.currentLeague,
          type: 'Currency',
        },
      },
    );

    // Cache for 10 minutes
    ctx.cache.set(cacheKey, data.chaosValue, 10 * 60 * 1000);
    return { content: [{ type: 'text', text: `${currencyId}: ${data.chaosValue}c` }] };
  },
};

// --- Plugin definition ---

const NinjaPlugin: PoEPlugin = {
  name: 'poe-ai-plugin-ninja',
  version: '1.0.0',
  patchCompatibility: '*',

  async initialize(ctx: PluginContext): Promise<void> {
    ctx.logger.info('poe-ninja plugin initialized');
    // No heavy setup needed — this plugin is stateless
  },

  tools: [getCurrencyPriceTool],
};

export default NinjaPlugin;
```

## Plugin Interface Reference

### `PoEPlugin`

The top-level contract. Every plugin must export this as `default`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | yes | npm package name. Used in log messages. |
| `version` | `string` | yes | Semver version string, e.g. `"1.0.0"`. |
| `patchCompatibility` | `string` | yes | Semver range of PoE patch versions this plugin supports, e.g. `"3.26.*"` or `"*"`. |
| `initialize` | `(ctx) => Promise<void>` | yes | Called once at server startup. Initialize connections, warm caches, or set `ctx.pobRuntime`. Throwing here skips the plugin with a warning — the server continues. |
| `tools` | `PluginTool[]` | yes | The MCP tools this plugin contributes. |
| `dispose` | `(ctx) => Promise<void>` | no | Optional cleanup called on server shutdown. |

### `PluginTool<TInput>`

Defines a single MCP tool.

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Tool name in `snake_case`, e.g. `"get_currency_price"`. |
| `description` | `string` | Human-readable description shown to the LLM. |
| `inputSchema` | `ZodType<TInput>` | Zod schema. The server validates raw input through this before calling `handler`. |
| `handler` | `(input: TInput, ctx: PluginContext) => Promise<ToolResult>` | Called with parsed, validated input. Must return `{ content: [{ type: 'text', text: string }] }`. |

### `PluginContext`

Passed to `initialize()` and to every tool `handler`. This is a **single shared mutable object** — mutations in one plugin's `initialize()` are visible to all subsequent plugins.

| Field | Type | Description |
|-------|------|-------------|
| `http` | `HttpClient` | Rate-limited HTTP client. All plugins share the same rate limit pool. |
| `cache` | `Cache` | TTL-based in-memory cache. Shared across all plugins. |
| `leagueState` | `LeagueState` | Current league, patch version, hardcore/SSF flags from user config. |
| `logger` | `Logger` | Structured logger with `info`, `warn`, `error`, `debug` methods. |
| `pobRuntime` | `PobRuntime \| undefined` | Set by `@poe-ai/plugin-pob` during `initialize()`. Only present if that plugin is loaded and initialized successfully. Always check for `undefined` before using. |

## Available Context

### `ctx.http` — Rate-Limited HTTP Client

```typescript
// GET request with query params
const data = await ctx.http.get<MyType>('https://api.example.com/endpoint', {
  params: { league: ctx.leagueState.currentLeague },
  headers: { 'Accept': 'application/json' },
  timeoutMs: 5000,
});

// POST request
const result = await ctx.http.post<MyResponse>('https://api.example.com/submit', {
  key: 'value',
});
```

Always use `ctx.http` for outbound calls. Bypassing it with raw `fetch` or `axios` skips the shared rate limiter, which can trigger API bans that affect other plugins.

### `ctx.cache` — TTL Cache

```typescript
// Read
const value = ctx.cache.get<MyType>('some-key');
if (value !== undefined) { /* cache hit */ }

// Write with optional TTL (falls back to server default if omitted)
ctx.cache.set('some-key', value, 5 * 60 * 1000); // 5 minutes

// Invalidate
ctx.cache.delete('some-key');
```

The cache is in-memory and shared across plugins. Use namespaced keys (prefix with your plugin name) to avoid collisions.

### `ctx.leagueState` — League and Patch Info

```typescript
const { currentLeague, patchVersion, hardcore, ssf } = ctx.leagueState;
// e.g. "Settlers of Kalguur", "3.26.0", false, false
```

Never hardcode league names or patch versions — always read from `ctx.leagueState`.

### `ctx.logger` — Structured Logger

```typescript
ctx.logger.info('Plugin initialized');
ctx.logger.warn('Unexpected response format — using defaults');
ctx.logger.error(`API call failed: ${err.message}`);
ctx.logger.debug('Cache miss for key: my-key');
```

### `ctx.pobRuntime` — PoB Runtime (optional)

Only available if `@poe-ai/plugin-pob` is loaded **before** your plugin in the config's `plugins` array. Always guard with a null check:

```typescript
if (!ctx.pobRuntime) {
  return { content: [{ type: 'text', text: 'PoB plugin not loaded' }], isError: true };
}
const stats = await ctx.pobRuntime.getBuildStats();
```

## Caching Best Practices

Game data changes every patch. Always include `patchVersion` in cache keys for anything that is patch-specific:

```typescript
// Good — cache busts automatically when patchVersion changes
const key = `myplugin:gems:${ctx.leagueState.patchVersion}:${gemName}`;

// Bad — stale data survives a patch update
const key = `myplugin:gems:${gemName}`;
```

Economy data (prices) changes daily; use short TTLs (5–15 minutes). Static game data (passive descriptions, item bases) rarely changes mid-patch; use longer TTLs (1–24 hours).

## Publishing

### Package naming

Community plugins must follow the naming convention `poe-ai-plugin-*` (no `@poe-ai/` scope — that is reserved for first-party packages):

```
poe-ai-plugin-ninja       // poe.ninja economy data
poe-ai-plugin-pathfinder  // custom passive pathfinding
poe-ai-plugin-trade       // trade API integration
```

### package.json template

```json
{
  "name": "poe-ai-plugin-ninja",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "peerDependencies": {
    "@poe-ai/core": ">=0.1.0"
  },
  "devDependencies": {
    "@poe-ai/core": "^0.1.0",
    "typescript": "^5.0.0",
    "zod": "3"
  }
}
```

Declare `@poe-ai/core` as a peer dependency, not a direct dependency. This ensures your plugin uses the same core instance as the server (critical for the shared `PluginContext` to work correctly).

### Important: ESM import extensions

All relative imports must use `.js` extensions (required for Node16 ESM):

```typescript
// Correct
import { myHelper } from './helpers.js';

// Wrong — will fail at runtime
import { myHelper } from './helpers';
```

### Publish

```bash
pnpm build
npm publish
```

## Loading Your Plugin

After publishing (or during local development with `npm link`), add the package name to `~/.config/poe-ai/config.json`:

```jsonc
{
  "league": "Settlers of Kalguur",
  "patchVersion": "3.26.0",
  "hardcore": false,
  "ssf": false,
  "plugins": [
    "@poe-ai/plugin-pob",
    "@poe-ai/plugin-wiki",
    "poe-ai-plugin-ninja"
  ]
}
```

Plugins are initialized in the order listed. If your plugin depends on `ctx.pobRuntime`, list `@poe-ai/plugin-pob` before it.

## Handling Errors

- Return `{ content: [...], isError: true }` for recoverable tool-level errors (e.g. item not found). This tells the LLM the call failed but lets it try again with different input.
- Throw from `initialize()` to signal a fatal startup error. The server will skip your plugin with a warning and continue loading others.
- Never let `initialize()` hang indefinitely — set timeouts on any I/O you do there.
