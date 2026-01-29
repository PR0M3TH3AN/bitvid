# Reproducer for Popover Viewport Bug

This reproducer demonstrates the flaky issue where the popover fails to flip to the top in a restricted viewport.

## Issue Description
In `tests/e2e/popover.spec.ts`, the test "keeps the bottom-right grid menu inside the viewport" is skipped because it is flaky or fails. This script unskips it to reproduce the failure.

## How to Run

1.  Build the project (specifically CSS):
    ```bash
    npm run build
    ```

2.  Run the reproducer test (using the repro-specific config):
    ```bash
    npx playwright test -c examples/reproducers/playwright.config.ts examples/reproducers/issue-popover-viewport/repro.spec.ts
    ```

## Expected Outcome
The test might fail with a placement assertion error (expected 'top...', got 'bottom...') or similar.
