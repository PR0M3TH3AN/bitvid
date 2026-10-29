# Lessons

Hard-won lessons and recurring landmines.

## Cloudflare/S3 upload-path gotchas

`js/services/r2Service.js` and `js/services/s3UploadService.js` are near-identical
copies that must be changed in lockstep, and storage keys must stay
content-addressed (`computeStorageContentHash`) or URL-first uploads silently
overwrite objects. Full audited writeup in the doc below.

Authoritative source:
- docs/lessons/cloudflare-s3-upload-gotchas.md

## NIP-07 signer reliability

"DMs / lists / watch-history won't load after login" is almost always an
unresponsive NIP-07 signer extension, not bitvid — diagnose with a raw
`window.nostr` probe first, and never regress the five resilience invariants
(capped relay fan-out, NIP-07 circuit breaker, re-thrown transient decrypt
errors, generous decrypt budgets, lazy modal population).

Authoritative source:
- docs/lessons/nip07-signer-reliability.md
