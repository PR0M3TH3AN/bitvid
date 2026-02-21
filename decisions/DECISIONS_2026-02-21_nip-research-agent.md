# Decisions: NIP-42 Research

**Date:** 2026-02-21

## NIP Selection
- **Decision:** Focus on NIP-42.
- **Rationale:** Currently marked as "Unknown" in inventory. Relay authentication is a critical feature for private or paid relays.

## Implementation Status
- **Initial Observation:** `grep` for "AUTH" in `js/nostr/client.js` showed no relevant results for relay authentication command handling.
- **Codebase Analysis:**
  - `js/nostr/client.js` and `js/nostr/managers/ConnectionManager.js` use `SimplePool` from `nostr-tools`.
  - `nostr-tools` v2.19.4 is used.
  - No listeners for `"AUTH"` messages found on relay instances.
  - No logic to sign Kind 22242 events found.
- **Conclusion:** NIP-42 is **Non-compliant**.
