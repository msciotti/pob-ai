/**
 * MockLuaJITRuntime
 *
 * Mock implementation of LuaJITRuntime for testing MCP server functionality
 * without requiring actual LuaJIT or PoB installation.
 */

export interface MockRuntimeState {
  initialized: boolean;
  currentBuild: string | null;
  stats: Record<string, number>;
  allocatedNodes: Array<{ id: string; name: string; type: string }>;
  equippedItems: Array<{ slot: string; itemId: number; name: string; rarity: string }>;
  socketGroups: Array<{
    index: number;
    label: string;
    enabled: boolean;
    slot?: string;
    gemCount: number;
    gems: Array<{ name: string; level: number; quality: number; enabled: boolean }>;
  }>;
  socketedJewels: Array<{
    nodeId: number;
    nodeName: string;
    jewelId: number;
    jewelName: string;
  }>;
  characterLevel: number;
  characterClass: string;
  ascendancy: string;
  bandit: string;
  pantheon: { major?: string; minor?: string };
  config: Record<string, boolean | string | number>;
}

export class MockLuaJITRuntime {
  private state: MockRuntimeState;
  private initializeDelay: number;
  private shouldFailInitialize: boolean;
  private shouldFailCommands: boolean;

  constructor(pobPath: string) {
    // Initialize with default state
    this.state = {
      initialized: false,
      currentBuild: null,
      stats: {},
      allocatedNodes: [],
      equippedItems: [],
      socketGroups: [],
      socketedJewels: [],
      characterLevel: 1,
      characterClass: 'Scion',
      ascendancy: 'None',
      bandit: 'None',
      pantheon: {},
      config: {},
    };

    // Test control flags
    this.initializeDelay = 0;
    this.shouldFailInitialize = false;
    this.shouldFailCommands = false;
  }

  /**
   * Test helpers - control mock behavior
   */
  setStats(stats: Record<string, number>): void {
    this.state.stats = stats;
  }

  setAllocatedNodes(nodes: Array<{ id: string; name: string; type: string }>): void {
    this.state.allocatedNodes = nodes;
  }

  setShouldFailInitialize(shouldFail: boolean): void {
    this.shouldFailInitialize = shouldFail;
  }

  setShouldFailCommands(shouldFail: boolean): void {
    this.shouldFailCommands = shouldFail;
  }

  setInitializeDelay(delay: number): void {
    this.initializeDelay = delay;
  }

  getState(): MockRuntimeState {
    return { ...this.state };
  }

  reset(): void {
    this.state = {
      initialized: false,
      currentBuild: null,
      stats: {},
      allocatedNodes: [],
      equippedItems: [],
      socketGroups: [],
      socketedJewels: [],
      characterLevel: 1,
      characterClass: 'Scion',
      ascendancy: 'None',
      bandit: 'None',
      pantheon: {},
      config: {},
    };
    this.initializeDelay = 0;
    this.shouldFailInitialize = false;
    this.shouldFailCommands = false;
  }

  /**
   * LuaJITRuntime interface implementation
   */
  async initialize(): Promise<void> {
    if (this.shouldFailInitialize) {
      throw new Error('Mock initialization failure');
    }

    if (this.initializeDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.initializeDelay));
    }

    this.state.initialized = true;
  }

  async newBuild(): Promise<void> {
    this.throwIfNotInitialized();
    this.throwIfCommandsShouldFail();
    this.state.currentBuild = 'New Build';
  }

  async loadBuildFromXML(xml: string, buildName: string = 'Imported Build'): Promise<void> {
    this.throwIfNotInitialized();
    this.throwIfCommandsShouldFail();
    this.state.currentBuild = buildName;
  }

  async importFromCode(code: string, buildName: string = 'Imported Build'): Promise<void> {
    this.throwIfNotInitialized();
    this.throwIfCommandsShouldFail();
    this.state.currentBuild = buildName;
  }

  async getBuildStats(): Promise<Record<string, number>> {
    this.throwIfNotInitialized();
    this.throwIfCommandsShouldFail();
    return { ...this.state.stats };
  }

  async allocatePassive(nodeName: string, autoPath: boolean = true): Promise<void> {
    this.throwIfNotInitialized();
    this.throwIfCommandsShouldFail();

    // Add node if not already allocated
    const exists = this.state.allocatedNodes.some(n => n.name === nodeName);
    if (!exists) {
      this.state.allocatedNodes.push({
        id: String(this.state.allocatedNodes.length + 1),
        name: nodeName,
        type: 'Normal',
      });
    }
  }

  async setCustomMods(mods: string): Promise<void> {
    this.throwIfNotInitialized();
    this.throwIfCommandsShouldFail();
  }

  async rebuildPaths(): Promise<void> {
    this.throwIfNotInitialized();
    this.throwIfCommandsShouldFail();
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
    this.throwIfNotInitialized();
    this.throwIfCommandsShouldFail();

    const allocated = this.state.allocatedNodes.some(n => n.name === nodeName);
    return {
      id: '1',
      name: nodeName,
      type: 'Normal',
      isKeystone: false,
      isNotable: false,
      isJewelSocket: false,
      allocated,
      hasPath: allocated,
      pathLength: allocated ? 0 : 5,
    };
  }

  async getAllocatedNodes(): Promise<Array<{ id: string; name: string; type: string }>> {
    this.throwIfNotInitialized();
    this.throwIfCommandsShouldFail();
    return [...this.state.allocatedNodes];
  }

  async findPathToNode(nodeName: string): Promise<{
    hasPath: boolean;
    pathLength: number;
    path: Array<{ id: string; name: string; allocated: boolean }>;
  }> {
    this.throwIfNotInitialized();
    this.throwIfCommandsShouldFail();

    return {
      hasPath: true,
      pathLength: 3,
      path: [
        { id: '1', name: 'Node 1', allocated: true },
        { id: '2', name: 'Node 2', allocated: false },
        { id: '3', name: nodeName, allocated: false },
      ],
    };
  }

  async equipItem(itemText: string, slotName: string): Promise<void> {
    this.throwIfNotInitialized();
    this.throwIfCommandsShouldFail();

    // Remove existing item in slot if any
    this.state.equippedItems = this.state.equippedItems.filter(i => i.slot !== slotName);

    // Add new item
    this.state.equippedItems.push({
      slot: slotName,
      itemId: this.state.equippedItems.length + 1,
      name: 'Mock Item',
      rarity: 'UNIQUE',
    });
  }

  async unequipItem(slotName: string): Promise<void> {
    this.throwIfNotInitialized();
    this.throwIfCommandsShouldFail();
    this.state.equippedItems = this.state.equippedItems.filter(i => i.slot !== slotName);
  }

  async getEquippedItems(): Promise<Array<{
    slot: string;
    itemId: number;
    name: string;
    rarity: string;
  }>> {
    this.throwIfNotInitialized();
    this.throwIfCommandsShouldFail();
    return [...this.state.equippedItems];
  }

  async addSocketGroup(
    label: string,
    gems: Array<{ name: string; level?: number; quality?: number; enabled?: boolean }>,
    slot?: string
  ): Promise<void> {
    this.throwIfNotInitialized();
    this.throwIfCommandsShouldFail();

    this.state.socketGroups.push({
      index: this.state.socketGroups.length,
      label,
      enabled: true,
      slot,
      gemCount: gems.length,
      gems: gems.map(g => ({
        name: g.name,
        level: g.level ?? 20,
        quality: g.quality ?? 0,
        enabled: g.enabled ?? true,
      })),
    });
  }

  async clearSocketGroups(): Promise<void> {
    this.throwIfNotInitialized();
    this.throwIfCommandsShouldFail();
    this.state.socketGroups = [];
  }

  async getSocketGroups(): Promise<Array<{
    index: number;
    label: string;
    enabled: boolean;
    slot?: string;
    gemCount: number;
    gems: Array<{ name: string; level: number; quality: number; enabled: boolean }>;
  }>> {
    this.throwIfNotInitialized();
    this.throwIfCommandsShouldFail();
    return [...this.state.socketGroups];
  }

  async socketJewel(nodeId: number, itemText: string): Promise<{ jewelId: number; jewelName: string }> {
    this.throwIfNotInitialized();
    this.throwIfCommandsShouldFail();

    const jewelId = this.state.socketedJewels.length + 1;
    const jewelName = 'Mock Jewel';

    this.state.socketedJewels.push({
      nodeId,
      nodeName: `Node ${nodeId}`,
      jewelId,
      jewelName,
    });

    return { jewelId, jewelName };
  }

  async unsocketJewel(nodeId: number): Promise<void> {
    this.throwIfNotInitialized();
    this.throwIfCommandsShouldFail();
    this.state.socketedJewels = this.state.socketedJewels.filter(j => j.nodeId !== nodeId);
  }

  async getSocketedJewels(): Promise<Array<{
    nodeId: number;
    nodeName: string;
    jewelId: number;
    jewelName: string;
  }>> {
    this.throwIfNotInitialized();
    this.throwIfCommandsShouldFail();
    return [...this.state.socketedJewels];
  }

  async getAvailableJewelSockets(): Promise<Array<{
    nodeId: number;
    nodeName: string;
    hasJewel: boolean;
  }>> {
    this.throwIfNotInitialized();
    this.throwIfCommandsShouldFail();

    return [
      { nodeId: 1, nodeName: 'Jewel Socket 1', hasJewel: false },
      { nodeId: 2, nodeName: 'Jewel Socket 2', hasJewel: false },
    ];
  }

  async setCharacterLevel(level: number): Promise<void> {
    this.throwIfNotInitialized();
    this.throwIfCommandsShouldFail();
    this.state.characterLevel = level;
  }

  async getCharacterLevel(): Promise<number> {
    this.throwIfNotInitialized();
    this.throwIfCommandsShouldFail();
    return this.state.characterLevel;
  }

  async setCharacterClass(className: string): Promise<void> {
    this.throwIfNotInitialized();
    this.throwIfCommandsShouldFail();
    this.state.characterClass = className;
  }

  async getCharacterClass(): Promise<string> {
    this.throwIfNotInitialized();
    this.throwIfCommandsShouldFail();
    return this.state.characterClass;
  }

  async setAscendancy(ascendClassName: string): Promise<void> {
    this.throwIfNotInitialized();
    this.throwIfCommandsShouldFail();
    this.state.ascendancy = ascendClassName;
  }

  async getAscendancy(): Promise<string> {
    this.throwIfNotInitialized();
    this.throwIfCommandsShouldFail();
    return this.state.ascendancy;
  }

  async setBandit(bandit: 'None' | 'Alira' | 'Oak' | 'Kraityn'): Promise<void> {
    this.throwIfNotInitialized();
    this.throwIfCommandsShouldFail();
    this.state.bandit = bandit;
  }

  async setPantheon(major?: string, minor?: string): Promise<void> {
    this.throwIfNotInitialized();
    this.throwIfCommandsShouldFail();
    this.state.pantheon = { major, minor };
  }

  async setConfig(var_: string, value: boolean | string | number): Promise<void> {
    this.throwIfNotInitialized();
    this.throwIfCommandsShouldFail();
    this.state.config[var_] = value;
  }

  async getConfig(var_: string): Promise<boolean | string | number | null> {
    this.throwIfNotInitialized();
    this.throwIfCommandsShouldFail();
    return this.state.config[var_] ?? null;
  }

  async getAllConfig(): Promise<Record<string, boolean | string | number>> {
    this.throwIfNotInitialized();
    this.throwIfCommandsShouldFail();
    return { ...this.state.config };
  }

  destroy(): void {
    this.state.initialized = false;
  }

  /**
   * Private helper methods
   */
  private throwIfNotInitialized(): void {
    if (!this.state.initialized) {
      throw new Error('LuaJIT process not initialized');
    }
  }

  private throwIfCommandsShouldFail(): void {
    if (this.shouldFailCommands) {
      throw new Error('Mock command failure');
    }
  }
}
