/**
 * Test script to verify PoB detection and Lua runtime
 */
import { loadConfig } from './config/index.js';
import { getPobPath } from './pob/detector.js';
import { LuaRuntime } from './pob/lua-runtime.js';

async function main() {
  console.log('=== PoB MCP Test ===\n');

  // Load config
  console.log('1. Loading configuration...');
  const config = await loadConfig();
  console.log(`   Config loaded:`, config);
  console.log();

  // Detect PoB installation
  console.log('2. Detecting Path of Building installation...');
  try {
    const pobPath = await getPobPath(config.pobPath);
    console.log(`   ✓ Found PoB at: ${pobPath}`);
    console.log();

    // Initialize Lua runtime
    console.log('3. Initializing Lua runtime...');
    const luaRuntime = new LuaRuntime(pobPath);
    await luaRuntime.initialize();
    console.log('   ✓ Lua runtime initialized');
    console.log();

    // Test that Lua environment is functional
    console.log('4. Testing Lua environment...');
    luaRuntime.newBuild();
    console.log('   ✓ Lua environment functional');
    console.log();

    console.log('=== All tests passed! ===');
    console.log('✅ PoB modules loaded successfully!');
    console.log('   Next: Implement Build module loading for full functionality');

    // Cleanup
    luaRuntime.destroy();
  } catch (error) {
    console.error(`   ✗ Error: ${error}`);
    process.exit(1);
  }
}

main().catch(console.error);
