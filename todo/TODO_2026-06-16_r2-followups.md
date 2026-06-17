# TODO — Cloudflare R2 system follow-ups (2026-06-16)

Backlog from the R2 audit. Branch: `unstable` (promote down to beta/main later).

## Done (for context — don't redo)
- [x] Upload audit #1 — content-address storage keys (no URL-first overwrite) — `066d98fe`
- [x] Upload audit #2 — "Analyzing" status during pre-upload hashing — `6b603cc2`
- [x] Upload audit #3 — flag/log optimistic (unconfirmed) relay publishes — `ac1dcff1`
- [x] Upload audit #4 — fail fast on 0-byte files — `04ae0ec4`
- [x] Upload audit #5 — surface thumbnail/.torrent upload failures — `3d6ffe99`
- [x] R2 object cleanup on **delete** (`R2Service.deleteVideoStorage`) — `95b51b6e`
- [x] R2 object cleanup on **edit** (URL replaced) — `33c701aa`

## Open — R2 areas not yet audited/built

### 1. Credential security review — DONE (2026-06-17, `200e5cec`)
- [x] Audited browser-held S3/R2 key storage. Verdict: **sound** — envelope encryption
      (AES-GCM-256 payload + fresh IV; master key encrypted to-self via the Nostr signer,
      NIP-44/NIP-04), in-memory master key cleared on logout, no secret logging, legacy
      plaintext migrated then cleared, secrets never in plaintext `meta`. Locked-in by a
      scan-the-whole-record regression test.
- [ ] Hardening (optional, post-launch): **idle auto-lock** — master key currently stays
      in memory the whole session after unlock. Add an idle/timeout auto-`lock(pubkey)`.
- [ ] Confirm the production CSP is strict (the real defense for in-memory keys / XSS).

### 2. Bucket / custom-domain provisioning — partially audited (2026-06-17)
- [x] CORS provisioning reviewed: `ensureBucketConfigForNpub` auto-creates the bucket +
      sets CORS best-effort (S3 `PutBucketCors`); the connection test (`verifyPublicAccess`)
      does a real browser upload+fetch and surfaces `buildCorsGuidance` on the opaque
      "Failed to fetch". Gap fixed: the **direct upload** path now also attaches CORS
      guidance via `isLikelyCorsError` (`<this commit>`), for users who skip the test.
- [ ] Still to check: `r2-mgmt.js` (`attachCustomDomainAndWait`, `setManagedDomain`,
      `deriveShortSubdomain`) — the managed-domain path; Cloudflare API-token scope;
      idempotency; partial-failure recovery. Note: token-based bucket creation/domain
      mgmt is marked deprecated in `ensureBucketConfigForNpub` — confirm it's fully unused.
- [ ] CORS replace-not-merge: `PutBucketCors` overwrites the whole config with only the
      current origin, so a bucket used from multiple bitvid origins keeps only the last.
      Consider merging existing origins.

### 3. CDN purge integration
- [ ] `scripts/purge-cloudflare-changed.mjs` uses `CLOUDFLARE_ZONE_ID` + `CLOUDFLARE_API_TOKEN`
      to purge changed `files`. It is **not wired into** the upload/edit/delete flows.
  - Decide: should publishing a new build / replacing an object trigger a targeted purge?
  - Note: this is for the *bitvid app* zone, separate from per-user R2 buckets.

## Open — follow-ups to the cleanup work we just shipped
- [ ] **Generic S3 cleanup**: `deleteVideoStorage` uses `makeR2Client` (R2/path-style).
      Add a generic-S3 path so `s3UploadService` users' deletes/edits also clean up.
- [ ] **All-versions delete cleanup**: delete currently cleans the target video's object;
      superseded versions from *past* edits (pre-`33c701aa`) are not retroactively cleaned.
      Consider enumerating all cached versions for a `videoRootId` on full delete.
- [ ] **Edit thumbnail cleanup**: currently skipped to avoid deleting a still-referenced
      thumbnail. Could diff old vs new thumbnail URL and clean the old one when it changed.

## Unrelated parking lot (from the infra tangent)
- [ ] Vercel dashboard: set production branch `bitvid-unstable`→`unstable`, `bitvid-beta`→`beta`
      (so pushes deploy to prod, not preview). Then redeploy `bitvid-unstable` to current HEAD.
- [ ] Optionally delete the `backup/{beta,main}-pre-unstable-sync` tags once confident.
