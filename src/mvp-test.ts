/**
 * MVP Test: Create fresh builds, allocate passives, verify stat changes
 *
 * IMPORTANT: This test uses newBuild() to create fresh, modifiable builds.
 *
 * Why not load XML builds?
 * - PoB's architecture: loadBuildFromXML() creates finalized, read-only builds
 * - Modifications to XML-loaded builds don't trigger proper recalculation
 * - This is by design in PoB, not a bug
 *
 * Evidence from PoB's own codebase:
 * - pob-data/spec/System/TestTriggers_spec.lua uses `before_each(function() newBuild() end)`
 * - All PoB tests that modify builds use newBuild()
 * - loadBuildFromXML() is only used for read-only verification in TestBuilds_spec.lua
 *
 * See Issue #31 for discussion of making loaded builds modifiable.
 */
import { loadConfig } from './config/index.js';
import { getPobPath } from './pob/detector.js';
import { LuaJITRuntime } from './pob/luajit-runtime.js';

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

    console.log('='.repeat(50));
    console.log('TEST 1: Resolute Technique');
    console.log('='.repeat(50) + '\n');

    // 2. Create fresh build for RT test
    console.log('2. Creating fresh build...');
    await runtime.newBuild();
    console.log('   ✓ Fresh build created\n');

    // 3. Add crit via custom mod
    console.log('3. Adding crit chance via custom mod...');
    await runtime.setCustomMods('+50% to Critical Strike Chance\n');
    let stats = await runtime.getBuildStats();
    const initialCrit = stats['CritChance'] || 0;
    console.log(`   ✓ Custom mod applied`);
    console.log(`   Initial CritChance: ${initialCrit}%\n`);

    if (initialCrit === 0) {
      console.log('   ⚠️  WARNING: Custom mod did not add crit. RT test may be invalid.\n');
    }

    // 4. Allocate Resolute Technique
    console.log('4. Allocating Resolute Technique passive...');
    await runtime.allocatePassive('Resolute Technique');
    console.log('   ✓ Passive node allocated\n');

    // 5. Get final crit chance
    console.log('5. Getting final crit chance after passive allocation...');
    stats = await runtime.getBuildStats();
    const finalCrit = stats['CritChance'] || 0;
    console.log(`   ✓ Stats recalculated`);
    console.log(`   Final CritChance: ${finalCrit}%\n`);

    // 6. Verification
    console.log('6. Verification...');
    if (finalCrit === 0 && initialCrit > 0) {
      console.log('   ✅ SUCCESS! Crit chance went from ' + initialCrit + '% to 0% after Resolute Technique');
      console.log('   The passive correctly sets crit to 0%');
    } else {
      console.log(`   ⚠️  FAILED: Expected crit to go from ${initialCrit}% to 0%, got ${finalCrit}%`);
    }

    console.log('\n' + '='.repeat(50));
    console.log('TEST 2: Chaos Inoculation');
    console.log('='.repeat(50) + '\n');

    // 7. Create fresh build for CI test
    console.log('7. Creating fresh build for Chaos Inoculation test...');
    await runtime.newBuild();
    console.log('   ✓ Fresh build created\n');

    // 8. Get initial Life
    console.log('8. Getting initial Life...');
    stats = await runtime.getBuildStats();
    const initialLife = stats['Life'] || 0;
    console.log(`   ✓ Stats calculated`);
    console.log(`   Initial Life: ${initialLife}\n`);

    // 9. Allocate Chaos Inoculation
    console.log('9. Allocating Chaos Inoculation passive...');
    await runtime.allocatePassive('Chaos Inoculation');
    console.log('   ✓ Passive node allocated\n');

    // 10. Get final Life
    console.log('10. Getting final Life after passive allocation...');
    stats = await runtime.getBuildStats();
    const finalLife = stats['Life'] || 0;
    const finalES = stats['EnergyShield'] || 0;
    console.log(`    ✓ Stats recalculated`);
    console.log(`    Final Life: ${finalLife}`);
    console.log(`    Final Energy Shield: ${finalES}\n`);

    // 11. Verification
    console.log('11. Verification...');
    if (finalLife === 1) {
      console.log('    ✅ SUCCESS! Life went from ' + initialLife + ' to 1 after Chaos Inoculation');
      console.log('    The passive correctly sets max Life to 1');
      console.log('    Character is now immune to chaos damage (relies on Energy Shield)');
    } else {
      console.log(`    ⚠️  FAILED: Expected Life to go from ${initialLife} to 1, got ${finalLife}`);
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
