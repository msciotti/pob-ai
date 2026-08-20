/**
 * Static metadata for first-party plugins, used by `poe-ai init` to present a
 * selection prompt and to know which heavy downloads (section 1d) each
 * enabled plugin needs. Community `poe-ai-plugin-*` packages aren't listed
 * here — they're accepted as-is by name and assumed to need no init-time
 * downloads (a community plugin manages its own data via its own
 * postinstall/setup, same as any other npm package would).
 */
export interface PluginCatalogEntry {
  /** Package name, e.g. "@poe-ai/plugin-pob" */
  name: string;
  /** Short label shown in the interactive picker */
  label: string;
  /** Heavy downloads this plugin needs at init time, if any */
  downloads: Array<'pob' | 'repoe'>;
  /** Preselected by default when no --plugins flag is given */
  defaultEnabled: boolean;
}

export const PLUGIN_CATALOG: PluginCatalogEntry[] = [
  {
    name: '@poe-ai/plugin-pob',
    label: 'Path of Building calculations (LuaJIT) — load_build, allocate_passive, get_build_stats, ...',
    downloads: ['pob'],
    defaultEnabled: true,
  },
  {
    name: '@poe-ai/plugin-wiki',
    label: 'Official PoE wiki lookups — wiki_lookup, get_item_info, get_skill_info, ...',
    downloads: [],
    defaultEnabled: true,
  },
  {
    name: '@poe-ai/plugin-ninja',
    label: 'poe.ninja economy prices — get_currency_price, get_item_price',
    downloads: [],
    defaultEnabled: false,
  },
  {
    name: '@poe-ai/plugin-wealth',
    label: 'Stash + character wealth tracking',
    downloads: [],
    defaultEnabled: false,
  },
  {
    name: '@poe-ai/plugin-crafting',
    label: 'Crafting simulation (needs RePoE game data)',
    downloads: ['repoe'],
    defaultEnabled: false,
  },
  {
    name: '@poe-ai/plugin-archetypes',
    label: 'Build archetype knowledge base + classifier (enhanced by plugin-pob if also enabled)',
    downloads: [],
    defaultEnabled: false,
  },
];

/**
 * Expands a short/casual plugin name to its full package name, e.g. "pob" or
 * "plugin-pob" -> "@poe-ai/plugin-pob". Anything that doesn't match a known
 * first-party plugin is returned unchanged — this is how community
 * `poe-ai-plugin-*` packages and already-full-form names pass through.
 */
export function resolvePluginName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  const known = PLUGIN_CATALOG.find((entry) => {
    const shortName = entry.name.replace('@poe-ai/plugin-', '');
    return (
      entry.name === trimmed ||
      entry.name.replace('@poe-ai/', '') === trimmed ||
      shortName === trimmed
    );
  });

  return known?.name ?? trimmed;
}

export function catalogEntryFor(pluginName: string): PluginCatalogEntry | undefined {
  return PLUGIN_CATALOG.find((entry) => entry.name === pluginName);
}

/** Default plugin selection when no --plugins flag is given and there's no prior config. */
export function defaultPluginSelection(): string[] {
  return PLUGIN_CATALOG.filter((entry) => entry.defaultEnabled).map((entry) => entry.name);
}
