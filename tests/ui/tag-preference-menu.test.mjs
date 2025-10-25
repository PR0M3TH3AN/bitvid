import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import createTagPreferenceMenu, {
  TAG_PREFERENCE_ACTIONS,
  applyTagPreferenceMenuState,
} from "../../js/ui/components/tagPreferenceMenu.js";
import Application from "../../js/app.js";

test("createTagPreferenceMenu renders heading and actions", () => {
  const { document } = new JSDOM("<!DOCTYPE html>").window;
  const menu = createTagPreferenceMenu({
    document,
    tag: "#Nostr",
    isLoggedIn: true,
  });

  assert(menu, "menu should render");
  const { panel, buttons } = menu;
  assert.equal(panel.dataset.menu, "tag-preference");
  assert.equal(panel.dataset.tag, "nostr");
  const heading = panel.querySelector(".menu__heading");
  assert(heading, "heading should be rendered");
  assert.equal(heading.textContent, "#Nostr");

  assert.equal(typeof buttons.addInterest, "object");
  assert.equal(buttons.addInterest.dataset.action, TAG_PREFERENCE_ACTIONS.ADD_INTEREST);
  assert.equal(
    buttons.removeDisinterest.dataset.action,
    TAG_PREFERENCE_ACTIONS.REMOVE_DISINTEREST,
  );
});

test("createTagPreferenceMenu disables actions based on membership and login", () => {
  const { document } = new JSDOM("<!DOCTYPE html>").window;
  const { buttons, panel } = createTagPreferenceMenu({
    document,
    tag: "video",
    isLoggedIn: false,
    membership: { state: "interest" },
  });

  assert(buttons.addInterest.disabled, "add interest should be disabled for interest state");
  assert(buttons.removeInterest.disabled, "remove interest should be disabled when logged out");
  assert(buttons.addDisinterest.disabled, "add disinterest should require login");
  assert(buttons.removeDisinterest.disabled, "remove disinterest should require login");

  const message = panel.querySelector("p.text-xs");
  assert(message, "login message should be present when logged out");

  applyTagPreferenceMenuState({
    buttons,
    isLoggedIn: true,
    membership: { state: "disinterest" },
  });

  assert.equal(buttons.addInterest.disabled, false);
  assert.equal(buttons.removeInterest.disabled, true);
  assert.equal(buttons.addDisinterest.disabled, true);
  assert.equal(buttons.removeDisinterest.disabled, false);
});

test("createTagPreferenceMenu forwards actions to callback", () => {
  const { document } = new JSDOM("<!DOCTYPE html>").window;
  const events = [];
  const { panel, buttons } = createTagPreferenceMenu({
    document,
    tag: "art",
    isLoggedIn: true,
    membership: { state: "disinterest" },
    onAction(action, detail) {
      events.push({ action, detail });
    },
  });

  document.body.append(panel);

  buttons.addInterest.click();
  buttons.removeDisinterest.click();

  assert.equal(events.length, 2);
  assert.equal(events[0].action, TAG_PREFERENCE_ACTIONS.ADD_INTEREST);
  assert.equal(events[0].detail.tag, "art");
  assert.equal(events[1].action, TAG_PREFERENCE_ACTIONS.REMOVE_DISINTEREST);
  assert.equal(events[1].detail.normalizedTag, "art");
});

test("handleTagPreferenceMenuAction publishes hashtag updates", async () => {
  const store = {
    interests: new Set(),
    disinterests: new Set(),
  };

  const publishCalls = [];
  const service = {
    addInterest(tag) {
      if (typeof tag !== "string") {
        return false;
      }
      const normalized = tag.trim().toLowerCase();
      if (!normalized) {
        return false;
      }
      store.disinterests.delete(normalized);
      const had = store.interests.has(normalized);
      store.interests.add(normalized);
      return !had;
    },
    removeInterest(tag) {
      if (typeof tag !== "string") {
        return false;
      }
      const normalized = tag.trim().toLowerCase();
      if (!normalized) {
        return false;
      }
      return store.interests.delete(normalized);
    },
    addDisinterest(tag) {
      if (typeof tag !== "string") {
        return false;
      }
      const normalized = tag.trim().toLowerCase();
      if (!normalized) {
        return false;
      }
      store.interests.delete(normalized);
      const had = store.disinterests.has(normalized);
      store.disinterests.add(normalized);
      return !had;
    },
    removeDisinterest(tag) {
      if (typeof tag !== "string") {
        return false;
      }
      const normalized = tag.trim().toLowerCase();
      if (!normalized) {
        return false;
      }
      return store.disinterests.delete(normalized);
    },
    getInterests() {
      return Array.from(store.interests).sort();
    },
    getDisinterests() {
      return Array.from(store.disinterests).sort();
    },
    async publish(payload) {
      publishCalls.push(payload);
      return { ok: true };
    },
    on() {
      return () => {};
    },
  };

  const app = Object.create(Application.prototype);
  app.hashtagPreferences = service;
  app.pubkey = "f".repeat(64);
  app.safeDecodeNpub = () => null;
  app.describeHashtagPreferencesError = (_error, fallback = "") => fallback;
  app.showError = () => {};
  app.refreshTagPreferenceUi = () => {};
  app.normalizeHexPubkey = Application.prototype.normalizeHexPubkey;
  app.normalizeHashtagPreferenceList =
    Application.prototype.normalizeHashtagPreferenceList;
  app.createHashtagPreferencesSnapshot =
    Application.prototype.createHashtagPreferencesSnapshot;
  app.computeHashtagPreferencesSignature =
    Application.prototype.computeHashtagPreferencesSignature;
  app.getHashtagPreferences = Application.prototype.getHashtagPreferences;
  app.updateCachedHashtagPreferences =
    Application.prototype.updateCachedHashtagPreferences;
  app.hashtagPreferencesSnapshot = app.createHashtagPreferencesSnapshot();
  app.hashtagPreferencesSnapshotSignature =
    app.computeHashtagPreferencesSignature(app.hashtagPreferencesSnapshot);
  app.hashtagPreferencesPublishInFlight = false;
  app.hashtagPreferencesPublishPromise = null;
  app.persistHashtagPreferencesFromMenu =
    Application.prototype.persistHashtagPreferencesFromMenu;
  app.handleTagPreferenceMenuAction =
    Application.prototype.handleTagPreferenceMenuAction;

  await app.handleTagPreferenceMenuAction(
    TAG_PREFERENCE_ACTIONS.ADD_INTEREST,
    { tag: "nostr" },
  );

  assert.equal(publishCalls.length, 1);
  assert.deepEqual(publishCalls[0], { pubkey: app.pubkey });

  await app.handleTagPreferenceMenuAction(
    TAG_PREFERENCE_ACTIONS.REMOVE_INTEREST,
    { tag: "nostr" },
  );

  assert.equal(publishCalls.length, 2);
  assert.deepEqual(publishCalls[1], { pubkey: app.pubkey });
});
