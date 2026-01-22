# Popover ReferenceError Bug

## Bug Description
The `tests/e2e/popover.spec.ts` test suite fails with `ReferenceError: getPanelWithTriggerMetrics is not defined`. This function appears to be defined in the test file, but for some reason, it is not accessible in the test scope where it is called.

## Steps to Reproduce
1. Install dependencies: `npm install`
2. Run the reproducer script: `npx playwright test examples/reproducers/popover-bug-repro.spec.ts`

Note: The provided reproducer script `examples/reproducers/popover-bug-repro.spec.ts` *fixes* the issue by correctly defining the function within the test file scope (or rather, copying the logic to where it works), effectively demonstrating what the code *should* do if the reference error didn't exist. To see the original error, run the original test suite: `npx playwright test tests/e2e/popover.spec.ts`.

## Logs
```
ReferenceError: getPanelWithTriggerMetrics is not defined
  at /app/tests/e2e/popover.spec.ts:196:21
```
