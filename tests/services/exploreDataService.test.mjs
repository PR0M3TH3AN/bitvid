
import { describe, it, before, beforeEach, afterEach, after, mock } from 'node:test';
import assert from 'node:assert';

// Set Dev Mode Override to ensure logs are emitted
globalThis.__BITVID_DEV_MODE_OVERRIDE__ = true;

// Mock Worker globally before importing the service
class MockWorker {
  constructor(scriptURL) {
    this.scriptURL = scriptURL;
    this.listeners = {};
    MockWorker.instances.push(this);
  }

  addEventListener(event, handler) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(handler);
  }

  removeEventListener(event, handler) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter((h) => h !== handler);
    }
  }

  postMessage(data) {
    // Simulate async processing
    setImmediate(() => {
        if (MockWorker.onPostMessage) {
            MockWorker.onPostMessage(this, data);
        }
    });
  }

  // Helper to simulate incoming message from worker
  emitMessage(data) {
    if (this.listeners['message']) {
      const event = { data };
      this.listeners['message'].forEach((handler) => handler(event));
    }
  }
}

MockWorker.instances = [];
MockWorker.onPostMessage = null;

globalThis.Worker = MockWorker;

describe('exploreDataService - buildWatchHistoryTagCounts', () => {
  let buildWatchHistoryTagCounts;
  let consoleWarnMock;
  let initialCallCount = 0;

  before(async () => {
    // Mock console.warn BEFORE import so logger.js captures the mock
    // if console.warn is already mocked (e.g. by other tests? unlikely in isolated process), restore it first
    if (console.warn.mock) console.warn.mock.restore();

    consoleWarnMock = mock.method(console, 'warn', () => {});

    // Dynamic import
    const mod = await import('../../js/services/exploreDataService.js');
    buildWatchHistoryTagCounts = mod.buildWatchHistoryTagCounts;
  });

  after(() => {
      if (consoleWarnMock) consoleWarnMock.mock.restore();
  });

  beforeEach(() => {
    MockWorker.instances = [];
    MockWorker.onPostMessage = null;
    initialCallCount = consoleWarnMock.mock.calls.length;
  });

  it('should return empty Map if watchHistoryService is missing', async () => {
    const result = await buildWatchHistoryTagCounts({});
    assert.ok(result instanceof Map);
    assert.strictEqual(result.size, 0);
  });

  it('should handle missing loadLatest method gracefully', async () => {
     const watchHistoryService = {};
     const result = await buildWatchHistoryTagCounts({ watchHistoryService });
     assert.strictEqual(result.size, 0);
  });

  it('should handle loadLatest failure gracefully', async () => {
    const watchHistoryService = {
      loadLatest: mock.fn(async () => {
        throw new Error('Load failed');
      }),
    };

    // Even if load fails, it should continue with empty items
    MockWorker.onPostMessage = (worker, data) => {
        assert.deepStrictEqual(data.payload.items, []);
        worker.emitMessage({ id: data.id, result: new Map() });
    };

    const result = await buildWatchHistoryTagCounts({ watchHistoryService });

    assert.ok(result instanceof Map);
    assert.strictEqual(result.size, 0);
    assert.strictEqual(watchHistoryService.loadLatest.mock.callCount(), 1);

    // Verify warning was logged
    const newCalls = consoleWarnMock.mock.calls.slice(initialCallCount);
    const warning = newCalls.find(c => c.arguments[0] && String(c.arguments[0]).includes('Failed to load watch history entries'));
    assert.ok(warning, 'Should log warning about load failure');
  });

  it('should return counts from worker on success', async () => {
    const watchHistoryService = {
      loadLatest: mock.fn(async () => ['item1']),
    };
    const nostrService = {
      getVideosMap: mock.fn(() => new Map([['v1', { tags: ['t1'] }]])),
    };

    MockWorker.onPostMessage = (worker, data) => {
      assert.strictEqual(data.type, 'CALC_HISTORY_COUNTS');
      assert.deepStrictEqual(data.payload.items, ['item1']);

      // Verify worker receives correct payload structure
      assert.ok(data.payload.videosMap instanceof Map);

      // Simulate successful result
      worker.emitMessage({
        id: data.id,
        result: new Map([['t1', 5]])
      });
    };

    const result = await buildWatchHistoryTagCounts({
        watchHistoryService,
        nostrService,
        actor: 'user1'
    });

    assert.strictEqual(result.get('t1'), 5);
  });

  it('should handle worker error gracefully', async () => {
    const watchHistoryService = {
      loadLatest: mock.fn(async () => ['item1']),
    };

    MockWorker.onPostMessage = (worker, data) => {
       worker.emitMessage({
         id: data.id,
         error: 'Worker exploded'
       });
    };

    const result = await buildWatchHistoryTagCounts({ watchHistoryService });
    assert.ok(result instanceof Map);
    assert.strictEqual(result.size, 0);

    const newCalls = consoleWarnMock.mock.calls.slice(initialCallCount);
    const warning = newCalls.find(c => c.arguments[0] && String(c.arguments[0]).includes('Worker failed to calculate history counts'));
    assert.ok(warning, 'Should log warning about worker failure');
  });
});

describe('exploreDataService - visibility', () => {
  let ExploreDataService;
  let service;
  let watchHistoryService;
  let nostrService;

  before(async () => {
    // We import the same module again, it should be cached, but that's fine as we instantiate the class.
    const mod = await import('../../js/services/exploreDataService.js');
    ExploreDataService = mod.default;
  });

  beforeEach(() => {
    // Reset global document state for each test if possible
    if (!globalThis.document) {
        globalThis.document = {
            visibilityState: 'hidden',
            hidden: true,
            addEventListener: mock.fn(),
            removeEventListener: mock.fn(),
        };
    } else {
        globalThis.document.visibilityState = 'hidden';
        globalThis.document.hidden = true;
        if (globalThis.document.addEventListener.mock) globalThis.document.addEventListener.mock.resetCalls();
        if (globalThis.document.removeEventListener.mock) globalThis.document.removeEventListener.mock.resetCalls();
    }

    watchHistoryService = {
      loadLatest: mock.fn(async () => []),
      subscribe: mock.fn(() => () => {}),
    };
    nostrService = {
      getVideosMap: mock.fn(() => new Map()),
      on: mock.fn(() => () => {}),
    };

    service = new ExploreDataService({
      watchHistoryService,
      nostrService,
      logger: { warn: () => {} },
      idfRefreshIntervalMs: 1000,
      historyRefreshIntervalMs: 1000,
    });

    // Spy on refresh methods
    mock.method(service, 'refreshWatchHistoryTagCounts');
    mock.method(service, 'refreshTagIdf');
  });

  afterEach(() => {
    if (service) service.destroy();
  });

  it('visibility change triggers refresh', async () => {
    service.initialize();

    // Simulate becoming visible
    document.visibilityState = 'visible';
    document.hidden = false;

    // Find the handler and call it
    const call = document.addEventListener.mock.calls.find(c => c.arguments[0] === 'visibilitychange');
    assert.ok(call, 'Should add visibilitychange listener');
    const handler = call.arguments[1];

    handler();

    assert.strictEqual(service.refreshWatchHistoryTagCounts.mock.callCount(), 2);
    assert.strictEqual(service.refreshTagIdf.mock.callCount(), 2);
  });
});
