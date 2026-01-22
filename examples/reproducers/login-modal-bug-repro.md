# Login Modal Bug

## Bug Description
The login modal fails to show error messages when invalid input (or no input) is submitted. Specifically, in the nsec/key login flow, submitting without entering a key should display an error message "Paste an nsec, hex key, or mnemonic to continue.", but the error element remains hidden. This is observed in `tests/e2e/ui-modals.spec.ts`.

## Steps to Reproduce
1. Install dependencies: `npm install`
2. Run the reproducer script: `npx playwright test examples/reproducers/login-modal-bug-repro.spec.ts`

## Logs
```
Error: expect(locator).toBeVisible() failed
Locator: locator('[data-nsec-error]')
Expected: visible
Received: hidden
Timeout: 5000ms
```
