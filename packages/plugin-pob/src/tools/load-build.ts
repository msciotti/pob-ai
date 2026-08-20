import { z } from 'zod';
import type { PluginTool, PluginContext } from '@poe-ai/core';
import { KEY_BUILD_STATS } from './constants.js';

// Matches a pastebin.com code/URL, a pobb.in code (variable length alphanumeric),
// or a full pobb.in URL (https://pobb.in/...)
const PASTEBIN_CODE_RE = /^[a-zA-Z0-9]{8}$/;
const PASTEBIN_URL_RE = /^https?:\/\/(?:www\.)?pastebin\.com\/(?:raw\/)?([a-zA-Z0-9]{8})/;
const POBBIN_URL_RE = /^https?:\/\/pobb\.in\/([a-zA-Z0-9]+)/;
const POBBIN_CODE_RE = /^[a-zA-Z0-9]{6,30}$/; // pobb.in codes are variable length

// A PoB build code is base64(zlib(xml)) with URL-safe variants; real ones are
// hundreds of chars. Anything shorter or containing other characters (e.g. an
// HTML interstitial served with HTTP 200) must not reach the Lua bridge.
const BUILD_CODE_RE = /^[A-Za-z0-9+/=_-]{40,}$/;

const inputSchema = z.object({
  source: z
    .string()
    .min(1)
    .describe(
      'A pastebin.com code or URL (e.g. "uCLE0msa"), a pobb.in code (e.g. "Dmb4Pgk3aa9c"), ' +
        'or a full pobb.in URL (e.g. "https://pobb.in/Dmb4Pgk3aa9c")'
    ),
  buildName: z.string().optional(),
});

type Input = z.infer<typeof inputSchema>;

type BuildSource =
  | { type: 'pastebin'; code: string }
  | { type: 'pobbin'; code: string };

/**
 * Returns candidate sources in the order they should be tried. A bare 8-char
 * code is ambiguous — pastebin codes are always 8 chars, but nothing stops
 * pobb.in from generating an 8-char code — so both are returned and the
 * fetch layer falls through to the next candidate on failure.
 */
export function detectSource(source: string): BuildSource[] {
  const pobbinUrl = source.match(POBBIN_URL_RE);
  if (pobbinUrl) return [{ type: 'pobbin', code: pobbinUrl[1] }];

  const pastebinUrl = source.match(PASTEBIN_URL_RE);
  if (pastebinUrl) return [{ type: 'pastebin', code: pastebinUrl[1] }];

  if (PASTEBIN_CODE_RE.test(source)) {
    return [
      { type: 'pastebin', code: source },
      { type: 'pobbin', code: source },
    ];
  }

  if (POBBIN_CODE_RE.test(source)) {
    return [{ type: 'pobbin', code: source }];
  }

  return [];
}

function validateBuildCode(raw: string, origin: string): string {
  const code = raw.trim();
  if (!BUILD_CODE_RE.test(code)) {
    throw new Error(
      `${origin} returned content that does not look like a PoB build code ` +
        '(possibly an error or CAPTCHA page). The build may be private or removed.'
    );
  }
  return code;
}

async function fetchFromSource(source: BuildSource, ctx: PluginContext): Promise<string> {
  if (source.type === 'pastebin') {
    ctx.logger.info(`[load_build] Fetching from pastebin.com: ${source.code}`);
    const raw = await ctx.http.get<string>(`https://pastebin.com/raw/${source.code}`, {
      timeoutMs: 10_000,
    });
    if (typeof raw !== 'string' || raw.length === 0) {
      throw new Error(`Pastebin code "${source.code}" not found or returned empty content`);
    }
    return validateBuildCode(raw, `pastebin.com/raw/${source.code}`);
  }

  ctx.logger.info(`[load_build] Fetching from pobb.in: ${source.code}`);
  const raw = await ctx.http.get<string>(`https://pobb.in/${source.code}/raw`, {
    timeoutMs: 15_000,
    headers: { 'User-Agent': 'poe-ai/1.0 (+https://github.com/msciotti/pob-ai)' },
  });
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new Error(`pobb.in returned unexpected response for code "${source.code}"`);
  }
  return validateBuildCode(raw, `pobb.in/${source.code}/raw`);
}

export async function fetchBuildCode(
  candidates: BuildSource[],
  ctx: PluginContext
): Promise<{ code: string; source: BuildSource }> {
  const failures: string[] = [];
  for (const candidate of candidates) {
    try {
      return { code: await fetchFromSource(candidate, ctx), source: candidate };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push(`${candidate.type} "${candidate.code}": ${msg}`);
    }
  }
  throw new Error(`Could not fetch build code. ${failures.join('; ')}`);
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

      const candidates = detectSource(source.trim());
      if (candidates.length === 0) {
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
      const { code: pobCode, source: resolvedSource } = await fetchBuildCode(candidates, ctx);

      ctx.logger.info(
        `[load_build] Importing build from ${resolvedSource.type} (code length: ${pobCode.length})`
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
        source: resolvedSource.type,
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
