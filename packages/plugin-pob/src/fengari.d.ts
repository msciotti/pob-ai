// Minimal type shim for 'fengari' — the package ships no .d.ts files.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module 'fengari' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lua: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lauxlib: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lualib: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function to_jsstring(s: any): string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function to_luastring(s: string): any;
}
