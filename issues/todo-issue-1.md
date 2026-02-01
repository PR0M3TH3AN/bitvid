# todo: Investigate flaky hashtag preferences test in CI

**File:** `tests/hashtag-preferences.test.mjs` (Line 307)
**Priority:** Medium
**Tags:** ai, needs-review

**Description:**
The test "load defers permission-required decrypts until explicitly enabled" contains commented-out code marked with a TODO indicating flakiness in CI environments.

**Context:**
```javascript
      // TODO: This part of the test is flaky in CI environments.
      // Logs confirm the code attempts decryption ("Attempting decryption via window.nostr fallback"),
      // but the mock spy is not consistently called, likely due to runNip07WithRetry/microtask timing.
      //
      // await hashtagPreferences.load(pubkey, { allowPermissionPrompt: true });
      //
      // assert.equal(
      //   decryptCalls.length,
      //   1,
      //   "explicit permission prompts should retry decryption",
      // );
      // assert.deepEqual(hashtagPreferences.getInterests(), ["late"]);
```

**Suggested Next Step:**
Investigate the timing issues with `runNip07WithRetry` and the microtask queue to reliably mock the permission prompt behavior in tests.
