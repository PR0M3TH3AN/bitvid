# Decisions: Constants Refactor (2026-02-16)

- `5000` ms used for UI message auto-hide:
    - Chosen canonical constant: `SHORT_TIMEOUT_MS`
    - Location: `js/constants.js`
    - Reason: It matches the intent of a short timeout for user feedback.

- `5000` ms used for NIP-07 decryption timeout:
    - Chosen canonical constant: `NIP07_EXTENSION_WAIT_TIMEOUT_MS`
    - Location: `js/nostr/nip07Permissions.js`
    - Reason: It is defined specifically for this purpose in the relevant module.
