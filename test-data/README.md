# Test Data

This directory contains sample data for testing the Path of Building integration.

## Files

- **sample-build.txt** - A real Path of Building build code (pastebin format)
  - Source: https://pastebin.com/uCLE0msa
  - Format: Base64-encoded, zlib-compressed XML data
  - Used for testing the `importFromCode()` functionality
  - Can be imported directly with the LuaJIT runtime

## Usage

```typescript
import { readFileSync } from 'fs';
import { LuaJITRuntime } from './src/pob/luajit-runtime.js';

const buildCode = readFileSync('test-data/sample-build.txt', 'utf-8').trim();
const runtime = new LuaJITRuntime();
await runtime.start();
const result = await runtime.importFromCode(buildCode);
```
