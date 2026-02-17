# NIP Compliance Report - 2026-02-12

## Summary
Completed a rigorous audit of NIP compliance for `bitvid` (unstable). Verified P0 items (Auth, Encryption, Relay Lists, Video Notes, Watch History) via automated unit tests.

## Findings

### P0 Items (Critical)
| Item | NIPs | Status | Verification |
|------|------|--------|--------------|
| **Auth** | NIP-07 | **Compliant** | **New Test:** `tests/compliance/nip07_compliance.test.mjs` verifies retry logic and timeout handling in `runNip07WithRetry`. |
| **Encryption** | NIP-04, NIP-44 | **Compliant** | Verified `createNip46Cipher` prefers NIP-44 v2 and falls back to NIP-04. Verified decryption handles both formats. |
| **Relay Lists** | NIP-65 (Kind 10002) | **Compliant** | Verified `relayManager.loadRelayList` requests Kind 10002 and parses `read`/`write` markers correctly. |
| **Video Notes** | Kind 30078, NIP-71 | **Compliant** | Verified `prepareVideoPublishPayload` constructs Kind 30078 with proper `d` tag and embeds NIP-71 tags (`title`, `t`ags, etc). |
| **Watch History**| Kind 30079 | **Compliant** | Uses custom Kind 30079 (parameterized replaceable). Implements robust bucketing and NIP-44/04 encryption fallback. |

### Other Findings
- **NIP-51/56**: Block lists (Kind 10000/30002) and Reporting (Kind 1984) logic is implemented correctly in `userBlocks.js` and `moderationService.js`.
- **NIP-10**: Threading markers are correctly handled in `commentEvents.js`.

## Remediation
- Created `tests/compliance/nip07_compliance.test.mjs` to close the testing gap for authentication resilience.
- All targeted NIPs are currently **Compliant**.

## Next Steps
- Maintain `tests/compliance/` suite as part of CI if possible.
- Monitor NIP-21 (`nostr:` URI) usage if it becomes critical.
