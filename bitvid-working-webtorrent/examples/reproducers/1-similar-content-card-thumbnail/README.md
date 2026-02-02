# SimilarContentCard Thumbnail Blur Bug Reproducer

This reproducer demonstrates a bug where `SimilarContentCard` clears the backdrop image (CSS variable `--similar-card-thumb-url`) when the thumbnail is blurred, causing a regression in `SimilarContentCard.test.mjs`.

## Issue

The `SimilarContentCard` component explicitly clears the backdrop image when `shouldBlur` is true to prevent sharp background showing through the blurred image. However, the unit tests expect the backdrop to be set to the fallback image even when blurred.

## How to run

From the repository root:

```bash
node --import ./tests/test-helpers/setup-localstorage.mjs examples/reproducers/1-similar-content-card-thumbnail/reproduce_issue.js
```

## Expected Output

The script should fail with an assertion error indicating that the CSS variable is empty instead of the expected URL.

```
CSS variable should be set to fallback src. Expected url("https://cdn.example.com/fallback.jpg"), got ''
```
