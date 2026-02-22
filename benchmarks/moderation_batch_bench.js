
// Mock Globals BEFORE imports
global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {}
};
global.window = { localStorage: global.localStorage };

// Dynamic imports to ensure globals are set first
const { ModerationService } = await import('../js/services/moderationService.js');
const { createModerationStage } = await import('../js/feedEngine/stages.js');
const { performance } = await import('node:perf_hooks');

// Mock Dependencies
const mockClient = {
  pool: {},
  ensurePool: async () => {},
  pubkey: 'viewer-pubkey',
};

const mockLogger = {
  log: () => {},
  dev: { log: () => {}, debug: () => {} },
  user: { warn: () => {}, info: () => {} }
};

const service = new ModerationService({
  nostrClient: mockClient,
  logger: mockLogger,
});

// Helper to generate valid hex
function makeHex(prefix, index) {
  return `${prefix}${index.toString(16).padStart(64 - prefix.length, '0')}`;
}

// Setup Data
const AUTHOR_COUNT = 500;
const MUTERS_PER_AUTHOR = 100;
const now = Date.now() / 1000;

console.log(`Populating ${AUTHOR_COUNT} authors with ${MUTERS_PER_AUTHOR} muters each...`);

for (let i = 0; i < AUTHOR_COUNT; i++) {
  const author = makeHex('abc', i);
  const muters = new Map();
  const categories = new Map();

  for (let j = 0; j < MUTERS_PER_AUTHOR; j++) {
    const muter = makeHex('def', j);
    muters.set(muter, now); // Not expired
  }

  // Add some categories
  const catMuters = new Map();
  const firstMuter = makeHex('def', 0);
  catMuters.set(firstMuter, now);
  categories.set('spam', catMuters);

  // We manually inject into internal map to bypass setter logic
  service.trustedMutedAuthors.set(author, {
    muters,
    categories,
    count: muters.size,
    lastPrunedAt: 0 // Force prune check
  });
}

// Prepare items for stage
const ITEM_COUNT = 5000;
const items = [];
for (let i = 0; i < ITEM_COUNT; i++) {
  const authorIndex = i % AUTHOR_COUNT;
  const author = makeHex('abc', authorIndex);
  items.push({
    video: {
      id: makeHex('123', i),
      pubkey: author,
      kind: 30078,
      moderation: {}
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
  log: () => {},
  addWhy: () => {}
};

async function runBenchmark() {
  console.log('Running Moderation Stage Benchmark (Sequential Lookups)...');

  const moderationStage = createModerationStage({
    service: service,
    stageName: 'bench-moderation-sequential'
  });

  // Warmup
  await moderationStage(items.slice(0, 100), context);

  // Measure
  const start = performance.now();
  await moderationStage(items, context);
  const end = performance.now();

  console.log(`Time: ${(end - start).toFixed(2)}ms`);
}

runBenchmark().catch(console.error);
