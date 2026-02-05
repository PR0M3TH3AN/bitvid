import { defineConfig } from "@playwright/test";

const HOST = "127.0.0.1";
const PORT = 4173;
const BASE_URL = `http://${HOST}:${PORT}`;

export default defineConfig({
  testDir: "./tests",
  outputDir: "artifacts/test-results-bench",
  timeout: 60_000,
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: "benchmark",
      testMatch: "**/*.spec.mjs",
    },
  ],
  webServer: {
    command: `npx http-server . -p ${PORT} -a ${HOST} -c-1 --silent`,
    url: `${BASE_URL}/docs/kitchen-sink.html`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
