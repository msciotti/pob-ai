/**
 * MVP Test: Load build, allocate passives, verify stat changes
 */
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadConfig } from './config/index.js';
import { getPobPath } from './pob/detector.js';
import { LuaJITRuntime } from './pob/luajit-runtime.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load test build from file
async function loadTestBuild(): Promise<string> {
  const buildPath = join(__dirname, '..', 'test-data', 'sample-build.txt');
  console.log(`   Reading build from: ${buildPath}`);
  const content = await readFile(buildPath, 'utf-8');
  console.log(`   Build file size: ${content.length} characters`);
  return content;
}

async function main() {
  console.log('=== PoB MVP Tests ===\n');

  try {
    // 1. Setup
    console.log('1. Initializing...');
    console.log('   Loading configuration...');
    const config = await loadConfig();
    console.log('   ✓ Configuration loaded');

    console.log('   Detecting PoB installation...');
    const pobPath = await getPobPath(config.pobPath);
    console.log(`   ✓ Found PoB at: ${pobPath}`);

    console.log('   Creating LuaJIT runtime...');
    const runtime = new LuaJITRuntime(pobPath);
    console.log('   ✓ Runtime created');

    console.log('   Initializing runtime (loading Lua modules)...');
    await runtime.initialize();
    console.log('   ✓ Runtime fully initialized\n');

    // 2. Load test build (this creates a build automatically)
    console.log('2. Loading test build...');
    const buildXML = await loadTestBuild();
    console.log('   Parsing and loading XML into PoB...');
    await runtime.loadBuildFromXML(buildXML, 'Test Build');
    console.log('   ✓ Build loaded and parsed\n');

    // 3. Get initial crit chance
    console.log('3. Getting initial crit chance...');
    console.log('   Calculating build stats...');
    let stats = await runtime.getBuildStats();
    const initialCrit = stats['CritChance'] || 0;
    console.log(`   ✓ Stats calculated`);
    console.log(`   Initial CritChance: ${initialCrit}%\n`);

    // 4. Allocate Resolute Technique
    console.log('4. Allocating Resolute Technique passive...');
    console.log('   Searching for passive node...');
    await runtime.allocatePassive('Resolute Technique');
    console.log('   ✓ Passive node allocated');
    console.log('   Build will auto-recalculate with new passive\n');

    // 5. Get final crit chance (recalculation happens automatically)
    console.log('5. Getting final crit chance after passive allocation...');
    console.log('   Recalculating build stats...');
    stats = await runtime.getBuildStats();
    const finalCrit = stats['CritChance'] || 0;
    console.log(`   ✓ Stats recalculated`);
    console.log(`   Final CritChance: ${finalCrit}%\n`);

    // 6. Verification
    console.log('6. Verification...');
    if (finalCrit === 0) {
      console.log('   ✅ SUCCESS! Crit chance is 0% after Resolute Technique');
      console.log('   The passive correctly sets crit to 0%');
    } else {
      console.log(`   ⚠️  FAILED: Expected 0%, got ${finalCrit}%`);
      console.log('   Something went wrong with the passive allocation');
    }

    console.log('\n' + '='.repeat(50));
    console.log('TEST 2: Chaos Inoculation');
    console.log('='.repeat(50) + '\n');

    // 7. Reload build for second test
    console.log('7. Reloading test build for Chaos Inoculation test...');
    await runtime.loadBuildFromXML(buildXML, 'CI Test Build');
    console.log('   ✓ Build reloaded\n');

    // 8. Get initial Life
    console.log('8. Getting initial Life...');
    console.log('   Calculating build stats...');
    stats = await runtime.getBuildStats();
    const initialLife = stats['Life'] || 0;
    console.log(`   ✓ Stats calculated`);
    console.log(`   Initial Life: ${initialLife}\n`);

    // 9. Allocate Chaos Inoculation
    console.log('9. Allocating Chaos Inoculation passive...');
    console.log('   Searching for passive node...');
    await runtime.allocatePassive('Chaos Inoculation');
    console.log('   ✓ Passive node allocated');
    console.log('   Build will auto-recalculate with new passive\n');

    // 10. Get final Life
    console.log('10. Getting final Life after passive allocation...');
    console.log('    Recalculating build stats...');
    stats = await runtime.getBuildStats();
    const finalLife = stats['Life'] || 0;
    const finalES = stats['EnergyShield'] || 0;
    console.log(`    ✓ Stats recalculated`);
    console.log(`    Final Life: ${finalLife}`);
    console.log(`    Final Energy Shield: ${finalES}\n`);

    // 11. Verification
    console.log('11. Verification...');
    if (finalLife === 1) {
      console.log('    ✅ SUCCESS! Life is 1 after Chaos Inoculation');
      console.log('    The passive correctly sets max Life to 1');
      console.log('    Character is now immune to chaos damage (relies on Energy Shield)');
    } else {
      console.log(`    ⚠️  FAILED: Expected 1, got ${finalLife}`);
      console.log('    Something went wrong with the passive allocation');
    }

    console.log('\n=== All MVP Tests Complete ===');

    // Cleanup
    console.log('\nCleaning up runtime...');
    runtime.destroy();
    console.log('✓ Cleanup complete');
  } catch (error) {
    console.error(`\n❌ Error: ${error}`);
    process.exit(1);
  }
}

main().catch(console.error);
