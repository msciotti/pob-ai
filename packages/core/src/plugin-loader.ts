import type { PoEPlugin, PluginContext, Logger } from './types.js';

/**
 * A function that dynamically imports a module by name.
 * The default implementation uses the built-in `import()`. Tests can inject
 * a mock implementation to avoid needing real plugin packages installed.
 */
export type PluginImporter = (name: string) => Promise<{ default?: unknown }>;

const defaultImporter: PluginImporter = (name) => import(name) as Promise<{ default?: unknown }>;

/**
 * Dynamically import and initialize plugins from the given list of package names.
 *
 * Each plugin must export a default that satisfies PoEPlugin. If a plugin fails
 * to import or initialize, a warning is logged and the plugin is skipped — the
 * server continues to start with the remaining plugins.
 *
 * Plugins are initialized sequentially so that a plugin setting ctx.pobRuntime
 * during initialize() is visible to all subsequent plugins.
 *
 * @param pluginNames - Ordered list of plugin package names to load
 * @param ctx - Shared mutable plugin context; plugins may mutate it (e.g. set ctx.pobRuntime)
 * @param logger - Logger for startup messages and warnings
 * @param importer - Optional override for dynamic import (used in tests)
 */
export async function loadPlugins(
  pluginNames: string[],
  ctx: PluginContext,
  logger: Logger,
  importer: PluginImporter = defaultImporter,
): Promise<PoEPlugin[]> {
  const plugins: PoEPlugin[] = [];

  for (const name of pluginNames) {
    try {
      const mod = await importer(name);
      const plugin = mod.default;

      if (!plugin || typeof (plugin as PoEPlugin).initialize !== 'function') {
        logger.warn(`Plugin "${name}" does not export a valid PoEPlugin default — skipping`);
        continue;
      }

      const validPlugin = plugin as PoEPlugin;

      logger.info(`Initializing plugin: ${name}`);
      await validPlugin.initialize(ctx);
      plugins.push(validPlugin);
      logger.info(`Plugin loaded: ${name} (${validPlugin.tools.length} tools)`);
    } catch (err) {
      logger.warn(`Failed to load plugin "${name}": ${(err as Error).message} — skipping`);
    }
  }

  return plugins;
}
