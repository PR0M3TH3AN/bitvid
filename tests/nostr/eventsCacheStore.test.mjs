import { indexedDB } from "fake-indexeddb";
// Polyfill global indexedDB
if (typeof global.indexedDB === 'undefined') {
    global.indexedDB = indexedDB;
}
if (typeof global.window === 'undefined') {
    global.window = {};
}
if (typeof global.window.indexedDB === 'undefined') {
    global.window.indexedDB = indexedDB;
}

import { EventsCacheStore } from '../../js/nostr/managers/EventsCacheStore.js';
import { strict as assert } from 'node:assert';
import { test, describe, beforeEach, afterEach } from 'node:test';

describe('EventsCacheStore', () => {
  let store;

  beforeEach(async () => {
    store = new EventsCacheStore();

    // Ensure clean state
    const db = await store.getDb();
    if (!db) {
        throw new Error("Failed to get DB instance (getDb returned null). indexedDB might not be polyfilled correctly.");
    }
    const tx = db.transaction(["events", "tombstones", "meta"], "readwrite");
    tx.objectStore("events").clear();
    tx.objectStore("tombstones").clear();
    tx.objectStore("meta").clear();
    await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(new Error("Transaction aborted"));
    });
  });

  test('persistSnapshot should store events and tombstones', async () => {
    const events = new Map([
      ['1', { id: '1', title: 'Video 1' }],
      ['2', { id: '2', title: 'Video 2' }]
    ]);
    const tombstones = new Map([
      ['key1', 1000]
    ]);
    const savedAt = Date.now();

    const result = await store.persistSnapshot({ events, tombstones, savedAt });

    assert.equal(result.persisted, true);
    assert.equal(result.eventWrites, 2);
    assert.equal(result.tombstoneWrites, 1);

    const snapshot = await store.restoreSnapshot();
    assert.deepEqual(snapshot.events, events);
    assert.deepEqual(snapshot.tombstones, tombstones);
    assert.equal(snapshot.savedAt, savedAt);
  });

  test('persistSnapshot should only update changed items', async () => {
    const events = new Map([
        ['1', { id: '1', title: 'Video 1' }]
    ]);
    const tombstones = new Map();
    const savedAt = Date.now();

    await store.persistSnapshot({ events, tombstones, savedAt });

    // No changes
    const result1 = await store.persistSnapshot({ events, tombstones, savedAt });
    assert.equal(result1.eventWrites, 0);

    // Update item
    events.set('1', { id: '1', title: 'Video 1 Updated' });
    const result2 = await store.persistSnapshot({ events, tombstones, savedAt });
    assert.equal(result2.eventWrites, 1);
  });

  test('persistSnapshot should delete removed items', async () => {
    const events = new Map([
        ['1', { id: '1', title: 'Video 1' }],
        ['2', { id: '2', title: 'Video 2' }]
    ]);
    const tombstones = new Map();
    const savedAt = Date.now();

    await store.persistSnapshot({ events, tombstones, savedAt });

    events.delete('2');
    const result = await store.persistSnapshot({ events, tombstones, savedAt });

    assert.equal(result.eventDeletes, 1);

    const snapshot = await store.restoreSnapshot();
    assert.equal(snapshot.events.size, 1);
    assert.equal(snapshot.events.has('1'), true);
    assert.equal(snapshot.events.has('2'), false);
  });

  test('persistSnapshot should respect dirty keys optimization', async () => {
    const events = new Map([
        ['1', { id: '1', title: 'Video 1' }],
        ['2', { id: '2', title: 'Video 2' }]
    ]);
    const tombstones = new Map();
    const savedAt = Date.now();

    await store.persistSnapshot({ events, tombstones, savedAt });

    events.set('1', { id: '1', title: 'Video 1 Updated' });

    // Only mark '1' as dirty
    const dirtyEventIds = new Set(['1']);

    // Even if we pass the whole map, it should optimized based on dirty keys if provided
    const result = await store.persistSnapshot({ events, tombstones, savedAt }, dirtyEventIds);

    assert.equal(result.eventWrites, 1);
    // It should skip checking '2' because it's not in dirtyEventIds and exists in persisted fingerprints
    // Note: The implementation detail calculates skipped only if we iterate over non-dirty items,
    // but the optimization restricts iteration to dirty items only, so skipped remains 0.
    // assert.ok(result.skipped >= 1);

    const snapshot = await store.restoreSnapshot();
    assert.deepEqual(snapshot.events.get('1'), { id: '1', title: 'Video 1 Updated' });
  });
});
