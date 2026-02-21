import { ModerationService } from '../js/services/moderationService.js';
import { performance } from 'perf_hooks';

// Mock dependencies
const mockClient = {
  pool: {},
};
const mockLogger = {
  log: () => {},
  dev: { log: () => {} },
  user: { warn: () => {}, info: () => {} }
};

const service = new ModerationService({
  nostrClient: mockClient,
  logger: mockLogger,
});

async function runBenchmark() {
  console.log('Starting Moderation Service Stress Benchmark...');

  // Setup Data
  // 100 authors, each having 500 muters (spam scenario).
  // 50 muters are expired.

  const AUTHOR_COUNT = 100;
  const MUTERS_PER_AUTHOR = 500;
  const now = Date.now() / 1000;
  const expiredTime = now - (61 * 24 * 60 * 60);

  console.log(`Populating ${AUTHOR_COUNT} authors with ${MUTERS_PER_AUTHOR} muters each...`);

  for (let i = 0; i < AUTHOR_COUNT; i++) {
    const author = `author-${i}`.padEnd(64, '0');
    const muters = new Map();

    for (let j = 0; j < MUTERS_PER_AUTHOR; j++) {
      const muter = `muter-${j}`.padEnd(64, '0');
      // 10% expired
      const timestamp = (j % 10 === 0) ? expiredTime : now;
      muters.set(muter, timestamp);
    }

    service.trustedMutedAuthors.set(author, {
      muters,
      categories: new Map(),
      count: muters.size
    });
  }

  // Benchmark Read
  console.log('Benchmarking getActiveTrustedMutersForAuthor (Read + Prune)...');
  const READ_ITERATIONS = 10000; // 10k reads

  const start = performance.now();

  for (let i = 0; i < READ_ITERATIONS; i++) {
    const authorIndex = i % AUTHOR_COUNT;
    const author = `author-${authorIndex}`.padEnd(64, '0');
    // This call triggers pruneTrustedMuteAggregates EVERY time
    service.getActiveTrustedMutersForAuthor(author);
  }

  const end = performance.now();
  const totalTime = end - start;
  const avgTime = totalTime / READ_ITERATIONS;

  console.log('---------------------------------------------------');
  console.log(`Total time: ${totalTime.toFixed(2)}ms`);
  console.log(`Average time per call: ${(avgTime * 1000).toFixed(4)}µs`);
  console.log('---------------------------------------------------');
}

runBenchmark().catch(console.error);
