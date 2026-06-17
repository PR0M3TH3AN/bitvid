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

### 1. Credential security review (highest priority)
- [ ] Audit how browser-held S3/R2 keys are stored in IndexedDB (the README's own warning).
  - Files: `js/services/storageService.js`, `js/r2.js` (legacy settings), `js/ui/profileModal/ProfileStorageController.js`.
  - Check: encryption at rest, unlock/lock model (`storageService.isUnlocked`), in-memory exposure window, what `resolveConnection` returns when locked, whether secrets can leak to logs/telemetry.
  - Confirm the "trusted operator only" assumption is actually enforced/communicated in the UI.

### 2. Bucket / custom-domain provisioning
- [ ] Audit `ensureBucketConfigForNpub` (`r2Service.js`) + `js/storage/r2-mgmt.js`
      (`ensureBucket`, `putCors`, `attachCustomDomainAndWait`, `setManagedDomain`,
      `deriveShortSubdomain`) for correctness + failure handling.
  - Check: Cloudflare management **API token** scope/usage, partial-failure recovery,
    CORS rule correctness, idempotency, what happens when the user pre-created the bucket.

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
