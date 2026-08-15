import { access, stat } from 'fs/promises';
import { join, dirname } from 'path';
import { platform, homedir } from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get bundled PoB data path.
 * At runtime this file lives at packages/plugin-pob/dist/runtime/detector.js,
 * so three levels up lands at packages/plugin-pob/, then into pob-data/src.
 */
function getBundledPobPath(): string {
  return join(__dirname, '..', '..', '..', 'pob-data', 'src');
}

/**
 * Platform-specific default PoB installation paths
 */
function getDefaultPobPaths(): string[] {
  const os = platform();

  switch (os) {
    case 'win32': {
      const programData = process.env.PROGRAMDATA || 'C:\\ProgramData';
      const localAppData = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
      return [
        join(programData, 'Path of Building'),
        join(localAppData, 'Programs', 'Path of Building'),
      ];
    }

    case 'darwin':
      return ['/Applications/Path of Building.app/Contents/Resources'];

    case 'linux':
      return [
        join(homedir(), '.wine', 'drive_c', 'ProgramData', 'Path of Building'),
        join(homedir(), '.local', 'share', 'PathOfBuilding'),
      ];

    default:
      return [];
  }
}

/**
 * Check if a path exists and is a directory
 */
async function pathExists(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Detect Path of Building installation
 * Returns the path if found, null otherwise
 */
export async function detectPobPath(): Promise<string | null> {
  const defaultPaths = getDefaultPobPaths();

  for (const path of defaultPaths) {
    if (await pathExists(path)) {
      const headlessPath = join(path, 'HeadlessWrapper.lua');
      try {
        await access(headlessPath);
        return path;
      } catch {
        continue;
      }
    }
  }

  return null;
}

/**
 * Get PoB installation path.
 * Tries config path first, then auto-detection, then bundled fallback.
 * Throws error if not found.
 */
export async function getPobPath(configPath?: string): Promise<string> {
  // Try config path first
  if (configPath) {
    if (await pathExists(configPath)) {
      const headlessPath = join(configPath, 'HeadlessWrapper.lua');
      try {
        await access(headlessPath);
        return configPath;
      } catch {
        throw new Error(
          `Path specified in config (${configPath}) does not contain HeadlessWrapper.lua. ` +
            'Please ensure the path points to a valid Path of Building installation.'
        );
      }
    } else {
      throw new Error(
        `Path specified in config (${configPath}) does not exist. ` +
          'Please check your configuration file at ~/.config/poe-ai/config.json'
      );
    }
  }

  // Try auto-detection
  const detectedPath = await detectPobPath();
  if (detectedPath) {
    return detectedPath;
  }

  // Try bundled PoB as fallback
  const bundledPath = getBundledPobPath();
  if (await pathExists(bundledPath)) {
    const headlessPath = join(bundledPath, 'HeadlessWrapper.lua');
    try {
      await access(headlessPath);
      console.log('Using bundled Path of Building installation');
      return bundledPath;
    } catch {
      // Bundled PoB exists but is incomplete
    }
  }

  throw new Error(
    'Path of Building installation not found. ' +
      'Please install Path of Building or specify the installation path in ~/.config/poe-ai/config.json\n\n' +
      'Example config:\n' +
      '{\n' +
      '  "pobPath": "/path/to/PathOfBuilding"\n' +
      '}'
  );
}
