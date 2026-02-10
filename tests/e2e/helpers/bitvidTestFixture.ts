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

const RELAY_PORT = 8877;
const RELAY_HTTP_PORT = 8878;
const RELAY_WS_URL = `ws://127.0.0.1:${RELAY_PORT}`;
const RELAY_HTTP_URL = `http://127.0.0.1:${RELAY_HTTP_PORT}`;

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
    ["title", video.title],
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
async function seedEventViaHttp(event: any) {
  const resp = await fetch(`${RELAY_HTTP_URL}/seed`, {
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
async function clearRelayEvents() {
  const resp = await fetch(`${RELAY_HTTP_URL}/events`, { method: "DELETE" });
  if (!resp.ok) {
    throw new Error(`Failed to clear events: ${resp.status}`);
  }
}

/**
 * Navigate to bitvid with test mode and relay overrides enabled.
 */
async function gotoWithTestMode(page: Page, path = "/") {
  const separator = path.includes("?") ? "&" : "?";
  const testUrl = `${path}${separator}__test__=1&__testRelays__=${encodeURIComponent(RELAY_WS_URL)}`;

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
  relay: Awaited<ReturnType<typeof startRelay>>;
  seedEvent: (video: TestVideoEvent) => Promise<any>;
  seedRawEvent: (event: any) => Promise<any>;
  clearRelay: () => Promise<void>;
  gotoApp: (path?: string) => Promise<void>;
  loginAs: (page: Page) => Promise<string>;
  testPubkey: string;
  testPrivateKey: string;
  relayUrl: string;
};

// ------------------------------------------------------------------
// Shared relay fixture (one relay per worker)
// ------------------------------------------------------------------

export const test = base.extend<BitvidFixtures>({
  relay: [
    async ({}, use) => {
      const relayInstance = startRelay(RELAY_PORT, { httpPort: RELAY_HTTP_PORT });
      await use(relayInstance);
      await relayInstance.close();
    },
    { scope: "test" },
  ],

  seedEvent: async ({ relay }, use) => {
    await use(async (video: TestVideoEvent) => {
      const event = createVideoEvent(video);
      return seedEventViaHttp(event);
    });
  },

  seedRawEvent: async ({ relay }, use) => {
    await use(async (event: any) => {
      return seedEventViaHttp(event);
    });
  },

  clearRelay: async ({ relay }, use) => {
    await use(async () => {
      await clearRelayEvents();
    });
  },

  gotoApp: async ({ page }, use) => {
    await use(async (path = "/") => {
      await gotoWithTestMode(page, path);
    });
  },

  loginAs: async ({}, use) => {
    await use(async (page: Page) => {
      return loginWithTestKey(page);
    });
  },

  testPubkey: TEST_PK,
  testPrivateKey: TEST_PRIVATE_KEY_HEX,
  relayUrl: RELAY_WS_URL,
});

export { expect };
