/**
 * Guards against loading a build whose passive tree version was pruned from
 * this install's pob-data (see scripts/download-pob.js).
 *
 * Without this check, PoB's own load path (Classes/TreeTab.lua -> PassiveTree
 * constructor) hits a missing `TreeData/<version>/tree.lua`, falls through to
 * a disabled network-download branch, and crashes on a nil value -- the bridge's
 * dispatch loop turns that into an opaque "Internal error: ...:88: attempt to
 * index a nil value" instead of a message pointing at the actual cause. This
 * module runs the same existence check ahead of time, in TS, so the tool
 * response instead names the missing version and the escape hatch.
 */
import { existsSync } from 'fs';
import { join } from 'path';
import zlib from 'zlib';

// GameVersions.lua: defaultTreeVersion = treeVersionList[2] ("2_6" is [1]).
// Applies when a <Spec> element carries no treeVersion attribute at all --
// only true of builds saved before PoB tracked tree versions per-spec.
const DEFAULT_TREE_VERSION = '3_6';

const SPEC_TAG_RE = /<Spec\b[^>]*>/g;
const TREE_VERSION_ATTR_RE = /\btreeVersion="([^"]+)"/;

/**
 * Extracts the set of passive tree versions a build's XML requires, one per
 * <Spec> element (a build can hold multiple specs saved at different tree
 * versions).
 */
export function extractRequiredTreeVersions(xml: string): string[] {
  const versions = new Set<string>();
  const specTags = xml.match(SPEC_TAG_RE) ?? [];
  for (const tag of specTags) {
    const match = tag.match(TREE_VERSION_ATTR_RE);
    versions.add(match ? match[1] : DEFAULT_TREE_VERSION);
  }
  return [...versions];
}

/**
 * Decodes a PoB build code (base64, URL-safe variant, zlib-compressed XML) to
 * its underlying XML text. Returns null on any decode failure so callers can
 * skip the guard and let the existing bridge error path handle it, rather
 * than surfacing a confusing error about a step (decoding) that isn't what
 * actually failed.
 */
export function decodePobBuildCode(code: string): string | null {
  try {
    const base64 = code.replace(/-/g, '+').replace(/_/g, '/');
    return zlib.inflateSync(Buffer.from(base64, 'base64')).toString('utf8');
  } catch {
    return null;
  }
}

export function findMissingTreeVersions(xml: string, pobPath: string): string[] {
  return extractRequiredTreeVersions(xml).filter(
    (version) => !existsSync(join(pobPath, 'TreeData', version, 'tree.lua'))
  );
}

/**
 * Throws a clear, actionable error if `xml` requires a passive tree version
 * that isn't present in this install's pob-data. No-op if everything needed
 * is present.
 */
export function assertTreeVersionsAvailable(xml: string, pobPath: string): void {
  const missing = findMissingTreeVersions(xml, pobPath);
  if (missing.length === 0) return;

  const plural = missing.length > 1;
  throw new Error(
    `This build uses passive tree version${plural ? 's' : ''} "${missing.join('", "')}", ` +
      `which ${plural ? 'were' : 'was'} pruned from this install to keep pob-data small ` +
      '(only the current patch\'s tree ships by default). Re-run ' +
      '"node scripts/download-pob.js" in packages/plugin-pob with POE_AI_ALL_TREES=1 set ' +
      'to restore every historical tree version, then retry.'
  );
}
