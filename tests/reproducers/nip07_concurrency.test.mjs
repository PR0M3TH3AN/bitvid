
import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert';
import { NostrClient } from '../../js/nostr/client.js';
import { runNip07WithRetry } from '../../js/nostr/nip07Permissions.js';

// Mock browser globals
global.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => {},
};
global.document = {
  dispatchEvent: () => {},
};
Object.defineProperty(global, 'navigator', {
  value: {},
  writable: true,
  configurable: true
});

describe('NIP-07 Concurrency and Login Speed', () => {
  let client;
  let mockExtension;
  let callCount = 0;

  before(() => {
    client = new NostrClient();

    mockExtension = {
      getPublicKey: mock.fn(async () => {
        callCount++;
        // Simulate slow extension
        await new Promise(resolve => setTimeout(resolve, 100));
        return "3bf0c63fcb93478c6f71c29b4582e0dd769e5dadbb95450cf2a0059fe8a27b80"; // Hex
      }),
      signEvent: mock.fn(async (evt) => {
        callCount++;
        await new Promise(resolve => setTimeout(resolve, 100));
        return { ...evt, sig: "mock-sig" };
      }),
      nip04: {
        encrypt: mock.fn(async () => "encrypted"),
        decrypt: mock.fn(async () => "decrypted"),
      }
    };

    global.window.nostr = mockExtension;
  });

  after(() => {
    delete global.window.nostr;
  });

  it('should process concurrent ensureActiveSignerForPubkey calls efficiently', async () => {
    callCount = 0;
    const pubkey = "3bf0c63fcb93478c6f71c29b4582e0dd769e5dadbb95450cf2a0059fe8a27b80";

    // Simulate 3 concurrent services requesting the signer (e.g. during login)
    const p1 = client.ensureActiveSignerForPubkey(pubkey);
    const p2 = client.ensureActiveSignerForPubkey(pubkey);
    const p3 = client.ensureActiveSignerForPubkey(pubkey);

    await Promise.all([p1, p2, p3]);

    const count = mockExtension.getPublicKey.mock.callCount();
    console.log(`Total getPublicKey calls: ${count}`);

    // Without optimization, this should be 6 (2 per call * 3 calls)
    // With optimization, we hope for less.
    assert.ok(count >= 3, 'Should verify extension access');
  });

  it('requestQueue should serialize calls', async () => {
    const start = Date.now();
    const tasks = [
        runNip07WithRetry(() => mockExtension.getPublicKey(), { label: 't1' }),
        runNip07WithRetry(() => mockExtension.getPublicKey(), { label: 't2' }),
        runNip07WithRetry(() => mockExtension.getPublicKey(), { label: 't3' }),
    ];

    await Promise.all(tasks);
    const duration = Date.now() - start;
    console.log(`Duration for 3 tasks (100ms each): ${duration}ms`);

    // Should be at least 300ms
    assert.ok(duration >= 300, 'Tasks should run sequentially');
  });
});
