/**
 * Runs the heavy per-plugin downloads (section 1d: config-driven downloads)
 * that used to run unconditionally on `npm install` via postinstall hooks.
 * `poe-ai init` is now the only thing that triggers them, and only for
 * plugins actually enabled in the written config.
 *
 * Each download is a real, already-tested standalone script that lives
 * inside its own plugin package (packages/plugin-pob/scripts/download-pob.js,
 * etc.) — this just resolves its on-disk path via that package's `exports`
 * map and runs it as a child process with inherited stdio, so the existing
 * progress output (and error handling, e.g. download-pob.js's own
 * network-failure tolerance) is reused as-is rather than reimplemented.
 */
import { createRequire } from 'module';
import { spawnSync } from 'child_process';
import process from 'process';

const require = createRequire(import.meta.url);

export interface DownloadResult {
  step: string;
  ok: boolean;
  /** True if the step was skipped because the package isn't installed. */
  skippedMissingPackage?: boolean;
}

/**
 * Resolves `<packageName>/<subpath>` to an absolute file path via Node's own
 * module resolution (so it respects the package's `exports` map), returning
 * null instead of throwing if the package isn't installed — e.g. a plugin
 * listed in --plugins that the user hasn't actually `npm install`ed yet.
 */
function resolveScript(packageName: string, subpath: string): string | null {
  try {
    return require.resolve(`${packageName}/${subpath}`);
  } catch {
    return null;
  }
}

function runScript(step: string, scriptPath: string, env: NodeJS.ProcessEnv = process.env): DownloadResult {
  const result = spawnSync(process.execPath, [scriptPath], { stdio: 'inherit', env });
  return { step, ok: result.status === 0 };
}

/**
 * Downloads pob-data (pruned to the current patch — see download-pob.js) and
 * ensures a usable LuaJIT is present (system-detected or built from source).
 * Both steps are best-effort in the same way the scripts themselves are —
 * see their own comments — so a network hiccup here doesn't abort the rest
 * of init.
 */
export function runPobDownloads(env?: NodeJS.ProcessEnv): DownloadResult[] {
  const downloadPobPath = resolveScript('@poe-ai/plugin-pob', 'scripts/download-pob.js');
  const downloadLuajitPath = resolveScript('@poe-ai/plugin-pob', 'scripts/download-luajit.js');

  if (!downloadPobPath || !downloadLuajitPath) {
    return [{ step: 'pob-data + LuaJIT', ok: false, skippedMissingPackage: true }];
  }

  console.log('\n📦 Setting up @poe-ai/plugin-pob (pob-data + LuaJIT)...');
  return [
    runScript('pob-data', downloadPobPath, env),
    runScript('LuaJIT', downloadLuajitPath, env),
  ];
}

/** Downloads RePoE game data for @poe-ai/plugin-crafting (~25MB). */
export function runRepoeDownload(env?: NodeJS.ProcessEnv): DownloadResult {
  const scriptPath = resolveScript('@poe-ai/game-data', 'scripts/download-repoe.js');
  if (!scriptPath) {
    return { step: 'RePoE game data', ok: false, skippedMissingPackage: true };
  }

  console.log('\n📦 Setting up @poe-ai/game-data (RePoE game data)...');
  return runScript('RePoE game data', scriptPath, env);
}
