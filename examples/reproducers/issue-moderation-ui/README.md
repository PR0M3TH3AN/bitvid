# Moderation UI "Show Anyway" Bug Reproducer

This reproducer demonstrates the failure of the "Show anyway" button visibility check and click action in the moderation UI fixtures.

## Issue Description

In the moderation UI tests, the "Show anyway" button fails to be visible or clickable in the test environment (headless mode), even though the logic seems correct. This prevents verifying the "show anyway" override functionality.

## Running the Reproducer

To run the reproducer script:

```bash
npx playwright test examples/reproducers/issue-moderation-ui/repro.spec.ts
```

## Expected Result

The test should fail with a timeout waiting for the "Show anyway" button to be visible or clickable.
