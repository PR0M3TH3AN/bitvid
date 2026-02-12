# NIP Compliance Todo

## Inventory Phase
- [x] Scan repo for all NIP references (NIP-xx) and Kind numbers.
- [x] Populate `NIP_INVENTORY.md` with findings.
- [x] Identify P0 items (Login, Relay Prefs, Encryption, Moderation, Video Notes).

## Research & Extract Spec
- [x] Research NIP-07 (Auth) - check `nip07Permissions.js`.
- [x] Research NIP-04 & NIP-44 (Encryption) - check `dmDecryptWorker.js`.
- [x] Research NIP-65 (Relay Lists) - check `relayManager.js`.
- [x] Research Kind 30078 (Video Notes) - check `client.js` & `videoPayloadBuilder.js`.
- [x] Research Kind 30079 (Watch History) - check `watchHistory.js`.

## Map-to-Code & Verify
- [x] **NIP-04/44 Verification**: Verified `tests/compliance/nip04_44_compliance.test.mjs` passes.
- [x] **NIP-07 Verification**: Created `tests/compliance/nip07_compliance.test.mjs` to verify retry logic.
- [x] **Relay List Verification**: Verified `tests/compliance/nip65_compliance.test.mjs` passes.
- [x] **Video Note Verification**: Verified `tests/compliance/video_note_compliance.test.mjs` passes.

## Remediation
- [x] Create PR/Issue for NIP-07 gaps. (Added test for retry/timeout)
- [x] Create PR/Issue for NIP-04/44 gaps. (None found)
- [x] Create PR/Issue for NIP-65 gaps. (None found)
- [x] Create PR/Issue for Kind 30078 gaps. (None found)

## Reporting
- [x] Generate `nip-report-2026-02-12.md`.
