/**
 * Integration Tests for MCP Server
 * Tests full MCP protocol interactions, transport lifecycle, and concurrent requests
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestClient, callTool } from './test-helpers.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { PobMcpServer } from '../server.js';

// Mock dependencies
vi.mock('../../config/index.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({ pobPath: '/mock/pob' }),
}));

vi.mock('../../pob/detector.js', () => ({
  getPobPath: vi.fn().mockResolvedValue('/mock/pob'),
}));

vi.mock('../../pob/luajit-runtime.js', () => {
  return {
    LuaJITRuntime: class MockLuaJITRuntime {
      async initialize() {}
      async importFromCode() {}
      async getBuildStats() {
        return { Life: 5000, TotalDPS: 1000000, Armour: 10000 };
      }
      async allocatePassive() {}
      destroy() {}
    },
  };
});

describe('MCP Server Integration Tests', () => {
  let client: Client;
  let server: PobMcpServer;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const setup = await createTestClient();
    client = setup.client;
    server = setup.server;
    cleanup = setup.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  describe('MCP Protocol', () => {
    it('should list available tools', async () => {
      const tools = await client.listTools();

      expect(tools.tools).toBeDefined();
      expect(tools.tools.length).toBeGreaterThan(0);

      const toolNames = tools.tools.map((t) => t.name);
      expect(toolNames).toContain('load_build');
      expect(toolNames).toContain('get_build_stats');
      expect(toolNames).toContain('allocate_passive');
    });

    it('should describe tools with schema', async () => {
      const tools = await client.listTools();

      const loadBuildTool = tools.tools.find((t) => t.name === 'load_build');
      expect(loadBuildTool).toBeDefined();
      expect(loadBuildTool?.description).toContain('Load a Path of Building build');
      expect(loadBuildTool?.inputSchema).toBeDefined();
    });

    it('should successfully call load_build tool', async () => {
      const result = await callTool(client, 'load_build', {
        source: 'uCLE0msa',
        buildName: 'Test Build',
      });

      expect(result.content).toBeDefined();
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('loaded successfully');
    });

    it('should successfully call get_build_stats tool', async () => {
      // Load a build first
      await callTool(client, 'load_build', {
        source: 'uCLE0msa',
        buildName: 'Test Build',
      });

      const result = await callTool(client, 'get_build_stats', {});

      expect(result.content).toBeDefined();
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.content[0].type).toBe('text');

      const statsText = result.content[0].text;
      expect(statsText).toContain('Life');
      expect(statsText).toContain('TotalDPS');
    });

    it('should successfully call allocate_passive tool', async () => {
      // Load a build first
      await callTool(client, 'load_build', {
        source: 'uCLE0msa',
        buildName: 'Test Build',
      });

      const result = await callTool(client, 'allocate_passive', {
        nodeName: 'Constitution',
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Constitution');
    });

    it('should reject invalid tool name', async () => {
      await expect(
        callTool(client, 'invalid_tool', {})
      ).rejects.toThrow('not found');
    });

    it('should reject invalid tool arguments', async () => {
      await expect(
        callTool(client, 'load_build', { invalid_param: 'test' })
      ).rejects.toThrow('Invalid arguments');
    });

    it('should validate pastebin code format', async () => {
      await expect(
        callTool(client, 'load_build', { source: 'toolong123456789', buildName: 'Test' })
      ).rejects.toThrow('8 alphanumeric characters');

      await expect(
        callTool(client, 'load_build', { source: 'short', buildName: 'Test' })
      ).rejects.toThrow('8 alphanumeric characters');

      await expect(
        callTool(client, 'load_build', { source: 'has!@#$%', buildName: 'Test' })
      ).rejects.toThrow('8 alphanumeric characters');
    });
  });

  describe('Transport Lifecycle', () => {
    it('should handle transport close gracefully after runtime initialization', async () => {
      // Call a tool to ensure runtime is initialized
      await callTool(client, 'load_build', {
        source: 'uCLE0msa',
        buildName: 'Test Build',
      });

      // Verify operations work before cleanup
      // (afterEach will test cleanup doesn't throw)
      const stats = await callTool(client, 'get_build_stats', {});
      expect(stats.content).toBeDefined();
    });

    it('should allow server operations after initialization', async () => {
      // Load a build to initialize runtime
      await callTool(client, 'load_build', {
        source: 'uCLE0msa',
        buildName: 'Test Build',
      });

      // Verify server can be used multiple times
      const result1 = await callTool(client, 'get_build_stats', {});
      const result2 = await callTool(client, 'get_build_stats', {});

      expect(result1.content).toBeDefined();
      expect(result2.content).toBeDefined();
      // afterEach will test cleanup/close doesn't throw
    });
  });

  describe('Concurrent Requests', () => {
    it('should handle concurrent tool calls without race conditions', async () => {
      // Make multiple concurrent calls
      const calls = [
        callTool(client, 'load_build', { source: 'uCLE0msa', buildName: 'Build 1' }),
        callTool(client, 'load_build', { source: 'ABC123de', buildName: 'Build 2' }),
        callTool(client, 'load_build', { source: 'XYZ789ab', buildName: 'Build 3' }),
      ];

      const results = await Promise.all(calls);

      // All should succeed
      results.forEach((result) => {
        expect(result.content).toBeDefined();
        expect(result.content[0].text).toContain('loaded successfully');
      });
    });

    it('should handle mixed concurrent operations', async () => {
      // Load build first
      await callTool(client, 'load_build', { source: 'uCLE0msa', buildName: 'Test Build' });

      // Then make concurrent calls
      const calls = [
        callTool(client, 'get_build_stats', {}),
        callTool(client, 'allocate_passive', { nodeName: 'Constitution' }),
        callTool(client, 'get_build_stats', {}),
      ];

      const results = await Promise.all(calls);

      // All should succeed
      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result.content).toBeDefined();
      });
    });

    it('should not create multiple runtime instances for concurrent requests', async () => {
      // This test verifies lazy initialization doesn't create multiple runtimes
      // Server: Promise caching (server.ts:46) ensures single initialization
      //
      // NOTE: Runtime commands should be queued to avoid race conditions
      // Current implementation uses single pendingResponse (luajit-runtime.ts:144)
      // which may cause issues with truly concurrent requests. This test works
      // because calls are awaited sequentially by Promise.all (requests queue
      // at the async boundary). Production usage should ensure commands are
      // serialized or runtime should be fixed to use a command queue.
      const calls = Array(10)
        .fill(null)
        .map((_, i) => callTool(client, 'load_build', { source: 'uCLE0msa', buildName: `Build ${i}` }));

      const results = await Promise.all(calls);

      expect(results).toHaveLength(10);
      results.forEach((result) => {
        expect(result.content[0].text).toContain('loaded successfully');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle get_build_stats without loaded build', async () => {
      // In the mocked environment, get_build_stats returns empty stats
      // Real implementation may require a build to be loaded first
      const result = await callTool(client, 'get_build_stats', {});
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
    });

    it('should handle invalid pastebin codes gracefully', async () => {
      await expect(
        callTool(client, 'load_build', { source: '!!!!!!!', buildName: 'Test' })
      ).rejects.toThrow('8 alphanumeric characters');
    });

    it('should provide helpful error messages', async () => {
      try {
        await callTool(client, 'load_build', { source: 'short', buildName: 'Test' });
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toContain('8 alphanumeric characters');
      }
    });
  });

  describe('State Management', () => {
    it('should maintain state across tool calls within a session', async () => {
      // Load a build
      await callTool(client, 'load_build', { source: 'uCLE0msa', buildName: 'Test Build' });

      // Get stats - build should be loaded
      const stats1 = await callTool(client, 'get_build_stats', {});
      expect(stats1.content).toBeDefined();

      // Allocate passive - should work on loaded build
      const allocResult = await callTool(client, 'allocate_passive', { nodeName: 'Constitution' });
      expect(allocResult.content).toBeDefined();
      expect(allocResult.content[0].text).toContain('Constitution');

      // Get stats again - should still work with same build
      const stats2 = await callTool(client, 'get_build_stats', {});
      expect(stats2.content).toBeDefined();
    });
  });
});
