import { Buffer } from "https://esm.sh/buffer@6.0.3?bundle";

const globalScope = typeof globalThis !== "undefined" ? globalThis : window;

if (globalScope && !globalScope.Buffer) {
  globalScope.Buffer = Buffer;
}

if (globalScope && !globalScope.global) {
  globalScope.global = globalScope;
}

if (globalScope && !globalScope.process) {
  globalScope.process = { env: {} };
}

export { Buffer };
