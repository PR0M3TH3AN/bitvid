import { defineConfig } from "@playwright/test";

const HOST = process.env.PLAYWRIGHT_HOST ?? "127.0.0.1";
const PORT = Number.parseInt(process.env.PLAYWRIGHT_PORT ?? "4173", 10);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://${HOST}:${PORT}`;

export default defineConfig({
  testDir: "../../",
  outputDir: "../../artifacts/test-results-repro",
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: "repro",
      testMatch: "examples/reproducers/**/*.spec.ts",
    },
  ],
  webServer: {
    command: `npx http-server . -p ${PORT} -a ${HOST} -c-1 --silent`,
    cwd: "../../",
    url: `${BASE_URL}/docs/kitchen-sink.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
