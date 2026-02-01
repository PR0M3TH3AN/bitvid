# Similar Content Logic Bug

This reproducer demonstrates bugs in the logic for calculating "Similar Content" candidates.

## The Bugs

The `computeSimilarContentCandidates` function in `js/app.js` (or related controller logic) has several issues identified by unit tests:

1.  **Empty Results:** It seems to be returning empty results even when valid candidates exist.
2.  **Tag Handling:** It may not be correctly identifying or counting shared tags.
3.  **Filtering:** It fails to return public videos when mixed with NSFW/Private ones (possibly due to returning nothing at all).

## Running the Reproducer

```bash
node --import ./tests/test-helpers/setup-localstorage.mjs examples/reproducers/3-similar-content-logic-bug/reproduce_issue.js
```

## Expected Output (Failure)

```
Running Similar Content Logic Reproducer...

FAIL: orders similar videos by shared tags then timestamp
   Expected 3 matches, got 0
FAIL: skips candidates without tag metadata
   Expected 1 match, got 0
FAIL: filters NSFW and private videos when NSFW content is disabled
   Expected ["video-public"], got []

Summary: FAIL
```
