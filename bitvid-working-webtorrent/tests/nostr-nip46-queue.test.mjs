import test from "node:test";
import assert from "node:assert/strict";
import { Nip46RequestQueue, NIP46_PRIORITY } from "../js/nostr/nip46Queue.js";

test("Nip46RequestQueue: processes tasks in FIFO order for same priority", async () => {
  const queue = new Nip46RequestQueue({ minDelayMs: 0 });
  const results = [];

  const task1 = () => {
    results.push(1);
    return Promise.resolve(1);
  };
  const task2 = () => {
    results.push(2);
    return Promise.resolve(2);
  };
  const task3 = () => {
    results.push(3);
    return Promise.resolve(3);
  };

  await Promise.all([
    queue.enqueue(task1),
    queue.enqueue(task2),
    queue.enqueue(task3),
  ]);

  assert.deepEqual(results, [1, 2, 3]);
});

test("Nip46RequestQueue: respects priority levels", async () => {
  const queue = new Nip46RequestQueue({ minDelayMs: 0 });
  const results = [];

  // Enqueue tasks. The queue starts processing immediately, so we need to
  // delay the start slightly or ensure they are added before the first one finishes?
  // Actually, since tasks are async, the first one starts running.
  // But subsequent ones will be queued.

  // To ensure they are all in the queue before processing picks the next one,
  // we can make the first task slow.

  let releaseFirst;
  const firstTaskPromise = new Promise(resolve => releaseFirst = resolve);

  const task1 = async () => {
    await firstTaskPromise;
    results.push("low");
    return "low";
  };

  const task2 = async () => {
    results.push("normal");
    return "normal";
  };

  const task3 = async () => {
    results.push("high");
    return "high";
  };

  const p1 = queue.enqueue(task1, NIP46_PRIORITY.LOW);
  // Give a tiny moment for p1 to start running (and block on firstTaskPromise)
  await new Promise(r => setTimeout(r, 10));

  const p2 = queue.enqueue(task2, NIP46_PRIORITY.NORMAL);
  const p3 = queue.enqueue(task3, NIP46_PRIORITY.HIGH);

  releaseFirst();

  await Promise.all([p1, p2, p3]);

  // task1 started first. While it was running, task2 and task3 were added.
  // task3 has higher priority than task2, so it should run after task1 finishes.
  assert.deepEqual(results, ["low", "high", "normal"]);
});

test("Nip46RequestQueue: respects minDelayMs", async () => {
  const minDelayMs = 50;
  const queue = new Nip46RequestQueue({ minDelayMs });

  const start = Date.now();
  const times = [];

  const task = async () => {
    times.push(Date.now());
  };

  await Promise.all([
    queue.enqueue(task),
    queue.enqueue(task),
    queue.enqueue(task),
  ]);

  assert.equal(times.length, 3);
  const diff1 = times[1] - times[0];
  const diff2 = times[2] - times[1];

  // Allow some margin for execution time
  assert.ok(diff1 >= minDelayMs - 10, `Delay ${diff1}ms should be >= ${minDelayMs}ms`);
  assert.ok(diff2 >= minDelayMs - 10, `Delay ${diff2}ms should be >= ${minDelayMs}ms`);
});

test("Nip46RequestQueue: clear() rejects pending tasks", async () => {
  const queue = new Nip46RequestQueue({ minDelayMs: 100 });
  const results = [];
  const errors = [];

  // Start a task that blocks the queue for a bit
  queue.enqueue(async () => {
    await new Promise(r => setTimeout(r, 50));
    results.push("finished");
  });

  // Add tasks that will be pending
  const p2 = queue.enqueue(async () => {
    results.push("should not run");
  }).catch(e => errors.push(e.message));

  const p3 = queue.enqueue(async () => {
    results.push("should not run either");
  }).catch(e => errors.push(e.message));

  // Clear the queue immediately
  queue.clear(new Error("Queue cleared manually"));

  await Promise.allSettled([p2, p3]);

  // wait for the first task to finish naturally (it was already running)
  await new Promise(r => setTimeout(r, 100));

  assert.ok(results.includes("finished"));
  assert.ok(!results.includes("should not run"));
  assert.equal(errors.length, 2);
  assert.equal(errors[0], "Queue cleared manually");
});
