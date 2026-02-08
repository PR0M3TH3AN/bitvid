import { writeMessages } from "../js/storage/dmDb.js";
import { indexedDB, IDBKeyRange } from "fake-indexeddb";

if (!globalThis.indexedDB) {
  globalThis.indexedDB = indexedDB;
  globalThis.IDBKeyRange = IDBKeyRange;
}

const ITERATIONS = 500;

async function benchmark() {
  console.log(`Starting benchmark with ${ITERATIONS} iterations...`);

  // Warm up
  await writeMessages({
    id: `warmup`,
    conversationId: "bench-conv",
    senderPubkey: "sender",
    receiverPubkey: "receiver",
    createdAt: Date.now(),
    kind: 4,
    content: "Warmup",
  });

  const start = performance.now();

  for (let i = 0; i < ITERATIONS; i++) {
    await writeMessages({
      id: `msg-${i}`,
      conversationId: "bench-conv",
      senderPubkey: "sender",
      receiverPubkey: "receiver",
      createdAt: Date.now(),
      kind: 4,
      content: "Bench",
    });
  }

  const end = performance.now();
  console.log(`Total time for ${ITERATIONS} writes: ${(end - start).toFixed(2)}ms`);
  console.log(`Average time per write: ${((end - start) / ITERATIONS).toFixed(2)}ms`);
}

benchmark().catch(console.error);
