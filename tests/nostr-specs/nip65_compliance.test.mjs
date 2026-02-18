import { test, describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { relayManager } from '../../js/relayManager.js';
import { nostrClient, setActiveSigner } from '../../js/nostrClientFacade.js';

// Mock browser globals
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    location: { protocol: 'https:' },
    localStorage: {
        getItem: () => null,
        setItem: () => {},
    }
  };
}

describe('NIP-65 / Kind 10002 Compliance', () => {
  let originalPool;
  let originalSigner;

  before(() => {
    // Save original state
    originalPool = nostrClient.pool;
  });

  after(() => {
    // Restore original state
    nostrClient.pool = originalPool;
  });

  beforeEach(() => {
    relayManager.reset();
  });

  it('should parse NIP-65 relay list events correctly', async () => {
    const pubkey = '00'.repeat(32);
    const mockEvent = {
      kind: 10002,
      pubkey: pubkey,
      created_at: 1000,
      tags: [
        ['r', 'wss://relay.example.com'],
        ['r', 'wss://read.example.com', 'read'],
        ['r', 'wss://write.example.com', 'write'],
      ],
      content: ''
    };

    // Mock pool.list to return our event
    nostrClient.pool = {
      list: async () => [mockEvent],
      publish: async () => {},
    };

    const result = await relayManager.loadRelayList(pubkey);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.source, 'event');

    const entries = relayManager.getEntries();
    assert.strictEqual(entries.length, 3);

    const both = entries.find(e => e.url === 'wss://relay.example.com');
    assert.ok(both);
    assert.strictEqual(both.mode, 'both');
    assert.strictEqual(both.read, true);
    assert.strictEqual(both.write, true);

    const read = entries.find(e => e.url === 'wss://read.example.com');
    assert.ok(read);
    assert.strictEqual(read.mode, 'read');
    assert.strictEqual(read.read, true);
    assert.strictEqual(read.write, false);

    const write = entries.find(e => e.url === 'wss://write.example.com');
    assert.ok(write);
    assert.strictEqual(write.mode, 'write');
    assert.strictEqual(write.read, false);
    assert.strictEqual(write.write, true);
  });

  it('should build a valid Kind 10002 event for publishing', async () => {
    const pubkey = '00'.repeat(32);

    // Set up relays
    relayManager.setEntries([
        { url: 'wss://relay.example.com', mode: 'both' },
        { url: 'wss://read.example.com', mode: 'read' },
    ]);

    // Mock signer
    // Use 'local' type to bypass permission check in relayManager
    const mockSigner = {
      type: 'local',
      signEvent: async (evt) => {
        return { ...evt, id: 'mock-id', sig: 'mock-sig', pubkey };
      }
    };

    setActiveSigner(mockSigner);

    // Mock pool.publish to capture the event
    let capturedEvent = null;
    nostrClient.pool = {
      publish: (urls, event) => {
        capturedEvent = event;
         // Return a promise-like object that resolves
         return {
            on: (evt, cb) => { if (evt === 'ok') cb(); },
            then: (cb) => { cb(); }
         };
      }
    };

    await relayManager.publishRelayList(pubkey);

    assert.ok(capturedEvent);
    assert.strictEqual(capturedEvent.kind, 10002);
    assert.strictEqual(capturedEvent.pubkey, pubkey);

    // Check tags
    const rTags = capturedEvent.tags.filter(t => t[0] === 'r');
    assert.strictEqual(rTags.length, 2);

    // Note: relayManager normalizes URLs (no trailing slash if empty path)
    const bothTag = rTags.find(t => t[1] === 'wss://relay.example.com');
    assert.ok(bothTag, 'Missing tag for wss://relay.example.com');
    // 'both' usually has no marker or explicit? relayManager uses parseRelayTags/buildRelayListEvent logic.
    // buildRelayListEvent: if mode is read -> read, write -> write, else -> no marker (both)
    assert.strictEqual(bothTag.length, 2); // ['r', 'url']

    const readTag = rTags.find(t => t[1] === 'wss://read.example.com');
    assert.ok(readTag, 'Missing tag for wss://read.example.com');
    assert.strictEqual(readTag[2], 'read');
  });
});
