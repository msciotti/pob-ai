import { spawn, ChildProcess } from 'child_process';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import readline from 'readline';
import { platform } from 'os';
import type { PobRuntime } from '@poe-ai/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * LuaJIT runtime for executing PoB via subprocess.
 * Implements PobRuntime so it can be stored on PluginContext.
 *
 * At runtime this file is at packages/plugin-pob/dist/runtime/luajit-runtime.js,
 * so __dirname/../.. resolves to packages/plugin-pob/.
 */
export class LuaJITRuntime implements PobRuntime {
  private process: ChildProcess | null = null;
  private pobPath: string;
  private rl: readline.Interface | null = null;
  private pendingResponse: ((response: unknown) => void) | null = null;
  private commandQueue: Array<{
    resolve: (response: unknown) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
    id: symbol;
  }> = [];
  private luajitPath: string;
  private dkjsonPath: string;

  /** Base directory of the plugin package (packages/plugin-pob/) */
  private static readonly pluginRoot = join(__dirname, '..', '..');

  constructor({ pobPath }: { pobPath: string }) {
    this.pobPath = pobPath;

    // Try bundled LuaJIT first, fall back to system luajit
    const bundledLuajit = join(
      LuaJITRuntime.pluginRoot,
      'pob-data',
      'luajit',
      'src',
      platform() === 'win32' ? 'luajit.exe' : 'luajit'
    );

    this.luajitPath = existsSync(bundledLuajit) ? bundledLuajit : 'luajit';

    // Path to bundled dkjson (lives in pob-data/runtime/lua/ after download-pob.js extracts PoB)
    this.dkjsonPath = join(LuaJITRuntime.pluginRoot, 'pob-data', 'runtime', 'lua');
  }

  /**
   * Initialize PoB environment by spawning LuaJIT process
   */
  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Bridge script lives in packages/plugin-pob/scripts/
      const bridgeScript = join(LuaJITRuntime.pluginRoot, 'scripts', 'pob-bridge.lua');

      const absoluteLuajitPath = this.luajitPath.startsWith('/')
        ? this.luajitPath
        : join(process.cwd(), this.luajitPath);
      const absoluteDkjsonPath = this.dkjsonPath.startsWith('/')
        ? this.dkjsonPath
        : join(process.cwd(), this.dkjsonPath);

      console.log(`Using LuaJIT: ${this.luajitPath}`);
      console.log(`Starting PoB at: ${this.pobPath}`);
      console.log(`Using dkjson from: ${this.dkjsonPath}`);

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

      this.rl = readline.createInterface({
        input: this.process.stdout,
        crlfDelay: Infinity,
      });

      this.rl.on('line', (line) => {
        try {
          const response = JSON.parse(line) as Record<string, unknown>;

          if (response['status'] === 'loading') {
            console.log(response['message']);
            return;
          }

          if (response['status'] === 'ready') {
            console.log(response['message']);
            resolve();
            return;
          }

          // Handle API responses - process from queue (FIFO)
          if (this.commandQueue.length > 0) {
            const command = this.commandQueue.shift()!;
            clearTimeout(command.timeout);

            if (response['success']) {
              command.resolve(response);
            } else {
              command.reject(new Error((response['error'] as string | undefined) || 'Command failed'));
            }
          } else if (this.pendingResponse) {
            const callback = this.pendingResponse;
            this.pendingResponse = null;
            callback(response);
          } else {
            console.warn('Received response with no pending command:', response);
          }
        } catch {
          if (line.trim().startsWith('{')) {
            console.error('Failed to parse JSON response:', line);
          }
        }
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        console.error('LuaJIT stderr:', data.toString());
      });

      this.process.on('error', (error: Error) => {
        reject(new Error(`Failed to start LuaJIT: ${error.message}`));
      });

      this.process.on('exit', (code: number | null) => {
        if (code !== 0 && code !== null) {
          reject(new Error(`LuaJIT exited with code ${code}`));
        }
      });

      setTimeout(() => {
        reject(new Error('LuaJIT initialization timeout'));
      }, 30000);
    });
  }

  /**
   * Send command to LuaJIT process and wait for response.
   * Commands are queued and processed in FIFO order to prevent race conditions.
   */
  private async sendCommand(command: string, params?: unknown): Promise<Record<string, unknown>> {
    if (!this.process || !this.process.stdin) {
      throw new Error('LuaJIT process not initialized');
    }

    return new Promise((resolve, reject) => {
      const request = JSON.stringify({ command, params }) + '\n';
      const commandId = Symbol('command');

      const timeout = setTimeout(() => {
        const index = this.commandQueue.findIndex((cmd) => cmd.id === commandId);
        if (index !== -1) {
          this.commandQueue.splice(index, 1);
        }
        reject(new Error('Command timeout'));
      }, 30000);

      this.commandQueue.push({
        resolve: resolve as (response: unknown) => void,
        reject,
        timeout,
        id: commandId,
      });

      this.process!.stdin!.write(request);
    });
  }

  // -------------------------------------------------------------------------
  // PobRuntime interface methods
  // -------------------------------------------------------------------------

  async newBuild(): Promise<void> {
    const response = await this.sendCommand('newBuild');
    console.log(response['message']);
  }

  /**
   * Load build from XML
   */
  async loadBuildFromXML(xml: string, buildName: string = 'Imported Build'): Promise<void> {
    const response = await this.sendCommand('loadBuildFromXML', {
      xml,
      name: buildName,
      preserveState: false,
    });
    console.log(response['message']);
  }

  /**
   * Import build from pastebin code
   */
  async importFromCode(code: string, buildName: string = 'Imported Build'): Promise<void> {
    const response = await this.sendCommand('importFromCode', {
      code,
      name: buildName,
      preserveState: false,
    });
    console.log(response['message']);
  }

  async getBuildStats(): Promise<Record<string, number>> {
    const response = await this.sendCommand('getStats');
    return (response['stats'] as Record<string, number>) || {};
  }

  /**
   * Allocate a passive node by name.
   * Returns a result object as required by PobRuntime.
   */
  async allocatePassive(nodeName: string, autoPath: boolean = true): Promise<{ success: boolean; message: string }> {
    const response = await this.sendCommand('allocatePassive', { nodeName, autoPath });

    if (!response['success']) {
      throw new Error((response['error'] as string | undefined) || 'Failed to allocate passive');
    }

    const message = (response['message'] as string | undefined) || `Allocated ${nodeName}`;
    console.log(message);

    if (response['debug']) {
      console.log('DEBUG INFO:', JSON.stringify(response['debug'], null, 2));
    }

    return { success: true, message };
  }

  /**
   * Gracefully destroy the runtime.
   * The underlying kill() is synchronous but we return Promise<void> to satisfy PobRuntime.
   */
  async destroy(): Promise<void> {
    // Clear command queue and reject pending commands
    while (this.commandQueue.length > 0) {
      const command = this.commandQueue.shift()!;
      clearTimeout(command.timeout);
      command.reject(new Error('Runtime destroyed'));
    }

    if (this.process) {
      // Best-effort graceful exit — ignore errors since we're tearing down
      this.sendCommand('exit').catch(() => {});
      this.process.kill();
      this.process = null;
    }

    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
  }

  // -------------------------------------------------------------------------
  // Extended methods beyond PobRuntime (available to callers with full type)
  // -------------------------------------------------------------------------

  async setCustomMods(mods: string): Promise<void> {
    const response = await this.sendCommand('setCustomMods', { mods });
    if (!response['success']) {
      throw new Error((response['error'] as string) || 'Failed to set custom mods');
    }
    console.log(response['message']);
  }

  async rebuildPaths(): Promise<void> {
    const response = await this.sendCommand('rebuildPaths');
    if (!response['success']) {
      throw new Error((response['error'] as string) || 'Failed to rebuild paths');
    }
  }

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
    if (!response['success']) {
      throw new Error((response['error'] as string) || 'Failed to get node info');
    }
    return response['node'] as {
      id: string; name: string; type: string; isKeystone: boolean;
      isNotable: boolean; isJewelSocket: boolean; allocated: boolean;
      hasPath: boolean; pathLength: number;
    };
  }

  async getAllocatedNodes(): Promise<Array<{ id: string; name: string; type: string }>> {
    const response = await this.sendCommand('getAllocatedNodes');
    if (!response['success']) {
      throw new Error((response['error'] as string) || 'Failed to get allocated nodes');
    }
    return (response['nodes'] as Array<{ id: string; name: string; type: string }>) || [];
  }

  async findPathToNode(nodeName: string): Promise<{
    hasPath: boolean;
    pathLength: number;
    path: Array<{ id: string; name: string; allocated: boolean }>;
  }> {
    const response = await this.sendCommand('findPathToNode', { nodeName });
    if (!response['success']) {
      throw new Error((response['error'] as string) || 'Failed to find path');
    }
    return {
      hasPath: response['hasPath'] as boolean,
      pathLength: response['pathLength'] as number,
      path: response['path'] as Array<{ id: string; name: string; allocated: boolean }>,
    };
  }

  async equipItem(itemText: string, slotName: string): Promise<void> {
    const response = await this.sendCommand('equipItem', { itemText, slotName });
    if (!response['success']) {
      throw new Error((response['error'] as string) || 'Failed to equip item');
    }
    console.log(response['message']);
  }

  async unequipItem(slotName: string): Promise<void> {
    const response = await this.sendCommand('unequipItem', { slotName });
    if (!response['success']) {
      throw new Error((response['error'] as string) || 'Failed to unequip item');
    }
    console.log(response['message']);
  }

  async activateFlask(slotName: string, active: boolean = true): Promise<void> {
    const response = await this.sendCommand('activateFlask', { slotName, active });
    if (!response['success']) {
      throw new Error((response['error'] as string) || 'Failed to activate flask');
    }
    console.log(response['message']);
  }

  async getEquippedItems(): Promise<Array<{
    slot: string;
    itemId: number;
    name: string;
    rarity: string;
  }>> {
    const response = await this.sendCommand('getEquippedItems', {});
    if (!response['success']) {
      throw new Error((response['error'] as string) || 'Failed to get equipped items');
    }
    return (response['items'] as Array<{ slot: string; itemId: number; name: string; rarity: string }>) || [];
  }

  async addSocketGroup(
    label: string,
    gems: Array<{ name: string; level?: number; quality?: number; enabled?: boolean }>,
    slot?: string
  ): Promise<void> {
    const gemsData = gems.map((gem) => ({
      nameSpec: gem.name,
      level: gem.level ?? 20,
      quality: gem.quality ?? 0,
      enabled: gem.enabled ?? true,
    }));

    const response = await this.sendCommand('addSocketGroup', { label, gems: gemsData, slot });
    if (!response['success']) {
      throw new Error((response['error'] as string) || 'Failed to add socket group');
    }
    console.log(response['message']);
  }

  async clearSocketGroups(): Promise<void> {
    const response = await this.sendCommand('clearSocketGroups', {});
    if (!response['success']) {
      throw new Error((response['error'] as string) || 'Failed to clear socket groups');
    }
    console.log(response['message']);
  }

  async getSocketGroups(): Promise<Array<{
    index: number;
    label: string;
    enabled: boolean;
    slot?: string;
    gemCount: number;
    gems: Array<{ name: string; level: number; quality: number; enabled: boolean }>;
  }>> {
    const response = await this.sendCommand('getSocketGroups', {});
    if (!response['success']) {
      throw new Error((response['error'] as string) || 'Failed to get socket groups');
    }
    return (response['socketGroups'] as Array<{
      index: number;
      label: string;
      enabled: boolean;
      slot?: string;
      gemCount: number;
      gems: Array<{ name: string; level: number; quality: number; enabled: boolean }>;
    }>) || [];
  }

  async socketJewel(nodeId: number, itemText: string): Promise<{ jewelId: number; jewelName: string }> {
    const response = await this.sendCommand('socketJewel', { nodeId, itemText });
    if (!response['success']) {
      throw new Error((response['error'] as string) || 'Failed to socket jewel');
    }
    return {
      jewelId: response['jewelId'] as number,
      jewelName: response['jewelName'] as string,
    };
  }

  async unsocketJewel(nodeId: number): Promise<void> {
    const response = await this.sendCommand('unsocketJewel', { nodeId });
    if (!response['success']) {
      throw new Error((response['error'] as string) || 'Failed to unsocket jewel');
    }
  }

  async getSocketedJewels(): Promise<Array<{
    nodeId: number;
    nodeName: string;
    jewelId: number;
    jewelName: string;
  }>> {
    const response = await this.sendCommand('getSocketedJewels', {});
    if (!response['success']) {
      throw new Error((response['error'] as string) || 'Failed to get socketed jewels');
    }
    return (response['jewels'] as Array<{ nodeId: number; nodeName: string; jewelId: number; jewelName: string }>) || [];
  }

  async getAvailableJewelSockets(): Promise<Array<{
    nodeId: number;
    nodeName: string;
    hasJewel: boolean;
  }>> {
    const response = await this.sendCommand('getAvailableJewelSockets', {});
    if (!response['success']) {
      throw new Error((response['error'] as string) || 'Failed to get available jewel sockets');
    }
    return (response['sockets'] as Array<{ nodeId: number; nodeName: string; hasJewel: boolean }>) || [];
  }

  async setCharacterLevel(level: number): Promise<void> {
    const response = await this.sendCommand('setCharacterLevel', { level });
    if (!response['success']) {
      throw new Error((response['error'] as string) || 'Failed to set character level');
    }
  }

  async getCharacterLevel(): Promise<number> {
    const response = await this.sendCommand('getCharacterLevel', {});
    if (!response['success']) {
      throw new Error((response['error'] as string) || 'Failed to get character level');
    }
    return response['level'] as number;
  }

  async setCharacterClass(className: string): Promise<void> {
    const response = await this.sendCommand('setCharacterClass', { className });
    if (!response['success']) {
      throw new Error((response['error'] as string) || 'Failed to set character class');
    }
  }

  async getCharacterClass(): Promise<string> {
    const response = await this.sendCommand('getCharacterClass', {});
    if (!response['success']) {
      throw new Error((response['error'] as string) || 'Failed to get character class');
    }
    return response['className'] as string;
  }

  async setAscendancy(ascendClassName: string): Promise<void> {
    const response = await this.sendCommand('setAscendancy', { ascendClassName });
    if (!response['success']) {
      throw new Error((response['error'] as string) || 'Failed to set ascendancy');
    }
  }

  async getAscendancy(): Promise<string> {
    const response = await this.sendCommand('getAscendancy', {});
    if (!response['success']) {
      throw new Error((response['error'] as string) || 'Failed to get ascendancy');
    }
    return response['ascendClassName'] as string;
  }

  async setBandit(bandit: 'None' | 'Alira' | 'Oak' | 'Kraityn'): Promise<void> {
    const response = await this.sendCommand('setBandit', { bandit });
    if (!response['success']) {
      throw new Error((response['error'] as string) || 'Failed to set bandit');
    }
  }

  async setPantheon(major?: string, minor?: string): Promise<void> {
    const response = await this.sendCommand('setPantheon', { major, minor });
    if (!response['success']) {
      throw new Error((response['error'] as string) || 'Failed to set pantheon');
    }
  }

  async setConfig(var_: string, value: boolean | string | number): Promise<void> {
    const response = await this.sendCommand('setConfig', { var: var_, value });
    if (!response['success']) {
      throw new Error((response['error'] as string) || 'Failed to set config');
    }
  }

  async getConfig(var_: string): Promise<boolean | string | number | null> {
    const response = await this.sendCommand('getConfig', { var: var_ });
    if (!response['success']) {
      throw new Error((response['error'] as string) || 'Failed to get config');
    }
    return response['value'] as boolean | string | number | null;
  }

  async getAllConfig(): Promise<Record<string, boolean | string | number>> {
    const response = await this.sendCommand('getAllConfig', {});
    if (!response['success']) {
      throw new Error((response['error'] as string) || 'Failed to get all config');
    }
    return (response['config'] as Record<string, boolean | string | number>) || {};
  }
}
