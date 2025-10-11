import { defineConfig } from "@playwright/test";

const HOST = process.env.PLAYWRIGHT_HOST ?? "127.0.0.1";
const PORT = Number.parseInt(process.env.PLAYWRIGHT_PORT ?? "4173", 10);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://${HOST}:${PORT}`;

export default defineConfig({
  testDir: "./tests/visual",
  timeout: 60_000,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
  },
  webServer: {
    command: `npx http-server . -p ${PORT} -a ${HOST} -c-1 --silent`,
    url: `${BASE_URL}/docs/kitchen-sink.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
