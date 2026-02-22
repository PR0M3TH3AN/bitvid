#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

function resolveEnvPath(value) {
  if (typeof value !== "string" || !value.trim()) {
    return "";
  }
  return path.resolve(value.trim());
}

const extensionPath = resolveEnvPath(process.env.PLAYWRIGHT_EXTENSION_PATH || "");
if (!extensionPath) {
  console.error(
    "PLAYWRIGHT_EXTENSION_PATH is required. Example:\n" +
      "PLAYWRIGHT_EXTENSION_PATH=/abs/path/to/extension npm run test:e2e:extension",
  );
  process.exit(1);
}

const extraArgs = process.argv.slice(2);
const testArgs = [
  "playwright",
  "test",
  "tests/e2e-extension",
  "--project=e2e-nip07-extension",
  ...extraArgs,
];

const child = spawn("npx", testArgs, {
  stdio: "inherit",
  shell: false,
  env: {
    ...process.env,
    PLAYWRIGHT_ENABLE_EXTENSION_E2E: "1",
    PLAYWRIGHT_EXTENSION_PATH: extensionPath,
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

