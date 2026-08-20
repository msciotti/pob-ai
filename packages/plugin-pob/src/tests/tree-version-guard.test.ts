import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import zlib from 'zlib';
import {
  extractRequiredTreeVersions,
  decodePobBuildCode,
  findMissingTreeVersions,
  assertTreeVersionsAvailable,
} from '../runtime/tree-version-guard.js';

function makeXml(specs: Array<{ treeVersion?: string }>): string {
  const specTags = specs
    .map((s) => (s.treeVersion ? `<Spec treeVersion="${s.treeVersion}" title="Default">` : '<Spec title="Default">'))
    .join('</Spec>');
  return `<PathOfBuilding><Tree activeSpec="1">${specTags}</Spec></Tree></PathOfBuilding>`;
}

describe('extractRequiredTreeVersions', () => {
  it('extracts a single treeVersion from a Spec element', () => {
    expect(extractRequiredTreeVersions(makeXml([{ treeVersion: '3_21' }]))).toEqual(['3_21']);
  });

  it('extracts multiple distinct versions across specs', () => {
    const xml = makeXml([{ treeVersion: '3_21' }, { treeVersion: '3_29' }]);
    expect(new Set(extractRequiredTreeVersions(xml))).toEqual(new Set(['3_21', '3_29']));
  });

  it('deduplicates repeated versions', () => {
    const xml = makeXml([{ treeVersion: '3_21' }, { treeVersion: '3_21' }]);
    expect(extractRequiredTreeVersions(xml)).toEqual(['3_21']);
  });

  it('falls back to the legacy default when a Spec has no treeVersion attribute', () => {
    expect(extractRequiredTreeVersions(makeXml([{}]))).toEqual(['3_6']);
  });

  it('returns an empty list when there are no Spec elements', () => {
    expect(extractRequiredTreeVersions('<PathOfBuilding></PathOfBuilding>')).toEqual([]);
  });
});

describe('decodePobBuildCode', () => {
  it('round-trips zlib-compressed XML, including the URL-safe -/_ variant', () => {
    const xml = makeXml([{ treeVersion: '3_29' }]);
    const compressed = zlib.deflateSync(Buffer.from(xml, 'utf8'));
    const code = compressed.toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
    expect(decodePobBuildCode(code)).toBe(xml);
  });

  it('returns null instead of throwing on garbage input', () => {
    expect(decodePobBuildCode('not-a-real-build-code')).toBeNull();
  });
});

describe('findMissingTreeVersions / assertTreeVersionsAvailable', () => {
  let pobPath: string;

  beforeEach(() => {
    pobPath = mkdtempSync(join(tmpdir(), 'pob-tree-guard-test-'));
    mkdirSync(join(pobPath, 'TreeData', '3_29'), { recursive: true });
    writeFileSync(join(pobPath, 'TreeData', '3_29', 'tree.lua'), 'return {}');
  });

  afterEach(() => {
    rmSync(pobPath, { recursive: true, force: true });
  });

  it('reports no missing versions when the tree is present on disk', () => {
    const xml = makeXml([{ treeVersion: '3_29' }]);
    expect(findMissingTreeVersions(xml, pobPath)).toEqual([]);
    expect(() => assertTreeVersionsAvailable(xml, pobPath)).not.toThrow();
  });

  it('reports a missing version that was pruned', () => {
    const xml = makeXml([{ treeVersion: '3_21' }]);
    expect(findMissingTreeVersions(xml, pobPath)).toEqual(['3_21']);
  });

  it('throws a clear, actionable error naming the missing version and escape hatch', () => {
    const xml = makeXml([{ treeVersion: '3_21' }]);
    expect(() => assertTreeVersionsAvailable(xml, pobPath)).toThrowError(
      /3_21.*POE_AI_ALL_TREES=1/s
    );
  });

  it('still reports missing if the version directory exists but tree.lua itself does not', () => {
    mkdirSync(join(pobPath, 'TreeData', '3_28'), { recursive: true });
    const xml = makeXml([{ treeVersion: '3_28' }]);
    expect(findMissingTreeVersions(xml, pobPath)).toEqual(['3_28']);
  });
});
