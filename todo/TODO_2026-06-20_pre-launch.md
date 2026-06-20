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

Design / approach:
- [ ] Publish as **NIP-78 app data** (kind 30078) replaceable events with stable,
      namespaced d-tags (e.g. `bitvid:storage-connections`, `bitvid:nwc`). Content
      **NIP-44-encrypted to self** (own pubkey); fall back to NIP-04 only if the
      signer lacks NIP-44 (NIP-46 remote signers especially).
- [ ] **Storage creds are already self-encrypted** today
      (`storageService._encryptMasterKey` → envelope: AES-GCM master key encrypted
      to self). Cleanest path: transport the EXISTING encrypted record as the note
      content (no new crypto); on another device, pull it and unlock with the
      signer. The NWC URI is a bearer secret stored locally via
      `nwcSettingsService` — encrypt it to self before publishing.
- [ ] **Reuse the relay/replaceable lessons from this session**: publish to the
      WRITE relays (not the capped read set) so the sync reaches everywhere; bump
      created_at strictly-newer; on read take the **newest event per d-tag** (don't
      union stale copies) — mirror `getDeletePublishRelays` + the watch-history
      dedup so a stale device can't clobber newer creds.
- [ ] **UX**: a per-item "Sync to my Nostr account (encrypted)" toggle in the
      Storage and Wallet panes; on login, if a synced note exists, offer to pull +
      unlock. Local remains source of truth on-device; sync is additive.
- [ ] **Clear/disable**: deleting the synced note must actually clear it on relays
      (apply the empty-replaceable-publish lesson from `a3799f3f`).

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

### 17. Short-form / external NIP-71 video note support
- [ ] Likely **NIP-71 Video Events** — the format Amethyst & co. use for "short
      form" vertical video: kind **22** (short video) and kind **21** (normal
      video). (Confirm current kinds; NIP-71 churned from the older 34235/34236.)
- [ ] bitvid currently publishes its OWN kind 30078 + attaches NIP-71 metadata.
      This item is about CONSUMING external NIP-71 notes (render them in the feed /
      a short-form view) so bitvid can show video posted by other Nostr apps.
- [ ] Research: confirm whether short-form is purely NIP-71 kind 22, how it maps
      onto bitvid's video model (url/magnet/thumbnail), and the vertical/feed UX.
