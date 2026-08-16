import { LuaJITRuntime, getPobPath, getBuildSummaryTool } from '@poe-ai/plugin-pob';
import type { PluginContext } from '@poe-ai/core';

/**
 * Minimal no-op PluginContext for use inside the data pipeline.
 * The getBuildSummaryTool only uses ctx.pobRuntime and ctx.logger,
 * so we stub out the rest with safe no-ops.
 */
function makeContext(runtime: LuaJITRuntime): PluginContext {
  const noop = () => {};
  return {
    pobRuntime: runtime as unknown as import('@poe-ai/core').PobRuntime,
    logger: {
      info: noop,
      warn: noop,
      error: noop,
      debug: noop,
    },
    // http is never called by getBuildSummaryTool — stub to satisfy the type
    http: {
      get: async () => { throw new Error('http not available in data-pipeline context'); },
      post: async () => { throw new Error('http not available in data-pipeline context'); },
    },
    // cache is never called by getBuildSummaryTool — stub to satisfy the type
    cache: {
      get: () => undefined,
      set: noop,
      delete: noop,
      clear: noop,
    },
    leagueState: {
      currentLeague: 'Standard',
      patchVersion: '3.25.0',
      hardcore: false,
      ssf: false,
    },
  };
}

export class BuildProcessor {
  private runtime: LuaJITRuntime | null = null;

  /**
   * Initialize the LuaJIT/PoB runtime. This takes ~15 seconds.
   * Call once and reuse across all builds.
   */
  async initialize(): Promise<void> {
    const pobPath = await getPobPath();
    this.runtime = new LuaJITRuntime({ pobPath });
    await this.runtime.initialize();
  }

  async destroy(): Promise<void> {
    await this.runtime?.destroy();
    this.runtime = null;
  }

  /**
   * Load a build from a pobb.in or pastebin URL and return its summary.
   * Returns { summary, error: null } on success, { summary: null, error } on failure.
   */
  async process(pobSource: string): Promise<{ summary: object | null; error: string | null }> {
    if (!this.runtime) throw new Error('BuildProcessor not initialized — call initialize() first');
    try {
      const code = await this.fetchCode(pobSource);
      await this.runtime.importFromCode(code, 'dataset-build');

      const ctx = makeContext(this.runtime);
      const result = await getBuildSummaryTool.handler({}, ctx);

      // getBuildSummaryTool returns JSON text; parse it back to an object for the dataset record
      const parsed = JSON.parse(result.content[0].text) as object;
      return { summary: parsed, error: null };
    } catch (err) {
      return { summary: null, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Fetch the raw base64-encoded build code from a pobb.in or pastebin URL.
   *
   * pobb.in: scrape the HTML for the textarea holding the build code.
   * pastebin: fetch the /raw/ endpoint directly.
   */
  private async fetchCode(source: string): Promise<string> {
    if (source.includes('pobb.in')) {
      const res = await fetch(source, { headers: { 'User-Agent': 'poe-ai-dataset/1.0' } });
      if (!res.ok) {
        throw new Error(`pobb.in fetch failed (HTTP ${res.status}) for ${source}`);
      }
      const html = await res.text();
      // The build code lives in a readonly textarea with id/name "buildcode"
      const match = html.match(/buildcode"\s+readonly="">\s*([a-zA-Z0-9+\/=_-]{50,})/);
      if (!match) throw new Error(`No build code found at ${source}`);
      return match[1].trim();
    }

    // pastebin — extract the paste code from the URL path
    const pasteCode = source.split('/').pop();
    if (!pasteCode) throw new Error(`Could not parse pastebin code from URL: ${source}`);
    const res = await fetch(`https://pastebin.com/raw/${pasteCode}`);
    if (!res.ok) {
      throw new Error(`pastebin fetch failed (HTTP ${res.status}) for code ${pasteCode}`);
    }
    const text = await res.text();
    if (!text || text.length < 10) throw new Error(`Pastebin ${pasteCode} returned empty content`);
    return text.trim();
  }
}
