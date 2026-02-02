import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import * as appState from "../../js/state/appState.js";

describe("AppState", () => {
  beforeEach(() => {
    appState.resetAppState();
  });

  test("getters and setters work for simple values", () => {
    assert.strictEqual(appState.getPubkey(), null);

    appState.setPubkey("test_pubkey");
    assert.strictEqual(appState.getPubkey(), "test_pubkey");

    appState.setPubkey(null);
    assert.strictEqual(appState.getPubkey(), null);
  });

  test("subscribeToAppStateKey fires on change", (t, done) => {
    const unsubscribe = appState.subscribeToAppStateKey("pubkey", (val, prev) => {
      assert.strictEqual(val, "new_pubkey");
      assert.strictEqual(prev, null);
      unsubscribe();
      done();
    });

    appState.setPubkey("new_pubkey");
  });

  test("subscribeToAppState fires on any change", (t, done) => {
    const unsubscribe = appState.subscribeToAppState((snapshot, { key, value }) => {
      if (key === "currentUserNpub") {
        assert.strictEqual(value, "npub1...");
        assert.strictEqual(snapshot.currentUserNpub, "npub1...");
        unsubscribe();
        done();
      }
    });

    appState.setCurrentUserNpub("npub1...");
  });

  test("setModalState updates state and notifies", (t, done) => {
    assert.strictEqual(appState.getModalState("testModal"), false);

    const unsubscribe = appState.subscribeToModalState("testModal", (isOpen) => {
      assert.strictEqual(isOpen, true);
      unsubscribe();
      done();
    });

    const result = appState.setModalState("testModal", true);
    assert.strictEqual(result, true);
    assert.strictEqual(appState.getModalState("testModal"), true);
  });

  test("resetAppState clears everything", () => {
    appState.setPubkey("pubkey");
    appState.setModalState("modal", true);

    appState.resetAppState();

    assert.strictEqual(appState.getPubkey(), null);
    assert.strictEqual(appState.getModalState("modal"), false);
  });

  test("setVideosMap only accepts Maps or null", () => {
    const map = new Map();
    appState.setVideosMap(map);
    assert.strictEqual(appState.getVideosMap(), map);

    appState.setVideosMap("not a map");
    assert.strictEqual(appState.getVideosMap(), null);
  });
});
