
import { listVideoReactions } from '../js/nostr/reactionEvents.js';
import { RELAY_BACKGROUND_CONCURRENCY } from '../js/nostr/relayConstants.js';

const NUM_RELAYS = 20;
const DELAY_MS = 100;

const mockRelays = Array.from({ length: NUM_RELAYS }, (_, i) => `wss://mock-relay-${i}.com`);

let activeRequests = 0;
let peakRequests = 0;

const mockPool = {
  list: async (relays, filters) => {
    activeRequests++;
    if (activeRequests > peakRequests) {
      peakRequests = activeRequests;
    }

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, DELAY_MS));

    activeRequests--;
    return []; // Return empty events for now
  }
};

const mockClient = {
  pool: mockPool,
  relays: mockRelays, // Allow these relays
  ensurePool: async () => mockPool
};

async function runBenchmark() {
  console.log(`Starting benchmark with ${NUM_RELAYS} relays...`);
  console.log(`Expected concurrency limit (after fix): ${RELAY_BACKGROUND_CONCURRENCY}`);

  const start = performance.now();

  await listVideoReactions(mockClient, { id: 'test-video-id' }, { relays: mockRelays });

  const end = performance.now();

  console.log('---------------------------------------------------');
  console.log(`Total time: ${(end - start).toFixed(2)}ms`);
  console.log(`Peak concurrent requests: ${peakRequests}`);
  console.log('---------------------------------------------------');
}

runBenchmark().catch(console.error);
