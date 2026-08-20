/**
 * Tests for detectSystemLuajit — the check that lets download-luajit.js skip
 * building from source (needs make/gcc) when a compatible system LuaJIT is
 * already on PATH (e.g. via `apt install luajit` / `brew install luajit`).
 */
import { describe, expect, it, vi } from 'vitest';
import { detectSystemLuajit } from './download-luajit.js';

describe('detectSystemLuajit', () => {
  it('returns the path and version when the candidate has working FFI', () => {
    const exec = vi.fn((cmd) => {
      if (cmd.includes('-v')) return 'LuaJIT 2.1.0-beta3 -- Copyright (C) 2005-2023 Mike Pall.';
      return 'POE_AI_LUAJIT_FFI_OK\n';
    });

    const result = detectSystemLuajit(['luajit'], exec);

    expect(result).toEqual({ path: 'luajit', version: 'LuaJIT 2.1.0-beta3 -- Copyright (C) 2005-2023 Mike Pall.' });
  });

  it('returns null when no candidate is found on PATH', () => {
    const exec = vi.fn(() => {
      throw new Error('command not found');
    });

    expect(detectSystemLuajit(['luajit'], exec)).toBeNull();
  });

  it('returns null when the candidate exists but lacks FFI (plain Lua, not LuaJIT)', () => {
    const exec = vi.fn((cmd) => {
      if (cmd.includes('-v')) return 'Lua 5.1.5';
      throw new Error("module 'ffi' not found");
    });

    expect(detectSystemLuajit(['luajit'], exec)).toBeNull();
  });

  it('falls through to the next candidate if the first is unusable', () => {
    const exec = vi.fn((cmd) => {
      if (cmd.startsWith('"luajit"')) throw new Error('not found');
      if (cmd.includes('-v')) return 'LuaJIT 2.1.1699908921';
      return 'POE_AI_LUAJIT_FFI_OK\n';
    });

    const result = detectSystemLuajit(['luajit', 'luajit-2.1'], exec);

    expect(result).toEqual({ path: 'luajit-2.1', version: 'LuaJIT 2.1.1699908921' });
  });
});
