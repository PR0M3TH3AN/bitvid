# Popover Flip Bug Reproducer

This reproducer demonstrates a bug where the popover fails to flip to the top when the bottom viewport space is restricted.

## Running the Reproducer

1. Ensure dependencies are installed:
   ```bash
   npm ci
   npx playwright install chromium
   ```

2. Build the CSS (required for the test page):
   ```bash
   npm run build:css
   ```

3. Run the Playwright test using the reproducer config:
   ```bash
   npx playwright test -c examples/reproducers/playwright.config.ts examples/reproducers/popover-flip-bug/repro.spec.ts
   ```

## Expected Behavior

The test should FAIL with an assertion error similar to:
`Error: expect(received).toBeLessThanOrEqual(expected)`
indicating that the popover's bottom coordinate is outside the viewport.
