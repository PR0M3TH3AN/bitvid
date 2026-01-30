import assert from 'node:assert';
import { test, describe, beforeEach, afterEach } from 'node:test';
import { createNip07Adapter } from '../../js/nostr/adapters/nip07Adapter.js';

describe('Nip07Adapter Race Condition', () => {
  let originalWindow;

  beforeEach(() => {
    originalWindow = global.window;
    global.window = {};
  });

  afterEach(() => {
    global.window = originalWindow;
  });

  test('should detect capabilities dynamically even if injected late', async () => {
    // 1. Setup initial window.nostr with NO encryption capabilities
    global.window.nostr = {
      getPublicKey: async () => 'pubkey',
      signEvent: async (e) => e,
      // nip04 and nip44 are missing initially
    };

    // 2. Initialize adapter
    const adapter = await createNip07Adapter();

    // 3. Verify initial state: capabilities should be false
    assert.strictEqual(adapter.capabilities.nip04, false, 'Should not have nip04 capability initially');
    assert.strictEqual(adapter.capabilities.nip44, false, 'Should not have nip44 capability initially');

    // 4. Simulate lazy injection of encryption APIs
    global.window.nostr.nip04 = { encrypt: () => {}, decrypt: () => {} };
    global.window.nostr.nip44 = { encrypt: () => {}, decrypt: () => {} };

    // 5. Verify dynamic state: capabilities should now be true
    assert.strictEqual(adapter.capabilities.nip04, true, 'Should detect nip04 capability after injection');
    assert.strictEqual(adapter.capabilities.nip44, true, 'Should detect nip44 capability after injection');
  });

  test('should call the injected method even if added late', async () => {
      // 1. Setup initial window.nostr with NO encryption capabilities
      global.window.nostr = {
        getPublicKey: async () => 'pubkey',
        signEvent: async (e) => e,
      };

      const adapter = await createNip07Adapter();

      // 2. Call nip04Encrypt - should fail or throw because it's missing
      await assert.rejects(async () => {
          await adapter.nip04Encrypt('pubkey', 'message');
      }, /NIP-04/); // Expect some error related to missing NIP-04

      // 3. Inject
      let called = false;
      global.window.nostr.nip04 = {
          encrypt: async () => { called = true; return 'encrypted'; },
          decrypt: async () => {}
      };

      // 4. Call again - should succeed
      const result = await adapter.nip04Encrypt('pubkey', 'message');
      assert.strictEqual(result, 'encrypted');
      assert.strictEqual(called, true);
  });
});
