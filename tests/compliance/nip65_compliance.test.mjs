
import test from 'node:test';
import assert from 'node:assert/strict';

// Polyfill minimal window/localStorage
const localStorageMock = {
  store: new Map(),
  getItem: (key) => localStorageMock.store.get(key) || null,
  setItem: (key, value) => localStorageMock.store.set(key, value),
  removeItem: (key) => localStorageMock.store.delete(key),
  clear: () => localStorageMock.store.clear(),
};

if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    localStorage: localStorageMock,
    crypto: globalThis.crypto,
    location: { protocol: 'https:' },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  globalThis.localStorage = localStorageMock;
}

test('NIP-65 Compliance: Relay List Loading', async (t) => {
  // Import dependencies
  const { relayManager } = await import('../../js/relayManager.js');
  const { nostrClient } = await import('../../js/nostrClientFacade.js');

  const pubkey = "0000000000000000000000000000000000000000000000000000000000000001";

  // Mock pool
  const mockPool = {
    list: async (relays, filters) => {
      // Return a NIP-65 event
      if (filters.some(f => f.kinds && f.kinds.includes(10002))) {
        return [{
          id: "event1",
          pubkey: pubkey,
          kind: 10002,
          created_at: 1600000000,
          tags: [
            ["r", "wss://relay.example.com", "read"],
            ["r", "wss://relay.other.com", "write"],
            ["r", "wss://relay.both.com"],
          ],
          content: ""
        }];
      }
      return [];
    },
    sub: () => ({ on: () => {}, unsub: () => {} }) // shimLegacySimplePoolMethods might wrap this
  };

  // Inject mock pool
  nostrClient.pool = mockPool;
  nostrClient.ensurePool = async () => mockPool; // Ensure ensurePool returns our mock

  await t.test('loadRelayList requests Kind 10002', async () => {
    // Spy on list
    let listCalled = false;
    let capturedFilters = null;
    const originalList = mockPool.list;
    mockPool.list = async (relays, filters) => {
      listCalled = true;
      capturedFilters = filters;
      return originalList(relays, filters);
    };

    await relayManager.loadRelayList(pubkey);

    assert.ok(listCalled, 'pool.list should be called');
    assert.ok(capturedFilters, 'Filters should be captured');
    const filter = capturedFilters.find(f => f.kinds && f.kinds.includes(10002));
    assert.ok(filter, 'Filter should include kind 10002');
    assert.deepEqual(filter.authors, [pubkey], 'Filter should include correct author');
  });

  await t.test('loadRelayList parses r tags correctly', async () => {
    const entries = relayManager.getEntries();

    // Check read relay
    const readRelay = entries.find(e => e.url === "wss://relay.example.com");
    assert.ok(readRelay, 'Read relay should be present');
    assert.equal(readRelay.mode, 'read');

    // Check write relay
    const writeRelay = entries.find(e => e.url === "wss://relay.other.com");
    assert.ok(writeRelay, 'Write relay should be present');
    assert.equal(writeRelay.mode, 'write');

    // Check both relay
    const bothRelay = entries.find(e => e.url === "wss://relay.both.com");
    assert.ok(bothRelay, 'Both relay should be present');
    assert.equal(bothRelay.mode, 'both');
  });
});
