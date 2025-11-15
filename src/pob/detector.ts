import { access, stat } from 'fs/promises';
import { join, dirname } from 'path';
import { platform, homedir } from 'os';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Get bundled PoB data path
 */
function getBundledPobPath(): string {
  // Go up from dist/pob/detector.js to root, then to pob-data/src
  // HeadlessWrapper.lua is in the src directory
  return join(__dirname, '..', '..', 'pob-data', 'src');
}

/**
 * Platform-specific default PoB installation paths
 */
function getDefaultPobPaths(): string[] {
  const os = platform();

  switch (os) {
    case 'win32':
      // Windows paths
      const programData = process.env.PROGRAMDATA || 'C:\\ProgramData';
      const localAppData = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
      return [
        join(programData, 'Path of Building'),
        join(localAppData, 'Programs', 'Path of Building'),
      ];

    case 'darwin':
      // macOS path
      return ['/Applications/Path of Building.app/Contents/Resources'];

    case 'linux':
      // Linux - defer to config file, but try Wine paths as fallback
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
      // Verify it's actually a PoB installation by checking for key files
      const headlessPath = join(path, 'HeadlessWrapper.lua');
      try {
        await access(headlessPath);
        return path;
      } catch {
        // Path exists but doesn't contain HeadlessWrapper.lua
        continue;
      }
    }
  }

  return null;
}

/**
 * Get PoB installation path
 * Tries config path first, then auto-detection
 * Throws error if not found
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
          'Please check your configuration file at ~/.config/pob-mcp/config.json'
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
      console.log('ℹ️  Using bundled Path of Building installation');
      return bundledPath;
    } catch {
      // Bundled PoB exists but is incomplete
    }
  }

  // Not found - throw helpful error
  throw new Error(
    'Path of Building installation not found. ' +
      'Please install Path of Building or specify the installation path in ~/.config/pob-mcp/config.json\\n\\n' +
      'Example config:\\n' +
      '{\\n' +
      '  "pobPath": "/path/to/PathOfBuilding"\\n' +
      '}'
  );
}
