import { spawn, ChildProcess } from 'child_process';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import readline from 'readline';
import { platform } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * LuaJIT runtime for executing PoB via subprocess
 * Uses bundled or system LuaJIT + HeadlessWrapper.lua
 */
export class LuaJITRuntime {
  private process: ChildProcess | null = null;
  private pobPath: string;
  private rl: readline.Interface | null = null;
  private pendingResponse: ((response: any) => void) | null = null;
  private luajitPath: string;
  private dkjsonPath: string;

  constructor(pobPath: string) {
    this.pobPath = pobPath;

    // Try bundled LuaJIT first, fall back to system luajit
    const bundledLuajit = join(__dirname, '..', '..', 'pob-data', 'luajit', 'src',
      platform() === 'win32' ? 'luajit.exe' : 'luajit');

    this.luajitPath = existsSync(bundledLuajit) ? bundledLuajit : 'luajit';

    // Path to bundled dkjson
    this.dkjsonPath = join(__dirname, '..', '..', 'pob-data', 'lua');
  }

  /**
   * Initialize PoB environment by spawning LuaJIT process
   */
  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Use absolute paths since we're setting cwd to PoB directory
      const bridgeScript = join(__dirname, '..', '..', 'scripts', 'pob-bridge.lua');
      const absoluteLuajitPath = this.luajitPath.startsWith('/') ? this.luajitPath : join(process.cwd(), this.luajitPath);
      const absoluteDkjsonPath = this.dkjsonPath.startsWith('/') ? this.dkjsonPath : join(process.cwd(), this.dkjsonPath);

      console.log(`Using LuaJIT: ${this.luajitPath}`);
      console.log(`Starting PoB at: ${this.pobPath}`);
      console.log(`Using dkjson from: ${this.dkjsonPath}`);

      // Spawn LuaJIT process with bundled dkjson path
      // Set cwd to PoB directory so HeadlessWrapper can find Launch.lua
      try {
        this.process = spawn(absoluteLuajitPath, [bridgeScript, this.pobPath, absoluteDkjsonPath], {
          stdio: ['pipe', 'pipe', 'pipe'],
          cwd: this.pobPath,
        });
      } catch (error) {
        reject(
          new Error(
            'Failed to spawn LuaJIT. Tried: ' + this.luajitPath + '\n' +
              'Please ensure build tools are installed:\n' +
              '  macOS:   xcode-select --install\n' +
              '  Ubuntu:  sudo apt install build-essential\n' +
              '  Fedora:  sudo dnf groupinstall "Development Tools"\n\n' +
              'Then run: pnpm install'
          )
        );
        return;
      }

      if (!this.process.stdout || !this.process.stdin) {
        reject(new Error('Failed to create process stdio'));
        return;
      }

      // Set up line reader for responses
      this.rl = readline.createInterface({
        input: this.process.stdout,
        crlfDelay: Infinity,
      });

      this.rl.on('line', (line) => {
        try {
          const response = JSON.parse(line);

          // Handle status messages
          if (response.status === 'loading') {
            console.log(response.message);
            return;
          }

          if (response.status === 'ready') {
            console.log(response.message);
            resolve();
            return;
          }

          // Handle API responses
          if (this.pendingResponse) {
            this.pendingResponse(response);
            this.pendingResponse = null;
          }
        } catch (error) {
          // Ignore non-JSON lines (PoB prints colored error messages)
          // Only log if it looks like it should be JSON
          if (line.trim().startsWith('{')) {
            console.error('Failed to parse JSON response:', line);
          }
        }
      });

      this.process.stderr?.on('data', (data) => {
        console.error('LuaJIT stderr:', data.toString());
      });

      this.process.on('error', (error) => {
        reject(new Error(`Failed to start LuaJIT: ${error.message}`));
      });

      this.process.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          reject(new Error(`LuaJIT exited with code ${code}`));
        }
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        reject(new Error('LuaJIT initialization timeout'));
      }, 30000);
    });
  }

  /**
   * Send command to LuaJIT process and wait for response
   */
  private async sendCommand(command: string, params?: any): Promise<any> {
    if (!this.process || !this.process.stdin) {
      throw new Error('LuaJIT process not initialized');
    }

    return new Promise((resolve, reject) => {
      const request = JSON.stringify({ command, params }) + '\n';

      this.pendingResponse = (response) => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.error || 'Command failed'));
        }
      };

      this.process!.stdin!.write(request);

      // Timeout after 10 seconds
      setTimeout(() => {
        if (this.pendingResponse) {
          this.pendingResponse = null;
          reject(new Error('Command timeout'));
        }
      }, 10000);
    });
  }

  /**
   * Create a new build
   */
  async newBuild(): Promise<void> {
    const response = await this.sendCommand('newBuild');
    console.log(response.message);
  }

  /**
   * Load build from XML
   * @param preserveState - If false, creates a fresh build without preserving state (useful for tests)
   */
  async loadBuildFromXML(xml: string, buildName: string = 'Imported Build', preserveState: boolean = true): Promise<void> {
    const response = await this.sendCommand('loadBuildFromXML', { xml, name: buildName, preserveState });
    console.log(response.message);
  }

  /**
   * Import build from pastebin code
   */
  async importFromCode(code: string, buildName: string = 'Imported Build'): Promise<void> {
    const response = await this.sendCommand('importFromCode', { code, name: buildName });
    console.log(response.message);
  }

  /**
   * Get build stats
   */
  async getBuildStats(): Promise<Record<string, number>> {
    const response = await this.sendCommand('getStats');
    return response.stats || {};
  }

  /**
   * Allocate a passive node by name (with automatic pathfinding)
   */
  async allocatePassive(nodeName: string, autoPath: boolean = true): Promise<void> {
    const response = await this.sendCommand('allocatePassive', { nodeName, autoPath });
    if (!response.success) {
      throw new Error(response.error || 'Failed to allocate passive');
    }
    console.log(response.message);

    // Log debug info if available
    if (response.debug) {
      console.log('DEBUG INFO:', JSON.stringify(response.debug, null, 2));
    }
  }

  /**
   * Set custom mods (for testing)
   */
  async setCustomMods(mods: string): Promise<void> {
    const response = await this.sendCommand('setCustomMods', { mods });
    if (!response.success) {
      throw new Error(response.error || 'Failed to set custom mods');
    }
    console.log(response.message);
  }

  /**
   * Rebuild paths from allocated nodes (for pathfinding)
   */
  async rebuildPaths(): Promise<void> {
    const response = await this.sendCommand('rebuildPaths');
    if (!response.success) {
      throw new Error(response.error || 'Failed to rebuild paths');
    }
  }

  /**
   * Get information about a specific passive node
   */
  async getNodeInfo(nodeName: string): Promise<{
    id: string;
    name: string;
    type: string;
    isKeystone: boolean;
    isNotable: boolean;
    isJewelSocket: boolean;
    allocated: boolean;
    hasPath: boolean;
    pathLength: number;
  }> {
    const response = await this.sendCommand('getNodeInfo', { nodeName });
    if (!response.success) {
      throw new Error(response.error || 'Failed to get node info');
    }
    return response.node;
  }

  /**
   * Get list of all allocated passive nodes
   */
  async getAllocatedNodes(): Promise<Array<{ id: string; name: string; type: string }>> {
    const response = await this.sendCommand('getAllocatedNodes');
    if (!response.success) {
      throw new Error(response.error || 'Failed to get allocated nodes');
    }
    return response.nodes;
  }

  /**
   * Find the shortest path to a passive node
   */
  async findPathToNode(nodeName: string): Promise<{
    hasPath: boolean;
    pathLength: number;
    path: Array<{ id: string; name: string; allocated: boolean }>;
  }> {
    const response = await this.sendCommand('findPathToNode', { nodeName });
    if (!response.success) {
      throw new Error(response.error || 'Failed to find path');
    }
    return {
      hasPath: response.hasPath,
      pathLength: response.pathLength,
      path: response.path,
    };
  }

  /**
   * Equip an item in a specific slot
   * @param itemText - The raw item text (in PoB format)
   * @param slotName - Slot name (e.g., "Weapon 1", "Helmet", "Body Armour", "Ring 1", etc.)
   */
  async equipItem(itemText: string, slotName: string): Promise<void> {
    const response = await this.sendCommand('equipItem', { itemText, slotName });
    if (!response.success) {
      throw new Error(response.error || 'Failed to equip item');
    }
    console.log(response.message);
  }

  /**
   * Unequip an item from a specific slot
   * @param slotName - Slot name to clear
   */
  async unequipItem(slotName: string): Promise<void> {
    const response = await this.sendCommand('unequipItem', { slotName });
    if (!response.success) {
      throw new Error(response.error || 'Failed to unequip item');
    }
    console.log(response.message);
  }

  /**
   * Activate or deactivate a flask
   * @param slotName - Flask slot name (e.g., "Flask 1", "Flask 2")
   * @param active - true to activate, false to deactivate (default: true)
   */
  async activateFlask(slotName: string, active: boolean = true): Promise<void> {
    const response = await this.sendCommand('activateFlask', { slotName, active });
    if (!response.success) {
      throw new Error(response.error || 'Failed to activate flask');
    }
    console.log(response.message);
  }

  /**
   * Get all currently equipped items
   */
  async getEquippedItems(): Promise<Array<{
    slot: string;
    itemId: number;
    name: string;
    rarity: string;
  }>> {
    const response = await this.sendCommand('getEquippedItems', {});
    if (!response.success) {
      throw new Error(response.error || 'Failed to get equipped items');
    }
    return response.items || [];
  }

  /**
   * Add a socket group with gems
   * @param label - Label for the socket group
   * @param gems - Array of gems with {name, level, quality, enabled}
   * @param slot - Optional item slot (e.g., "Weapon 1", "Body Armour")
   */
  async addSocketGroup(
    label: string,
    gems: Array<{ name: string; level?: number; quality?: number; enabled?: boolean }>,
    slot?: string
  ): Promise<void> {
    const gemsData = gems.map(gem => ({
      nameSpec: gem.name,
      level: gem.level ?? 20,
      quality: gem.quality ?? 0,
      enabled: gem.enabled ?? true,
    }));

    const response = await this.sendCommand('addSocketGroup', {
      label,
      gems: gemsData,
      slot,
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to add socket group');
    }
    console.log(response.message);
  }

  /**
   * Clear all socket groups
   */
  async clearSocketGroups(): Promise<void> {
    const response = await this.sendCommand('clearSocketGroups', {});
    if (!response.success) {
      throw new Error(response.error || 'Failed to clear socket groups');
    }
    console.log(response.message);
  }

  /**
   * Get all socket groups and their gems
   */
  async getSocketGroups(): Promise<Array<{
    index: number;
    label: string;
    enabled: boolean;
    slot?: string;
    gemCount: number;
    gems: Array<{ name: string; level: number; quality: number; enabled: boolean }>;
  }>> {
    const response = await this.sendCommand('getSocketGroups', {});
    if (!response.success) {
      throw new Error(response.error || 'Failed to get socket groups');
    }
    return response.socketGroups || [];
  }

  /**
   * Socket a jewel into a passive tree jewel socket node
   */
  async socketJewel(nodeId: number, itemText: string): Promise<{ jewelId: number; jewelName: string }> {
    const response = await this.sendCommand('socketJewel', { nodeId, itemText });
    if (!response.success) {
      throw new Error(response.error || 'Failed to socket jewel');
    }
    return {
      jewelId: response.jewelId,
      jewelName: response.jewelName
    };
  }

  /**
   * Unsocket a jewel from a passive tree jewel socket node
   */
  async unsocketJewel(nodeId: number): Promise<void> {
    const response = await this.sendCommand('unsocketJewel', { nodeId });
    if (!response.success) {
      throw new Error(response.error || 'Failed to unsocket jewel');
    }
  }

  /**
   * Get all socketed jewels
   */
  async getSocketedJewels(): Promise<Array<{
    nodeId: number;
    nodeName: string;
    jewelId: number;
    jewelName: string;
  }>> {
    const response = await this.sendCommand('getSocketedJewels', {});
    if (!response.success) {
      throw new Error(response.error || 'Failed to get socketed jewels');
    }
    return response.jewels || [];
  }

  /**
   * Get all available jewel sockets (allocated jewel socket nodes)
   */
  async getAvailableJewelSockets(): Promise<Array<{
    nodeId: number;
    nodeName: string;
    hasJewel: boolean;
  }>> {
    const response = await this.sendCommand('getAvailableJewelSockets', {});
    if (!response.success) {
      throw new Error(response.error || 'Failed to get available jewel sockets');
    }
    return response.sockets || [];
  }

  /**
   * Set character level (1-100)
   */
  async setCharacterLevel(level: number): Promise<void> {
    const response = await this.sendCommand('setCharacterLevel', { level });
    if (!response.success) {
      throw new Error(response.error || 'Failed to set character level');
    }
  }

  /**
   * Get current character level
   */
  async getCharacterLevel(): Promise<number> {
    const response = await this.sendCommand('getCharacterLevel', {});
    if (!response.success) {
      throw new Error(response.error || 'Failed to get character level');
    }
    return response.level;
  }

  /**
   * Set character class
   */
  async setCharacterClass(className: string): Promise<void> {
    const response = await this.sendCommand('setCharacterClass', { className });
    if (!response.success) {
      throw new Error(response.error || 'Failed to set character class');
    }
  }

  /**
   * Get current character class
   */
  async getCharacterClass(): Promise<string> {
    const response = await this.sendCommand('getCharacterClass', {});
    if (!response.success) {
      throw new Error(response.error || 'Failed to get character class');
    }
    return response.className;
  }

  /**
   * Set ascendancy class
   */
  async setAscendancy(ascendClassName: string): Promise<void> {
    const response = await this.sendCommand('setAscendancy', { ascendClassName });
    if (!response.success) {
      throw new Error(response.error || 'Failed to set ascendancy');
    }
  }

  /**
   * Get current ascendancy
   */
  async getAscendancy(): Promise<string> {
    const response = await this.sendCommand('getAscendancy', {});
    if (!response.success) {
      throw new Error(response.error || 'Failed to get ascendancy');
    }
    return response.ascendClassName;
  }

  /**
   * Set bandit reward choice
   */
  async setBandit(bandit: 'None' | 'Alira' | 'Oak' | 'Kraityn'): Promise<void> {
    const response = await this.sendCommand('setBandit', { bandit });
    if (!response.success) {
      throw new Error(response.error || 'Failed to set bandit');
    }
  }

  /**
   * Set pantheon choices
   */
  async setPantheon(major?: string, minor?: string): Promise<void> {
    const response = await this.sendCommand('setPantheon', { major, minor });
    if (!response.success) {
      throw new Error(response.error || 'Failed to set pantheon');
    }
  }

  /**
   * Set a configuration value
   *
   * Examples:
   * - setConfig('conditionFullLife', true) - Set always on full life
   * - setConfig('conditionMoving', true) - Set always moving
   * - setConfig('enemyIsBoss', 'Boss') - Set enemy as boss
   * - setConfig('enemyLevel', 85) - Set enemy level
   */
  async setConfig(var_: string, value: boolean | string | number): Promise<void> {
    const response = await this.sendCommand('setConfig', { var: var_, value });
    if (!response.success) {
      throw new Error(response.error || 'Failed to set config');
    }
  }

  /**
   * Get a configuration value
   */
  async getConfig(var_: string): Promise<boolean | string | number | null> {
    const response = await this.sendCommand('getConfig', { var: var_ });
    if (!response.success) {
      throw new Error(response.error || 'Failed to get config');
    }
    return response.value;
  }

  /**
   * Get all configuration values
   */
  async getAllConfig(): Promise<Record<string, boolean | string | number>> {
    const response = await this.sendCommand('getAllConfig', {});
    if (!response.success) {
      throw new Error(response.error || 'Failed to get all config');
    }
    return response.config || {};
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.process) {
      this.sendCommand('exit').catch(() => {});
      this.process.kill();
      this.process = null;
    }

    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
  }
}
