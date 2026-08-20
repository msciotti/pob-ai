import { describe, expect, it } from 'vitest';
import {
  PLUGIN_CATALOG,
  catalogEntryFor,
  defaultPluginSelection,
  resolvePluginName,
} from '../plugin-catalog.js';

describe('resolvePluginName', () => {
  it('expands a bare short name to the full package name', () => {
    expect(resolvePluginName('pob')).toBe('@poe-ai/plugin-pob');
    expect(resolvePluginName('wiki')).toBe('@poe-ai/plugin-wiki');
    expect(resolvePluginName('crafting')).toBe('@poe-ai/plugin-crafting');
  });

  it('expands an unscoped "plugin-x" form', () => {
    expect(resolvePluginName('plugin-ninja')).toBe('@poe-ai/plugin-ninja');
  });

  it('passes an already-full-form name through unchanged', () => {
    expect(resolvePluginName('@poe-ai/plugin-wealth')).toBe('@poe-ai/plugin-wealth');
  });

  it('passes an unrecognized (community) plugin name through unchanged', () => {
    expect(resolvePluginName('poe-ai-plugin-something-community')).toBe(
      'poe-ai-plugin-something-community'
    );
  });
});

describe('catalogEntryFor', () => {
  it('finds the entry for a known plugin', () => {
    expect(catalogEntryFor('@poe-ai/plugin-pob')?.downloads).toEqual(['pob']);
    expect(catalogEntryFor('@poe-ai/plugin-crafting')?.downloads).toEqual(['repoe']);
  });

  it('returns undefined for an unknown plugin', () => {
    expect(catalogEntryFor('poe-ai-plugin-unknown')).toBeUndefined();
  });

  it('every catalog entry with pob-data/repoe downloads is a known first-party plugin', () => {
    for (const entry of PLUGIN_CATALOG) {
      expect(entry.name.startsWith('@poe-ai/')).toBe(true);
    }
  });
});

describe('defaultPluginSelection', () => {
  it('returns only the plugins marked defaultEnabled', () => {
    const defaults = defaultPluginSelection();
    expect(defaults).toContain('@poe-ai/plugin-pob');
    expect(defaults).toContain('@poe-ai/plugin-wiki');
    expect(defaults).not.toContain('@poe-ai/plugin-crafting');
  });
});
