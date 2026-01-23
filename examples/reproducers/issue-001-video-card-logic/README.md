# Issue 001: VideoCard Logic Failure

This reproducer demonstrates the bug where `VideoCard` block action fails to restore the trusted mute hide state after an override.

## Run
```bash
node --import ./tests/test-helpers/setup-localstorage.mjs examples/reproducers/issue-001-video-card-logic/repro.mjs
```

## Expected Result
The test should FAIL with an `AssertionError: false !== true`.
