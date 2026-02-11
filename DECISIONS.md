# Decisions Log

## NIP Compliance Decisions

| Date | Topic | Decision | Rationale |
|------|-------|----------|-----------|
| 2025-02-12 | Kind 30078 Tagging | Do not include `summary` tag in Kind 30078 event. | NIP-71 defines `summary` as the `content` field of the paired Kind 21/22 event. Duplicating it as a tag on Kind 30078 is not required by the spec and `buildNip71MetadataTags` correctly omits it. (See `js/nostr/nip71.js`) |
| 2025-02-12 | NIP-04/44 Fallback | Prefer NIP-44 v2, fallback to NIP-04. | Ensures compatibility with legacy clients while adopting the more secure NIP-44 standard where available. |
| 2025-02-12 | Relay Lists | Support Kind 10002. | NIP-65 is the standard for relay lists. `relayManager.js` implements this correctly. |
