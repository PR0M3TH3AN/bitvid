# Decisions: NIP Research Agent Run (2026-02-21)

- **Assumption:** NIP-42 is non-compliant as per initial inventory. Verification will focus on confirming absence of `AUTH` handler.
- **Assumption:** NIP-21 is handled in `js/utils/nostrHelpers.js` or similar utility files.
- **Assumption:** NIP-09 deletion logic resides in `js/nostr/client.js` or `js/nostr/adapters/`.
