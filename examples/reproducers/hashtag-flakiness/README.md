# Hashtag Preferences Flakiness Reproducer

This reproducer attempts to demonstrate flakiness in the unit test `tests/hashtag-preferences.test.mjs`, specifically the test case `"load defers permission-required decrypts until explicitly enabled"`.

This test was reported as flaky in CI due to timing issues with `runNip07WithRetry` and microtasks when simulating explicit permission retries.

## Usage

Run the reproducer script:

```bash
node examples/reproducers/hashtag-flakiness/repro.mjs
```

This script will run the unit test file 20 times in a loop. If it fails on any iteration, it will exit with an error code and print the iteration number.

## Expected Behavior

If the issue is reproducible, the script should fail within the 20 iterations.
If the issue is not reproducible (e.g. fixed, or requires specific CI conditions), the script will complete all 20 iterations successfully.
