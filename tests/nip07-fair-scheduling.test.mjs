// Scenario tests for the NIP-07 queue's reserved foreground slot.
//
// The extension is a single serialized resource with only 2 concurrency slots.
// Background-class work (LOW priority: DM backfill) must never occupy every
// slot, or it starves the feed-driving lists (hashtags, subscriptions, watch
// history) and moderation/block lists. The queue reserves one slot for
// foreground (priority > LOW) by capping background work at maxConcurrent - 1.
//
// These tests drive the real shared queue through runNip07WithRetry so they
// assert the externally observable scheduling behavior, not internals.

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import {
  runNip07WithRetry,
  NIP07_PRIORITY,
} from "../js/nostr/nip07Permissions.js";

global.window = { nostr: {} };

describe("NIP-07 fair scheduling (reserved foreground slot)", () => {
  const originalWindow = global.window;
  beforeEach(() => {
    global.window = { nostr: {} };
  });
  afterEach(() => {
    global.window = originalWindow;
  });

  // SCN-nip07-background-capped:
  //   Given a flood of LOW-priority (background) tasks,
  //   When they are all enqueued at once,
  //   Then no more than (maxConcurrent - 1) === 1 of them ever run concurrently,
  //     leaving a slot free for foreground work.
  test("background (LOW) work never uses more than the unreserved slots", async () => {
    let active = 0;
    let maxActive = 0;
    const task = (delay) => async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, delay));
      active -= 1;
    };

    const all = [];
    for (let i = 0; i < 5; i += 1) {
      all.push(
        runNip07WithRetry(task(60), { priority: NIP07_PRIORITY.LOW }),
      );
    }
    await Promise.all(all);

    assert.equal(
      maxActive,
      1,
      "at most 1 background task should run at once (1 slot reserved for foreground)",
    );
  });

  // SCN-nip07-foreground-not-starved:
  //   Given background (LOW) work is saturating its allowed slot,
  //   When a foreground (NORMAL) task arrives,
  //   Then it starts promptly using the reserved slot — it does NOT wait for a
  //     background task to finish.
  test("a foreground task is not starved by a background flood", async () => {
    const start = Date.now();
    const log = [];
    const bg = (delay) => async () => {
      await new Promise((r) => setTimeout(r, delay));
    };
    const fg = () => async () => {
      log.push({ id: "fg", time: Date.now() - start });
    };

    // Flood the queue with long background tasks first.
    const bgPromises = [];
    for (let i = 0; i < 4; i += 1) {
      bgPromises.push(runNip07WithRetry(bg(200), { priority: NIP07_PRIORITY.LOW }));
    }
    // Now a foreground task arrives while background is running.
    const fgPromise = runNip07WithRetry(fg(), { priority: NIP07_PRIORITY.NORMAL });

    await fgPromise;
    const fgStart = log.find((e) => e.id === "fg");
    assert.ok(fgStart, "foreground task should have run");
    assert.ok(
      fgStart.time < 150,
      `foreground should start in the reserved slot (<150ms), got ${fgStart.time}ms`,
    );

    await Promise.all(bgPromises);
  });

  // SCN-nip07-foreground-uses-all-slots:
  //   Given only foreground (NORMAL) work,
  //   When two tasks are enqueued,
  //   Then both run concurrently — the reservation does not throttle foreground.
  test("foreground work can still use every slot", async () => {
    let active = 0;
    let maxActive = 0;
    const task = (delay) => async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, delay));
      active -= 1;
    };

    await Promise.all([
      runNip07WithRetry(task(80), { priority: NIP07_PRIORITY.NORMAL }),
      runNip07WithRetry(task(80), { priority: NIP07_PRIORITY.NORMAL }),
    ]);

    assert.equal(maxActive, 2, "two foreground tasks should run concurrently");
  });
});
