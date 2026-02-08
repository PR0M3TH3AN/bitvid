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
    if (MockWorker.onCreate) {
        MockWorker.onCreate(this);
    }
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

  // Helper to simulate error event
  emitError(error) {
    if (this.listeners['error']) {
      this.listeners['error'].forEach((handler) => handler(error));
    }
  }
}

MockWorker.instances = [];
MockWorker.onPostMessage = null;
MockWorker.onCreate = null;

globalThis.Worker = MockWorker;

describe('nip04WorkerClient', () => {
  let encryptNip04InWorker;
  let consoleWarnMock;
  let originalWorker;

  // Helper to load a fresh module instance
  const loadModule = async () => {
    // Cache busting to ensure we get a fresh module instance (and thus fresh internal state)
    const mod = await import(`../../js/nostr/nip04WorkerClient.js?t=${Date.now()}-${Math.random()}`);
    return mod.encryptNip04InWorker;
  };

  before(() => {
    if (console.warn.mock) console.warn.mock.restore();
    consoleWarnMock = mock.method(console, 'warn', () => {});
    originalWorker = globalThis.Worker;
  });

  after(() => {
    if (consoleWarnMock) consoleWarnMock.mock.restore();
    globalThis.Worker = originalWorker;
  });

  beforeEach(() => {
    MockWorker.instances = [];
    MockWorker.onPostMessage = null;
    MockWorker.onCreate = null;
    globalThis.Worker = MockWorker;
  });

  it('should encrypt message successfully via worker', async () => {
    encryptNip04InWorker = await loadModule();

    MockWorker.onPostMessage = (worker, data) => {
      assert.strictEqual(data.privateKey, 'privKey');
      assert.strictEqual(data.targetPubkey, 'pubKey');
      assert.strictEqual(data.plaintext, 'hello');

      worker.emitMessage({
        id: data.id,
        ok: true,
        ciphertext: 'encrypted_data'
      });
    };

    const result = await encryptNip04InWorker({
      privateKey: 'privKey',
      targetPubkey: 'pubKey',
      plaintext: 'hello'
    });

    assert.strictEqual(result, 'encrypted_data');
  });

  it('should reject when worker returns error', async () => {
    encryptNip04InWorker = await loadModule();

    MockWorker.onPostMessage = (worker, data) => {
      worker.emitMessage({
        id: data.id,
        ok: false,
        error: { message: 'encryption failed', name: 'EncryptionError' }
      });
    };

    await assert.rejects(
      async () => {
        await encryptNip04InWorker({
          privateKey: 'privKey',
          targetPubkey: 'pubKey',
          plaintext: 'hello'
        });
      },
      (err) => {
        assert.strictEqual(err.message, 'encryption failed');
        assert.strictEqual(err.name, 'EncryptionError');
        return true;
      }
    );
  });

  it('should reject when worker emits error event', async () => {
    encryptNip04InWorker = await loadModule();

    MockWorker.onPostMessage = (worker, data) => {
      worker.emitError(new Error('Worker crashed'));
    };

    await assert.rejects(
      async () => {
        await encryptNip04InWorker({
            privateKey: 'privKey',
            targetPubkey: 'pubKey',
            plaintext: 'hello'
        });
      },
      (err) => {
        assert.strictEqual(err.message, 'Worker crashed');
        return true;
      }
    );
  });

  it('should timeout if worker does not respond', async () => {
    encryptNip04InWorker = await loadModule();

    MockWorker.onPostMessage = (worker, data) => {
      // Do nothing, let it timeout
    };

    await assert.rejects(
      async () => {
        await encryptNip04InWorker({
            privateKey: 'privKey',
            targetPubkey: 'pubKey',
            plaintext: 'hello',
            timeoutMs: 100 // Short timeout
        });
      },
      (err) => {
        assert.strictEqual(err.message, 'nip04-worker-timeout');
        return true;
      }
    );
  });

  it('should reject immediately if inputs are missing', async () => {
    encryptNip04InWorker = await loadModule();

    await assert.rejects(
      async () => {
        await encryptNip04InWorker({});
      },
      (err) => {
        assert.strictEqual(err.message, 'nip04-worker-invalid-input');
        return true;
      }
    );

     await assert.rejects(
      async () => {
        await encryptNip04InWorker({ privateKey: '', targetPubkey: 'pub' });
      },
      (err) => {
        assert.strictEqual(err.message, 'nip04-worker-invalid-input');
        return true;
      }
    );
  });

  it('should reject if Worker API is unavailable', async () => {
    globalThis.Worker = undefined;
    encryptNip04InWorker = await loadModule();

    await assert.rejects(
      async () => {
        await encryptNip04InWorker({
            privateKey: 'privKey',
            targetPubkey: 'pubKey',
            plaintext: 'hello'
        });
      },
      (err) => {
        assert.strictEqual(err.message, 'nip04-worker-unavailable');
        return true;
      }
    );
  });

  it('should handle worker creation failure', async () => {
      // Mock Worker to throw on instantiation
      globalThis.Worker = class ThrowingWorker {
          constructor() {
              throw new Error('Worker creation not allowed');
          }
      };

      encryptNip04InWorker = await loadModule();

      await assert.rejects(
          async () => {
              await encryptNip04InWorker({
                  privateKey: 'privKey',
                  targetPubkey: 'pubKey',
                  plaintext: 'hello'
              });
          },
          (err) => {
              assert.strictEqual(err.message, 'nip04-worker-unavailable');
              return true;
          }
      );

      // Verify warning was logged
      const calls = consoleWarnMock.mock.calls;
      const warning = calls.find(c => c.arguments[0] && String(c.arguments[0]).includes('Failed to create worker'));
      assert.ok(warning, 'Should log warning about worker creation failure');
  });
});
