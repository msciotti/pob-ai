# Path of Building MCP Server

MCP server that provides LLMs access to Path of Building's calculation engine for analyzing and optimizing Path of Exile builds.

## What This Does

Enables AI assistants like Claude to:
- Load Path of Exile builds from pastebin or XML
- Modify passive tree allocations
- Calculate real stat changes using PoB's engine
- Explain build optimizations with accurate numbers

## Quick Start

### Prerequisites

- **Node.js** 18 or higher
- **pnpm** (install with `npm install -g pnpm`)

### Installation

```bash
git clone <this-repo>
cd pob-ai
pnpm install
```

The install script will automatically:
- Download Path of Building source
- Build bundled LuaJIT (requires build tools on your system)

**Linux/macOS Build Tools:**
```bash
# macOS
xcode-select --install

# Ubuntu/Debian
sudo apt install build-essential

# Fedora/RHEL
sudo dnf groupinstall "Development Tools"
```

### Build and Test

```bash
# Compile TypeScript
pnpm build

# Run test suite
pnpm test

# Run MVP demo (Resolute Technique test)
pnpm mvp
```

### Running the MCP Server

```bash
pnpm start
```

**Note:** MCP server implementation is not yet complete. See [docs/TASKS.md](docs/TASKS.md) for current work status.

## Project Structure

```
pob-ai/
├── src/
│   ├── pob/                    # PoB runtime integration
│   │   ├── luajit-runtime.ts   # Main API wrapper
│   │   ├── detector.ts         # PoB path detection
│   │   └── passive-tree-utils.ts # Pathfinding utilities
│   ├── config/                 # Configuration management
│   ├── tests/                  # Test suite
│   │   ├── passive-allocation.test.ts
│   │   ├── item-equip.test.ts
│   │   ├── skill-gems.test.ts
│   │   └── jewels.test.ts
│   └── mvp-test.ts            # MVP demonstration
├── scripts/
│   ├── download-pob.js        # PoB source downloader
│   ├── download-luajit.js     # LuaJIT build script
│   └── pob-bridge.lua         # Lua ↔ TypeScript JSON bridge
├── docs/                      # Documentation
│   ├── MVP.md                 # Product requirements
│   ├── ARCHITECTURE.md        # Technical decisions
│   ├── TASKS.md              # Work breakdown
│   ├── API_REFERENCE.md      # LuaJITRuntime API
│   └── POB_INTERNALS.md      # PoB integration guide
├── pob-data/                  # Downloaded PoB source
└── test-data/                 # Sample builds
```

## Architecture

```
TypeScript MCP Server
       ↓ spawn
    LuaJIT Process
       ↓ loads
  HeadlessWrapper.lua
       ↓ loads
   Full PoB Application
  (minus GUI display)
       ↓ JSON over stdin/stdout
    TypeScript API
```

**Key Insight:** We run the **actual** Path of Building code via LuaJIT subprocess. This gives us 100% calculation accuracy and automatic compatibility with PoB updates.

## Example Usage

```typescript
import { LuaJITRuntime } from './pob/luajit-runtime';

const runtime = new LuaJITRuntime('/path/to/pob');
await runtime.initialize();

// Load build from pastebin
await runtime.importFromCode('eNqVVt1u...', 'My Build');

// Get stats
let stats = await runtime.getBuildStats();
console.log(`DPS: ${stats.TotalDPS}, Life: ${stats.Life}`);

// Allocate passive
await runtime.allocatePassive('Resolute Technique');

// Get updated stats
stats = await runtime.getBuildStats();
console.log(`New crit chance: ${stats.CritChance}%`); // 0%

runtime.destroy();
```

## Development

```bash
# Install dependencies
pnpm install

# Build TypeScript
pnpm build

# Watch mode (auto-rebuild)
pnpm dev

# Run tests
pnpm test

# Run MVP demo
pnpm mvp
```

## Configuration

Optional config file: `~/.config/pob-mcp/config.json`

```json
{
  "pobPath": "/custom/path/to/pob",
  "cacheTtl": 1800000,
  "maxCachedBuilds": 100
}
```

If not specified, PoB is auto-detected or the bundled version is used.

## Documentation

- **[MVP.md](docs/MVP.md)** - Product scope and requirements
- **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** - Technical decisions and data flow
- **[TASKS.md](docs/TASKS.md)** - Current work and task breakdown
- **[API_REFERENCE.md](docs/API_REFERENCE.md)** - LuaJITRuntime API documentation
- **[POB_INTERNALS.md](docs/POB_INTERNALS.md)** - PoB integration guide for contributors

## Contributing

See [docs/TASKS.md](docs/TASKS.md) for current work items. Tasks are designed to be picked up by mid-level engineers working in parallel.

1. Pick a task from TASKS.md
2. Create feature branch: `git checkout -b feature/task-name`
3. Implement and test
4. Create PR

## Testing

The test suite covers:
- **Passive allocation** - Tree pathfinding and node allocation
- **Item equipment** - Equipping items in various slots
- **Skill gems** - Socket groups and support gems
- **Jewels** - Jewel socketing in passive tree

```bash
pnpm test
```

## Requirements

- **Node.js** >= 18.0.0
- **pnpm** (package manager)
- **Build tools** (for LuaJIT compilation)
  - macOS: Xcode Command Line Tools
  - Linux: build-essential or equivalent
  - Windows: Not yet tested (contributions welcome)

## License

MIT

## Credits

Built on top of [Path of Building Community Fork](https://github.com/PathOfBuildingCommunity/PathOfBuilding) - the amazing build planning tool maintained by the PoE community.
