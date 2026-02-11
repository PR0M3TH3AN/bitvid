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

## Map-to-Code & Verify
- [x] **NIP-04/44 Verification**: Create `tests/compliance/nip04_44_compliance.test.mjs` to verify fallback order and vector compliance.
- [x] **NIP-07 Verification**: Audit `runNip07WithRetry` for correct timeout/permission handling.
- [x] **Relay List Verification**: Create `tests/compliance/nip65_compliance.test.mjs` to verify Kind 10002 handling.
- [x] **Video Note Verification**: Create `tests/compliance/video_note_compliance.test.mjs` to verify Kind 30078 structure and NIP-71/94 mirroring.

## Remediation
- [x] Create PR/Issue for NIP-07 gaps. (None found)
- [x] Create PR/Issue for NIP-04/44 gaps. (None found)
- [x] Create PR/Issue for NIP-65 gaps. (None found)
- [x] Create PR/Issue for Kind 30078 gaps. (None found)

## Reporting
- [x] Generate `nip-report-YYYY-MM-DD.md`.
