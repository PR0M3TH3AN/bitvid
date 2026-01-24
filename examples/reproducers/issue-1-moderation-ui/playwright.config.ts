import { defineConfig } from "@playwright/test";
import baseConfig from "../../../playwright.config.ts";

export default defineConfig({
  ...baseConfig,
  testDir: ".",
  projects: [
    {
      name: "repro",
      testMatch: "**/*.spec.ts",
    },
  ],
});
