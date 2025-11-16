/**
 * Passive Tree Utilities
 *
 * High-level utilities for passive tree analysis and manipulation.
 * These utilities work with the PoB integration to provide pathfinding,
 * node analysis, and build optimization features.
 */

import { LuaJITRuntime } from './luajit-runtime.js';

export interface PassiveNodeInfo {
  id: string;
  name: string;
  type: string;
  isKeystone: boolean;
  isNotable: boolean;
  isJewelSocket: boolean;
  allocated: boolean;
  hasPath: boolean;
  pathLength: number;
}

export interface PassivePath {
  hasPath: boolean;
  pathLength: number;
  path: Array<{ id: string; name: string; allocated: boolean }>;
}

/**
 * PassiveTreeAnalyzer provides utilities for passive tree analysis
 */
export class PassiveTreeAnalyzer {
  constructor(private runtime: LuaJITRuntime) {}

  /**
   * Check if a passive node can be allocated (has a path to the tree)
   */
  async canAllocate(nodeName: string): Promise<boolean> {
    try {
      const nodeInfo = await this.runtime.getNodeInfo(nodeName);
      return nodeInfo.hasPath;
    } catch {
      return false;
    }
  }

  /**
   * Get the shortest path to a passive node
   */
  async getPathToNode(nodeName: string): Promise<PassivePath> {
    return await this.runtime.findPathToNode(nodeName);
  }

  /**
   * Get information about a passive node
   */
  async getNodeInfo(nodeName: string): Promise<PassiveNodeInfo> {
    return await this.runtime.getNodeInfo(nodeName);
  }

  /**
   * Get all currently allocated nodes
   */
  async getAllocatedNodes(): Promise<Array<{ id: string; name: string; type: string }>> {
    return await this.runtime.getAllocatedNodes();
  }

  /**
   * Calculate the number of points needed to reach a node
   * (returns unallocated nodes in the path)
   */
  async getPointsNeededForNode(nodeName: string): Promise<number> {
    const path = await this.getPathToNode(nodeName);
    if (!path.hasPath) {
      throw new Error(`No path available to ${nodeName}`);
    }

    // Count unallocated nodes in the path
    return path.path.filter(node => !node.allocated).length;
  }

  /**
   * Check if a node is a keystone
   */
  async isKeystone(nodeName: string): Promise<boolean> {
    const info = await this.getNodeInfo(nodeName);
    return info.isKeystone;
  }

  /**
   * Check if a node is a notable
   */
  async isNotable(nodeName: string): Promise<boolean> {
    const info = await this.getNodeInfo(nodeName);
    return info.isNotable;
  }

  /**
   * Check if a node is a jewel socket
   */
  async isJewelSocket(nodeName: string): Promise<boolean> {
    const info = await this.getNodeInfo(nodeName);
    return info.isJewelSocket;
  }

  /**
   * Get a summary of the passive tree state
   */
  async getTreeSummary(): Promise<{
    totalAllocated: number;
    keystones: string[];
    notables: string[];
    jewelSockets: string[];
  }> {
    const allocated = await this.getAllocatedNodes();

    const keystones: string[] = [];
    const notables: string[] = [];
    const jewelSockets: string[] = [];

    // Check each allocated node's type
    for (const node of allocated) {
      try {
        const info = await this.getNodeInfo(node.name);
        if (info.isKeystone) keystones.push(node.name);
        if (info.isNotable) notables.push(node.name);
        if (info.isJewelSocket) jewelSockets.push(node.name);
      } catch {
        // Skip nodes that can't be queried
      }
    }

    return {
      totalAllocated: allocated.length,
      keystones,
      notables,
      jewelSockets,
    };
  }
}

/**
 * PassiveTreeSimulator provides utilities for simulating passive allocations
 */
export class PassiveTreeSimulator {
  constructor(private runtime: LuaJITRuntime) {}

  /**
   * Simulate allocating a passive and return the stat changes
   */
  async simulateAllocation(nodeName: string): Promise<{
    canAllocate: boolean;
    pointsNeeded: number;
    statsBefore: Record<string, number>;
    statsAfter: Record<string, number>;
    statChanges: Record<string, number>;
  }> {
    // Get initial stats
    const statsBefore = await this.runtime.getBuildStats();

    // Check if we can allocate this node
    const analyzer = new PassiveTreeAnalyzer(this.runtime);
    const canAllocate = await analyzer.canAllocate(nodeName);

    if (!canAllocate) {
      return {
        canAllocate: false,
        pointsNeeded: 0,
        statsBefore,
        statsAfter: statsBefore,
        statChanges: {},
      };
    }

    const pointsNeeded = await analyzer.getPointsNeededForNode(nodeName);

    // Allocate the node
    await this.runtime.allocatePassive(nodeName);

    // Get final stats
    const statsAfter = await this.runtime.getBuildStats();

    // Calculate changes
    const statChanges: Record<string, number> = {};
    for (const key of Object.keys(statsAfter)) {
      const before = statsBefore[key] || 0;
      const after = statsAfter[key] || 0;
      if (before !== after) {
        statChanges[key] = after - before;
      }
    }

    return {
      canAllocate: true,
      pointsNeeded,
      statsBefore,
      statsAfter,
      statChanges,
    };
  }

  /**
   * Compare multiple passive allocations and return the best one
   * based on a scoring function
   */
  async findBestPassive(
    candidates: string[],
    scoreFn: (stats: Record<string, number>) => number
  ): Promise<{
    bestNode: string | null;
    bestScore: number;
    results: Array<{ nodeName: string; score: number; canAllocate: boolean }>;
  }> {
    const results: Array<{ nodeName: string; score: number; canAllocate: boolean }> = [];

    let bestNode: string | null = null;
    let bestScore = -Infinity;

    for (const nodeName of candidates) {
      try {
        const sim = await this.simulateAllocation(nodeName);

        if (sim.canAllocate) {
          const score = scoreFn(sim.statsAfter);
          results.push({ nodeName, score, canAllocate: true });

          if (score > bestScore) {
            bestScore = score;
            bestNode = nodeName;
          }
        } else {
          results.push({ nodeName, score: -Infinity, canAllocate: false });
        }
      } catch {
        results.push({ nodeName, score: -Infinity, canAllocate: false });
      }
    }

    return { bestNode, bestScore, results };
  }
}
