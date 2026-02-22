import { test as base, expect, chromium, type BrowserContext, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

type PersistentExtensionFixtures = {
  persistentContext: BrowserContext;
  extensionPath: string;
  extensionUserDataDir: string;
};

export const test = base.extend<PersistentExtensionFixtures>({
  extensionPath: [
    async ({}, use) => {
      const rawPath = process.env.PLAYWRIGHT_EXTENSION_PATH || "";
      const resolved = rawPath ? path.resolve(rawPath) : "";
      if (!resolved) {
        throw new Error(
          "PLAYWRIGHT_EXTENSION_PATH is required for extension E2E tests.",
        );
      }
      await use(resolved);
    },
    { scope: "worker" },
  ],

  extensionUserDataDir: [
    async ({}, use, testInfo) => {
      const provided = process.env.PLAYWRIGHT_EXTENSION_USER_DATA_DIR || "";
      if (provided.trim()) {
        await use(path.resolve(provided.trim()));
        return;
      }

      const dir = await fs.mkdtemp(
        path.join(
          os.tmpdir(),
          `bitvid-playwright-extension-${testInfo.workerIndex}-`,
        ),
      );
      try {
        await use(dir);
      } finally {
        await fs.rm(dir, { recursive: true, force: true });
      }
    },
    { scope: "worker" },
  ],

  persistentContext: [
    async ({ extensionPath, extensionUserDataDir }, use) => {
      const context = await chromium.launchPersistentContext(
        extensionUserDataDir,
        {
          headless: false,
          viewport: { width: 1280, height: 720 },
          args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`,
          ],
        },
      );

      try {
        await use(context);
      } finally {
        await context.close();
      }
    },
    { scope: "worker" },
  ],

  context: async ({ persistentContext }, use) => {
    await use(persistentContext);
  },

  page: async ({ persistentContext, baseURL }, use) => {
    const existing = persistentContext.pages()[0] || null;
    const page = existing || (await persistentContext.newPage());
    if (baseURL) {
      await page.goto(baseURL);
    }
    await use(page);
  },
});

export { expect };

