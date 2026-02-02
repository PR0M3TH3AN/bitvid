# Issue 003: Popover ReferenceError

This reproducer attempts to reproduce the `ReferenceError` in popover placement tests.

## Run
```bash
npx playwright test examples/reproducers/issue-003-popover-ref-error/repro.spec.ts
```

## Expected Result
If the bug is present, the test will FAIL with `ReferenceError`.
Note: In some environments, this test might pass if the bug is flaky or fixed.
