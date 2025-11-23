/**
 * Schema Validation Tests
 * Tests input validation for pastebin codes and tool parameters
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

import { createTestClient } from './test-helpers.js';
import { MockLuaJITRuntime } from './mocks/luajit-runtime.mock.js';
import { VALID_PASTEBIN_CODES, INVALID_PASTEBIN_CODES, MOCK_BUILD_STATS } from './fixtures/test-data.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

describe('Schema Validation', () => {
  let client: Client;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const testSetup = await createTestClient();
    client = testSetup.client;
    cleanup = testSetup.cleanup;

    // Set up mock runtime with stats
    const mockRuntime = new MockLuaJITRuntime('/mock/pob');
    mockRuntime.setStats(MOCK_BUILD_STATS.basic);
  });

  afterEach(async () => {
    await cleanup();
  });

  describe('Pastebin Code Validation', () => {
    it('should accept valid 8-character alphanumeric pastebin codes', async () => {
      const result = await client.callTool({
        name: 'load_build',
        arguments: {
          source: VALID_PASTEBIN_CODES.sample1,
          buildName: 'Test Build',
        },
      });

      expect(result.content).toBeDefined();
      expect(result.isError).toBeUndefined();
    });

    it('should reject pastebin code that is too short', async () => {
      const result = await client.callTool({
        name: 'load_build',
        arguments: {
          source: INVALID_PASTEBIN_CODES.tooShort,
          buildName: 'Test Build',
        },
      });

      expect(result.isError).toBe(true);
      const errorText = result.content[0]?.text || '';
      expect(errorText).toContain('Invalid pastebin code format');
      expect(errorText).toContain('8 alphanumeric characters');
    });

    it('should reject pastebin code that is too long', async () => {
      const result = await client.callTool({
        name: 'load_build',
        arguments: {
          source: INVALID_PASTEBIN_CODES.tooLong,
          buildName: 'Test Build',
        },
      });

      expect(result.isError).toBe(true);
      const errorText = result.content[0]?.text || '';
      expect(errorText).toContain('Invalid pastebin code format');
    });

    it('should reject pastebin code with special characters', async () => {
      const result = await client.callTool({
        name: 'load_build',
        arguments: {
          source: INVALID_PASTEBIN_CODES.withSpecialChars,
          buildName: 'Test Build',
        },
      });

      expect(result.isError).toBe(true);
      const errorText = result.content[0]?.text || '';
      expect(errorText).toContain('Invalid pastebin code format');
    });

    it('should reject pastebin code with spaces', async () => {
      const result = await client.callTool({
        name: 'load_build',
        arguments: {
          source: INVALID_PASTEBIN_CODES.withSpaces,
          buildName: 'Test Build',
        },
      });

      expect(result.isError).toBe(true);
      const errorText = result.content[0]?.text || '';
      expect(errorText).toContain('Invalid pastebin code format');
    });

    it('should reject pastebin code with underscores', async () => {
      const result = await client.callTool({
        name: 'load_build',
        arguments: {
          source: INVALID_PASTEBIN_CODES.withUnderscores,
          buildName: 'Test Build',
        },
      });

      expect(result.isError).toBe(true);
      const errorText = result.content[0]?.text || '';
      expect(errorText).toContain('Invalid pastebin code format');
    });

    it('should reject empty pastebin code', async () => {
      const result = await client.callTool({
        name: 'load_build',
        arguments: {
          source: INVALID_PASTEBIN_CODES.empty,
          buildName: 'Test Build',
        },
      });

      expect(result.isError).toBe(true);
      const errorText = result.content[0]?.text || '';
      expect(errorText).toContain('Invalid pastebin code format');
    });
  });

  describe('allocate_passive Parameter Validation', () => {
    beforeEach(async () => {
      // Load a build first
      await client.callTool({
        name: 'load_build',
        arguments: {
          source: VALID_PASTEBIN_CODES.sample1,
          buildName: 'Test Build',
        },
      });
    });

    it('should use default autoPath value of true when not specified', async () => {
      const result = await client.callTool({
        name: 'allocate_passive',
        arguments: {
          nodeName: 'Test Node',
        },
      });

      expect(result.isError).toBeUndefined();
      const output = JSON.parse(result.content[0]?.text || '{}');
      expect(output.autoPath).toBe(true);
    });

    it('should accept explicit autoPath value of true', async () => {
      const result = await client.callTool({
        name: 'allocate_passive',
        arguments: {
          nodeName: 'Test Node',
          autoPath: true,
        },
      });

      expect(result.isError).toBeUndefined();
      const output = JSON.parse(result.content[0]?.text || '{}');
      expect(output.autoPath).toBe(true);
      expect(output.message).toContain('with automatic pathing');
    });

    it('should accept explicit autoPath value of false', async () => {
      const result = await client.callTool({
        name: 'allocate_passive',
        arguments: {
          nodeName: 'Test Node',
          autoPath: false,
        },
      });

      expect(result.isError).toBeUndefined();
      const output = JSON.parse(result.content[0]?.text || '{}');
      expect(output.autoPath).toBe(false);
      expect(output.message).not.toContain('with automatic pathing');
    });
  });

  describe('Output Schema Validation', () => {
    it('should return valid load_build success schema', async () => {
      const result = await client.callTool({
        name: 'load_build',
        arguments: {
          source: VALID_PASTEBIN_CODES.sample1,
          buildName: 'Test Build',
        },
      });

      expect(result.isError).toBeUndefined();
      const output = JSON.parse(result.content[0]?.text || '{}');

      expect(output).toHaveProperty('success');
      expect(output).toHaveProperty('message');
      expect(output).toHaveProperty('buildName');
      expect(output).toHaveProperty('statsAvailable');
      expect(output).toHaveProperty('sampleStats');

      expect(typeof output.success).toBe('boolean');
      expect(typeof output.message).toBe('string');
      expect(typeof output.buildName).toBe('string');
      expect(typeof output.statsAvailable).toBe('boolean');
      expect(typeof output.sampleStats).toBe('object');
    });

    it('should return valid load_build error schema', async () => {
      const result = await client.callTool({
        name: 'load_build',
        arguments: {
          source: INVALID_PASTEBIN_CODES.tooShort,
          buildName: 'Test Build',
        },
      });

      expect(result.isError).toBe(true);
      const output = JSON.parse(result.content[0]?.text || '{}');

      expect(output).toHaveProperty('success', false);
      expect(output).toHaveProperty('error');
      expect(typeof output.error).toBe('string');
    });

    it('should return valid get_build_stats success schema', async () => {
      // Load a build first
      await client.callTool({
        name: 'load_build',
        arguments: {
          source: VALID_PASTEBIN_CODES.sample1,
          buildName: 'Test Build',
        },
      });

      const result = await client.callTool({
        name: 'get_build_stats',
        arguments: {},
      });

      expect(result.isError).toBeUndefined();
      const output = JSON.parse(result.content[0]?.text || '{}');

      expect(output).toHaveProperty('success');
      expect(output).toHaveProperty('stats');
      expect(output).toHaveProperty('statCount');

      expect(typeof output.success).toBe('boolean');
      expect(typeof output.stats).toBe('object');
      expect(typeof output.statCount).toBe('number');
    });

    it('should return valid allocate_passive success schema', async () => {
      // Load a build first
      await client.callTool({
        name: 'load_build',
        arguments: {
          source: VALID_PASTEBIN_CODES.sample1,
          buildName: 'Test Build',
        },
      });

      const result = await client.callTool({
        name: 'allocate_passive',
        arguments: {
          nodeName: 'Test Node',
          autoPath: true,
        },
      });

      expect(result.isError).toBeUndefined();
      const output = JSON.parse(result.content[0]?.text || '{}');

      expect(output).toHaveProperty('success');
      expect(output).toHaveProperty('message');
      expect(output).toHaveProperty('nodeName');
      expect(output).toHaveProperty('autoPath');
      expect(output).toHaveProperty('statChanges');

      expect(typeof output.success).toBe('boolean');
      expect(typeof output.message).toBe('string');
      expect(typeof output.nodeName).toBe('string');
      expect(typeof output.autoPath).toBe('boolean');
      expect(typeof output.statChanges).toBe('object');
    });

    it('should include stat change details with correct structure', async () => {
      // Load a build first
      await client.callTool({
        name: 'load_build',
        arguments: {
          source: VALID_PASTEBIN_CODES.sample1,
          buildName: 'Test Build',
        },
      });

      const result = await client.callTool({
        name: 'allocate_passive',
        arguments: {
          nodeName: 'Test Node',
          autoPath: true,
        },
      });

      expect(result.isError).toBeUndefined();
      const output = JSON.parse(result.content[0]?.text || '{}');
      const statChanges = output.statChanges;

      // Each stat change should have before, after, and delta
      for (const [_statName, change] of Object.entries(statChanges || {})) {
        const c = change as any;
        expect(c).toHaveProperty('before');
        expect(c).toHaveProperty('after');
        expect(c).toHaveProperty('delta');

        expect(typeof c.before).toBe('number');
        expect(typeof c.after).toBe('number');
        expect(typeof c.delta).toBe('number');

        // Delta should be correctly calculated
        expect(c.delta).toBe(c.after - c.before);
      }
    });
  });

  describe('Error Response Format', () => {
    it('should return consistent error format across all tools', async () => {
      const result = await client.callTool({
        name: 'load_build',
        arguments: {
          source: INVALID_PASTEBIN_CODES.tooShort,
          buildName: 'Test',
        },
      });

      expect(result.isError).toBe(true);
      const output = JSON.parse(result.content[0]?.text || '{}');

      expect(output).toHaveProperty('success', false);
      expect(output).toHaveProperty('error');
      expect(output.error).toMatch(/^Failed to load build:/);
    });

    it('should not expose stack traces in error messages', async () => {
      const result = await client.callTool({
        name: 'load_build',
        arguments: {
          source: INVALID_PASTEBIN_CODES.tooShort,
          buildName: 'Test',
        },
      });

      const errorText = result.content[0]?.text || '';
      expect(errorText).not.toContain('at ');
      expect(errorText).not.toContain('.js:');
      expect(errorText).not.toContain('.ts:');
    });

    it('should provide descriptive error messages', async () => {
      const result = await client.callTool({
        name: 'load_build',
        arguments: {
          source: INVALID_PASTEBIN_CODES.withSpecialChars,
          buildName: 'Test',
        },
      });

      const output = JSON.parse(result.content[0]?.text || '{}');
      expect(output.error).toContain('Invalid pastebin code format');
      expect(output.error).toContain('8 alphanumeric characters');
      expect(output.error).toContain('uCLE0msa');
    });
  });
});
