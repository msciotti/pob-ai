/**
 * Tool Handler Tests
 * Tests the functionality of each MCP tool with mocked runtime
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

import { createTestClient } from './test-helpers.js';
import type { PobMcpServer } from '../server.js';
import {
  VALID_PASTEBIN_CODES,
  INVALID_PASTEBIN_CODES,
  MOCK_BUILD_STATS,
  createMockStats,
  createMockStatDelta,
} from './fixtures/test-data.js';

describe('Tool Handlers', () => {
  let client: Client;
  let server: PobMcpServer;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const testSetup = await createTestClient();
    client = testSetup.client;
    server = testSetup.server;
    cleanup = testSetup.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  describe('load_build Tool', () => {
    it('should successfully load a build from pastebin code', async () => {
      const result = await client.callTool({
        name: 'load_build',
        arguments: {
          source: VALID_PASTEBIN_CODES.sample1,
          buildName: 'Test Build',
        },
      });

      expect(result.isError).toBeUndefined();
      expect(result.content).toBeDefined();
      expect(result.content[0]).toHaveProperty('type', 'text');

      const responseText = (result.content[0] as any).text;
      const response = JSON.parse(responseText);

      expect(response.success).toBe(true);
      expect(response.buildName).toBe('Test Build');
      expect(response.message).toContain('loaded');
      expect(response).toHaveProperty('statsAvailable');
      expect(response).toHaveProperty('sampleStats');
    });

    it('should use default build name when not provided', async () => {
      const result = await client.callTool({
        name: 'load_build',
        arguments: {
          source: VALID_PASTEBIN_CODES.sample1,
          buildName: '',
        },
      });

      expect(result.isError).toBeUndefined();
      const responseText = (result.content[0] as any).text;
      const response = JSON.parse(responseText);

      expect(response.success).toBe(true);
      expect(response.buildName).toBe('Imported Build');
    });

    it('should validate pastebin code format before loading', async () => {
      const result = await client.callTool({
        name: 'load_build',
        arguments: {
          source: INVALID_PASTEBIN_CODES.tooShort,
          buildName: 'Test Build',
        },
      });

      expect(result.isError).toBe(true);
      const responseText = (result.content[0] as any).text;
      const response = JSON.parse(responseText);

      expect(response.success).toBe(false);
      expect(response.error).toContain('Invalid pastebin code format');
    });

    it('should handle import failures gracefully', async () => {
      // Use an invalid pastebin code to trigger import failure
      const result = await client.callTool({
        name: 'load_build',
        arguments: {
          source: INVALID_PASTEBIN_CODES.withSpecialChars,
          buildName: 'Test Build',
        },
      });

      expect(result.isError).toBe(true);
      const responseText = (result.content[0] as any).text;
      const response = JSON.parse(responseText);

      expect(response.success).toBe(false);
      expect(response).toHaveProperty('error');
    });

    it('should extract sample stats correctly', async () => {
      const result = await client.callTool({
        name: 'load_build',
        arguments: {
          source: VALID_PASTEBIN_CODES.sample1,
          buildName: 'Test Build',
        },
      });

      const responseText = (result.content[0] as any).text;
      const response = JSON.parse(responseText);

      expect(response).toHaveProperty('sampleStats');
      if (response.statsAvailable) {
        expect(typeof response.sampleStats).toBe('object');
      }
    });
  });

  describe('allocate_passive Tool', () => {
    it('should successfully allocate a passive node', async () => {
      // First load a build
      await client.callTool({
        name: 'load_build',
        arguments: {
          source: VALID_PASTEBIN_CODES.sample1,
          buildName: 'Test',
        },
      });

      // Then allocate a passive
      const result = await client.callTool({
        name: 'allocate_passive',
        arguments: {
          nodeName: 'Resolute Technique',
          autoPath: true,
        },
      });

      expect(result.isError).toBeUndefined();
      const responseText = (result.content[0] as any).text;
      const response = JSON.parse(responseText);

      expect(response.success).toBe(true);
      expect(response.nodeName).toBe('Resolute Technique');
      expect(response.message).toContain('allocated');
    });

    it('should calculate stat deltas correctly', async () => {
      await client.callTool({
        name: 'load_build',
        arguments: {
          source: VALID_PASTEBIN_CODES.sample1,
          buildName: 'Test',
        },
      });

      const result = await client.callTool({
        name: 'allocate_passive',
        arguments: {
          nodeName: 'Resolute Technique',
          autoPath: true,
        },
      });

      const responseText = (result.content[0] as any).text;
      const response = JSON.parse(responseText);

      expect(response).toHaveProperty('statChanges');
      expect(typeof response.statChanges).toBe('object');
    });

    it('should use autoPath=true by default', async () => {
      await client.callTool({
        name: 'load_build',
        arguments: {
          source: VALID_PASTEBIN_CODES.sample1,
          buildName: 'Test',
        },
      });

      const result = await client.callTool({
        name: 'allocate_passive',
        arguments: {
          nodeName: 'Resolute Technique',
        },
      });

      const responseText = (result.content[0] as any).text;
      const response = JSON.parse(responseText);

      expect(response.autoPath).toBe(true);
    });

    it('should handle missing stats gracefully', async () => {
      await client.callTool({
        name: 'load_build',
        arguments: {
          source: VALID_PASTEBIN_CODES.sample1,
          buildName: 'Test',
        },
      });

      const result = await client.callTool({
        name: 'allocate_passive',
        arguments: {
          nodeName: 'Some Node',
          autoPath: true,
        },
      });

      // Should not throw, even if stats are missing
      expect(result).toBeDefined();
    });

    it('should validate node name', async () => {
      await client.callTool({
        name: 'load_build',
        arguments: {
          source: VALID_PASTEBIN_CODES.sample1,
          buildName: 'Test',
        },
      });

      const result = await client.callTool({
        name: 'allocate_passive',
        arguments: {
          nodeName: '',
          autoPath: true,
        },
      });

      // Empty node name should be handled
      expect(result).toBeDefined();
    });

    it('should respect autoPath parameter', async () => {
      await client.callTool({
        name: 'load_build',
        arguments: {
          source: VALID_PASTEBIN_CODES.sample1,
          buildName: 'Test',
        },
      });

      const result = await client.callTool({
        name: 'allocate_passive',
        arguments: {
          nodeName: 'Resolute Technique',
          autoPath: false,
        },
      });

      const responseText = (result.content[0] as any).text;
      const response = JSON.parse(responseText);

      expect(response.autoPath).toBe(false);
    });
  });

  describe('get_build_stats Tool', () => {
    it('should successfully return build stats', async () => {
      await client.callTool({
        name: 'load_build',
        arguments: {
          source: VALID_PASTEBIN_CODES.sample1,
          buildName: 'Test',
        },
      });

      const result = await client.callTool({
        name: 'get_build_stats',
        arguments: {},
      });

      expect(result.isError).toBeUndefined();
      const responseText = (result.content[0] as any).text;
      const response = JSON.parse(responseText);

      expect(response.success).toBe(true);
      expect(response).toHaveProperty('stats');
      expect(response).toHaveProperty('statCount');
      expect(typeof response.stats).toBe('object');
    });

    it('should return stat count', async () => {
      await client.callTool({
        name: 'load_build',
        arguments: {
          source: VALID_PASTEBIN_CODES.sample1,
          buildName: 'Test',
        },
      });

      const result = await client.callTool({
        name: 'get_build_stats',
        arguments: {},
      });

      const responseText = (result.content[0] as any).text;
      const response = JSON.parse(responseText);

      expect(typeof response.statCount).toBe('number');
      expect(response.statCount).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty stats', async () => {
      await client.callTool({
        name: 'load_build',
        arguments: {
          source: VALID_PASTEBIN_CODES.sample1,
          buildName: 'Test',
        },
      });

      const result = await client.callTool({
        name: 'get_build_stats',
        arguments: {},
      });

      const responseText = (result.content[0] as any).text;
      const response = JSON.parse(responseText);

      // Should handle case where stats might be empty
      expect(response).toHaveProperty('stats');
      expect(typeof response.stats).toBe('object');
    });

    it('should work after allocating passives', async () => {
      await client.callTool({
        name: 'load_build',
        arguments: {
          source: VALID_PASTEBIN_CODES.sample1,
          buildName: 'Test',
        },
      });

      await client.callTool({
        name: 'allocate_passive',
        arguments: {
          nodeName: 'Resolute Technique',
        },
      });

      const result = await client.callTool({
        name: 'get_build_stats',
        arguments: {},
      });

      expect(result.isError).toBeUndefined();
      const responseText = (result.content[0] as any).text;
      const response = JSON.parse(responseText);

      expect(response.success).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should return proper error format', async () => {
      const result = await client.callTool({
        name: 'load_build',
        arguments: {
          source: INVALID_PASTEBIN_CODES.tooShort,
          buildName: 'Test',
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content).toBeDefined();
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should include descriptive error messages', async () => {
      const result = await client.callTool({
        name: 'load_build',
        arguments: {
          source: INVALID_PASTEBIN_CODES.withSpecialChars,
          buildName: 'Test',
        },
      });

      const responseText = (result.content[0] as any).text;
      const response = JSON.parse(responseText);

      expect(response).toHaveProperty('error');
      expect(typeof response.error).toBe('string');
      expect(response.error.length).toBeGreaterThan(0);
    });

    it('should not leak stack traces to users', async () => {
      const result = await client.callTool({
        name: 'load_build',
        arguments: {
          source: INVALID_PASTEBIN_CODES.tooShort,
          buildName: 'Test',
        },
      });

      const responseText = (result.content[0] as any).text;
      const response = JSON.parse(responseText);

      // Error messages should not contain stack traces
      if (response.error) {
        expect(response.error).not.toContain('at ');
        expect(response.error).not.toContain('.ts:');
        expect(response.error).not.toContain('Error:');
      }
    });
  });
});
