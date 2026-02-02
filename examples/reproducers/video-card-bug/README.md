# VideoCard Block Action Bug Reproducer

This reproducer demonstrates a bug where the VideoCard fails to restore the trusted mute hide state after a block action is performed on an overridden video.

## Running the Reproducer

1. Ensure dependencies are installed:
   ```bash
   npm ci
   ```

2. Run the reproducer script:
   ```bash
   node examples/reproducers/video-card-bug/repro.mjs
   ```

## Expected Behavior

The test should FAIL with an assertion error similar to:
`AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: false !== true`
indicating that `contextAfterHide.activeHidden` is false instead of true.
