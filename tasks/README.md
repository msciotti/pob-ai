# PoB AI Implementation Tasks

This directory contains detailed implementation guides for parallelizable tasks to expand the PoB AI test suite and analysis capabilities.

## Task Overview

| Task | Description | Depends On | Est. Tests | Priority |
|------|-------------|------------|------------|----------|
| [Task 1](task-1-character-config.md) | Character Configuration (level, class, ascendancy, bandits, pantheon) | None | 5-8 | High |
| [Task 2](task-2-flask-tests.md) | Flask Equipment & Activation | None | 6-8 | High |
| [Task 3](task-3-jewel-tests.md) | Jewel Socketing in Passive Tree | None | 6-8 | Medium |
| [Task 4](task-4-configuration-tests.md) | Build Configuration (enemy type, conditions, buffs) | None | 8-10 | Medium |
| [Task 5](task-5-build-analysis.md) | AI-Powered Build Analysis & Suggestions | Tasks 1-2 | 6-8 | High |

## Current Test Coverage

**Completed (22 tests):**
- ✅ Passive Allocation (10 tests)
- ✅ Item Equipment (6 tests)
- ✅ Skill Gems (6 tests)

**After All Tasks (55-62 tests):**
- Passive Allocation (10 tests)
- Item Equipment (6 tests)
- Skill Gems (6 tests)
- Character Configuration (5-8 tests)
- Flasks (6-8 tests)
- Jewels (6-8 tests)
- Configuration (8-10 tests)
- Build Analysis (6-8 tests)

## Parallelization Strategy

### Wave 1 (Independent - Can Run in Parallel)
- **Task 1**: Character Configuration
- **Task 2**: Flask Tests
- **Task 3**: Jewel Tests
- **Task 4**: Configuration Tests

These four tasks have no dependencies on each other and can be executed simultaneously by different agents/developers.

### Wave 2 (Depends on Wave 1)
- **Task 5**: Build Analysis

Should start after Tasks 1-2 are complete, as it needs comprehensive build data for meaningful analysis.

## Branch Naming Convention

All tasks use the same session ID for consistency:

```
claude/add-[feature]-tests-01PtSjaZ1J2ZfEL1DoxbTfAR
```

Examples:
- `claude/add-character-config-tests-01PtSjaZ1J2ZfEL1DoxbTfAR`
- `claude/add-flask-tests-01PtSjaZ1J2ZfEL1DoxbTfAR`
- `claude/add-jewel-tests-01PtSjaZ1J2ZfEL1DoxbTfAR`
- `claude/add-configuration-tests-01PtSjaZ1J2ZfEL1DoxbTfAR`
- `claude/add-build-analysis-01PtSjaZ1J2ZfEL1DoxbTfAR`

## Task Structure

Each task file contains:

1. **Goal** - Clear objective
2. **Branch Name** - Git branch to use
3. **Files to Create/Modify** - Specific file paths
4. **Research Phase** - Investigation steps before coding
5. **Implementation Steps** - Detailed coding instructions
6. **Expected Outcome** - Success criteria
7. **Testing** - How to verify
8. **Commit Message Template** - Standardized commit format

## Getting Started

1. Choose a task from the list above
2. Create the branch: `git checkout -b [branch-name]`
3. Follow the task file instructions step-by-step
4. Run tests: `pnpm build && pnpm test`
5. Commit with provided template
6. Push: `git push -u origin [branch-name]`
7. Create PR when complete

## Implementation Tips

### Research Phase
- Use `Grep` tool to search codebase for patterns
- Use `Read` tool to examine relevant files
- Create debug scripts to explore PoB data structures
- Test assumptions before implementing

### API Development
- Follow existing patterns in `pob-bridge.lua`
- Always trigger `BuildOutput()` after modifications
- Return success/error consistently
- Provide helpful error messages

### TypeScript Wrappers
- Match Lua API function signatures
- Use proper TypeScript types
- Log messages for user feedback
- Throw errors on failure

### Test Writing
- Use descriptive test names
- Test both success and failure cases
- Include console output for test results
- Follow existing test patterns

### Debugging
- Create standalone debug scripts in `/tmp/`
- Use `debugExec` command to inspect Lua state
- Check that existing tests still pass
- Use `pnpm build` before testing

## Common Patterns

### Lua API Function Template

```lua
function api.functionName(params)
  local param1 = params.param1

  if not build then
    return {success = false, error = "Build not initialized"}
  end

  -- Validation
  if not param1 then
    return {success = false, error = "param1 required"}
  end

  -- Perform operation
  -- ...

  -- Trigger recalculation
  if build.calcsTab and build.calcsTab.BuildOutput then
    build.calcsTab:BuildOutput()
  end

  return {success = true, message = "Operation completed"}
end
```

### TypeScript Wrapper Template

```typescript
async functionName(param1: string): Promise<void> {
  const response = await this.sendCommand('functionName', { param1 });
  if (!response.success) {
    throw new Error(response.error || 'Failed to perform operation');
  }
  console.log(response.message);
}
```

### Test Template

```typescript
{
  name: 'Description of what is being tested',
  run: async (runtime) => {
    await loadTestBuild(runtime);

    // Get initial state
    let stats = await runtime.getBuildStats();
    const before = stats['SomeStat'] || 0;

    // Perform operation
    await runtime.someOperation();

    // Verify result
    stats = await runtime.getBuildStats();
    const after = stats['SomeStat'] || 0;

    if (after <= before) {
      throw new Error(`Expected increase. Before: ${before}, After: ${after}`);
    }

    console.log(`   ✓ Stat: ${before} → ${after}`);
  },
},
```

## Questions or Issues?

If you encounter issues:
1. Check existing implementations for patterns
2. Use debug scripts to explore PoB internals
3. Verify the test build has necessary data
4. Consult PoB source code in `pob-data/src/`

## Progress Tracking

Mark completed tasks here:

- [ ] Task 1: Character Configuration
- [ ] Task 2: Flask Tests
- [ ] Task 3: Jewel Tests
- [ ] Task 4: Configuration Tests
- [ ] Task 5: Build Analysis

## Final Goal

A comprehensive PoB AI system capable of:
- ✅ Modifying passive tree allocations
- ✅ Equipping items and testing stats
- ✅ Managing skill gems and supports
- ⏳ Configuring character settings
- ⏳ Managing flasks
- ⏳ Socketing jewels
- ⏳ Setting build configurations
- ⏳ Analyzing builds and providing AI-powered suggestions

This will enable natural language interaction with Path of Building through Claude Code, allowing users to say things like:

> "Analyze my build and suggest improvements"
> "What happens if I switch to Chaos Inoculation?"
> "Add a diamond flask and show me the crit chance increase"
> "Socket this jewel and calculate the DPS gain"

