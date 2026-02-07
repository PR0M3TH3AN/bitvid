# VideoCard Block State Reproducer

Reproduction for the bug where VideoCard block action fails to restore trusted mute hide state after override.

## Usage

```bash
node examples/reproducers/issue-moderation-block-state/repro.mjs
```

## Expected Failure

The script should fail with an assertion error:
```
not ok 1 - VideoCard block action restores trusted mute hide state after override
...
  error: |-
    Expected values to be strictly equal:

    false !== true
```
