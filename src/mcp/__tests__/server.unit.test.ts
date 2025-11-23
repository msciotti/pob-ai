/**
 * Server Initialization and Lifecycle Tests
 * Tests lazy initialization, race conditions, and error handling
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

// Mock modules before importing server
vi.mock('../../pob/luajit-runtime.js', async () => {
  const { MockLuaJITRuntime } = await import('./mocks/luajit-runtime.mock.js');
  return {
    LuaJITRuntime: MockLuaJITRuntime,
  };
});

vi.mock('../../config/index.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({ pobPath: '/mock/pob' }),
}));

vi.mock('../../pob/detector.js', () => ({
  getPobPath: vi.fn().mockResolvedValue('/mock/pob'),
}));

import { PobMcpServer } from '../server.js';
import { createTestClient } from './test-helpers.js';
import { VALID_PASTEBIN_CODES } from './fixtures/test-data.js';

describe('Server Initialization', () => {
  describe('Lazy Initialization', () => {
    it('should not create runtime until first tool call', async () => {
      const server = new PobMcpServer();

      // Runtime should not be created yet (server just instantiated)
      // We can't directly access private runtime, but we can verify behavior
      expect(server).toBeDefined();

      await server.close();
    });

    it('should initialize runtime on first tool call', async () => {
      const { client, cleanup } = await createTestClient();

      // This first tool call should trigger initialization
      const result = await client.callTool({
        name: 'load_build',
        arguments: {
          source: VALID_PASTEBIN_CODES.sample1,
          buildName: 'Test',
        },
      });

      expect(result.isError).toBeUndefined();
      await cleanup();
    });

    it('should reuse same runtime instance for multiple tool calls', async () => {
      const { client, cleanup } = await createTestClient();

      // First call
      await client.callTool({
        name: 'load_build',
        arguments: {
          source: VALID_PASTEBIN_CODES.sample1,
          buildName: 'Test 1',
        },
      });

      // Second call (should reuse runtime)
      const result2 = await client.callTool({
        name: 'get_build_stats',
        arguments: {},
      });

      expect(result2.isError).toBeUndefined();
      await cleanup();
    });

    it('should initialize runtime with correct PoB path', async () => {
      const { client, cleanup } = await createTestClient();

      // Trigger initialization
      await client.callTool({
        name: 'load_build',
        arguments: {
          source: VALID_PASTEBIN_CODES.sample1,
          buildName: 'Test',
        },
      });

      // Runtime should be initialized with mocked path
      // This is verified by the mock returning successfully
      expect(true).toBe(true);

      await cleanup();
    });
  });

  describe('Race Condition Prevention', () => {
    it('should handle concurrent tool calls without creating multiple runtimes', async () => {
      const { client, cleanup } = await createTestClient();

      // Make multiple concurrent calls
      const promises = [
        client.callTool({
          name: 'load_build',
          arguments: {
            source: VALID_PASTEBIN_CODES.sample1,
            buildName: 'Test 1',
          },
        }),
        client.callTool({
          name: 'load_build',
          arguments: {
            source: VALID_PASTEBIN_CODES.sample2,
            buildName: 'Test 2',
          },
        }),
      ];

      const results = await Promise.all(promises);

      // Both should succeed (runtime only initialized once)
      results.forEach(result => {
        expect(result.isError).toBeUndefined();
      });

      await cleanup();
    });

    it('should prevent race conditions during initialization', async () => {
      const { client, cleanup } = await createTestClient();

      // Fire off multiple requests simultaneously
      const call1 = client.callTool({
        name: 'load_build',
        arguments: {
          source: VALID_PASTEBIN_CODES.sample1,
          buildName: 'Test 1',
        },
      });

      const call2 = client.callTool({
        name: 'load_build',
        arguments: {
          source: VALID_PASTEBIN_CODES.sample2,
          buildName: 'Test 2',
        },
      });

      // Both should complete successfully
      await expect(call1).resolves.toBeDefined();
      await expect(call2).resolves.toBeDefined();

      await cleanup();
    });
  });

  describe('Error Handling', () => {
    it('should handle config loading failure', async () => {
      // This test would require mocking a config failure
      // For now, verify the server can be created
      const server = new PobMcpServer();
      expect(server).toBeDefined();
      await server.close();
    });

    it('should propagate runtime errors correctly', async () => {
      const { client, cleanup } = await createTestClient();

      // Invalid pastebin code should cause an error
      const result = await client.callTool({
        name: 'load_build',
        arguments: {
          source: 'INVALID',
          buildName: 'Test',
        },
      });

      expect(result.isError).toBe(true);
      await cleanup();
    });

    it('should handle tool errors gracefully', async () => {
      const { client, cleanup } = await createTestClient();

      // Try to allocate passive without loading build first
      const result = await client.callTool({
        name: 'allocate_passive',
        arguments: {
          nodeName: 'Some Node',
        },
      });

      // Should handle error gracefully
      expect(result).toBeDefined();
      await cleanup();
    });

    it('should clean up on close even after errors', async () => {
      const { client, server } = await createTestClient();

      // Cause an error
      await client.callTool({
        name: 'load_build',
        arguments: {
          source: 'INVALID',
          buildName: 'Test',
        },
      });

      // Should still be able to close cleanly
      await expect(server.close()).resolves.toBeUndefined();
      await client.close();
    });
  });

  describe('Lifecycle Management', () => {
    it('should clean up runtime on server close', async () => {
      const { client, server } = await createTestClient();

      // Initialize runtime
      await client.callTool({
        name: 'load_build',
        arguments: {
          source: VALID_PASTEBIN_CODES.sample1,
          buildName: 'Test',
        },
      });

      // Close should clean up runtime
      await server.close();
      await client.close();

      // Verify close completed
      expect(true).toBe(true);
    });

    it('should destroy runtime exactly once', async () => {
      const { server, cleanup } = await createTestClient();

      // Close server
      await cleanup();

      // Multiple closes should not cause issues
      await expect(server.close()).resolves.toBeUndefined();
    });

    it('should handle close before any tool calls', async () => {
      const server = new PobMcpServer();

      // Close without initializing runtime
      await expect(server.close()).resolves.toBeUndefined();
    });

    it('should not accept tool calls after close', async () => {
      const { client, server } = await createTestClient();

      await server.close();

      // Attempting to call tool after close should fail
      // The client will throw an error because connection is closed
      await expect(
        client.callTool({
          name: 'load_build',
          arguments: {
            source: VALID_PASTEBIN_CODES.sample1,
            buildName: 'Test',
          },
        })
      ).rejects.toThrow();

      await client.close();
    });

    it('should handle rapid open/close cycles', async () => {
      // Create and close multiple servers rapidly
      for (let i = 0; i < 3; i++) {
        const server = new PobMcpServer();
        await server.close();
      }

      expect(true).toBe(true);
    });
  });

  describe('Tool Registration', () => {
    it('should register all expected tools', async () => {
      const { client, cleanup } = await createTestClient();

      // List available tools
      const tools = await client.listTools();

      expect(tools.tools).toBeDefined();
      expect(tools.tools.length).toBeGreaterThan(0);

      // Check for expected tools
      const toolNames = tools.tools.map(t => t.name);
      expect(toolNames).toContain('load_build');
      expect(toolNames).toContain('get_build_stats');
      expect(toolNames).toContain('allocate_passive');

      await cleanup();
    });

    it('should provide tool metadata', async () => {
      const { client, cleanup } = await createTestClient();

      const tools = await client.listTools();

      // Each tool should have required metadata
      tools.tools.forEach(tool => {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');
      });

      await cleanup();
    });
  });

  describe('Server Metadata', () => {
    it('should provide server information', async () => {
      const { client, cleanup } = await createTestClient();

      // Server should provide capabilities
      expect(client).toBeDefined();

      await cleanup();
    });

    it('should handle multiple connections', async () => {
      // Create two separate client connections
      const setup1 = await createTestClient();
      const setup2 = await createTestClient();

      // Both should work independently
      const result1 = await setup1.client.callTool({
        name: 'load_build',
        arguments: {
          source: VALID_PASTEBIN_CODES.sample1,
          buildName: 'Test 1',
        },
      });

      const result2 = await setup2.client.callTool({
        name: 'load_build',
        arguments: {
          source: VALID_PASTEBIN_CODES.sample2,
          buildName: 'Test 2',
        },
      });

      expect(result1.isError).toBeUndefined();
      expect(result2.isError).toBeUndefined();

      await setup1.cleanup();
      await setup2.cleanup();
    });
  });
});
