import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  use: {
    baseURL: "http://127.0.0.1:4173",
  },
  webServer: {
    command: "npx http-server ../../.. -p 4173 -a 127.0.0.1 -c-1 --silent",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
