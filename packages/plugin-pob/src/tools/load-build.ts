import { z } from 'zod';
import type { PluginTool, PluginContext } from '@poe-ai/core';
import { KEY_BUILD_STATS } from './constants.js';

// Matches an 8-char pastebin.com code, a pobb.in code (variable length alphanumeric),
// or a full pobb.in URL (https://pobb.in/...)
const PASTEBIN_CODE_RE = /^[a-zA-Z0-9]{8}$/;
const POBBIN_URL_RE = /^https?:\/\/pobb\.in\/([a-zA-Z0-9]+)/;
const POBBIN_CODE_RE = /^[a-zA-Z0-9]{6,30}$/; // pobb.in codes are variable length

const inputSchema = z.object({
  source: z
    .string()
    .min(1)
    .describe(
      'A pastebin.com code (8 chars, e.g. "uCLE0msa"), a pobb.in code (e.g. "Dmb4Pgk3aa9c"), ' +
        'or a full pobb.in URL (e.g. "https://pobb.in/Dmb4Pgk3aa9c")'
    ),
  buildName: z.string().optional(),
});

type Input = z.infer<typeof inputSchema>;

type BuildSource =
  | { type: 'pastebin'; code: string }
  | { type: 'pobbin'; code: string };

function detectSource(source: string): BuildSource | null {
  // Full pobb.in URL
  const urlMatch = source.match(POBBIN_URL_RE);
  if (urlMatch) return { type: 'pobbin', code: urlMatch[1] };

  // 8-char pastebin code
  if (PASTEBIN_CODE_RE.test(source)) return { type: 'pastebin', code: source };

  // pobb.in shortcode (not pastebin — those are exactly 8 chars)
  if (POBBIN_CODE_RE.test(source) && source.length !== 8) {
    return { type: 'pobbin', code: source };
  }

  return null;
}

async function fetchBuildCode(source: BuildSource, ctx: PluginContext): Promise<string> {
  if (source.type === 'pastebin') {
    ctx.logger.info(`[load_build] Fetching from pastebin.com: ${source.code}`);
    const raw = await ctx.http.get<string>(`https://pastebin.com/raw/${source.code}`, {
      timeoutMs: 10_000,
    });
    if (typeof raw !== 'string' || raw.length < 10) {
      throw new Error(`Pastebin code "${source.code}" not found or returned empty content`);
    }
    return raw.trim();
  }

  // pobb.in: fetch the page HTML and extract the build code from the readonly input
  ctx.logger.info(`[load_build] Fetching from pobb.in: ${source.code}`);
  const html = await ctx.http.get<string>(`https://pobb.in/${source.code}`, {
    timeoutMs: 15_000,
    headers: { 'User-Agent': 'poe-ai/1.0 (+https://github.com/msciotti/pob-ai)' },
  });

  if (typeof html !== 'string') {
    throw new Error(`pobb.in returned unexpected response for code "${source.code}"`);
  }

  // The build code is embedded in a readonly input: buildcode" readonly="">eN...
  const match = html.match(/buildcode"\s+readonly="">\s*([a-zA-Z0-9+/=_-]{50,})/);
  if (!match) {
    throw new Error(
      `Could not find build code on pobb.in page for "${source.code}". ` +
        'The build may be private or the URL may be incorrect.'
    );
  }

  return match[1].trim();
}

export const loadBuildTool: PluginTool<Input> = {
  name: 'load_build',
  description:
    'Load a Path of Building build. Accepts a pastebin.com code (e.g. "uCLE0msa"), ' +
    'a pobb.in code (e.g. "Dmb4Pgk3aa9c"), or a full pobb.in URL.',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputSchema: inputSchema as any,

  async handler({ source, buildName }: Input, ctx: PluginContext) {
    if (!ctx.pobRuntime) {
      return {
        content: [{ type: 'text' as const, text: 'PoB plugin not loaded' }],
        isError: true,
      };
    }

    try {
      const finalBuildName = buildName || 'Imported Build';

      const detected = detectSource(source.trim());
      if (!detected) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error:
                  `Could not recognise "${source}" as a pastebin code or pobb.in link. ` +
                  'Provide an 8-character pastebin code, a pobb.in code, or a full pobb.in URL.',
              }),
            },
          ],
          isError: true,
        };
      }

      // Fetch the actual PoB build code from the source
      const pobCode = await fetchBuildCode(detected, ctx);

      ctx.logger.info(
        `[load_build] Importing build from ${detected.type} (code length: ${pobCode.length})`
      );
      await ctx.pobRuntime.importFromCode(pobCode, finalBuildName);

      // Verify by fetching stats
      ctx.logger.info('[load_build] Attempting to fetch build stats...');
      let stats: Record<string, number> = {};
      let statsAvailable = false;

      try {
        stats = await ctx.pobRuntime.getBuildStats();
        statsAvailable = Object.keys(stats).length > 0;
        ctx.logger.info(
          `[load_build] Build stats retrieved: ${Object.keys(stats).length} stats available`
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.logger.warn(`[load_build] Stats not immediately available: ${msg}`);
      }

      const sampleStats: Record<string, number> = {};
      if (statsAvailable) {
        for (const key of KEY_BUILD_STATS) {
          if (typeof stats[key] === 'number') {
            sampleStats[key] = stats[key];
          }
        }
      }

      const output = {
        success: true,
        message: `Build '${finalBuildName}' loaded successfully`,
        source: detected.type,
        buildName: finalBuildName,
        statsAvailable,
        sampleStats,
      };

      ctx.logger.info('[load_build] Build loaded successfully');
      return { content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }] };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      ctx.logger.error(`[load_build] Failed to load build: ${errorMessage}`);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: `Failed to load build: ${errorMessage}` }),
          },
        ],
        isError: true,
      };
    }
  },
};
