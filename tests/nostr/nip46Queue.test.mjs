import assert from "node:assert/strict";
import test from "node:test";
import { Nip46RequestQueue, NIP46_PRIORITY } from "../../js/nostr/nip46Queue.js";

test("Nip46RequestQueue processes tasks in FIFO order for same priority", async () => {
  const queue = new Nip46RequestQueue({ minDelayMs: 0 });
  const results = [];

  const task1 = () => Promise.resolve(results.push(1));
  const task2 = () => Promise.resolve(results.push(2));
  const task3 = () => Promise.resolve(results.push(3));

  await Promise.all([
    queue.enqueue(task1),
    queue.enqueue(task2),
    queue.enqueue(task3),
  ]);

  assert.deepEqual(results, [1, 2, 3]);
});

test("Nip46RequestQueue respects priority", async () => {
  const queue = new Nip46RequestQueue({ minDelayMs: 10 });
  const results = [];

  let resolveFirst;
  const firstTask = () => new Promise(r => { resolveFirst = r; });

  // Starts immediately because queue is empty
  const p1 = queue.enqueue(async () => {
      await firstTask();
      results.push("first");
  }, NIP46_PRIORITY.LOW);

  // While firstTask is running (waiting for resolveFirst), we enqueue others
  const p2 = queue.enqueue(async () => results.push("low"), NIP46_PRIORITY.LOW);
  const p3 = queue.enqueue(async () => results.push("high"), NIP46_PRIORITY.HIGH);
  const p4 = queue.enqueue(async () => results.push("normal"), NIP46_PRIORITY.NORMAL);

  resolveFirst();
  await Promise.all([p1, p2, p3, p4]);

  // Expected order:
  // 1. "first" (started immediately)
  // 2. "high" (highest priority among pending)
  // 3. "normal"
  // 4. "low"
  assert.deepEqual(results, ["first", "high", "normal", "low"]);
});

test("Nip46RequestQueue enforces minDelayMs", async () => {
  const delay = 50;
  const queue = new Nip46RequestQueue({ minDelayMs: delay });

  const start = Date.now();
  // Task 1 executes immediately
  await queue.enqueue(async () => {});
  // Task 2 waits for delay
  await queue.enqueue(async () => {});
  // Task 3 waits for another delay
  await queue.enqueue(async () => {});
  const end = Date.now();

  const elapsed = end - start;
  // Total delay should be roughly 2 * delay (wait between 1&2, and 2&3)
  // Allow for some small execution time variance, check >= 2 * delay - margin
  assert.ok(elapsed >= delay * 2 - 10, `Elapsed time ${elapsed}ms should be >= ${delay * 2}ms`);
});

test("Nip46RequestQueue clear() rejects pending tasks", async () => {
  const queue = new Nip46RequestQueue({ minDelayMs: 50 });

  let resolveFirst;
  const firstTask = () => new Promise(r => { resolveFirst = r; });

  const p1 = queue.enqueue(firstTask); // Starts running
  const p2 = queue.enqueue(() => Promise.resolve(2)); // Pending

  // Clear the queue while p1 is running and p2 is pending
  queue.clear(new Error("Queue Cleared"));

  resolveFirst(); // Allow p1 to finish

  await p1; // p1 should complete successfully as it was already running
  await assert.rejects(p2, /Queue Cleared/);
});

test("Nip46RequestQueue handles task errors and continues", async () => {
    const queue = new Nip46RequestQueue({ minDelayMs: 0 });

    await assert.rejects(
        queue.enqueue(async () => { throw new Error("Task Failed"); }),
        /Task Failed/
    );

    // Ensure queue continues to process new tasks
    const res = await queue.enqueue(async () => "success");
    assert.equal(res, "success");
});
