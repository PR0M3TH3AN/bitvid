# Issue 002: Login Modal NSEC Error

This reproducer attempts to reproduce the issue where `login-modal` fails to find the `[data-nsec-error]` element.

## Run
```bash
npx playwright test examples/reproducers/issue-002-login-modal-nsec/repro.spec.ts
```

## Expected Result
If the bug is present, the test will FAIL waiting for `[data-nsec-error]` to be visible.
Note: In some environments, this test might pass if the bug is flaky or fixed.
