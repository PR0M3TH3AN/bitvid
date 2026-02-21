import { createModerationStage } from '../js/feedEngine/stages.js';
import { performance } from 'perf_hooks';

// Mock Logger
const logger = {
  log: () => {},
  dev: { log: () => {}, debug: () => {} },
  user: { warn: () => {}, info: () => {} }
};

// Realistic Mock Service
const mutedAuthors = new Set();
const reportedVideos = new Map();

// Seed data
for (let i = 0; i < 100; i++) {
  if (Math.random() < 0.1) {
    mutedAuthors.add(`pubkey-${i}`);
  }
}

// Simulate pruning cost
function pruneSimulation() {
  const map = new Map();
  for(let i=0; i<5; i++) map.set(i, Date.now()); // Simulate 5 muters
  for(const [k,v] of map) {
    if (v < 0) map.delete(k);
  }
}

const mockService = {
  refreshViewerFromClient: async () => {},
  setActiveEventIds: async () => {},
  getAdminListSnapshot: () => ({
    whitelist: new Set(),
    whitelistHex: new Set(),
    blacklist: new Set(),
    blacklistHex: new Set()
  }),
  getAccessControlStatus: (pubkey) => ({
    hex: pubkey,
    whitelisted: false,
    blacklisted: false
  }),
  getTrustedReportSummary: (id) => {
    if (reportedVideos.has(id)) {
      return reportedVideos.get(id);
    }
    return null;
  },
  trustedReportCount: (id) => {
    const summary = reportedVideos.get(id);
    return summary ? summary.totalTrusted : 0;
  },
  getTrustedReporters: (id) => [],
  isAuthorMutedByTrusted: (pubkey) => {
    // Simulate the real service logic which calls prune
    pruneSimulation();
    return mutedAuthors.has(pubkey);
  },
  getTrustedMutersForAuthor: (pubkey) => {
    // Simulate prune here too if called
    pruneSimulation();
    if (mutedAuthors.has(pubkey)) {
      return ['trusted-muter-1', 'trusted-muter-2'];
    }
    return [];
  },
  getTrustedMuteCountsForAuthor: (pubkey) => {
    pruneSimulation();
    if (mutedAuthors.has(pubkey)) {
      return { total: 2, categories: { nudity: 1, spam: 1 } };
    }
    return { total: 0, categories: {} };
  },
  isAuthorMutedByViewer: (pubkey) => false,
};

async function runBenchmark() {
  console.log('Starting Moderation Stage Benchmark (with prune cost)...');

  const ITEM_COUNT = 10000;
  const items = [];

  for (let i = 0; i < ITEM_COUNT; i++) {
    const videoId = `video-${i}`;
    const pubkey = `pubkey-${i % 100}`;

    // Simulate some reported videos
    if (Math.random() < 0.05) {
      reportedVideos.set(videoId, {
        eventId: videoId,
        totalTrusted: 2,
        types: { nudity: { trusted: 2, total: 5, latest: Date.now() } },
        updatedAt: Date.now()
      });
    }

    items.push({
      video: {
        id: videoId,
        pubkey: pubkey,
        kind: 30078,
        tags: []
      },
      metadata: {}
    });
  }

  const context = {
    runtime: {
      moderationThresholds: {
        autoplayBlockThreshold: 1,
        blurThreshold: 1,
        trustedSpamHideThreshold: 1,
        trustedMuteHideThresholds: {}
      },
      isAuthorBlocked: () => false
    },
    log: logger.dev.log,
    addWhy: () => {}
  };

  const moderationStage = createModerationStage({
    service: mockService,
    stageName: 'bench-moderation'
  });

  // Warmup
  console.log('Warming up...');
  await moderationStage(items.slice(0, 100), context);

  // Run
  console.log(`Processing ${ITEM_COUNT} items with ~10% muted authors and prune simulation...`);
  const start = performance.now();

  const result = await moderationStage(items, context);

  const end = performance.now();
  const totalTime = end - start;
  const avgTime = totalTime / ITEM_COUNT;

  console.log('---------------------------------------------------');
  console.log(`Total time: ${totalTime.toFixed(2)}ms`);
  console.log(`Average time per item: ${(avgTime * 1000).toFixed(4)}µs`);
  console.log(`Items processed: ${result.length}`);
  console.log('---------------------------------------------------');
}

runBenchmark().catch(console.error);
