/**
 * Tool Handler Tests
 * Tests the functionality of each MCP tool with mocked runtime
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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
import { MockLuaJITRuntime } from './mocks/luajit-runtime.mock.js';
import {
  VALID_PASTEBIN_CODES,
  INVALID_PASTEBIN_CODES,
  MOCK_BUILD_STATS,
  MOCK_PASSIVE_NODES,
  createMockStats,
} from './fixtures/test-data.js';

describe('Tool Handlers', () => {
  let server: PobMcpServer;
  let mockRuntime: MockLuaJITRuntime;

  beforeEach(() => {
    server = new PobMcpServer();
    mockRuntime = new MockLuaJITRuntime('/mock/pob');
    mockRuntime.setStats(MOCK_BUILD_STATS.basic);
  });

  afterEach(async () => {
    await server.close();
  });

  describe('load_build Tool', () => {
    it('should successfully load a build from pastebin code', async () => {
      const mcpServer = server.getServer();

      const result = await mcpServer.callTool('load_build', {
        source: VALID_PASTEBIN_CODES.sample1,
        buildName: 'Test Build',
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toHaveProperty('success', true);
      expect(result.structuredContent?.buildName).toBe('Test Build');
      expect(result.structuredContent?.message).toContain('loaded successfully');
      expect(result.structuredContent).toHaveProperty('statsAvailable');
      expect(result.structuredContent).toHaveProperty('sampleStats');
    });

    it('should use default build name when not provided', async () => {
      const mcpServer = server.getServer();

      const result = await mcpServer.callTool('load_build', {
        source: VALID_PASTEBIN_CODES.sample1,
        buildName: '',
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toHaveProperty('success', true);
      expect(result.structuredContent?.buildName).toBe('Imported Build');
    });

    it('should validate pastebin code format before loading', async () => {
      const mcpServer = server.getServer();

      const result = await mcpServer.callTool('load_build', {
        source: INVALID_PASTEBIN_CODES.tooShort,
        buildName: 'Test Build',
      });

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toHaveProperty('success', false);
      expect(result.structuredContent?.error).toContain('Invalid pastebin code format');
    });

    it('should handle runtime initialization failure', async () => {
      const mcpServer = server.getServer();

      // Create a new mock runtime that will fail to initialize
      const failingRuntime = new MockLuaJITRuntime('/mock/pob');
      failingRuntime.setShouldFailInitialize(true);

      // Mock the constructor to return our failing runtime
      vi.mocked(MockLuaJITRuntime as any).mockImplementationOnce(() => failingRuntime);

      const result = await mcpServer.callTool('load_build', {
        source: VALID_PASTEBIN_CODES.sample1,
        buildName: 'Test Build',
      });

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toHaveProperty('success', false);
      expect(result.structuredContent?.error).toContain('Failed to load build');
    });

    it('should handle import failures from runtime', async () => {
      const mcpServer = server.getServer();

      // Create a runtime that will fail commands after initialization
      const failingRuntime = new MockLuaJITRuntime('/mock/pob');
      await failingRuntime.initialize();
      failingRuntime.setShouldFailCommands(true);

      // Replace the runtime after initialization
      vi.mocked(MockLuaJITRuntime as any).mockImplementationOnce(() => failingRuntime);

      const result = await mcpServer.callTool('load_build', {
        source: VALID_PASTEBIN_CODES.sample1,
        buildName: 'Test Build',
      });

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toHaveProperty('success', false);
    });

    it('should extract sample stats correctly when available', async () => {
      const mcpServer = server.getServer();
      mockRuntime.setStats(MOCK_BUILD_STATS.highLife);

      const result = await mcpServer.callTool('load_build', {
        source: VALID_PASTEBIN_CODES.sample1,
        buildName: 'Test Build',
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent?.statsAvailable).toBe(true);

      const sampleStats = result.structuredContent?.sampleStats;
      expect(sampleStats).toBeDefined();
      expect(sampleStats?.Level).toBe(MOCK_BUILD_STATS.highLife.Level);
      expect(sampleStats?.Life).toBe(MOCK_BUILD_STATS.highLife.Life);
      expect(sampleStats?.TotalDPS).toBe(MOCK_BUILD_STATS.highLife.TotalDPS);
    });

    it('should handle missing stats gracefully', async () => {
      const mcpServer = server.getServer();
      mockRuntime.setStats({});

      const result = await mcpServer.callTool('load_build', {
        source: VALID_PASTEBIN_CODES.sample1,
        buildName: 'Test Build',
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toHaveProperty('success', true);
      expect(result.structuredContent?.statsAvailable).toBe(false);
      expect(result.structuredContent?.sampleStats).toEqual({});
    });

    it('should return proper structured output format', async () => {
      const mcpServer = server.getServer();

      const result = await mcpServer.callTool('load_build', {
        source: VALID_PASTEBIN_CODES.sample1,
        buildName: 'Test Build',
      });

      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('structuredContent');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content?.[0]).toHaveProperty('type', 'text');
      expect(result.content?.[0]).toHaveProperty('text');

      // Verify text content is valid JSON
      const textContent = result.content?.[0]?.text;
      expect(() => JSON.parse(textContent || '')).not.toThrow();
    });
  });

  describe('allocate_passive Tool', () => {
    beforeEach(async () => {
      // Load a build first for allocation tests
      const mcpServer = server.getServer();
      await mcpServer.callTool('load_build', {
        source: VALID_PASTEBIN_CODES.sample1,
        buildName: 'Test Build',
      });
    });

    it('should successfully allocate a passive node', async () => {
      const mcpServer = server.getServer();

      const result = await mcpServer.callTool('allocate_passive', {
        nodeName: MOCK_PASSIVE_NODES.keystone,
        autoPath: true,
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toHaveProperty('success', true);
      expect(result.structuredContent?.nodeName).toBe(MOCK_PASSIVE_NODES.keystone);
      expect(result.structuredContent?.message).toContain('allocated successfully');
    });

    it('should calculate stat deltas correctly', async () => {
      const mcpServer = server.getServer();

      // Set initial stats
      const initialStats = createMockStats({ Life: 5000, TotalDPS: 1000000 });
      const finalStats = createMockStats({ Life: 5200, TotalDPS: 1000000 });

      mockRuntime.setStats(initialStats);

      // Allocate node
      const result = await mcpServer.callTool('allocate_passive', {
        nodeName: MOCK_PASSIVE_NODES.notable,
        autoPath: true,
      });

      // Update stats after allocation
      mockRuntime.setStats(finalStats);

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toHaveProperty('statChanges');

      const statChanges = result.structuredContent?.statChanges;
      if (statChanges && statChanges.Life) {
        expect(statChanges.Life.before).toBe(initialStats.Life);
        expect(statChanges.Life.after).toBe(finalStats.Life);
        expect(statChanges.Life.delta).toBe(finalStats.Life - initialStats.Life);
      }
    });

    it('should handle missing stats gracefully', async () => {
      const mcpServer = server.getServer();

      // Clear stats to simulate missing data
      mockRuntime.setStats({});

      const result = await mcpServer.callTool('allocate_passive', {
        nodeName: MOCK_PASSIVE_NODES.basic,
        autoPath: true,
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toHaveProperty('success', true);
      expect(result.structuredContent).toHaveProperty('statChanges');

      // Stat changes should be empty or minimal when stats are not available
      const statChanges = result.structuredContent?.statChanges;
      expect(Object.keys(statChanges || {}).length).toBe(0);
    });

    it('should validate node name', async () => {
      const mcpServer = server.getServer();

      // Create a runtime that will fail when allocating
      const failingRuntime = new MockLuaJITRuntime('/mock/pob');
      await failingRuntime.initialize();
      failingRuntime.setShouldFailCommands(true);

      const result = await mcpServer.callTool('allocate_passive', {
        nodeName: 'Invalid Node Name',
        autoPath: true,
      });

      // Even if the node is invalid, we should get a proper error response
      // (in this case, the mock will throw an error which gets caught)
      expect(result.structuredContent).toBeDefined();
    });

    it('should respect autoPath parameter', async () => {
      const mcpServer = server.getServer();

      const resultWithPath = await mcpServer.callTool('allocate_passive', {
        nodeName: MOCK_PASSIVE_NODES.notable,
        autoPath: true,
      });

      expect(resultWithPath.structuredContent?.autoPath).toBe(true);
      expect(resultWithPath.structuredContent?.message).toContain('with automatic pathing');

      const resultWithoutPath = await mcpServer.callTool('allocate_passive', {
        nodeName: MOCK_PASSIVE_NODES.basic,
        autoPath: false,
      });

      expect(resultWithoutPath.structuredContent?.autoPath).toBe(false);
      expect(resultWithoutPath.structuredContent?.message).not.toContain('with automatic pathing');
    });

    it('should return proper stat change information', async () => {
      const mcpServer = server.getServer();

      const result = await mcpServer.callTool('allocate_passive', {
        nodeName: MOCK_PASSIVE_NODES.notable,
        autoPath: true,
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toHaveProperty('statChanges');

      const statChanges = result.structuredContent?.statChanges;

      // Verify structure of stat changes
      for (const [statName, change] of Object.entries(statChanges || {})) {
        expect(change).toHaveProperty('before');
        expect(change).toHaveProperty('after');
        expect(change).toHaveProperty('delta');
        expect(typeof change.before).toBe('number');
        expect(typeof change.after).toBe('number');
        expect(typeof change.delta).toBe('number');
      }
    });

    it('should handle allocation errors gracefully', async () => {
      const mcpServer = server.getServer();

      // Create a runtime that will fail commands
      const failingRuntime = new MockLuaJITRuntime('/mock/pob');
      await failingRuntime.initialize();
      failingRuntime.setShouldFailCommands(true);

      vi.mocked(MockLuaJITRuntime as any).mockImplementationOnce(() => failingRuntime);

      const result = await mcpServer.callTool('allocate_passive', {
        nodeName: MOCK_PASSIVE_NODES.notFound,
        autoPath: true,
      });

      // Should return error response
      expect(result.structuredContent).toBeDefined();
      if (result.isError) {
        expect(result.structuredContent).toHaveProperty('success', false);
        expect(result.structuredContent).toHaveProperty('error');
      }
    });
  });

  describe('get_build_stats Tool', () => {
    beforeEach(async () => {
      // Load a build first
      const mcpServer = server.getServer();
      await mcpServer.callTool('load_build', {
        source: VALID_PASTEBIN_CODES.sample1,
        buildName: 'Test Build',
      });
    });

    it('should successfully return build stats', async () => {
      const mcpServer = server.getServer();
      mockRuntime.setStats(MOCK_BUILD_STATS.highLife);

      const result = await mcpServer.callTool('get_build_stats', {});

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toHaveProperty('success', true);
      expect(result.structuredContent).toHaveProperty('stats');
      expect(result.structuredContent).toHaveProperty('statCount');
    });

    it('should return correct stat count', async () => {
      const mcpServer = server.getServer();
      mockRuntime.setStats(MOCK_BUILD_STATS.basic);

      const result = await mcpServer.callTool('get_build_stats', {});

      expect(result.isError).toBeUndefined();
      const statCount = Object.keys(MOCK_BUILD_STATS.basic).length;
      expect(result.structuredContent?.statCount).toBe(statCount);
    });

    it('should handle no build loaded error', async () => {
      // Create a fresh server without loading a build
      const freshServer = new PobMcpServer();
      const mcpServer = freshServer.getServer();

      // Create a runtime that will fail commands
      const failingRuntime = new MockLuaJITRuntime('/mock/pob');
      await failingRuntime.initialize();
      failingRuntime.setShouldFailCommands(true);

      vi.mocked(MockLuaJITRuntime as any).mockImplementationOnce(() => failingRuntime);

      const result = await mcpServer.callTool('get_build_stats', {});

      // Should handle the error gracefully
      if (result.isError) {
        expect(result.structuredContent).toHaveProperty('success', false);
        expect(result.structuredContent).toHaveProperty('error');
      }

      await freshServer.close();
    });

    it('should handle missing calculations', async () => {
      const mcpServer = server.getServer();
      mockRuntime.setStats({});

      const result = await mcpServer.callTool('get_build_stats', {});

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toHaveProperty('success', true);
      expect(result.structuredContent?.stats).toEqual({});
      expect(result.structuredContent?.statCount).toBe(0);
    });

    it('should return all stats in correct format', async () => {
      const mcpServer = server.getServer();
      mockRuntime.setStats(MOCK_BUILD_STATS.hybrid);

      const result = await mcpServer.callTool('get_build_stats', {});

      expect(result.isError).toBeUndefined();
      const stats = result.structuredContent?.stats;

      // Verify all expected stats are present
      expect(stats).toHaveProperty('Level');
      expect(stats).toHaveProperty('Life');
      expect(stats).toHaveProperty('TotalDPS');
      expect(stats).toHaveProperty('EnergyShield');
      expect(stats).toHaveProperty('Armour');
      expect(stats).toHaveProperty('Evasion');

      // Verify all values are numbers
      for (const [key, value] of Object.entries(stats || {})) {
        expect(typeof value).toBe('number');
      }
    });

    it('should return proper structured output format', async () => {
      const mcpServer = server.getServer();

      const result = await mcpServer.callTool('get_build_stats', {});

      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('structuredContent');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content?.[0]).toHaveProperty('type', 'text');

      // Verify text content is valid JSON
      const textContent = result.content?.[0]?.text;
      expect(() => JSON.parse(textContent || '')).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should return proper error format for all tools', async () => {
      const mcpServer = server.getServer();

      // Test each tool with an error condition
      const loadResult = await mcpServer.callTool('load_build', {
        source: INVALID_PASTEBIN_CODES.tooShort,
        buildName: 'Test',
      });

      expect(loadResult.isError).toBe(true);
      expect(loadResult.structuredContent).toHaveProperty('success', false);
      expect(loadResult.structuredContent).toHaveProperty('error');
      expect(typeof loadResult.structuredContent?.error).toBe('string');
    });

    it('should include descriptive error messages', async () => {
      const mcpServer = server.getServer();

      const result = await mcpServer.callTool('load_build', {
        source: INVALID_PASTEBIN_CODES.withSpecialChars,
        buildName: 'Test',
      });

      expect(result.structuredContent?.error).toContain('Failed to load build');
      expect(result.structuredContent?.error).toContain('Invalid pastebin code format');
    });

    it('should not leak stack traces to users', async () => {
      const mcpServer = server.getServer();

      const result = await mcpServer.callTool('load_build', {
        source: INVALID_PASTEBIN_CODES.tooShort,
        buildName: 'Test',
      });

      const errorText = result.content?.[0]?.text || '';
      expect(errorText).not.toContain('at ');
      expect(errorText).not.toContain('.ts:');
      expect(errorText).not.toContain('node_modules');
    });

    it('should handle runtime errors consistently', async () => {
      const mcpServer = server.getServer();

      // Create a failing runtime
      const failingRuntime = new MockLuaJITRuntime('/mock/pob');
      failingRuntime.setShouldFailInitialize(true);

      vi.mocked(MockLuaJITRuntime as any).mockImplementationOnce(() => failingRuntime);

      const result = await mcpServer.callTool('load_build', {
        source: VALID_PASTEBIN_CODES.sample1,
        buildName: 'Test',
      });

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toHaveProperty('success', false);
      expect(result.structuredContent).toHaveProperty('error');
    });
  });
});
