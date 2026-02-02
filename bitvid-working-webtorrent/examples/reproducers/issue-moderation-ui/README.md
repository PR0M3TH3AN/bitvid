# Moderation UI "Show Anyway" Button Visibility Issue Reproducer

This reproducer demonstrates the issue where the "Show anyway" button in the moderation UI is not visible (or not interactable) in the test environment, even though the logic seems correct.

## Issue Description
- **Known Issue**: `KNOWN_ISSUES.md`: Moderation UI (`tests/visual/moderation.spec.ts`): The "Show anyway" button and related moderation badges fail to render in the test environment, causing `toBeVisible()` assertions to fail.
- **Symptoms**: `Error: element(s) not found` when asserting visibility of the "Show anyway" button.

## How to Run

1.  Navigate to the repository root.
2.  Ensure dependencies are installed and the project is built:
    ```bash
    npm ci
    npm run build
    npx playwright install chromium
    ```
3.  Run the reproducer script using the provided config:
    ```bash
    npx playwright test -c examples/reproducers/issue-moderation-ui/playwright.config.ts
    ```

## Expected Output
The test `repro: show anyway override button visibility` should **fail** with a timeout or "element not found" error on the assertion `await expect(showAnywayButton).toBeVisible();`.
