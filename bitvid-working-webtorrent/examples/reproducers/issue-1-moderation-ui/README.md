# Moderation UI "Show Anyway" Bug Reproducer

This directory contains a minimal reproducer for the bug where the "Show anyway" button is not visible in headless mode (or specific environments) within the moderation fixtures.

## Issue

The "Show anyway" button fails `toBeVisible()` check in tests, causing false negatives in moderation UI tests.

## Running the Reproducer

Run the following command from the repository root:

```bash
npx playwright test -c examples/reproducers/issue-1-moderation-ui/playwright.config.ts
```

Expected result: The test should **fail** with `Error: expect(locator).toBeVisible() failed`.
