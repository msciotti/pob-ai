/**
 * MVP Test: Load build, check crit, allocate Resolute Technique, verify crit is 0
 */
import { loadConfig } from './config/index.js';
import { getPobPath } from './pob/detector.js';
import { LuaJITRuntime } from './pob/luajit-runtime.js';

// Simple test build XML with some crit chance
const TEST_BUILD_XML = `<?xml version="1.0" encoding="UTF-8"?>
<PathOfBuilding>
  <Build level="90" targetVersion="3_0" bandit="None" className="Duelist" ascendClassName="Champion">
    <PlayerStat stat="CritChance" value="5"/>
  </Build>
  <Tree activeSpec="1">
    <Spec treeVersion="3_21" nodes="" classId="1" ascendClassId="1"/>
  </Tree>
  <Skills>
    <Skill mainActiveSkill="1" slot="Weapon 1" enabled="true">
      <Gem enableGlobal1="true" level="20" quality="0" skillId="Melee"/>
    </Skill>
  </Skills>
  <Items>
  </Items>
</PathOfBuilding>`;

async function main() {
  console.log('=== PoB MVP Test: Resolute Technique ===\n');

  try {
    // 1. Setup
    console.log('1. Initializing...');
    const config = await loadConfig();
    const pobPath = await getPobPath(config.pobPath);
    const runtime = new LuaJITRuntime(pobPath);
    await runtime.initialize();
    console.log('   ✓ Initialized\n');

    // 2. Load test build (this creates a build automatically)
    console.log('2. Loading test build...');
    await runtime.loadBuildFromXML(TEST_BUILD_XML, 'Test Build');
    console.log('   ✓ Build loaded\n');

    // 4. Get initial crit chance
    console.log('4. Getting initial crit chance...');
    let stats = await runtime.getBuildStats();
    const initialCrit = stats['CritChance'] || 0;
    console.log(`   Initial CritChance: ${initialCrit}%\n`);

    // 5. Allocate Resolute Technique
    console.log('5. Allocating Resolute Technique...');
    await runtime.allocatePassive('Resolute Technique');
    console.log('   ✓ Passive allocated\n');

    // 6. Get final crit chance (recalculation happens automatically)
    console.log('6. Getting final crit chance...');
    stats = await runtime.getBuildStats();
    const finalCrit = stats['CritChance'] || 0;
    console.log(`   Final CritChance: ${finalCrit}%\n`);

    // 7. Verify
    console.log('7. Verification...');
    if (finalCrit === 0) {
      console.log('   ✅ SUCCESS! Crit chance is 0% after Resolute Technique');
    } else {
      console.log(`   ⚠️  Expected 0%, got ${finalCrit}%`);
    }

    console.log('\n=== MVP Test Complete ===');

    // Cleanup
    runtime.destroy();
  } catch (error) {
    console.error(`\n❌ Error: ${error}`);
    process.exit(1);
  }
}

main().catch(console.error);
