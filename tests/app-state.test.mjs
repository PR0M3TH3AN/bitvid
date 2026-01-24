import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";

// Import module under test
import * as appState from "../js/state/appState.js";

describe("AppState", () => {
  beforeEach(() => {
    appState.resetAppState();
  });

  test("Initial state is clean", () => {
    const state = appState.getAppState();
    assert.strictEqual(state.pubkey, null);
    assert.strictEqual(state.currentUserNpub, null);
    assert.strictEqual(state.currentVideo, null);
    assert.strictEqual(state.videosMap, null);
    assert.strictEqual(state.videoSubscription, null);
    assert.deepStrictEqual(state.modals, {});
  });

  test("setPubkey() updates state and notifies subscribers", (t) => {
    let callCount = 0;
    const cleanup = appState.subscribeToAppStateKey("pubkey", (val, prev, snap) => {
      callCount++;
      assert.strictEqual(val, "new_pubkey");
      assert.strictEqual(prev, null);
      assert.strictEqual(snap.pubkey, "new_pubkey");
    });
    t.after(cleanup);

    appState.setPubkey("new_pubkey");
    assert.strictEqual(appState.getPubkey(), "new_pubkey");
    assert.strictEqual(callCount, 1);
  });

  test("setCurrentUserNpub() updates state", () => {
    appState.setCurrentUserNpub("npub123");
    assert.strictEqual(appState.getCurrentUserNpub(), "npub123");
  });

  test("setCurrentVideo() updates state", () => {
    const video = { id: "v1" };
    appState.setCurrentVideo(video);
    assert.strictEqual(appState.getCurrentVideo(), video);
  });

  test("setVideosMap() updates state", () => {
    const map = new Map([["v1", {}]]);
    appState.setVideosMap(map);
    assert.strictEqual(appState.getVideosMap(), map);
  });

  test("setVideoSubscription() updates state", () => {
    const sub = { id: "sub1" };
    appState.setVideoSubscription(sub);
    assert.strictEqual(appState.getVideoSubscription(), sub);
  });

  test("setModalState() updates state and notifies modal subscribers", (t) => {
    let modalCallCount = 0;
    const cleanup = appState.subscribeToModalState("login", (val, prev) => {
      modalCallCount++;
      assert.strictEqual(val, true);
      assert.strictEqual(prev, false);
    });
    t.after(cleanup);

    appState.setModalState("login", true);
    assert.strictEqual(appState.getModalState("login"), true);
    assert.strictEqual(modalCallCount, 1);

    // Test no change behavior
    appState.setModalState("login", true);
    assert.strictEqual(modalCallCount, 1); // Should not increase
  });

  test("Global subscriber receives updates", (t) => {
    let callCount = 0;
    const cleanup = appState.subscribeToAppState((snapshot, change) => {
      callCount++;
      assert.strictEqual(change.key, "pubkey");
      assert.strictEqual(change.value, "pk1");
      assert.strictEqual(snapshot.pubkey, "pk1");
    });
    t.after(cleanup);

    appState.setPubkey("pk1");
    assert.strictEqual(callCount, 1);
  });

  test("resetAppState() clears all state and notifies", (t) => {
    appState.setPubkey("pk1");
    appState.setModalState("login", true);

    let callCount = 0;
    const cleanup = appState.subscribeToAppStateKey("pubkey", (val) => {
        if (val === null) callCount++;
    });
    t.after(cleanup);

    appState.resetAppState();

    assert.strictEqual(appState.getPubkey(), null);
    assert.strictEqual(appState.getModalState("login"), false);
    assert.strictEqual(callCount, 1);
  });
});
