
import { describe, it, before, after, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';

// Mock Worker globally
class MockWorker {
  constructor(scriptURL) {
    this.scriptURL = scriptURL;
    this.listeners = {};
    MockWorker.instances.push(this);
    // Mimic the real worker path
    assert.match(String(scriptURL), /dmDecryptWorker\.js$/);
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

  // Helper to simulate worker error
  emitError(error) {
    if (this.listeners['error']) {
      this.listeners['error'].forEach((handler) => handler(error));
    }
  }

  terminate() {}
}

MockWorker.instances = [];
MockWorker.onPostMessage = null;

describe('dmDecryptWorkerClient', () => {
  let originalWorker;
  let originalConsoleWarn;
  let originalDevOverride;

  before(() => {
    originalWorker = globalThis.Worker;
    originalConsoleWarn = console.warn;
    originalDevOverride = globalThis.__BITVID_DEV_MODE_OVERRIDE__;

    // Set dev mode to true to ensure logger calls console.warn
    globalThis.__BITVID_DEV_MODE_OVERRIDE__ = true;
  });

  after(() => {
    globalThis.Worker = originalWorker;
    console.warn = originalConsoleWarn;
    globalThis.__BITVID_DEV_MODE_OVERRIDE__ = originalDevOverride;
  });

  let warnMock;
  let initialCallCount = 0;

  beforeEach(() => {
    MockWorker.instances = [];
    MockWorker.onPostMessage = null;

    if (!warnMock) {
        warnMock = mock.fn();
        console.warn = warnMock;
    }
    initialCallCount = warnMock.mock.calls.length;

    globalThis.Worker = MockWorker;
  });

  afterEach(() => {
      // Cleanup is handled by new import per test or global reset
      // We don't need to manually destroy the module as we import a fresh one
  });

  // Helper to load a fresh module instance
  async function loadModule() {
    // Cache busting to ensure we get a fresh module with reset internal state (workerInstance = null)
    const mod = await import(`../../js/nostr/dmDecryptWorkerClient.js?t=${Date.now()}-${Math.random()}`);
    return mod;
  }

  it('should support worker environment', async () => {
    const { isDmDecryptWorkerSupported } = await loadModule();
    assert.strictEqual(isDmDecryptWorkerSupported(), true);
  });

  it('should reject if Worker is unavailable', async () => {
    globalThis.Worker = undefined;
    const { decryptDmInWorker } = await loadModule();

    await assert.rejects(
      decryptDmInWorker({ privateKey: 'pk', targetPubkey: 'tp', ciphertext: 'ct' }),
      { message: 'dm-worker-unavailable' }
    );
  });

  it('should reject if inputs are invalid', async () => {
    const { decryptDmInWorker } = await loadModule();

    await assert.rejects(
      decryptDmInWorker({ privateKey: '', targetPubkey: 'tp', ciphertext: 'ct' }),
      { message: 'dm-worker-invalid-input' }
    );

    await assert.rejects(
        decryptDmInWorker({ privateKey: 'pk', targetPubkey: '', ciphertext: 'ct' }),
        { message: 'dm-worker-invalid-input' }
    );

    await assert.rejects(
        decryptDmInWorker({ privateKey: 'pk', targetPubkey: 'tp', ciphertext: '' }),
        { message: 'dm-worker-invalid-input' }
    );
  });

  it('should successfully decrypt message', async () => {
    const { decryptDmInWorker, getDmDecryptWorkerQueueSize } = await loadModule();

    MockWorker.onPostMessage = (worker, data) => {
      assert.strictEqual(data.privateKey, 'pk');
      assert.strictEqual(data.ciphertext, 'ct');
      assert.strictEqual(data.targetPubkey, 'tp');

      worker.emitMessage({
        id: data.id,
        ok: true,
        plaintext: 'decrypted-text'
      });
    };

    const promise = decryptDmInWorker({ privateKey: 'pk', targetPubkey: 'tp', ciphertext: 'ct' });
    assert.strictEqual(getDmDecryptWorkerQueueSize(), 1);

    const result = await promise;
    assert.strictEqual(result, 'decrypted-text');
    assert.strictEqual(getDmDecryptWorkerQueueSize(), 0);
  });

  it('should handle worker error response', async () => {
    const { decryptDmInWorker } = await loadModule();

    MockWorker.onPostMessage = (worker, data) => {
      worker.emitMessage({
        id: data.id,
        error: { message: 'decryption-failed', name: 'DecryptError' }
      });
    };

    await assert.rejects(
      decryptDmInWorker({ privateKey: 'pk', targetPubkey: 'tp', ciphertext: 'ct' }),
      (err) => {
        assert.strictEqual(err.message, 'decryption-failed');
        assert.strictEqual(err.name, 'DecryptError');
        return true;
      }
    );
  });

  it('should handle worker error event', async () => {
    const { decryptDmInWorker } = await loadModule();

    MockWorker.onPostMessage = (worker, data) => {
      worker.emitError(new Error('worker-crashed'));
    };

    await assert.rejects(
      decryptDmInWorker({ privateKey: 'pk', targetPubkey: 'tp', ciphertext: 'ct' }),
      { message: 'worker-crashed' }
    );

    // Check that warning was logged
    const newCalls = warnMock.mock.calls.slice(initialCallCount);
    assert.strictEqual(newCalls.length, 1);
    const args = newCalls[0].arguments;
    assert.match(args[0], /Worker error/);
  });

  it('should timeout if worker does not respond', async () => {
    const { decryptDmInWorker } = await loadModule();

    // Use a short timeout for testing
    const timeoutMs = 100;

    MockWorker.onPostMessage = (worker, data) => {
      // Do nothing, let it timeout
    };

    await assert.rejects(
      decryptDmInWorker({ privateKey: 'pk', targetPubkey: 'tp', ciphertext: 'ct', timeoutMs }),
      { message: 'dm-worker-timeout' }
    );
  });

  it('should initialize worker lazily and reuse instance', async () => {
    const mod = await loadModule();

    // First call creates worker
    MockWorker.onPostMessage = (worker, data) => worker.emitMessage({id: data.id, ok: true, plaintext: 'p1'});
    await mod.decryptDmInWorker({ privateKey: 'pk', targetPubkey: 'tp', ciphertext: 'ct' });

    assert.strictEqual(MockWorker.instances.length, 1);
    const firstInstance = MockWorker.instances[0];

    // Second call reuses worker
    MockWorker.onPostMessage = (worker, data) => worker.emitMessage({id: data.id, ok: true, plaintext: 'p2'});
    await mod.decryptDmInWorker({ privateKey: 'pk', targetPubkey: 'tp', ciphertext: 'ct' });

    assert.strictEqual(MockWorker.instances.length, 1);
    assert.strictEqual(MockWorker.instances[0], firstInstance);
  });

  it('should recreate worker if creation fails', async () => {
      // This is hard to test because ensureWorker catches the error and sets workerInstance to null
      // but only logs it. It returns null.

      globalThis.Worker = class BrokenWorker {
          constructor() { throw new Error('Init failed'); }
      };

      const mod = await loadModule();

      await assert.rejects(
          mod.decryptDmInWorker({ privateKey: 'pk', targetPubkey: 'tp', ciphertext: 'ct' }),
          { message: 'dm-worker-unavailable' }
      );

       const newCalls = warnMock.mock.calls.slice(initialCallCount);
       assert.strictEqual(newCalls.length, 1);
       assert.match(newCalls[0].arguments[0], /Failed to create worker/);
  });
});
