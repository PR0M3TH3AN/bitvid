# NIP Research Report — 2026-02-21

**Agent:** bitvid-nip-research-agent
**Focus:** NIP-09 (Deletion), NIP-21 (URI Scheme), NIP-42 (Auth).

## 1. Inventory Updates

| NIP | Previous Status | New Status | Findings |
|---|---|---|---|
| **NIP-09** | Partial | **Compliant** | `js/nostr/client.js` implements `deleteAllVersions` which performs both soft delete (tombstone) and hard delete (Kind 5). `js/nostrEventSchemas.js` defines correct Kind 5 schema. |
| **NIP-21** | Unknown | **Partial** | `js/app/routerCoordinator.js` strips `nostr:` prefix but delegates to `js/utils/nostrHelpers.js` which only handles `npub1...` and hex. URIs like `nostr:nprofile1...` or `nostr:nevent1...` fail. |
| **NIP-42** | Non-compliant | **Non-compliant** | Confirmed total absence of `AUTH` message handling in `js/nostr/client.js` and `ConnectionManager`. |

## 2. Compliance Details

### NIP-09 (Event Deletion)
- **Status:** Compliant.
- **Evidence:** `NostClient.deleteAllVersions` creates Kind 5 events with proper `e` and `a` tags referencing all historical versions. It also performs local tombstoning.
- **Action:** Updated status in inventory.

### NIP-21 (`nostr:` URI Scheme)
- **Status:** Partial.
- **Evidence:**
  - `routerCoordinator.js` handles `nostr:` prefix.
  - `nostrHelpers.normalizeHexPubkey` strictly checks for `startsWith('npub1')`.
  - Verification script `scripts/verify-nip21.mjs` confirmed failure for `nprofile`.
- **Gap:** Navigation via `nostr:nprofile...` or `nostr:naddr...` is not supported.
- **Recommendation:** Update `normalizeHexPubkey` to support `nprofile` decoding via `nostr-tools`.

### NIP-42 (Relay Auth)
- **Status:** Non-compliant.
- **Evidence:** `grep "AUTH" js/` yielded no protocol handler results. `SimplePool` usage does not enable auth.
- **Impact:** Cannot connect to relays requiring authentication (e.g. paid relays).
- **Recommendation:** Implement `AUTH` challenge handler in `ConnectionManager`.

## 3. Artifacts Created
- `artifacts/nips/09.md` (Fetched)
- `artifacts/nips/21.md` (Fetched)
- `artifacts/nips/42.md` (Fetched)
- `scripts/verify-nip21.mjs` (Reproduction script)

## 4. Next Steps
- **P1:** Fix NIP-21 support in `js/utils/nostrHelpers.js` to handle `nprofile` and `naddr`.
- **P2:** Implement NIP-42 Auth flow.
