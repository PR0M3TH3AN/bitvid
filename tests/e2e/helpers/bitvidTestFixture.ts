/**
 * Playwright test fixture for bitvid agent testing.
 *
 * Provides:
 * - Local mock relay with HTTP seeding API
 * - Programmatic login via the test harness
 * - Test data seeding helpers
 * - App state inspection utilities
 *
 * Usage:
 *   import { test, expect } from './helpers/bitvidTestFixture';
 *
 *   test('can publish a video', async ({ page, relay, seedEvent, loginAs }) => {
 *     await loginAs(page);
 *     // ... interact with the app
 *   });
 */

import { test as base, expect, type Page } from "@playwright/test";
import { startRelay } from "../../../scripts/agent/simple-relay.mjs";
import { finalizeEvent, getPublicKey } from "nostr-tools";
import { WebSocket } from "ws";
import { attachCoverageAndConsoleCapture } from "./playwrightCoverageInstrumentation";

// Polyfill WebSocket for node environment
if (!global.WebSocket) {
  (global as any).WebSocket = WebSocket;
}

// Fixed test key for deterministic testing.
// This is a throwaway key used only in test environments.
const TEST_PRIVATE_KEY_HEX =
  "7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b";
const TEST_SK = Uint8Array.from(Buffer.from(TEST_PRIVATE_KEY_HEX, "hex"));
const TEST_PK = getPublicKey(TEST_SK);

const BASE_RELAY_PORT = 8877;

export interface TestVideoEvent {
  title: string;
  url?: string;
  magnet?: string;
  description?: string;
  dTag?: string;
}

/**
 * Create a signed Nostr video event (kind 30078) for test seeding.
 */
function createVideoEvent(video: TestVideoEvent) {
  const dTag = video.dTag || `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const contentObj: Record<string, unknown> = {
    version: 3,
    title: video.title,
    videoRootId: dTag,
    mode: "dev",
    isPrivate: false,
    deleted: false,
  };
  if (video.url) contentObj.url = video.url;
  if (video.magnet) contentObj.magnet = video.magnet;
  if (video.description) contentObj.description = video.description;

  const tags: string[][] = [
    ["d", dTag],
    ["t", "video"],
    ["title", video.title],
    ["s", `nostr:${dTag}`],
  ];
  if (video.url) tags.push(["url", video.url]);

  return finalizeEvent(
    {
      kind: 30078,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: JSON.stringify(contentObj),
      pubkey: TEST_PK,
    },
    TEST_SK,
  );
}

/**
 * Seed an event into the relay via HTTP API.
 */
async function seedEventViaHttp(event: any, httpUrl: string) {
  const resp = await fetch(`${httpUrl}/seed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });
  if (!resp.ok) {
    throw new Error(`Failed to seed event: ${resp.status} ${await resp.text()}`);
  }
  return resp.json();
}

/**
 * Clear all events from the relay.
 */
async function clearRelayEvents(httpUrl: string) {
  const resp = await fetch(`${httpUrl}/events`, { method: "DELETE" });
  if (!resp.ok) {
    throw new Error(`Failed to clear events: ${resp.status}`);
  }
}

/**
 * Navigate to bitvid with test mode and relay overrides enabled.
 */
async function gotoWithTestMode(page: Page, relayUrl: string, path = "/") {
  const separator = path.includes("?") ? "&" : "?";
  const testUrl = `${path}${separator}__test__=1&__testRelays__=${encodeURIComponent(relayUrl)}`;

  // Set up localStorage before navigation
  await page.addInitScript(() => {
    localStorage.setItem("hasSeenDisclaimer", "true");
    localStorage.setItem("__bitvidTestMode__", "1");
  });

  await page.goto(testUrl);

  // Wait for the test harness to be available
  await page.waitForFunction(
    () => typeof (window as any).__bitvidTest__ === "object",
    { timeout: 15000 },
  );

  // Explicitly set test relays to ensure they are active and recognized by the relayManager patch
  await page.evaluate((url) => {
    (window as any).__bitvidTest__.setTestRelays([url], { persist: false });
  }, relayUrl);
}

/**
 * Login programmatically via the test harness.
 */
async function loginWithTestKey(page: Page) {
  const pubkey = await page.evaluate(async (hexKey) => {
    const harness = (window as any).__bitvidTest__;
    if (!harness) throw new Error("Test harness not installed");
    return harness.loginWithNsec(hexKey);
  }, TEST_PRIVATE_KEY_HEX);
  return pubkey;
}

// ------------------------------------------------------------------
// Fixture type definitions
// ------------------------------------------------------------------

type BitvidFixtures = {
  _coverageAndConsoleCapture: void;
  relay: Awaited<ReturnType<typeof startRelay>>;
  seedEvent: (video: TestVideoEvent) => Promise<any>;
  seedRawEvent: (event: any) => Promise<any>;
  clearRelay: () => Promise<void>;
  gotoApp: (path?: string) => Promise<void>;
  loginAs: (page: Page) => Promise<string>;
  setTestRelays: (page: Page, relays: string[]) => Promise<any>;
  setDecryptBehavior: (
    page: Page,
    mode: "passthrough" | "timeout" | "error" | "delay",
    options?: { delayMs?: number; errorMessage?: string },
  ) => Promise<any>;
  startDiagnostics: (
    page: Page,
    options?: { captureSyncEvents?: boolean },
  ) => Promise<{
    stop: () => Promise<{
      console: Array<{ type: string; text: string }>;
      pageErrors: string[];
      syncEvents: any[];
    }>;
  }>;
  testPubkey: string;
  testPrivateKey: string;
  relayUrl: string;
};

// ------------------------------------------------------------------
// Shared relay fixture (one relay per worker)
// ------------------------------------------------------------------

export const test = base.extend<BitvidFixtures>({
  _coverageAndConsoleCapture: [
    async ({ page, browserName }, use, testInfo) => {
      const stopCapture = await attachCoverageAndConsoleCapture(page, testInfo, browserName);
      await use();
      await stopCapture();
    },
    { auto: true },
  ],

  relay: [
    async ({}, use, testInfo) => {
      // Avoid port collisions when running in parallel workers
      const port = BASE_RELAY_PORT + (testInfo.workerIndex * 2);
      const httpPort = port + 1;

      const relayInstance = startRelay(port, { httpPort });
      // Attach the dynamic URLs to the relay instance for downstream fixtures
      (relayInstance as any).wsUrl = `ws://127.0.0.1:${port}`;
      (relayInstance as any).httpUrl = `http://127.0.0.1:${httpPort}`;

      await use(relayInstance);
      await relayInstance.close();
    },
    { scope: "test" },
  ],

  seedEvent: async ({ relay }, use) => {
    await use(async (video: TestVideoEvent) => {
      const event = createVideoEvent(video);
      return seedEventViaHttp(event, (relay as any).httpUrl);
    });
  },

  seedRawEvent: async ({ relay }, use) => {
    await use(async (event: any) => {
      return seedEventViaHttp(event, (relay as any).httpUrl);
    });
  },

  clearRelay: async ({ relay }, use) => {
    await use(async () => {
      await clearRelayEvents((relay as any).httpUrl);
    });
  },

  gotoApp: async ({ page, relay }, use) => {
    await use(async (path = "/") => {
      await gotoWithTestMode(page, (relay as any).wsUrl, path);
    });
  },

  loginAs: async ({}, use) => {
    await use(async (page: Page) => {
      return loginWithTestKey(page);
    });
  },

  setTestRelays: async ({}, use) => {
    await use(async (page: Page, relays: string[]) => {
      return page.evaluate((urls) => {
        const harness = (window as any).__bitvidTest__;
        if (!harness || typeof harness.setTestRelays !== "function") {
          throw new Error("setTestRelays is not available in test harness");
        }
        return harness.setTestRelays(urls);
      }, relays);
    });
  },

  setDecryptBehavior: async ({}, use) => {
    await use(
      async (
        page: Page,
        mode: "passthrough" | "timeout" | "error" | "delay",
        options = {},
      ) => {
        return page.evaluate(
          ({ nextMode, nextOptions }) => {
            const harness = (window as any).__bitvidTest__;
            if (!harness || typeof harness.setSignerDecryptBehavior !== "function") {
              throw new Error(
                "setSignerDecryptBehavior is not available in test harness",
              );
            }
            return harness.setSignerDecryptBehavior(nextMode, nextOptions);
          },
          { nextMode: mode, nextOptions: options },
        );
      },
    );
  },

  startDiagnostics: async ({}, use) => {
    await use(async (page: Page, options = {}) => {
      const consoleEntries: Array<{ type: string; text: string }> = [];
      const pageErrors: string[] = [];
      const captureSyncEvents = options.captureSyncEvents !== false;

      const onConsole = (message: any) => {
        consoleEntries.push({
          type: message.type(),
          text: message.text(),
        });
      };
      const onPageError = (error: Error) => {
        pageErrors.push(error?.message || String(error));
      };

      page.on("console", onConsole);
      page.on("pageerror", onPageError);

      if (captureSyncEvents) {
        await page.evaluate(() => {
          const harness = (window as any).__bitvidTest__;
          if (harness && typeof harness.clearListSyncEvents === "function") {
            harness.clearListSyncEvents();
          }
        });
      }

      return {
        stop: async () => {
          page.off("console", onConsole);
          page.off("pageerror", onPageError);
          const syncEvents = captureSyncEvents
            ? await page.evaluate(() => {
                const harness = (window as any).__bitvidTest__;
                if (harness && typeof harness.getListSyncEvents === "function") {
                  return harness.getListSyncEvents();
                }
                return [];
              })
            : [];
          return {
            console: consoleEntries,
            pageErrors,
            syncEvents,
          };
        },
      };
    });
  },

  testPubkey: TEST_PK,
  testPrivateKey: TEST_PRIVATE_KEY_HEX,
  relayUrl: async ({ relay }, use) => {
    await use((relay as any).wsUrl);
  },
});

export { expect };
