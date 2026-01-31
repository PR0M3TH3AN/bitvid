import { defineConfig } from "@playwright/test";
import baseConfig from "../../playwright.config.ts";

export default defineConfig({
  ...baseConfig,
  testDir: ".",
  webServer: {
    ...baseConfig.webServer,
    cwd: "../../",
  },
  projects: [
    {
      name: "repro",
      testMatch: "**/*.spec.ts",
      use: baseConfig.use,
    },
  ],
});
