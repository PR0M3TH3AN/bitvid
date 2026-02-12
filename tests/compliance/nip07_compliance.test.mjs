
import test from 'node:test';
import assert from 'node:assert/strict';
import { runNip07WithRetry, NIP07_LOGIN_TIMEOUT_ERROR_MESSAGE, __testExports } from '../../js/nostr/nip07Permissions.js';

// Polyfill global window/logger if needed
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {};
}

// Mock logger to suppress console noise during tests
const mockLogger = {
  warn: () => {},
  log: () => {},
  info: () => {},
  error: () => {},
};

// We need to inject the mock logger into the module if possible, or just accept that it logs to console.
// The module imports devLogger/userLogger. We can't easily mock them without a module loader hook or dependency injection.
// However, the test should still pass even if it logs.

test('NIP-07 Compliance: Retry Logic', async (t) => {

  await t.test('runNip07WithRetry succeeds on first try', async () => {
    const operation = t.mock.fn(async () => 'success');
    const result = await runNip07WithRetry(operation, { timeoutMs: 100 });
    assert.equal(result, 'success');
    assert.equal(operation.mock.callCount(), 1);
  });

  await t.test('runNip07WithRetry retries on timeout error', async () => {
    let attempts = 0;
    const operation = t.mock.fn(async () => {
      attempts++;
      if (attempts === 1) {
        // First attempt simulates a timeout/hang
        // We can't easily simulate the *timeout* itself inside the operation because the wrapper controls it.
        // But runNip07WithRetry catches specifically NIP07_LOGIN_TIMEOUT_ERROR_MESSAGE.
        // The wrapper throws this error if the operation takes too long.
        // So we need the operation to actually take longer than the timeout.
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'slow';
      }
      return 'success';
    });

    // We set a very short timeout for the test
    const result = await runNip07WithRetry(operation, {
        timeoutMs: 20, // Should timeout the first attempt (50ms)
        retryMultiplier: 2
    });

    assert.equal(result, 'success');
    // It should have called it twice: once timed out, once succeeded
    // Note: The first call might technically still be running in background/promise land, but the retry logic starts a new one.
    assert.equal(operation.mock.callCount(), 2);
  });

  await t.test('runNip07WithRetry fails after max retries or if error is not timeout', async () => {
    const error = new Error('Random Error');
    const operation = t.mock.fn(async () => {
      throw error;
    });

    await assert.rejects(async () => {
        await runNip07WithRetry(operation, { timeoutMs: 100 });
    }, /Random Error/);

    assert.equal(operation.mock.callCount(), 1, 'Should not retry on non-timeout errors');
  });
});
