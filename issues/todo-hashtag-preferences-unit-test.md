# TODO: Fix flaky unit test in `tests/hashtag-preferences.test.mjs`

**Source:** `tests/hashtag-preferences.test.mjs:303`

**Context:**
The test case "load defers permission-required decrypts until explicitly enabled" has a commented-out section marked with a TODO.

```javascript
// TODO: This part of the test is flaky in CI environments.
// Logs confirm the code attempts decryption ("Attempting decryption via window.nostr fallback"),
// but the mock spy is not consistently called, likely due to runNip07WithRetry/microtask timing.
//
// await hashtagPreferences.load(pubkey, { allowPermissionPrompt: true });
// ...
```

**Problem:**
The test attempts to verify that `hashtagPreferences.load` retries decryption when `allowPermissionPrompt` is set to `true` after a previous failure. However, the mock spy for the decryption method is not consistently called in the test environment, leading to flakiness. This is likely due to race conditions or timing issues with `runNip07WithRetry` or microtask processing.

**Suggested Next Steps:**

1.  Uncomment the test code.
2.  Investigate the timing of the `load` call and the mock invocation.
3.  Consider using `fakeTimers` or explicit promise resolution waits to ensure the async operations complete before assertion.
4.  Verify the fix by running the test multiple times locally and in CI (if possible).
