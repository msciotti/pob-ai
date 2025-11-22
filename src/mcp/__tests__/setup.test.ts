/**
 * Setup smoke test
 * Verifies that the test infrastructure is properly configured
 */
import { describe, it, expect } from 'vitest';

describe('Test Setup', () => {
  it('should run tests', () => {
    expect(true).toBe(true);
  });

  it('should support basic assertions', () => {
    const value = 42;
    expect(value).toBe(42);
    expect(value).toBeGreaterThan(40);
    expect(value).toBeLessThan(50);
  });

  it('should support async tests', async () => {
    const result = await Promise.resolve('success');
    expect(result).toBe('success');
  });

  it('should support object matchers', () => {
    const obj = { name: 'test', value: 123 };
    expect(obj).toHaveProperty('name');
    expect(obj).toHaveProperty('value', 123);
  });
});
