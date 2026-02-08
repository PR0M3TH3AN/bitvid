
import { performance } from "perf_hooks";

// Mock IndexedDB if running in Node
if (!globalThis.indexedDB) {
  const { indexedDB, IDBKeyRange } = await import("fake-indexeddb");
  globalThis.indexedDB = indexedDB;
  globalThis.IDBKeyRange = IDBKeyRange;
}

// Mock console to suppress logs
const originalConsoleWarn = console.warn;
console.warn = () => {};

// Import after mocking console
const { writeMessages, clearDmDb } = await import("../js/storage/dmDb.js");

async function runBenchmark() {
  await clearDmDb();

  const iterations = 1000;
  const messages = [];

  for (let i = 0; i < iterations; i++) {
    messages.push({
      id: `msg-${i}`,
      conversation_id: "conv-1",
      sender_pubkey: "sender",
      receiver_pubkey: "receiver",
      created_at: Date.now(),
      kind: 4,
      content: `Message ${i}`,
    });
  }

  console.log(`Starting benchmark with ${iterations} writes...`);

  const start = performance.now();

  // Simulate N+1 writes
  for (const msg of messages) {
    await writeMessages(msg);
  }

  const end = performance.now();
  const duration = end - start;

  console.log(`Total time: ${duration.toFixed(2)}ms`);
  console.log(`Average time per write: ${(duration / iterations).toFixed(2)}ms`);

  // Restore console
  console.warn = originalConsoleWarn;
}

runBenchmark().catch(console.error);
