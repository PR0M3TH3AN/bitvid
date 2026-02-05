
import { normalizeNip46CiphertextPayload } from "../js/nostr/nip46Client.js";

const ITERATIONS = 100;
const ARRAY_SIZE = 200;

function runBenchmark() {
  const largeArray = Array.from({ length: ARRAY_SIZE }, (_, i) => `string_${i}`);

  // Wrap in a structure that triggers the recursive coerce and then the array handling
  const payload = {
    data: largeArray
  };

  const start = performance.now();

  for (let i = 0; i < ITERATIONS; i++) {
    normalizeNip46CiphertextPayload(payload);
  }

  const end = performance.now();
  const duration = end - start;

  console.log(`Time taken for ${ITERATIONS} iterations with array size ${ARRAY_SIZE}: ${duration.toFixed(2)}ms`);
  console.log(`Average time per iteration: ${(duration / ITERATIONS).toFixed(2)}ms`);
}

runBenchmark();
