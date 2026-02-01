# Moderation UI Failure Reproducer

This reproducer demonstrates a known issue where the "Show anyway" button and related moderation badges fail to render or be interactable in the test environment (headless mode), despite logic indicating they should be present.

## Issue Description
As noted in `KNOWN_ISSUES.md`:
> **Moderation UI (`tests/visual/moderation.spec.ts`)**: The "Show anyway" button and related moderation badges fail to render in the test environment, causing `toBeVisible()` assertions to fail. The logic for creating the button appears correct (`allowOverride` is true), but the button element is not found in the DOM during the test execution.

## How to Run

1.  Ensure the project is built:
    ```bash
    npm run build
    ```

2.  Run the reproducer test using the custom config (which sets the correct test directory and server context):
    ```bash
    npx playwright test -c examples/reproducers/playwright.config.ts examples/reproducers/issue-moderation-ui/repro.spec.ts
    ```

## Expected Output
The test should FAIL with timeout errors waiting for the "Show anyway" button to be visible or clickable.
