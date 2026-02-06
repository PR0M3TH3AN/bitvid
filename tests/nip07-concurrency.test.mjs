
import { test, describe, afterEach, beforeEach } from "node:test";
import assert from "node:assert";
import { runNip07WithRetry, NIP07_PRIORITY } from "../js/nostr/nip07Permissions.js";

// Mock window and logger
global.window = {
  nostr: {}
};

describe("NIP-07 Concurrency Queue", () => {
  const originalWindow = global.window;

  beforeEach(() => {
    global.window = {
      nostr: {}
    };
  });

  afterEach(() => {
    global.window = originalWindow;
  });

  test("runs up to 5 tasks concurrently", async () => {
    const start = Date.now();
    const delays = [200, 200, 200, 200, 200, 100];
    const log = [];

    const task = (id, delay) => async () => {
      log.push({ id, status: 'start', time: Date.now() - start });
      await new Promise(resolve => setTimeout(resolve, delay));
      log.push({ id, status: 'end', time: Date.now() - start });
      return id;
    };

    const p1 = runNip07WithRetry(task(1, delays[0]), { priority: NIP07_PRIORITY.NORMAL });
    const p2 = runNip07WithRetry(task(2, delays[1]), { priority: NIP07_PRIORITY.NORMAL });
    const p3 = runNip07WithRetry(task(3, delays[2]), { priority: NIP07_PRIORITY.NORMAL });
    const p4 = runNip07WithRetry(task(4, delays[3]), { priority: NIP07_PRIORITY.NORMAL });
    const p5 = runNip07WithRetry(task(5, delays[4]), { priority: NIP07_PRIORITY.NORMAL });
    const p6 = runNip07WithRetry(task(6, delays[5]), { priority: NIP07_PRIORITY.NORMAL });

    await Promise.all([p1, p2, p3, p4, p5, p6]);

    const starts = log.filter(e => e.status === 'start');

    // Task 1-5 should start almost immediately (concurrency 5)
    assert.ok(Math.abs(starts[0].time - starts[4].time) < 50, "Task 1-5 should start concurrently");

    // Task 6 should start after roughly 200ms (when slot opens)
    // Note: Node's setTimeout is not precise, so we use loose bounds
    assert.ok(starts[5].time >= 150, "Task 6 should wait for a slot");
  });

  test("respects priority", async () => {
    const start = Date.now();
    const log = [];

    const task = (id, delay) => async () => {
      log.push({ id, status: 'start', time: Date.now() - start });
      await new Promise(resolve => setTimeout(resolve, delay));
      return id;
    };

    // Fill the queue (size 5)
    runNip07WithRetry(task('blocker1', 100));
    runNip07WithRetry(task('blocker2', 100));
    runNip07WithRetry(task('blocker3', 100));
    runNip07WithRetry(task('blocker4', 100));
    runNip07WithRetry(task('blocker5', 100));

    // Enqueue low priority
    const pLow = runNip07WithRetry(task('low', 50), { priority: NIP07_PRIORITY.LOW });

    // Enqueue high priority
    const pHigh = runNip07WithRetry(task('high', 50), { priority: NIP07_PRIORITY.HIGH });

    await Promise.all([pLow, pHigh]);

    const starts = log.filter(e => e.status === 'start');
    const lowIndex = starts.findIndex(e => e.id === 'low');
    const highIndex = starts.findIndex(e => e.id === 'high');

    // High priority should start before Low priority (after blockers finish)
    assert.ok(highIndex < lowIndex, "High priority task should run before low priority task");
  });
});
