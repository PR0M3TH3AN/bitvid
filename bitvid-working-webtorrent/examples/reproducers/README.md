# Fuzz Testing Reproducers

This directory contains reproducers for crashes found during fuzz testing.
These files contain the input that caused a crash and the error message.

## How to run

The reproducers are JSON files. To re-run a specific case, you can use the fuzz harness and load the JSON input, or manually import the function and call it with the input.

Example structure:
```json
{
  "target": "functionName",
  "input": { ... },
  "error": { ... }
}
```

## Known Issues

- `buildVideoPostEvent` crashes on circular objects if not handled (Fixed).
- `normalizeAndAugmentMagnet` crashes on non-iterable `extraTrackers` (Fixed).
- `build...` functions crash on `null`/`undefined` input (Fixed).
