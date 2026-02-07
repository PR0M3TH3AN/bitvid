# LoginModalController JSDOM Leak Reproducer

Reproduction for the JSDOM async activity leak in LoginModalController tests.

## Usage

```bash
node examples/reproducers/issue-login-modal-leak/repro.mjs
```

## Expected Failure

The script should fail with an uncaught exception due to async activity after test end:
```
# Error: Test "LoginModalController shows NIP-46 handshake panel" ... generated asynchronous activity after the test ended. This activity created the error "ReferenceError: HTMLElement is not defined" ...
```
