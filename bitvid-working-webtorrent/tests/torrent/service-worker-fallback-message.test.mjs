import test from "node:test";
import assert from "node:assert/strict";

import {
  buildServiceWorkerFallbackStatus,
} from "../../js/utils/serviceWorkerFallbackMessages.js";

const BASE = "Streaming via WebTorrent";

test("returns generic message when error missing", () => {
  assert.strictEqual(
    buildServiceWorkerFallbackStatus(null),
    `${BASE} (service worker unavailable)`
  );
});

test("identifies HTTPS requirement errors", () => {
  const error = new Error("HTTPS or localhost required");
  assert.strictEqual(
    buildServiceWorkerFallbackStatus(error),
    `${BASE} (serve over HTTPS to enable service worker)`
  );
});

test("identifies disabled service worker errors", () => {
  const error = new Error("Service Worker not supported or disabled");
  assert.strictEqual(
    buildServiceWorkerFallbackStatus(error),
    `${BASE} (browser disabled service workers)`
  );
});

test("identifies Brave specific guidance", () => {
  const error = new Error("Please enable Service Workers in Brave Shield settings");
  assert.strictEqual(
    buildServiceWorkerFallbackStatus(error),
    `${BASE} (Brave Shields blocked the service worker)`
  );
});

test("identifies blocked script errors", () => {
  const error = new Error(
    "Failed to register ServiceWorker: TypeError: Failed to fetch"
  );
  assert.strictEqual(
    buildServiceWorkerFallbackStatus(error),
    `${BASE} (service worker blocked by browser or extension)`
  );
});

test("identifies controller claim timeout", () => {
  const error = new Error("Service worker controller claim timeout");
  assert.strictEqual(
    buildServiceWorkerFallbackStatus(error),
    `${BASE} (waiting for service worker control)`
  );
});
