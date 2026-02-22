import { defineConfig } from "@playwright/test";
import path from "node:path";

const HOST = process.env.PLAYWRIGHT_HOST ?? "127.0.0.1";
const PORT = Number.parseInt(process.env.PLAYWRIGHT_PORT ?? "4173", 10);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://${HOST}:${PORT}`;
const ENABLE_EXTENSION_E2E = process.env.PLAYWRIGHT_ENABLE_EXTENSION_E2E === "1";
const EXTENSION_PATH = process.env.PLAYWRIGHT_EXTENSION_PATH
  ? path.resolve(process.env.PLAYWRIGHT_EXTENSION_PATH)
  : "";

const projects = [
  {
    name: "visual",
    testMatch: "visual/**/*.spec.ts",
    use: {
      screenshot: "only-on-failure",
      trace: "retain-on-failure",
      video: "retain-on-failure",
    },
  },
  {
    name: "e2e",
    testMatch: "e2e/**/*.spec.ts",
    use: {
      browserName: "chromium",
    },
  },
  {
    name: "e2e-firefox",
    testMatch: "e2e/**/*.spec.ts",
    use: {
      browserName: "firefox",
    },
  },
];

if (ENABLE_EXTENSION_E2E && EXTENSION_PATH) {
  projects.push({
    name: "e2e-nip07-extension",
    testMatch: "e2e-extension/**/*.spec.ts",
    use: {
      browserName: "chromium",
    },
  });
}

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./tests/e2e/helpers/playwrightCoverageGlobalSetup.ts",
  outputDir: "artifacts/test-results",
  timeout: 60_000,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
  },
  projects,
  webServer: {
    command: `npx http-server . -p ${PORT} -a ${HOST} -c-1 --silent`,
    url: `${BASE_URL}/docs/kitchen-sink.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
