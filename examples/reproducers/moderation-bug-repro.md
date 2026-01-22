# Moderation UI Bug

## Bug Description
The "Show anyway" button in the moderation UI fails to render in the test environment, causing `toBeVisible()` assertions to fail. This is observed in `tests/visual/moderation.spec.ts`. The logic for creating the button appears correct (`allowOverride` is true), but the button element is not found in the DOM during the test execution. This might be due to a race condition in the test fixture's state initialization or an environment-specific rendering issue.

## Steps to Reproduce
1. Install dependencies: `npm install`
2. Run the reproducer script: `npx playwright test examples/reproducers/moderation-bug-repro.spec.ts`

## Logs
```
Error: expect(locator).toBeVisible() failed
Locator: locator('[data-test-id="show-anyway"]').getByRole('button', { name: 'Show anyway' })
Expected: visible
Timeout: 5000ms
Error: element(s) not found
```
