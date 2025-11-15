# Installation Guide

## Prerequisites

You need to install **LuaJIT** and **dkjson** before using pob-mcp.

### Step 1: Install LuaJIT

Choose your platform:

#### macOS
```bash
brew install luajit
brew install luarocks  # Lua package manager
```

#### Ubuntu/Debian
```bash
sudo apt update
sudo apt install luajit luarocks
```

#### Fedora/RHEL
```bash
sudo dnf install luajit luarocks
```

#### Windows
Option 1 - Chocolatey (recommended):
```powershell
choco install luajit
choco install luarocks
```

Option 2 - Manual:
1. Download LuaJIT from https://luajit.org/download.html
2. Extract and add to PATH
3. Download LuaRocks from https://luarocks.org/
4. Install and add to PATH

### Step 2: Install dkjson

After installing luarocks:
```bash
luarocks install dkjson
```

### Step 3: Verify Installation

Check that everything is installed:
```bash
luajit -v          # Should show: LuaJIT 2.1.x
luarocks list      # Should show dkjson in the list
```

## Install pob-mcp

```bash
# Clone repository
git clone <repo-url>
cd pob-mcp

# Install dependencies
pnpm install

# This will automatically:
# - Download Path of Building source
# - Check for LuaJIT (and warn if missing)
# - Build TypeScript

# Build
pnpm build

# Run MVP test
pnpm mvp
```

## Troubleshooting

### "luajit: command not found"
- LuaJIT is not installed or not in PATH
- Follow Step 1 above for your platform

### "dkjson not found"
- Run: `luarocks install dkjson`
- Make sure luarocks is installed

### "luarocks: command not found"
- Install luarocks (see Step 1 for your platform)
- On Windows, make sure it's added to PATH

### Permission errors on Linux
- Run luarocks commands with `sudo`
- Or install to user directory: `luarocks install --local dkjson`
- Then ensure `~/.luarocks` is in your LUA_PATH

### Path of Building not found
- The postinstall script should download it automatically
- If it fails, manually run: `node scripts/download-pob.js`
- Or set custom path in `~/.config/pob-mcp/config.json`

## Alternative: Docker (Future)

For easier deployment, we could provide a Docker image with everything pre-installed:

```dockerfile
FROM node:18
RUN apt-get update && apt-get install -y luajit luarocks
RUN luarocks install dkjson
# ... rest of setup
```

This is a future enhancement.
