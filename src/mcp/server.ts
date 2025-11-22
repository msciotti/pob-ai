/**
 * MCP Server for Path of Building
 *
 * This server exposes Path of Building functionality to LLMs via the Model Context Protocol.
 * It provides tools for loading builds, allocating passive nodes, and querying build stats.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { z } from 'zod';
import { LuaJITRuntime } from '../pob/luajit-runtime.js';
import { getPobPath } from '../pob/detector.js';
import { loadConfig } from '../config/index.js';

/**
 * Key build statistics to include in sample stats response
 */
const KEY_BUILD_STATS = ['Level', 'Life', 'TotalDPS', 'EnergyShield', 'Armour', 'Evasion'] as const;

export class PobMcpServer {
  private mcpServer: McpServer;
  private runtime: LuaJITRuntime | null = null;
  private initializationPromise: Promise<void> | null = null;

  constructor() {
    // Initialize MCP server with metadata
    this.mcpServer = new McpServer({
      name: 'pob-mcp',
      version: '0.1.0',
    });

    console.error('[PoB MCP] Server initialized');

    // Register tools
    this.registerTools();
  }

  /**
   * Initialize the LuaJIT runtime (lazy initialization)
   */
  private async initializeRuntime(): Promise<void> {
    if (this.runtime) {
      return; // Already initialized
    }

    if (this.initializationPromise) {
      return this.initializationPromise; // Already initializing
    }

    this.initializationPromise = (async () => {
      try {
        console.error('[PoB MCP] Initializing LuaJIT runtime...');

        // Load config and detect PoB path
        const config = await loadConfig();
        const pobPath = await getPobPath(config.pobPath);

        console.error(`[PoB MCP] Using PoB at: ${pobPath}`);

        // Create and initialize runtime
        this.runtime = new LuaJITRuntime(pobPath);
        await this.runtime.initialize();

        console.error('[PoB MCP] LuaJIT runtime initialized successfully');
      } catch (error) {
        // Clear promise on error to allow retry
        this.initializationPromise = null;
        console.error('[PoB MCP] Failed to initialize runtime:', error);
        throw error;
      }
    })();

    return this.initializationPromise;
  }

  /**
   * Register all MCP tools
   */
  private registerTools(): void {
    // Tool: load_build
    this.mcpServer.registerTool(
      'load_build',
      {
        title: 'Load Build',
        description: 'Load a Path of Building build from a pastebin code (e.g., "uCLE0msa")',
        inputSchema: {
          source: z.string(),
          buildName: z.string(),
        },
        outputSchema: {
          success: z.boolean(),
          message: z.string(),
          buildName: z.string(),
          statsAvailable: z.boolean(),
          sampleStats: z.record(z.number()),
        },
      },
      async ({ source, buildName }: { source: string; buildName: string }) => {
        try {
          // Validate pastebin code format
          if (!/^[a-zA-Z0-9]{8}$/.test(source)) {
            throw new Error(
              'Invalid pastebin code format. Expected 8 alphanumeric characters (e.g., "uCLE0msa")'
            );
          }

          // Ensure runtime is initialized
          await this.initializeRuntime();

          if (!this.runtime) {
            throw new Error('Runtime not initialized');
          }

          // Load the build from pastebin code
          const finalBuildName = buildName || 'Imported Build';
          console.error(`[PoB MCP] Loading build from pastebin: ${source}`);
          await this.runtime.importFromCode(source, finalBuildName);

          // Try to fetch stats to verify, but don't fail if not available yet
          console.error('[PoB MCP] Attempting to fetch build stats...');
          let stats: Record<string, number> = {};
          let statsAvailable = false;

          try {
            stats = await this.runtime.getBuildStats();
            statsAvailable = Object.keys(stats).length > 0;
            console.error(`[PoB MCP] Build stats retrieved: ${Object.keys(stats).length} stats available`);
          } catch (error) {
            // Stats not available yet - that's ok, build is still loaded
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`[PoB MCP] Stats not immediately available: ${errorMsg}`);
          }

          // Extract a few sample stats if available
          const sampleStats: Record<string, number> = {};
          if (statsAvailable) {
            for (const key of KEY_BUILD_STATS) {
              if (stats[key] !== undefined && typeof stats[key] === 'number') {
                sampleStats[key] = stats[key];
              }
            }
          }

          const output = {
            success: true,
            message: `Build '${finalBuildName}' loaded successfully from pastebin code`,
            buildName: finalBuildName,
            statsAvailable,
            sampleStats,
          };

          console.error(`[PoB MCP] Build loaded successfully`);

          return {
            content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
            structuredContent: output,
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error('[PoB MCP] Failed to load build:', errorMessage);

          const output = {
            success: false,
            error: `Failed to load build: ${errorMessage}`,
          };

          return {
            content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
            structuredContent: output,
            isError: true,
          };
        }
      }
    );

    // Tool: get_build_stats
    this.mcpServer.registerTool(
      'get_build_stats',
      {
        title: 'Get Build Stats',
        description: 'Get all calculated stats for the current build',
        inputSchema: {},
        outputSchema: {
          success: z.boolean(),
          stats: z.record(z.number()),
          statCount: z.number(),
        },
      },
      async () => {
        try {
          // Ensure runtime is initialized
          await this.initializeRuntime();

          if (!this.runtime) {
            throw new Error('Runtime not initialized');
          }

          console.error('[PoB MCP] Getting build stats...');
          const stats = await this.runtime.getBuildStats();
          const statCount = Object.keys(stats).length;

          console.error(`[PoB MCP] Retrieved ${statCount} stats`);

          const output = {
            success: true,
            stats,
            statCount,
          };

          return {
            content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
            structuredContent: output,
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error('[PoB MCP] Failed to get build stats:', errorMessage);

          const output = {
            success: false,
            error: `Failed to get build stats: ${errorMessage}`,
          };

          return {
            content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
            structuredContent: output,
            isError: true,
          };
        }
      }
    );

    // Tool: allocate_passive
    this.mcpServer.registerTool(
      'allocate_passive',
      {
        title: 'Allocate Passive Node',
        description: 'Allocate a passive tree node by name (e.g., "Resolute Technique")',
        inputSchema: {
          nodeName: z.string(),
          autoPath: z.boolean().default(true),
        },
        outputSchema: {
          success: z.boolean(),
          message: z.string(),
          nodeName: z.string(),
          autoPath: z.boolean(),
          statChanges: z.record(z.object({
            before: z.number(),
            after: z.number(),
            delta: z.number(),
          })),
        },
      },
      async ({ nodeName, autoPath = true }: { nodeName: string; autoPath?: boolean }) => {
        try {
          // Ensure runtime is initialized
          await this.initializeRuntime();

          if (!this.runtime) {
            throw new Error('Runtime not initialized');
          }

          // Get "before" stats
          console.error('[PoB MCP] Getting stats before allocation...');
          let statsBefore: Record<string, number> = {};

          try {
            statsBefore = await this.runtime.getBuildStats();
            console.error(`[PoB MCP] Before stats: ${Object.keys(statsBefore).length} stats available`);
          } catch (error) {
            console.error('[PoB MCP] Warning: Could not get stats before allocation');
          }

          // Allocate the passive node
          console.error(`[PoB MCP] Allocating passive node: ${nodeName} (autoPath: ${autoPath})`);
          await this.runtime.allocatePassive(nodeName, autoPath);

          // Get "after" stats
          console.error('[PoB MCP] Getting stats after allocation...');
          let statsAfter: Record<string, number> = {};

          try {
            statsAfter = await this.runtime.getBuildStats();
            console.error(`[PoB MCP] After stats: ${Object.keys(statsAfter).length} stats available`);
          } catch (error) {
            console.error('[PoB MCP] Warning: Could not get stats after allocation');
          }

          // Calculate stat deltas for key stats
          const statChanges: Record<string, { before: number; after: number; delta: number }> = {};

          for (const key of KEY_BUILD_STATS) {
            const before = statsBefore[key];
            const after = statsAfter[key];

            // Only include if both values are valid numbers
            if (typeof before === 'number' && typeof after === 'number') {
              statChanges[key] = {
                before,
                after,
                delta: after - before,
              };
            }
          }

          const output = {
            success: true,
            message: `Passive node '${nodeName}' allocated successfully${autoPath ? ' with automatic pathing' : ''}`,
            nodeName,
            autoPath,
            statChanges,
          };

          console.error('[PoB MCP] Passive node allocated successfully');

          return {
            content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
            structuredContent: output,
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error('[PoB MCP] Failed to allocate passive:', errorMessage);

          const output = {
            success: false,
            error: `Failed to allocate passive node: ${errorMessage}`,
          };

          return {
            content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
            structuredContent: output,
            isError: true,
          };
        }
      }
    );

    console.error('[PoB MCP] Tools registered: load_build, get_build_stats, allocate_passive');
  }

  /**
   * Connect the MCP server to a transport
   * Can be called multiple times for different transports (stateless HTTP mode)
   */
  async connect(transport: Transport): Promise<void> {
    try {
      await this.mcpServer.connect(transport);
      console.error('[PoB MCP] Server connected to transport');
    } catch (error) {
      console.error('[PoB MCP] Failed to connect to transport:', error);
      throw error;
    }
  }

  /**
   * Gracefully close the server
   */
  async close(): Promise<void> {
    try {
      // Clean up runtime first
      if (this.runtime) {
        this.runtime.destroy();
        this.runtime = null;
        console.error('[PoB MCP] Runtime destroyed');
      }

      await this.mcpServer.close();
      console.error('[PoB MCP] Server closed successfully');
    } catch (error) {
      console.error('[PoB MCP] Error closing server:', error);
      throw error;
    }
  }

  /**
   * Get the underlying MCP server instance (for registering tools later)
   */
  getServer(): McpServer {
    return this.mcpServer;
  }
}
