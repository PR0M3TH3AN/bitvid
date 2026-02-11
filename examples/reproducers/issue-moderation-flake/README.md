# Moderation Flakiness Reproducer

This script reproduces a visual regression test flakiness in `tests/visual/moderation.spec.ts`.

## Issue
The test case "trusted mute hide fixture annotates mute reason and can be overridden" is flaky in headless environments due to layout issues (potentially 0x0 size) causing visibility checks to fail. The assertion `await expect(showAnywayButton).toBeVisible()` was commented out in the original test.

## How to Run

From the root of the repository:
```bash
npm run build
npx playwright test -c examples/reproducers/issue-moderation-flake/playwright.config.ts
```

## Expected Outcome
- The test `examples/reproducers/issue-moderation-flake/reproduce_flake.spec.ts` should fail in headless mode if the layout issue occurs.
- If the CSS loads correctly and the environment supports the layout, it may pass (flake is resolved).
