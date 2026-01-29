# Reproducer for Moderation UI Visibility Bug

This reproducer demonstrates the issue where the "Show anyway" button and related moderation badges fail to render or be visible in the test environment (headless mode), despite logic suggesting they should be present.

## Issue Description
In `tests/visual/moderation.spec.ts`, several assertions are commented out because `expect(showAnywayButton).toBeVisible()` fails or clicking the button times out.

## How to Run

1.  Build the project (specifically CSS):
    ```bash
    npm run build
    ```

2.  Run the reproducer test (using the repro-specific config):
    ```bash
    npx playwright test -c examples/reproducers/playwright.config.ts examples/reproducers/issue-moderation-visibility/repro.spec.ts
    ```

## Expected Outcome
The test should fail at `await expect(showAnywayButton).toBeVisible();` or timeout.
