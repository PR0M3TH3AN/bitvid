import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

import {
  SITE_UPDATE_DISMISSED_KEY,
  SITE_UPDATE_LAST_SEEN_KEY,
  initializeSiteUpdateNotice,
} from "../js/ui/siteUpdateNotice.js";

function createDocument(version = "deadbeef") {
  return new JSDOM(
    `<!doctype html><html><body><div data-site-version="${version}" data-site-version-date="2026-07-26"></div></body></html>`,
    { url: "https://bitvid.example" },
  );
}

test("site update notice records a first visit without interrupting it", () => {
  const dom = createDocument();
  const result = initializeSiteUpdateNotice({
    doc: dom.window.document,
    storage: dom.window.localStorage,
  });

  assert.deepEqual(result, { shown: false, reason: "first-visit" });
  assert.equal(dom.window.localStorage.getItem(SITE_UPDATE_LAST_SEEN_KEY), "deadbeef");
  assert.equal(dom.window.document.querySelector(".site-update-notice"), null);
});

test("site update notice shows a dismissible build summary after an update", async () => {
  const dom = createDocument("cafebabe");
  dom.window.localStorage.setItem(SITE_UPDATE_LAST_SEEN_KEY, "deadbeef");

  const result = initializeSiteUpdateNotice({
    doc: dom.window.document,
    storage: dom.window.localStorage,
    fetchImpl: async () => ({
      ok: true,
      json: async () => [
        { sha: "1234567890abcdef", commit: { message: "Make Nostr login obvious\n\nMore detail" } },
      ],
    }),
  });

  assert.equal(result.shown, true);
  const button = dom.window.document.querySelector(".site-update-notice__button");
  const panel = dom.window.document.querySelector(".site-update-notice__panel");
  assert.ok(button);
  assert.ok(panel.classList.contains("hidden"));

  button.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(button.getAttribute("aria-expanded"), "true");
  assert.equal(panel.classList.contains("hidden"), false);
  assert.match(panel.textContent, /cafebabe/);
  assert.match(panel.textContent, /12345678 — Make Nostr login obvious/);

  dom.window.document.querySelector("[aria-label='Dismiss this update']").click();
  assert.equal(dom.window.document.querySelector(".site-update-notice"), null);
  assert.equal(dom.window.localStorage.getItem(SITE_UPDATE_LAST_SEEN_KEY), "cafebabe");
  assert.equal(dom.window.localStorage.getItem(SITE_UPDATE_DISMISSED_KEY), "cafebabe");
});

test("site update notice keeps its curated summary when GitHub is unavailable", async () => {
  const dom = createDocument("cafebabe");
  dom.window.localStorage.setItem(SITE_UPDATE_LAST_SEEN_KEY, "deadbeef");
  initializeSiteUpdateNotice({
    doc: dom.window.document,
    storage: dom.window.localStorage,
    updateItems: ["Fallback update copy."],
    fetchImpl: async () => ({ ok: false }),
  });

  dom.window.document.querySelector(".site-update-notice__button").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.match(
    dom.window.document.querySelector(".site-update-notice__panel").textContent,
    /Fallback update copy/,
  );
});
