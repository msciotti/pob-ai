declare module 'fengari' {
  export const lua: any;
  export const lauxlib: any;
  export const lualib: any;
  export function to_jsstring(value: any): string;
  export function to_luastring(value: string): any;
}
