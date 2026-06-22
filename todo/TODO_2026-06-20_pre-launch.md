# TODO — Pre-launch fixes & audits (2026-06-20)

Consolidated pre-launch backlog. Branch: `unstable` (promote down to beta/main later).
Cadence: audit → small separately-committed fixes → cheat-resistant (mutation-verified)
tests → `npm run build` + `npm run test:unit` green → commit + push.

## Done this session (for context — don't redo)
- [x] Background watch-history preload after login — `512b6c3f`
- [x] Multi-webseed support (upload + edit management)
- [x] 10/10 file-size decompositions (real extraction, not baseline bumps)
- [x] WebTorrent feed-scroll freeze fix (probe concurrency 96→4, maxConns caps) — `126ac75a`
- [x] "No active signer" on storage unlock after refresh — `0031d68b` / `f383cde4`
- [x] Relay removal routing fix (`mainController.runRelayOperation`) — `95071fd1`
- [x] Publish array-return fix (nostr-tools 2.17 per-relay promises; no uncaught-rejection flood) — `6984fb2e`
- [x] Empty-thumbnail-on-publish fix — `f218ec32`
- [x] Relay list tab: live/dead status pills + insecure-relay hints
- [x] Edit modal upload parity (replace video + thumbnail file) — `c8a63c57`
- [x] Edit: clean up superseded thumbnail (orphan removal) — `3aef97f0`
- [x] **Feed never blank**: always reserve live default relays in the feed set — `de515462` (+ spec test `6b63625d`)
- [x] **Publish feedback**: "published to N/M relays" outcome toast — `3f4299a8`
- [x] **Delete safety**: warn when a hosted file is left behind by locked storage — `f0eecec0`
- [x] **Video delete propagation**: tombstones publish to write relays — `afb6200b`
- [x] **Watch-history delete**: replace (not merge) semantics — `5f19f536`
- [x] **My Videos tab** (Phase 1 + 2): per-video health (no-source/dead/deleted),
      thumbnails, Edit/Delete, bucket reconciliation (missing-file + orphan cleanup)
      — `8cb03d23`…`9d3a0df0`
- [x] **CI**: visual-regression moved to its own job so it no longer blocks deploy — `73a06069`
- [x] **Vercel**: disable auto-deploy for `unstable`; deploy on demand via
      `vercel deploy --prod` — `ba1f492f`

## Open — high priority (launch-blocking candidates)

### 1. Delete is not fully working — tombstoned videos still show in the UI
- [x] **Root cause found + fixed** (`afb6200b`): deletes published only to the CAPPED
      read set (<=8) while videos publish to the full write set, so relays outside
      the subset kept serving the original → resurrection. Now both delete paths
      (soft-delete tombstone + NIP-09) use `getDeletePublishRelays()` (write set).
      Tombstone created_at was already bumped strictly-newer, so this closes the gap.
- [ ] **Verify with the user** that zombies are gone after this fix. If any remain,
      remaining suspects to audit:
      - Is the local cache / `videosMap` + persisted `bitvid:filtered-videos:v1`
        purged on delete, and does the feed filter honor `deleted` + tombstones on
        an optimistic (cache-first) reload?
      - Are NIP-71 (kind 22) + NIP-94 (kind 1063) mirrors also tombstoned, or can a
        lingering mirror resurrect the card?
      - getActiveKey mismatch between original (pubkey:dTag) and tombstone (ROOT:…)
        for edge-case legacy videos.
- [ ] Add a feed-level regression test (seed event → delete → assert not rendered)
      once the cache/mirror angles above are confirmed.

### 2. Watch history delete does not work at all
- [x] **Root cause found + fixed** (`5f19f536`): the removal path called
      `watchHistoryService.snapshot(remaining, …)` but snapshot published WITHOUT
      `replace:true`, and the default merges incoming items with the cached list —
      so the removed item was merged straight back (no effect). Removing the last
      item fell through to republishing the pending queue instead of clearing.
      Fixed: snapshot honors `replace` (incl. empty = clear), both removal call
      sites pass `replace:true`. Mutation-verified.
- [x] Confirmed the NIP-51 list publish already uses the WRITE relays
      (`publishRecords` → `getWriteRelays`), so it does NOT have the #1 relay-scope
      bug. The replace-semantics fix is the complete fix.
- [x] **Second root cause found + fixed** (`fff2bef2`): reads UNION items across all
      events relays return, and a publish only reports ok when ALL relays accept. With
      a flaky relay list the reduced event reached some relays while others kept the
      old copy; the reader deduped by event id, so stale+fresh versions of the same
      month (d-tag) were unioned → removed items resurrected. Now
      dedupeNewestPerReplaceableAddress keeps only the newest event per d-tag at both
      read union sites. Live on unstable.bitvid.network (module verified served).
- [x] **Third gap fixed** (`a3799f3f`): clearing the LAST item of a month (or
      clearing all) didn't propagate — `publishMonthRecord` early-returned on an
      empty month, so the clearing event updateWatchHistoryList intended was never
      published. Now an empty month publishes a newest EMPTY replaceable event for
      its d-tag, so the clear takes effect (and reads see it as empty). Live.
- [x] **THE actual bug for the profile pane** (`4c6415c2`): the profile modal's
      history renderer overrode `remove` to route through onHistoryReady →
      app.handleProfileHistoryEvent(), a no-op stub (`return null`) left from the
      synced-vs-local refactor. So profile-pane deletes published NOTHING (card
      vanished optimistically, reappeared on refresh) — which is why the earlier
      three fixes (publish/read layer) never helped there. Removed the override so
      it uses the working defaultRemoveHandler. Live.
- [x] **Logged-out / local-only delete** (`2f95d448`): snapshot no-op'd for
      local-only actors, so removing from the local queue did nothing. A replace
      snapshot now rewrites the local queue (replaceLocalQueue). Live.
- [x] **All-relays false-failure fixed** (`565a9618`): publishMonthRecord reported
      success only when EVERY write relay accepted, so on a 20+ relay list every
      snapshot was "partial-relay-acceptance" -> ok:false -> the logged-in remove
      threw "watch-history-snapshot-failed" (even though major relays accepted) AND
      new watches never persisted. Now success = acceptedCount > 0. Live.
- [ ] **Verify with the user**: logged-IN profile-pane delete + clear, AND
      logged-OUT local delete + clear, all stick across reload; AND that newly
      watched videos now appear in history (was blocked by the same all-relays bug).
- [ ] Backfill regression tests: a profile-pane wiring test (remove not routed to a
      no-op) — the existing profile-modal-controller test file has an unusual
      wrapper, so add carefully — plus a feed/view-level seed→delete→assert test.
      (Local + publish/read layers are already unit+mutation tested.)

### 3. Zaps system + platform-fee zap split
- [ ] Audit the zap flow (NWC / `nwcClient.js`, `zapController.js`, `zapReceiptValidator.js`).
- [ ] Verify the platform-fee split: correct recipients, correct percentages, rounding,
      and that the fee can't silently swallow the whole zap or be bypassed.
- [ ] Confirm zap-receipt validation (kind 9735) is accurate before crediting.

### 4. View counter accuracy & reliability
- [ ] Audit the view-counter system (`viewEvents.js`, `reactionCounter.js`) for
      accuracy and reliability — dedup per viewer/session, relay aggregation,
      double-counting, and resilience to dead relays (now that feed defaults are
      reserved, ensure view reads/writes use a sane relay set too).

### 5. Card-hide / video-liveness check
- [ ] Audit the card-hide system that gates a card on a video-liveness probe
      (`gridHealth.js`, probe concurrency now 4). Confirm: dead URL/magnet hides the
      card correctly, a live video is never falsely hidden, and the probe can't
      stampede connections (regression risk from the freeze fix).

## Open — medium priority

### 6. Test S3 (generic, non-R2) functions
- [ ] End-to-end test the generic-S3 path (not just Cloudflare R2): upload, thumbnail,
      `.torrent`, public-base-URL resolution, CORS guidance, and **delete/edit cleanup**
      (provider-aware path-style). Confirm `forcePathStyle` is honored throughout.

### 7. Mobile + video-card layout
- [ ] Improve mobile layout and the video card layout.
- [ ] Consider removing the CDN/WebTorrent source badge from the card (clutter).
- [ ] Run `npm run test:visual` after layout changes; update baselines deliberately.

### 8. Orphan storage garbage-collection tool
- [x] **Largely delivered by the My Videos tab** (`9d3a0df0`): lists bucket objects no
      live note references and offers per-file delete (under the user's prefix only).
- [ ] Remaining (optional): a one-click **bulk** "delete all orphans" action, and/or
      surfacing the same control from the Storage settings pane.

### 9. Cap the cold-login relay-REQ storm further
- [ ] Investigate the ~117 REQ/s spike at login. Respect the `capReadRelays` invariant
      everywhere fan-out happens; consider staggering subsystem subscriptions at login.

## Open — lower priority / infra

### 10. WebTorrent `null.fill` seeding crash
- [ ] Investigate the vendored `webtorrent.min.js` `null.fill` error on wire handshake;
      may require a bundle update or patch.

### 11. Harden flaky tests (CI gate reliability)
- [ ] `tests/ui/uploadModal-reset.test.mjs` ("UploadModal Reset Logic") intermittently
      hangs/cancels (jsdom/webtorrent async-hang flake; documented in KNOWN_ISSUES,
      reproduced on pre-refactor `1b11cb1b`). Make it deterministic so it can be a
      trusted release gate. Audit e2e parallel-load flakiness too.

### 12. Promotion: `unstable → beta`
- [ ] After this batch soaks and the high-priority items land, promote `unstable → beta`
      for hosted-domain QA (per the release pipeline in CLAUDE.md). Never push directly
      to beta/main — always promote from the previous stage.

## Open — My Videos tab follow-ups (deferred from the build)

### 13. My Videos enhancements
- [ ] **Restore (un-delete) action** for deleted rows — republish a prior live version
      so a tombstoned video can be brought back from the management tab.
- [ ] **`info.json` sidecar on upload** — write a small metadata file next to each
      uploaded object (title, event id, root id, date) so orphaned files can be
      identified by name even after their note is gone from relays. PRIVACY GUARD:
      skip private videos (the bucket is public) or only mirror already-public fields.
      Path-based reconciliation stays the baseline (sidecar is additive, future-only).
- [ ] Show orphan **size/last-modified** (from the ListObjectsV2 metadata) on orphan
      rows to make triage easier; consider grouping by folder.
- [ ] Replace the `window.confirm` on orphan delete with the app's confirm/modal for
      a consistent, less jarring destructive-action UX.
- [ ] External (non-bucket) URL liveness is unverifiable from the browser — currently
      left "OK/unverifiable" on purpose. Optionally add a server-side/HEAD check later
      if false-confidence becomes a problem.

## Open — deploy / CI infra (from this session)

### 14. Deploy workflow + CI gate health
- [ ] **On-demand deploy is now the norm for `unstable`** (auto-deploy disabled).
      Deploy with `vercel deploy --prod` (repo is linked to `bitvid-unstable`). Decide
      whether to apply the same `git.deploymentEnabled:false` to `beta`, and whether to
      ever set the Vercel **Production Branch = unstable** if auto-deploy is wanted again.
- [ ] **Visual-regression baseline is environment-sensitive / stale** (committed
      baseline from 2026-03 vs current CI Chromium/font rendering → ~1.4% diff). It's
      no longer deploy-blocking (own job) but the job is red. Regenerate the baseline
      inside CI's environment (or pin fonts / run visual in a fixed container) so it's
      a trustworthy gate again — relates to #11.

## Open — enhancements (security-sensitive)

### 15. Encrypted cross-login sync of storage credentials + NWC wallet (opt-in)
Goal: optionally sync the S3/R2 storage credentials AND the NWC zap wallet URI
across logins/devices via an encrypted Nostr note, unlocked by the logged-in
signer — so users don't re-enter them on every device. **Opt-in only; off by
default.**

Status (2026-06-21): COMPLETE — shipped to unstable. Core + Storage + NWC wallet
sync + offer-to-pull-on-login all live. Follow-ups only: cross-device merge
(restore currently REPLACES) and upgrading the login confirm() to a styled modal.

Design / approach:
- [x] Shared **core** `js/nostr/encryptedSync.js` (DI, unit-tested): NIP-78 app
      data (kind 30078) replaceable events, namespaced d-tags, **NIP-44-encrypted
      to self** with NIP-04 fallback. Facade `js/nostr/encryptedSyncFacade.js`
      wires it to the live client/signer. (commits 0abb82b9, 6f7f4196, 7376ff91)
- [x] **Storage creds**: re-encrypt the WHOLE on-disk account record to self
      (its `meta` is plaintext — bucket/endpoint names — so transporting the bare
      envelope would leak those). `storageService.exportAccountRecord` /
      `importAccountRecord`; `storageSyncService` (d-tag `bitvid:storage-connections`).
- [x] **NWC URI** is a bearer SPENDING secret stored via `nwcSettingsService` —
      encrypted to self under d-tag `bitvid:nwc`; gated behind an explicit
      window.confirm spend warning. `walletSyncService` + Wallet pane UI.
      Disconnecting the wallet while synced also wipes the note.
- [x] **Relay/replaceable lessons applied**: publish to the WRITE relays
      (`getDeletePublishRelays`), created_at forced strictly-newer, read takes the
      **newest event per d-tag** (reads routed through the subscription manager,
      not pool.list). NWC will reuse the same core.
- [x] **Storage UX**: opt-in "Sync these settings to my Nostr account (encrypted)"
      toggle + "Restore" button + public-relay/key-compromise warning in the
      Storage pane (shown only when unlocked). Re-pushes on save when enabled.
- [x] **Wallet UX**: toggle/restore in the Wallet pane + spend warning + confirm.
- [x] **Offer-to-pull on login**: one-time per-pubkey prompt
      (`settingsRestorePrompt` + `encryptedSync.exists` list-only peek), wired in
      `app.maybeOfferSettingsRestore` (deferred, non-blocking). Reuses the pulls.
- [x] **Clear/disable**: `clear()` publishes a cleared marker so the wipe
      propagates (empty-replaceable-publish lesson); `disable()` calls it.

Threat model / cautions (write these into the feature + docs):
- The encrypted blob lives on PUBLIC relays: NIP-44 hides contents but not the
  fact that this pubkey stores bitvid creds. Acceptable, but document it.
- Anyone who compromises the user's Nostr key can decrypt these (same trust root
  as everything else they sign) — make the opt-in copy explicit about that.
- NWC URI = spending capability; treat as highest-sensitivity. Consider a
  confirm + "this lets any device with your key spend from this wallet" warning.
- Never log decrypted creds; clear in-memory copies on logout (existing rule).
- Decryption goes through the (single-threaded) signer — respect the NIP-07/46
  decrypt budget + circuit-breaker invariants; don't block login on it.

## Open — new content-type support (needs research first)

> Note: live streams and short-form video are almost certainly NOT the same
> thing — they're two different NIPs. Confirm the exact kinds/tags before building.

### 16. Nostr live streams — watch-only (zap.stream, shosho.live)
- [ ] Likely **NIP-53 Live Activities**: kind **30311** (live event; carries the
      `streaming` URL — usually HLS .m3u8 — plus `status` live/planned/ended,
      title, host `p` tags), and kind **1311** (live chat). zap.stream and
      shosho.live publish these.
- [ ] Watch-only scope: discover/list live (status=live) events, render the HLS
      stream in the player, optionally show live chat (read). Publish / "go live"
      is a later, separate effort.
- [ ] Research: confirm NIP-53 kinds + tag shapes, how zap.stream vs shosho.live
      populate `streaming`/`recording`, and HLS playback support in the player.

### 17. NIP-71 interop (full plan in `docs/nip71-migration-plan.md`)
Research done; decisions locked. **See the plan doc** — it supersedes the rough
notes below. Summary:
- Opt-in, off by default. Dual-event: keep canonical kind 30078; add an addressable
  **34235/34236** mirror (`d`=`videoRootId`, edits in lockstep). 34235/36 are NOT
  deprecated — current NIP-71 designates them for editable content.
- WebTorrent rides standard NIP-94 `imeta` fields (`magnet`, `i`); private videos
  never mirrored; HTTPS `url` required to mirror.
- [x] Phase 0 (commit 0e2f683b): `buildNip71MirrorEvent` (js/nostr/nip71Mirror.js)
      maps a bitvid video → addressable 34235/36 event; magnet/i/ox added to the
      imeta builder+parser; mutation-verified tests. Flag still off, no UX.
- [ ] Phase 1 (in progress):
      - [x] 1a (e20191d6): `nip71MirrorService.publish` + the ALLOW_NSFW_CONTENT
            gate (instance that forbids NSFW won't mirror it outward).
      - [x] 1b (58f19095): `remove` teardown — NIP-09 delete (both addressable
            kinds) + empty-replace tombstone.
      - [x] 1c/1d (783c7df0): My Videos "Share to apps" opt-in toggle wired to the
            mirror service via new FEATURE_NIP71_MIRROR flag (on) +
            nip71MirrorFlags (per-video opt-in). Ineligible videos show the reason
            (private / NSFW-blocked / no-url). LIVE on unstable.
      - [ ] Remaining polish: auto-update the mirror when a video is edited in the
            edit modal (currently the user re-toggles from My Videos); capture
            dimensions at upload (short 34236 + imeta dim — defaults to 34235 now);
            hashtags input → t tags (bitvid has no hashtags field yet).
      - NOTE: legacy FEATURE_PUBLISH_NIP71 (videoPublisher.js auto-21/22) stays
        OFF/dormant — superseded by the opt-in 34235/36 mirror; clean up later.
- [ ] Phase 1.5: NIP-89 handler reg (kind 31990 → "Open in bitvid" elsewhere);
      NIP-51 kind 30005 portable playlists.
- [ ] Phase 2: inbound ingest of external NIP-71 videos (dedup, moderation, trust,
      `origin` attribution, distinct discovery surface).
