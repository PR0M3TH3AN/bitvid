# Hashtag Preferences Flakiness Reproducer

This script reproduces a flaky unit test in `tests/hashtag-preferences.test.mjs`.

## Issue
The original test case "load defers permission-required decrypts until explicitly enabled" was flaky due to `runNip07WithRetry/microtask` timing. The test has been extracted into a standalone script `reproduce_issue.mjs` here.

## How to Run

From the root of the repository:
```bash
node examples/reproducers/issue-hashtag-prefs/reproduce_issue.mjs
```

## Expected Outcome
- The test may pass (flake is resolved or timing is favorable).
- Or it may fail with an error related to "Decrypt permissions are required", but the assertion `decryptCalls.length` being 0 instead of 1 (if the promise resolution happens too late).
