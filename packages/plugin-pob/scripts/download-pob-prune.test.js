/**
 * Tests for the post-extraction pruning steps in download-pob.js: TreeData
 * version pruning (with the POE_AI_ALL_TREES escape hatch and the 3_19/Assets.lua
 * special case) and the unneeded-artifact cleanup.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pruneTreeData, pruneUnneededArtifacts } from './download-pob.js';

function makeTreeVersionDir(dataDir, version, files = ['tree.lua']) {
  const dir = join(dataDir, 'src', 'TreeData', version);
  mkdirSync(dir, { recursive: true });
  for (const file of files) {
    writeFileSync(join(dir, file), `-- ${version}/${file}\n`);
  }
  return dir;
}

describe('pruneTreeData', () => {
  let dataDir;
  const originalEnv = process.env.POE_AI_ALL_TREES;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'pob-prune-test-'));
    delete process.env.POE_AI_ALL_TREES;
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
    if (originalEnv === undefined) delete process.env.POE_AI_ALL_TREES;
    else process.env.POE_AI_ALL_TREES = originalEnv;
  });

  it('is a no-op when TreeData does not exist', async () => {
    const result = await pruneTreeData(dataDir);
    expect(result).toEqual({ kept: [], removed: [] });
  });

  it('keeps only the latest patch prefix (including same-patch variants), legion, and 3_19/Assets.lua', async () => {
    makeTreeVersionDir(dataDir, '2_6');
    makeTreeVersionDir(dataDir, '3_21');
    makeTreeVersionDir(dataDir, '3_28');
    makeTreeVersionDir(dataDir, '3_29');
    makeTreeVersionDir(dataDir, '3_29_ruthless');
    makeTreeVersionDir(dataDir, 'legion', ['tree-legion.lua']);
    makeTreeVersionDir(dataDir, '3_19', ['Assets.lua', 'mastery-3.png', 'skills-3.jpg']);

    const result = await pruneTreeData(dataDir);

    expect(new Set(result.kept)).toEqual(new Set(['3_29', '3_29_ruthless', 'legion']));
    expect(new Set(result.removed)).toEqual(new Set(['2_6', '3_21', '3_28']));

    // Pruned versions are gone entirely.
    expect(existsSync(join(dataDir, 'src', 'TreeData', '2_6'))).toBe(false);
    expect(existsSync(join(dataDir, 'src', 'TreeData', '3_21'))).toBe(false);
    expect(existsSync(join(dataDir, 'src', 'TreeData', '3_28'))).toBe(false);

    // Kept versions survive intact.
    expect(existsSync(join(dataDir, 'src', 'TreeData', '3_29', 'tree.lua'))).toBe(true);
    expect(existsSync(join(dataDir, 'src', 'TreeData', '3_29_ruthless', 'tree.lua'))).toBe(true);
    expect(existsSync(join(dataDir, 'src', 'TreeData', 'legion', 'tree-legion.lua'))).toBe(true);

    // 3_19 is reduced to just Assets.lua, not deleted outright.
    expect(existsSync(join(dataDir, 'src', 'TreeData', '3_19', 'Assets.lua'))).toBe(true);
    expect(existsSync(join(dataDir, 'src', 'TreeData', '3_19', 'mastery-3.png'))).toBe(false);
    expect(existsSync(join(dataDir, 'src', 'TreeData', '3_19', 'skills-3.jpg'))).toBe(false);
  });

  it('keeps 3_19 intact (no special-case reduction) if it happens to be the latest patch', async () => {
    makeTreeVersionDir(dataDir, '3_19', ['Assets.lua', 'mastery-3.png', 'tree.lua']);

    const result = await pruneTreeData(dataDir);

    expect(result.kept).toContain('3_19');
    expect(existsSync(join(dataDir, 'src', 'TreeData', '3_19', 'mastery-3.png'))).toBe(true);
  });

  it('keeps everything when POE_AI_ALL_TREES=1 is set via env var', async () => {
    makeTreeVersionDir(dataDir, '2_6');
    makeTreeVersionDir(dataDir, '3_29');
    process.env.POE_AI_ALL_TREES = '1';

    const result = await pruneTreeData(dataDir);

    expect(result.removed).toEqual([]);
    expect(existsSync(join(dataDir, 'src', 'TreeData', '2_6'))).toBe(true);
  });

  it('keeps everything when allTrees is passed explicitly, overriding env', async () => {
    makeTreeVersionDir(dataDir, '2_6');
    makeTreeVersionDir(dataDir, '3_29');

    const result = await pruneTreeData(dataDir, { allTrees: true });

    expect(result.removed).toEqual([]);
    expect(existsSync(join(dataDir, 'src', 'TreeData', '2_6'))).toBe(true);
  });
});

describe('pruneUnneededArtifacts', () => {
  let dataDir;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'pob-prune-artifacts-test-'));
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('removes docs/spec/tests/.github and the stale runtime-win32.zip', async () => {
    for (const dir of ['docs', 'spec', 'tests', '.github']) {
      mkdirSync(join(dataDir, dir), { recursive: true });
      writeFileSync(join(dataDir, dir, 'placeholder.txt'), 'x');
    }
    writeFileSync(join(dataDir, 'runtime-win32.zip'), 'fake zip');
    writeFileSync(join(dataDir, 'CHANGELOG.md'), 'x');
    writeFileSync(join(dataDir, 'README.md'), 'keep me');

    await pruneUnneededArtifacts(dataDir);

    for (const dir of ['docs', 'spec', 'tests', '.github']) {
      expect(existsSync(join(dataDir, dir))).toBe(false);
    }
    expect(existsSync(join(dataDir, 'runtime-win32.zip'))).toBe(false);
    expect(existsSync(join(dataDir, 'CHANGELOG.md'))).toBe(false);
    expect(existsSync(join(dataDir, 'README.md'))).toBe(true);
  });

  it('removes runtime/*.dll, runtime/*.exe, and runtime/SimpleGraphic/ but keeps runtime/lua/', async () => {
    mkdirSync(join(dataDir, 'runtime', 'lua'), { recursive: true });
    writeFileSync(join(dataDir, 'runtime', 'lua', 'dkjson.lua'), 'x');
    mkdirSync(join(dataDir, 'runtime', 'SimpleGraphic', 'Fonts'), { recursive: true });
    writeFileSync(join(dataDir, 'runtime', 'SimpleGraphic', 'Fonts', 'font.tga'), 'x');
    writeFileSync(join(dataDir, 'runtime', 'SimpleGraphic.dll'), 'x');
    writeFileSync(join(dataDir, 'runtime', 'Path of Building.exe'), 'x');
    writeFileSync(join(dataDir, 'runtime', 'zlib1.dll'), 'x');

    await pruneUnneededArtifacts(dataDir);

    expect(existsSync(join(dataDir, 'runtime', 'lua', 'dkjson.lua'))).toBe(true);
    expect(existsSync(join(dataDir, 'runtime', 'SimpleGraphic'))).toBe(false);
    expect(existsSync(join(dataDir, 'runtime', 'SimpleGraphic.dll'))).toBe(false);
    expect(existsSync(join(dataDir, 'runtime', 'Path of Building.exe'))).toBe(false);
    expect(existsSync(join(dataDir, 'runtime', 'zlib1.dll'))).toBe(false);
  });

  it('is a no-op when the target paths do not exist', async () => {
    await expect(pruneUnneededArtifacts(dataDir)).resolves.toBeUndefined();
  });
});
