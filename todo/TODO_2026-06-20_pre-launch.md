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

### 33. Login / profile / session persistence broken with NIP-46 (Amber) — AUDIT (BUG)
Reported 2026-06-25. All symptoms observed with a **NIP-46 remote signer (Amber)**.
Likely a shared root cause in session/identity persistence + multi-account handling.
- [ ] **Lost login → "unknown user".** Sometimes the site loses who is logged in: the
      profile shows "unknown user", the profile area renders weird, and no videos load.
      Only a **logout + hard refresh** recovers it. (Session/identity state desync —
      possibly the NIP-46 signer connection or the persisted pubkey dropping after a
      refresh/idle, leaving the UI without a resolved identity.)
- [ ] **Switching profiles doesn't work** for logged-in users (multi-account switch is
      broken).
- [ ] **Logout logs out everyone.** Logging out the current user appears to log out
      **every** signed-in account, not just the active one (shared/global session state
      instead of per-account).
- [ ] **Audit the whole login + profile system + user persistence** across refresh and
      repeat visits — especially the NIP-46 path: how the active pubkey + signer
      connection are stored/restored, how multiple accounts are tracked, and how
      logout scopes to one account. Produce a plan (likely `docs/`), then fix.

- [x] **AUDIT done 2026-06-25 (code-level).** Architecture:
      `js/state/cache.js` persists a list of **saved profiles** (`bitvid:savedProfiles:v1`)
      + a single **active profile pubkey**. There is ONE active session at a time.
      `SignerManager` (`js/nostr/managers/SignerManager.js`) holds a SINGLE shared
      `this.nip46Client` (one remote-signer connection). Likely root cause for ALL three
      symptoms: the single-shared `nip46Client` + per-profile restore/switch not being
      multi-account-aware. Specifics:
        - **Logout-logs-out-everyone:** `authService.logout()` IS registry-scoped
          (`logoutSignerFromRegistry(previousPubkey)`), but `SignerManager.logout()`
          calls `disconnectRemoteSigner()` which destroys the SHARED `nip46Client` — so
          for NIP-46 every profile that depends on it loses its signer.
        - **Switch-doesn't-work:** `authService.switchProfile` re-runs `requestLogin`
          with `expectPubkey`; for NIP-46 the shared client must be re-established for the
          target profile — if it doesn't reconnect, the new profile has no working signer.
        - **Unknown-user-after-refresh:** `scheduleStoredRemoteSignerRestore` →
          `useStoredRemoteSigner` silently fails (the catch logged via the gated
          `devLogger`), leaving `this.pubkey` unresolved → UI shows "unknown user".
- [x] **Diagnostics SHIPPED (2026-06-25, TEMP).** Added `[nip46-diag]` `userLogger`
      traces (visible on unstable, where `devLogger` is gated off) at:
      `scheduleStoredRemoteSignerRestore` (hasStored/storedPubkey + succeeded/FAILED),
      `disconnectRemoteSigner` (keepStored/hadClient + caller stack),
      `SignerManager.logout` (previousPubkey/hadRemoteClient), and
      `authService.switchProfile` (from/to + whether requestLogin resolved the expected
      pubkey). **Remove these once the fix lands.**
- [ ] **VERIFY / REPRODUCE (user action):** on the phone with Amber on
      unstable.bitvid.network, exercise (1) fresh load, (2) switch profiles, (3) logout,
      and capture the `[nip46-diag]` console lines for each — restore succeeded/FAILED,
      switchProfile `matchesTarget`, and disconnect `keepStored`/`hadClient`/caller stack.
- [ ] **THEN fix** based on the captured trace (likely: per-profile NIP-46 session keyed
      by pubkey; don't tear the shared client on a scoped logout; reconnect on
      switch/restore) and REMOVE the temporary `[nip46-diag]` diagnostics.

### 1. Delete is not fully working — tombstoned videos still show in the UI
- [x] **Root cause found + fixed** (`afb6200b`): deletes published only to the CAPPED
      read set (<=8) while videos publish to the full write set, so relays outside
      the subset kept serving the original → resurrection. Now both delete paths
      (soft-delete tombstone + NIP-09) use `getDeletePublishRelays()` (write set).
      Tombstone created_at was already bumped strictly-newer, so this closes the gap.
- [x] **getActiveKey mismatch — ROOT-CAUSED + FIXED (2026-06-23).** `js/nostr/client.js`
      carried a STALE local duplicate of `getActiveKey` (added before the LEGACY guard
      landed in `js/nostr/utils.js` at `1b11cb1b`). The tombstone machinery
      (`recordTombstone`/`isOlderThanTombstone`/`applyTombstoneGuard`) used the local
      copy, so a deleted legacy video (synthesized `videoRootId = LEGACY:<pubkey>:<dTag>`)
      keyed its tombstone as `ROOT:LEGACY:…` while a bare zombie from a relay keyed as
      `<pubkey>:<dTag>` → guard never matched → resurrection. Fix: client.js now imports
      the single canonical `getActiveKey` from utils.js (duplicate deleted). Regression
      test added in `tests/nostr/client.test.mjs` ("tombstone guard (legacy zombie
      suppression)") — in the CI suite.
- [x] **Cache / optimistic-reload angle — audited, OK.** `js/nostr/videoEventBuffer.js`
      checks tombstones + `deleted` on every buffered event (cache-first reload honors
      deletions; lines ~89, 156–172).
- [x] **Mirror-resurrection angle — audited + GAP FIXED (2026-06-23).**
      `js/services/nip71MirrorSync.js` listens on `videos:deleted` →
      `nip71MirrorService.remove()` (NIP-09 on BOTH addressable kinds 34235/34236 +
      empty-replace tombstone). Legacy auto-21/22 publisher stays dormant.
      GAP: teardown was gated on the per-video opt-in flag, which is **browser-local
      only** (`bitvid:nip71-mirror:v1`). A video shared on one device and deleted
      from another (or after a cache clear) skipped teardown → the NIP-71 mirror
      orphaned on other apps. Fixed in `resolveDeleteSync` (`js/services/
      nip71MirrorFlags.js`): delete now ALWAYS attempts teardown when
      FEATURE_NIP71_MIRROR is on, ignoring the local flag (remove() is idempotent —
      NIP-09 + empty tombstone are no-ops if no mirror exists). The flag still gates
      the UI toggle; the feature flag still fully gates publishing. Spec-corrected
      unit test + sync-level spy tests (cross-device teardown + best-effort no-throw)
      in `tests/nip71-mirror-flags.test.mjs` + `tests/nip71-mirror-sync.test.mjs`.
- [ ] **Verify with the user** that zombies are gone on the live site after these fixes
      (the getActiveKey fix needs `npm run build` + redeploy to unstable to take effect).
- [ ] (Nice-to-have) Add a feed/view-level seed→delete→assert-not-rendered test now that
      the client-level guard + buffer tombstone paths are covered by unit tests.

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
- [x] **"1970-01" month bucketing FIXED (2026-06-23).** Legacy/migrated history items
      with no real `watchedAt` were siloed into a literal `1970-01` month event
      (kind 30079) that self-perpetuated (read back as 0 → re-bucketed → re-published
      with 0). `canonicalizeWatchHistoryItems` now derives a STABLE watch time from
      the pointer d-tag's embedded ms-timestamp (the video creation time) and
      backfills it, so those items land in a real month and the 0→1970 loop stops.
      Only truly undecodable pointers still use the epoch bucket. Helper
      `deriveWatchedAtFromPointer` + `tests/watch-history-bucketing.test.mjs`. NOTE:
      the old `1970-01` event already on relays is left as harmless stale data (not
      recreated); actively clearing it was declined as extra surgery.

### 3a. Video-modal popover mis-positioning (zap) — FIXED 2026-06-23
The zap popover (`#modalZapDialog`) opened functional but anchored to the modal
edge instead of `bottom-end` under its trigger.
- [x] **Root cause confirmed + fixed** in the shared engine
      (`js/ui/overlay/popoverEngine.js`). The zap render fn returns the PRE-EXISTING
      in-modal `#modalZapDialog` verbatim (`() => this.modalZapDialog`,
      `zapController.js`). The engine only appended panels to the body-level portal
      `if (!panel.isConnected)`, so this already-connected panel was never moved
      out; its `position: fixed` then resolved against a transformed/contained modal
      ancestor → edge anchoring. Fix: the engine now `relocatePanelToPortal()` on
      open (records the panel's origin: parent + nextSibling, moves it into the
      `#uiOverlay` portal) and `restorePanelToOrigin()` on close (and via destroy),
      so the host DOM stays intact and re-open works. Fresh portal-owned panels
      (card "⋯" menu, share/more menus, feed-settings gear) are unaffected — they're
      already appended to the portal, so relocate is a no-op for them.
      Style-safe: `#modalZapDialog` uses the same `popover__panel card …` classes the
      already-portaled menus use; no `.modal`-descendant CSS. Regression test in
      `tests/ui/popoverEngine.test.mjs` ("relocates a pre-existing in-host panel …");
      all 9 engine tests + the menu-controller tests pass; build green.
- [ ] **Verify with the user** on the live site after deploy that the zap popover
      now opens `bottom-end` under the Zap button (and re-opens correctly).
- NOTE: the "embed" in the original report is a separate full modal
      (`components/embed-video-modal.html`, `#embedVideoModal`), NOT an anchored
      popover, so it isn't affected by this engine bug. The share/copy menu uses a
      fresh portaled panel and already positions correctly. If any other pre-existing
      in-modal panel is found mis-positioned, this same engine fix now covers it.

### 3. Zaps system + platform-fee zap split — DONE 2026-06-24 (full plan in docs/zap-audit-plan.md)
Audit started 2026-06-23. See the doc for architecture map + findings. Summary:
- [x] **Send-error softened** (`dd1ce113`): recipient LNURL unreachable/CORS now
      shows a clear message, not raw "Failed to fetch".
- [x] **NWC connection bug FIXED (2026-06-23, launch-blocker)** — `parseNwcUri`
      passed a hex secret to nostr-tools `getPublicKey` (needs bytes) → NWC connect
      threw `expected Uint8Array` and failed entirely. Now hex→bytes. Guarded by
      `tests/nwc-parse-uri.test.mjs`. **This likely explains a lot of the "errors on
      send".** VERIFY live: connect a wallet + send a zap end-to-end.
- [x] **Popover positioning (3a)** — FIXED (see 3a).
- [x] **In-flight status + form-reset polish (2026-06-23)** — "Sending…" no longer
      mis-toned as a warning; success path fully resets the form (`resetZapForm`).
- [x] **"Have to click the Zap button ~3-4 times before it opens" — ROOT-CAUSED +
      FIXED (2026-06-23).** Diagnosed with click instrumentation: the button is
      intentionally `hidden`+`disabled` until the creator's Lightning address resolves
      (a profile fetch, ~2s) — but `.video-modal__action-button` sets
      `display: inline-flex`, which OVERRODE the UA `[hidden] { display:none }`, so the
      button rendered and looked clickable while still a disabled no-op. Disabled
      buttons don't fire `click`, so the first clicks did nothing until it flipped
      enabled. Fix: `.video-modal__action-button[hidden] { display:none }`
      (`css/tailwind.source.css`) so the zap button only appears once it's
      enabled/ready (restores the intended "show zap only when zappable" design). The
      earlier in-flight-open toggle tweak was harmless but NOT the cause. VERIFY live:
      the zap button appears a moment after the modal loads and opens on first click.
      FOLLOW-UP (optional UX): the ~2s appear-delay is the creator-profile fetch; could
      show the button immediately and resolve the address lazily if the delay annoys.
- [x] **Receipt success-reporting + discovery FIXED (2026-06-23)** — a paid zap whose
      kind-9735 receipt couldn't be validated was shown as a red error; now it's a
      success-with-note (the NWC preimage proves payment). Receipt lookup now queries
      the reliably-indexed `#e/#a/#p` tags (not the unindexed `#bolt11`) and polls a
      few times for a late receipt. See docs/zap-audit-plan.md.
- [x] **Platform-fee fallback verified no-bypass** — junk override falls back to the
      configured fee, not 0.
- [x] **CORS / LNURL — DECIDED 2026-06-24: accept graceful degradation, no proxy.**
      Keep the visual zappability flag (`walletZappabilityCheck` /
      `lnurl-unreachable`) as the honest fallback when a recipient's LNURL host
      sends no CORS headers. Rationale:
        - Browser-enforced CORS can't be bypassed from page JS; the only universal
          fix is a proxy, which **breaks the static/no-custody rule** AND adds a
          real security surface (the proxy can swap the returned bolt11 → steal the
          zap unless it verifies `description_hash`). Not worth it for a static app.
        - The fee/receipt model is **fundamentally incompatible** with a CORS-blocked
          recipient in a static client: the platform-fee split needs to fetch the
          creator's invoice in-page, which is exactly what CORS blocks.
        - WebLN was evaluated and rejected: its only CORS-bypassing primitive
          (`webln.lnurl()`) **pays directly** — no NIP-57 receipt, no split, no
          deterministic amount — so it degrades a zap into an unattributed tip and
          bypasses the platform fee. Not acceptable as a silent fallback.
      Net: the current behavior is the right answer for a static, no-custody client.
- [x] **Remaining audit items — DONE 2026-06-24. #3 fully closed.**
      - **Split correctness (`js/payments/zapSplit.js`):** `platformShare =
        floor(amount*fee/100)`, `creatorShare = amount - platformShare` — the
        creator always gets the remainder, so **no sats are lost or invented**; a
        sub-1-sat fee rounds to 0 and the whole zap goes to the creator (no
        zero-amount platform send). Fee is `clampPercent`-bounded to 0–100 and a
        junk override falls back to the configured default (can't be bypassed or
        swallow the zap). **Fixed the creator==platform edge:** when the platform
        fee would pay the *same* Lightning address as the creator, the split now
        collapses to a single full-amount payment (was sending two invoices to one
        wallet → extra routing fee + duplicate receipt). Cheat-resistant tests
        added in `tests/zap-split.test.mjs`
        (`testCreatorEqualsPlatformCollapsesToOnePayment`,
        `testSplitRoundingPreservesEverySat`).
      - **"Fee landed in my own wallet" — NOT a bug (expected):** occurs when the
        *sender is the platform operator* (the platform fee correctly returns to
        them) or on a *self-zap* (you get your own creator share back). The fee
        recipient is always the configured platform address, never the sender's.
      - **Receipt validation (9735):** already fixed 2026-06-23 (author + bolt11 +
        description-hash match, with polling for late receipts); confirmed green
        (`tests/zap-receipt-pool.test.mjs`, validator tests in `zap-split`).
      - **NWC budget/retry UX:** already actionable — detects budget-exhausted,
        shows "Increase your wallet zap limit or reduce the platform fee, then
        retry…" plus the remaining-share summary and a Retry button.
      - **General clunkiness:** maintainer confirms the flow is working well;
        closed as accepted.
- [x] Comment box confirmed WORKING (the "message doesn't work" was the popover
      mis-position making it hard to use — see 3a).

### 4. View counter accuracy & reliability — DEEP AUDIT
Audit finding (2026-06-24): counts INFLATE. `viewCounter.js` dedupes locally by
(viewer, time-window) correctly, but two things defeated it: (a)
`generateViewEventDedupeTag` built the kind-30079 `d` tag with random entropy +
exact timestamp, so every view was a UNIQUE event and relays could not dedupe the
parameterized-replaceable event; (b) `exactCountForPointer` runs a NIP-45 COUNT
(raw event count, no per-viewer dedupe) and bumped the displayed total UP to it
(`max(deduped, raw)`). Net: reloads / multi-device / re-watches each added a view.
- [x] **Root fix — deterministic, window-bucketed `d` tag** (`viewEvents.js`):
      `scope:viewer:bucket`, no entropy. Kind-30079 view events are now genuinely
      replaceable, so relays collapse a viewer's repeat views in a window into ONE
      event → the NIP-45 COUNT is accurate AND scalable, and `max(deduped, raw)`
      stops inflating. `buildViewEvent` no longer invents a random `d` tag
      (`nostrEventSchemas.js`). Transition: pre-existing entropy events age out over
      `VIEW_COUNT_BACKFILL_MAX_DAYS`. Tests: `tests/view-event-dedupe.test.mjs`
      (same-window dedupe, next-window separate, per-viewer/per-video, no auto-d).
- [x] **`tests/view-counter.test.mjs` un-quarantined + green.** Triaged the whole
      monolith: pinned the legacy hydrate/subscribe path (the batched
      SubscriptionManager added later silently shadowed the mocks), made the
      dedupe-window test bucket-aligned (was flaky on time-of-day), and corrected
      the `hydrateVideoHistory` root-timestamp assertions to the refactored unit
      boundary (map vs the `syncActiveVideoRootTimestamp` field step). Removed from
      the QUARANTINE map. Spec corrections logged in TEST_INTEGRITY.md
      (SCN-view-counter-legacy-path, SCN-hydrate-root-timestamp).
- [x] **Cross-relay UNDER-count fixed (2026-06-24).** The "exact" path (watch page
      + popularity chart) relied on the NIP-45 COUNT, but `countEventsAcrossRelays`
      returns `bestEstimate` = the SINGLE relay with the most events — it can't
      union across relays, so it under-counts when views are spread across relays
      (e.g. card showed 19 while the chart's uncapped list union showed ~63).
      `exactCountForPointer` now lists view events across ALL relays (uncapped, one
      on-demand list — not a storm) and folds the UNION into the deduped
      `dedupeBuckets` (one per viewer-window); total = the set size, so it's
      accurate AND monotonic (never spuriously decreases). Per-relay COUNT is kept
      only as a lower-bound floor when the list truncates (>2000), flagged partial.
      The popularity modal now passes `{ exact: true }`, and since the count flows
      through the shared pointer state, opening a video corrects its count
      everywhere (grid cards converge). Test: `testExactCountUnionsAcrossRelays` in
      `tests/view-counter.test.mjs`. NOTE: grid cards (no `exact`) still use the
      §17-capped batched backfill (approximate, storm-safe) until the video is
      opened — acceptable accuracy/cost tradeoff.
- [x] **`reactionCounter.js` (likes/kind-7) audited — accurate, no fix needed.**
      It does NOT use NIP-45 COUNT; it lists kind-7 events and dedupes via
      `applyReactionToState` keyed by pubkey (one reaction per user, latest-wins),
      with per-content totals. No raw-count inflation. (Kind-7 isn't replaceable,
      so listing+dedupe is the only accurate model; the only limit is the
      hydration cap for viral content — undercount, not inflate — a future
      scalability nicety.) Underpins the popularity chart (#26) / Trending (#27).

### 5. Card-hide / video-liveness check — full plan in docs/video-liveness-plan.md
Audited (2026-06-23). Finding: the hide/show **policy is already correct**
(`cardSourceVisibility.js` hides only when neither CDN nor WebTorrent is healthy;
un-hides when WebTorrent flips green). The real gaps:
- [x] **Speed** (`URL_PROBE_TIMEOUT_MS` 8s → 4s): dead hosts yield a fast verdict
      so unplayable cards hide quickly. WebTorrent probe stays generous (swarm).
- [x] **Probe accuracy**: confirmed the card probe already uses the video-element
      probe (`confirmPlayable:true`, actually loads media) — accurate, not the
      opaque HEAD. No change needed.
- [x] **Multi-source**: ingest adapter exposes `sources` (all video imeta urls;
      `collectVideoSources`); `urlHealthController.probeUrlList` probes them in
      order — healthy as soon as one plays, offline only if all fail. So a dead
      primary host no longer hides a video with a working mirror.
- [x] **Player fail-over at play time (2026-06-24).** Playback now tries each
      hosted source in turn before dropping to P2P. The `PlaybackSession` builds an
      ordered, de-duped `hostedSourceCandidates` (primary URL first, then the
      video's imeta `sources`); `attemptHostedPlayback` takes a `candidateUrl` and
      the url-first execution loop advances to the next mirror on probe-fail/stall/
      timeout (cleaning up watchdogs + resetting the element between candidates),
      only calling WebTorrent after all hosted mirrors fail. `sources` plumbed
      coordinator → strategy → session; single-source videos behave exactly as
      before. Tests: `tests/services/playbackService_multisource.test.mjs`
      (candidate construction; the full async fail-over flow is covered by the
      playbackService_order suite in CI). ROLLBACK: revert the loop in
      `playbackService.js` to the single `attemptHostedPlayback()` call + drop the
      `sources` plumbing.
- [x] **Made the policy config-driven for live A/B testing (2026-06-24).** New
      `CARD_LIVENESS_POLICY` (config/instance-config.js): `show-pending` (default,
      unchanged) | `hide-foreign` (foreign/ingested hidden until a source verifies;
      native stays show-pending) | `hide-all`. Owner's own cards always visible.
      Flip it live without a rebuild: `window.__BITVID_CARD_LIVENESS_POLICY__ =
      "hide-foreign"` then refresh/scroll. Implemented via a `data-foreign`
      provenance flag on the card + `getCardLivenessPolicy()` in
      `cardSourceVisibility.js`. Tests: three policy scenarios in
      `tests/video-card-source-visibility.test.mjs` (also un-broke 3 pre-existing
      VideoCard tests by adding the missing IntersectionObserver JSDOM stub).
- [x] **Probe speed — prefetch ahead of scroll (2026-06-24).** Both liveness
      probes were already viewport-gated (IntersectionObserver, on-screen-first,
      WebTorrent priority-queued + concurrency-capped). Added a configurable
      `LIVENESS_PROBE_PREFETCH_MARGIN` (default `600px`) applied to both observers'
      `rootMargin`, so cards just below the fold verify before the user scrolls to
      them — makes hide-until-verified feel instant. Override:
      `window.__BITVID_LIVENESS_PREFETCH_MARGIN__`.
- [x] **Deadlock fixed (2026-06-24).** First hide-foreign test made ALL foreign/
      NIP-71 content vanish: a hide-until-verified card starts `display:none`, which
      has no layout box, so the IntersectionObserver never fires for it → its
      liveness probe never runs → it never gets a healthy verdict → hidden forever.
      Fix: `cardNeedsEagerLivenessProbe()` + eager-probe such cards on
      `onCardRegister` (fires regardless of visibility) in both `gridHealth` and
      `urlHealthObserver`, instead of waiting for an intersection that can't happen.
      Still concurrency-capped/priority-ordered; show-pending unchanged. Default is
      now `hide-foreign`.
- [ ] **DECIDE after live A/B**: confirm `hide-foreign` feels right (foreign cards
      now verify-then-appear); else flip `CARD_LIVENESS_POLICY` in instance-config.

### 18. Embed button / modal on the video player does not open — FIXED 2026-06-23
- [x] **Root cause: event-name mismatch.** `VideoModal.handleEmbedRequest`
      dispatched `"action:embed"`, but `ModalManager` listens for `"video:embed"`
      (which opens `EmbedVideoModal`), and `dispatch()` does not remap names — so the
      embed button fired an event into the void. (Share survives the same mismatch
      only because `shareBtn` also toggles a popover directly.) Now dispatches
      `"video:embed"`. Regression test in `tests/video-modal-zap.test.mjs`.
- [x] **Sibling bug FIXED (2026-06-23):** `handleCopyRequest` had the SAME mismatch —
      dispatched `"action:copy"` with no listener (manager listens for
      `"video:copy-magnet"` → `app.handleCopyMagnet`), and `#copyMagnetBtn` has no
      popover fallback, so the standalone copy-magnet button was also dead. Now
      dispatches `"video:copy-magnet"`. Covered by the same regression test.

### 19. Direct messages: can read but cannot SEND — FIXED 2026-06-23
- [x] **Root cause: missing controller delegations.** Clicking Send threw
      `this.controller.handleDmAppShellSendMessage is not a function`. The DM
      app-shell renderer wires its callbacks on `this.controller` (the
      `ProfileDirectMessageController`), but the controller was missing the
      delegation methods that forward to `this.actions` — so Send AND mark-read,
      mark-all-read, read-receipts/typing toggles, and open-settings all threw and
      did nothing. Added the six delegations. The send path itself (encrypt → sign →
      publish, NIP-04 default / NIP-17) was fine. Regression test
      `tests/dm-controller-delegations.test.mjs`. VERIFY live: typing + Send actually
      delivers a message.
- [x] **Follow-up: "Message" button targeted the wrong person.** Clicking Message
      on a profile (or anyone you'd never DMed) set the recipient, but
      `buildDmConversationData` discarded it — a recipient with no existing thread
      wasn't in `conversationMap`, so it fell back to `conversations[0]` (the top
      conversation). The inbox silently jumped to the top thread and any message
      sent went to THAT person ("says sent but I don't see it"). Fixes: (a)
      `setDirectMessageRecipient` now focuses the selected recipient's
      conversation; (b) `buildDmConversationData` synthesizes an empty
      conversation for a selected-but-threadless recipient and honors it as active
      (incl. `activeRemotePubkey` fallback for the composer target); (c) the legacy
      `renderProfileMessages` list no longer clobbers a non-null recipient.
      Regression: `tests/ui/dm-conversation-focus.test.mjs`. VERIFY live: Message a
      brand-new person, confirm the thread opens on THEM and the sent message lands
      in that conversation after refresh.

### 20. Feed / grid loading reliability — some videos missing (BUG)
Two related intermittent symptoms; likely the same root cause (a one-shot,
all-relays-settle fetch that drops slow-relay results — see 17d).
- [x] **Profile / Channel page sometimes doesn't pull in all of a creator's
      videos.** Root cause: `loadUserVideos` rendered ONLY the live fetch, which
      REPLACES the grid — so when a relay holding a video transiently failed this
      load, that video vanished even though it was known in memory/cache. Fixed by
      unioning the live events with already-known events
      (`mergeChannelVideoSources`, live-wins-on-id) before render, so the grid is a
      superset and never shrinks; existing dedupe-by-root + access checks still
      handle versioning/deletes. Regression: `tests/channel-video-merge.test.mjs`.
      (Streaming/first-relay-wins UX is still the 17d follow-up.)
- [x] **"Paginating between pages" was tab-switching: videos present in one feed
      tab missing in another.** Root cause shared with #21: all general tabs read
      the SAME active set and only re-ranked, and the rankers never dropped — so
      tabs were near-identical and any apparent "missing" was the lack of a
      distinct identity. Addressed by giving each tab a real identity (see #21).
- Remaining: streaming/first-relay-wins incremental render (17d UX) is still open
      as a latency follow-up, not a correctness bug.

### 21. "For You" / Explore / Recent: make each a genuinely distinct feed — DONE
Root cause: RECENT, FOR_YOU, EXPLORE all sourced the full active set and only
re-ranked (and the rankers never drop), so with thin signals they all collapsed
toward freshness and looked identical. Gave each a structural identity:
- [x] **For You = "your people first"** (`4873a431`): the scorer tags forYouTier
      (2 followed author / 1 interest·watch match / 0 other) and the sorter leads
      with tier regardless of raw score, then score within tier; watched already
      suppressed. No-signal (logged-out / no follows) falls back to an
      author-interleaved discovery order so it never mirrors Recent.
      Tests: `tests/for-you-tiering.test.mjs`.
- [x] **Explore = "new-to-you + diverse, less recency"** (`087cf410`): freshness
      weight down (0.25→0.12), novelty up (0.30→0.35), a soft followed-author
      penalty (reads subscriptionAuthors in the Explore runtime) so non-followed
      creators surface, and more variety via the diversity sorter (MMR λ 0.7→0.5).
      Test: explore follows-penalty in `tests/feed-engine/explore-scorer.test.mjs`.
- [x] **Recent = chronological** (unchanged).
- [x] **Render bug that masked ALL of the above (2026-06-24):** `VideoListView.render`
      re-sorted the grid by date unless `metadata.preserveOrder` was set, and only
      Explore set it — so For You's tiering and Kids' scoring were discarded at
      render and shown chronologically (looking identical to Recent). Fixed by
      setting `preserveOrder` for For You / Trending / Kids in the refreshFeed
      cases. This is why the feed-identity work "didn't show" until now.
- [ ] **Follow-up (optional):** Explore per-VIDEO "already watched" suppression
      (currently only topic-novelty, not per-video) — needs the watch-history
      preload wired into the Explore refresh like For You has. And a Trending tab
      (popularity) once view-count/zap data is reliable.

## Open — medium priority

### 6. Test S3 (generic, non-R2) functions — DONE 2026-06-24
- [x] **Audited; was more covered than it looked.** Already tested: upload/thumbnail/
      `.torrent` (`s3UploadService.test.mjs`, `s3-upload-*`), CORS guidance
      (`s3-upload-cors-guidance.test.mjs`), and **delete/edit cleanup provider-aware
      path-style** — incl. the documented vhost bug (`r2-delete-video-storage.test.mjs`
      asserts cleanup uses `forcePathStyle:false` for generic S3;
      `s3-upload-publish-cleanup-integration.test.mjs` covers the full upload→delete
      round-trip). `forcePathStyle` is plumbed through upload + delete.
- [x] **Closed the real gap: public-URL resolution.** The upload tests *mock*
      `buildS3ObjectUrl`, so the actual path-style/vhost URL logic in `js/storage/
      s3-url.js` had no focused test. Added `tests/storage/s3-url.test.mjs` (11 pure-
      function scenarios): path-style → bucket in PATH; vhost → bucket as host
      subdomain (no double-prefix); endpoint path-prefix preserved; bare-endpoint
      https upgrade; key/slash normalization; explicit `publicBaseUrl` wins; missing
      inputs → "". Also covers `s3Service.derivePublicBaseUrl`/`buildS3ObjectUrl`.
- [~] Provider forcePathStyle DEFAULTS (generic→path-style true, aws→vhost false) are
      a 3-line internal config map (`resolveForcePathStyle`/`PROVIDER_TESTS`, not
      exported); not unit-tested in isolation (would require exposing internals).
      Behavior is exercised via the upload/delete tests above. Acceptable minor gap.

### 7. Mobile + video-card layout
- [ ] Improve mobile layout and the video card layout.
- [ ] **Improve mobile UI** broadly (reiterated 2026-06-25) — not just the card: nav/
      sidebar, modals, the player, forms, and touch targets across the app.
  - [x] **Profile modal tabs → app-grid on mobile (2026-06-25).** Below 1024px (the
        full-width menu view), the profile modal's tab nav (`.profile-modal__nav`:
        Account/Relays/Wallet/Storage/…) renders as a 3-column grid of icon tiles
        with the title centered below each icon, instead of the vertical list.
        Desktop keeps the vertical nav. Token-only; validated live in-browser.
        `css/tailwind.source.css`. (NOTE: the sidebar is NOT a grid — an earlier
        sidebar version was a misread and was reverted.)
- [ ] Consider removing the CDN/WebTorrent source badge from the card (clutter).
- [ ] Run `npm run test:visual` after layout changes; update baselines deliberately.

### 41. Native browser dialogs → site notification system
- [x] **DONE 2026-06-30.** Replaced every `alert()`/`confirm()` (no `prompt()` existed)
      with the app's notification system so dialogs are styled + consistent.
      - `alert()` (13) → toasts: `this.showError` where the component already had it
        (UploadModal), else `notifyError`/`notifySuccess` via a new `js/ui/appNotify.js`
        (routes to the app's NotificationController).
      - `confirm()` (~13) → a new promise-based **`showConfirm()`** dialog
        (`js/ui/confirmDialog.js`) — a `bv-modal modal-always-on-top` overlay returning
        `Promise<boolean>` (Confirm/Cancel/backdrop/Escape, danger variant focuses
        Cancel). Importable anywhere, so future confirmations use it too. Stacks above
        other modals and is typable thanks to the stacked-modal focus fix.
      - Migrated: UploadModal, MyVideosController, ProfileStorage/Wallet/Relay
        controllers, profileModalController, subscriptionHistoryController,
        settingsRestorePrompt (default `confirm` now `showConfirm`), nostr/client
        (deleteAllVersions). `confirmSyncOverwrite` helpers made async (the sync layer
        already `await`s `confirmOverwrite`). Tests: `tests/confirm-dialog.test.mjs` (6).
        Build + lint clean; affected suites green. NOTE: `npm run build`/`lint` do NOT
        parse JS — verify migrations by importing the module / running its test.

### 42. Admin whitelist edit fails with nsec / NIP-46 (only NIP-07 worked) — FIXED
- [x] **DONE 2026-06-30.** Editing the admin whitelist/blacklist worked with a NIP-07
      extension but silently failed with nsec and NIP-46 (Amber). Root cause:
      `adminListStore.persistNostrState` signed with `window.nostr.signEvent` directly
      (and required `requestDefaultExtensionPermissions`), so non-extension logins threw
      "nostr-extension-missing". Fix: sign with the **active signer**
      (`getActiveSigner()` from the registry — works for extension/nsec/NIP-46, all expose
      `signEvent`), and only run the extension-permission prompt when the signer is an
      extension (`type === "extension"/"nip07"`). Regression test added to
      `tests/admin-list-store.test.mjs` (nsec signer used while `window.nostr.signEvent`
      throws). Build + lint clean.
- [x] **AUDIT DONE 2026-06-30 — clean (adminListStore was the only bug).** Swept every
      `.signEvent(`, `window.nostr`, and `ensureExtensionPermissions`/
      `requestDefaultExtensionPermissions` caller:
      - **Signing:** NO `window.nostr` is used to sign/encrypt anywhere. Every publish
        path signs with the active signer (`signer.signEvent`): subscriptions, userBlocks,
        hashtag prefs, relay prefs, moderationService reports, nip71MirrorService,
        encryptedSyncFacade, DM seal + legacy DM (`nostr/client` signingAdapter defaults
        to the active signer), DM relay list, admin lists.
      - **Extension-permission gates:** every caller (reactions, comments, subscriptions,
        userBlocks, watchHistory, relayManager, DM relays) guards the request behind a
        signer-type (`extension`/`nip07`) or capability check, so nsec/NIP-46 skip it and
        go straight to active-signer signing — they never hit the `extension-missing`
        failure that broke admin lists.
      - **Decrypt:** gates on the active signer's nip04/nip44 capability with `window.nostr`
        only as a fallback; nsec (closures) + NIP-46 (remote) both decrypt fine.
      - **Cleanup note (low priority):** `js/auth/signingAdapter.js`
        (`createNip07SigningAdapter`, defaults to `window.nostr`) is dead production code —
        referenced only by its own test, no app callers. Harmless; remove or repoint at
        the active signer if ever reused.

### 43. Logged-in profile card at the top of the profile modal (UX)
- [ ] Show the **logged-in user's profile photo + name** at the **top-center** of the
      profile modal, styled as a "profile card" that sits **half-on / half-off** the
      modal edge (overlapping the top border) for a polished look. Goal: users can see
      WHICH profile they're acting as (e.g. uploading as) at a glance. Pull avatar/name
      from the profile cache for the active pubkey; update on profile switch.

### 44. In-modal storage selector for uploads (UX)
- [ ] Make storage unlock + selection easier from the **video upload modal**: let the
      user **pick any configured storage connection** (R2 / B2 / Custom S3) and unlock it
      **without leaving the upload modal** — today they must close it, open Profile →
      Storage, change the default/selected connection, then reopen upload. Add a provider
      picker (driven by `storageService.listConnections`) + inline unlock in the upload
      modal's storage section; selecting one sets it as the active upload target for this
      upload (and optionally the default). Reuse `loadFromStorage` / the per-provider
      connection model.

### 45. Upload modal: suggest tags from the user's previous videos (UX)
- [x] **DONE 2026-07-01.** The Hashtags section of the upload modal now shows one-tap
      chips of the user's most-used past hashtags ("Reuse a tag from your videos:").
      Source: `app.getUserHashtagSuggestions()` reads the user's own videos
      (`nostrService.getActiveVideosByAuthors([pubkey])`) and ranks their hashtags via
      `js/utils/hashtagSuggestions.js` `rankHashtagsByFrequency` — count = number of
      videos using each tag, normalized (case + `#`) and deduped per video, ties broken
      alphabetically (top 12). Tags come from `video.nip71.hashtags` (falls back to raw
      `t` tags minus bitvid's fixed `t=video` marker). Clicking a chip adds it to the
      NIP-71 `t` repeater (skips duplicates); already-added chips dim + disable. Hidden
      for users with no past tags. Rendered on modal open. Tests:
      `tests/hashtag-suggestions.test.mjs` (5, pure ranking). Lint + build green.

### 46. Feed auto-refreshes after posting a video (UX)
- [x] **DONE 2026-06-30.** `publishVideoNote` now (1) **optimistically injects** the
      just-published legacy event into the shared client cache via a new
      `nostrClient.ingestLocalVideoEvent(rawEvent)` (+ thin `nostrService` wrapper), so the
      new video shows in the feed **instantly**, before the relays echo it back; and (2)
      refreshes via the canonical `refreshAllVideoGrids({ reason: "video-published",
      forceMainReload: true })` instead of a bare `loadVideos()` — so it refreshes
      **whichever feed is active** (For You / Explore / Recent) plus the subscription and
      channel grids, and forces a render (bypassing the load cooldown) so the injected
      video is actually shown. `ingestLocalVideoEvent` mirrors live ingestion (convert →
      root created_at → tombstone guard → allEvents/activeMap), so it obeys the same
      dedupe/active-key rules (#20/#21): a later relay copy of the same event (same
      `created_at`) won't duplicate it, and an older revision can't overwrite a newer
      active entry. Tests: `tests/optimistic-feed-insert.test.mjs` (6 — surfaced instantly,
      no-duplicate on re-ingest, newer-wins, older-doesn't-clobber, invalid→null, garbage
      handled).

### 47. "Most Zapped" sidebar tab (trending-by-zaps)
- [ ] Add a **Most Zapped** sidebar tab: like Trending (#27, view-count) but ranked by
      **total zaps** (sats / zap count) per video. Reuse the zap accounting (kind-9735
      receipts) already used for the zap system; build a feed source/ranker that sorts by
      zap total over a window, wired into the feed engine like Trending. Depends on
      reliable zap data (couples with the zap system already shipped in #3).

### 48. Fluent profile switching across signing methods (nsec / NIP-46 / NIP-07)
- [x] **nsec switching FIXED 2026-06-30.** Switching to a saved nsec profile used to fail
      silently ("secret-required") — `switchProfile` called the nsec provider with no
      passphrase and never prompted. Now `handleProfileSwitchRequest` detects an nsec
      target, checks the stored key (`getStoredSessionActorMetadata` +
      `evaluateStoredNsecSwitch` — must be a persisted nsec for THIS account), prompts for
      the PIN/passphrase via a new `showPasswordPrompt` dialog
      (`js/ui/promptDialog.js`), and calls `switchProfile(pubkey, { unlockStored: true,
      passphrase })`. `authService.switchProfile` now forwards `unlockStored`/`passphrase`
      → `requestLogin` → the nsec provider's `unlockStoredSessionActor` restores the signer
      and activates the account. Wrong PIN → "Incorrect PIN/passphrase" toast; no stored
      key / different account → a clear "log in with its nsec" toast. So you can switch
      NIP-07 → nsec fluently. Tests: `tests/stored-nsec-switch.test.mjs` (6, pure gate) +
      `tests/password-prompt.test.mjs` (6, dialog). Build + lint clean; auth suites 25/25.
- [x] **NIP-46 switching FIXED 2026-06-30.** Confirmed the same bug: switching to a saved
      NIP-46 account called the provider with no `reuseStored`, so it started a fresh
      handshake (needing a new connect URI/QR) instead of reconnecting. Now
      `handleProfileSwitchRequest` sends `{ providerId: "nip46", reuseStored: true }` for
      NIP-46 targets → `switchProfile` forwards `reuseStored` → the nip46 provider's
      `useStoredRemoteSigner` reconnects the stored session and activates the account. On
      failure → "Couldn't reconnect to this account's remote signer" toast.
- [x] **Wrong-account guard (all methods) 2026-06-30.** `requestLogin` now enforces
      `expectPubkey` (only set by `switchProfile`): if a single-slot stored session
      resolves to a DIFFERENT account than requested, it rejects with `pubkey-mismatch`
      instead of silently switching to the wrong profile. Also protects NIP-07 (switching
      to an account the extension isn't currently on now fails clearly instead of grabbing
      the extension's active account). Tests in `tests/authService.test.mjs` (option
      forwarding + expectPubkey rejection).
- [x] **Multiple nsec accounts — DONE 2026-06-30.** The encrypted-key store is now
      per-pubkey (`bitvid:sessionActors:v2` = `{ [pubkeyLower]: { privateKeyEncrypted,
      encryption, createdAt } }`), following the existing `bitvid:<thing>:<npub>`
      convention (profileCache, nwcSettings, …). Several saved nsec accounts each keep
      their own key on the device, so the switcher can move between them. The legacy v1
      single slot is kept in sync as the "last-saved default" (boot restore / no-arg
      reads) and is migrated into the map on first read. `readStoredSessionActorEntry`,
      `getStoredSessionActorMetadata`, and `unlockStoredSessionActor` all take an optional
      target pubkey; the nsec provider threads `expectPubkey` through so a switch unlocks
      the requested account (not the last-saved one), with the `expectPubkey` guard as a
      backstop. IndexedDB mirror is now keyed per-pubkey too. Added
      `listStoredSessionActorPubkeys()`. Tests: `tests/session-actor-multi-account.test.mjs`
      (7 — per-account resolve, list, clear-one-keeps-others, no-arg default, no-arg wipe,
      v1→v2 migration, missing-account returns null).
- [x] **Multiple NIP-46 accounts — DONE 2026-06-30.** The remote-signer session store is
      now per-user-pubkey (`bitvid:nip46:sessions:v2` = `{ [userPubkeyLower]: session }`),
      mirroring the nsec store. Several saved NIP-46 accounts each keep their own
      reconnectable session, so the switcher can move between them. The legacy v1 single
      slot is kept in sync as the last-connected default (boot restore) and migrated into
      the map on first read. `readStoredNip46Session` and `getStoredNip46Metadata` take an
      optional target pubkey; `writeStoredNip46SessionSync` writes both the map (keyed by
      `userPubkey`) and the v1 default; `clearStoredNip46Session(pubkey)` forgets one
      account (no-arg wipes all, for logout). `SignerManager.useStoredRemoteSigner({ pubkey
      })` selects the target account's session and, on access-denial, forgets only that
      account; the nsec/nip46 providers thread `expectPubkey` through so a switch
      reconnects the requested account (with the `expectPubkey` guard as a backstop). Added
      `listStoredNip46SessionPubkeys()`. (`nip46Connector.js` is dead code — the live path
      is entirely in `SignerManager`.) Tests: `tests/nip46-multi-account.test.mjs` (7).

### 8. Orphan storage garbage-collection tool
- [x] **Largely delivered by the My Videos tab** (`9d3a0df0`): lists bucket objects no
      live note references and offers per-file delete (under the user's prefix only).
- [x] **Bulk "Delete all" orphans — DONE 2026-06-30.** Added a "Delete all (N)" button to
      the orphaned-objects header in My Videos (shown only when >1 orphan). One
      confirmation → a single `deleteStorageKeys({ keys: allOrphans, pubkey })` call
      (already array-capable + unlock-gated + prefix-scoped). Refreshes the list on
      success and reports partial outcomes honestly ("Removed 2 files (1 could not be
      deleted)"); surfaces storage-locked as an unlock prompt. Tests:
      `tests/my-videos-bulk-orphan-delete.test.mjs` (5 — all-keys-in-one-call, cancel,
      storage-locked, partial, empty no-op). Build + lint clean; My Videos suite 37/37.
- [ ] Remaining (optional): surface the same orphan control from the Storage settings
      pane (currently only in My Videos).

### 9. Cap the cold-login relay-REQ storm further
- [x] **Biggest source fixed** (`a8e9f520`): the community-blacklist load fired one
      kind-30000 REQ *per curator* (~28-32 parallel) at cold start. Collapsed into a
      single batched multi-author REQ (`js/adminListBatch.js`), routed through the
      subscription manager. This was the dominant `kind 30000` storm.
- [ ] **VERIFY the batching actually reduced it.** A later logged-OUT load
      (2026-06-23 00:45) STILL showed `kind 30000=32` — either that build wasn't
      loaded, or there's ANOTHER kind-30000 source besides
      `loadCommunityBlacklistEntries` (admin editor/whitelist/blacklist lists? a
      per-author follow-set fetch?). Re-check on a fresh hard-refresh; if still ~32,
      trace the actual emitter.
- [x] **`from_hex` root-caused + FIXED (2026-06-23).** The sanitizer
      (`HEX64_FILTER_FIELDS`, toolkit.js) covered `ids/authors/#e/#p/#q` but NOT the
      NIP-22 UPPERCASE root tags `#E`/`#P`, which relays also hex-decode and which
      the kind-1111 comment subscriptions (`commentEvents.js`) query by. An
      odd-length root event-id/author there bypassed the sanitizer and got the whole
      REQ rejected ("uneven size input to from_hex"). Added `#E`/`#P` to the
      sanitized fields; test in `tests/filter-hex-sanitize.test.mjs`.
- [x] **Relay `from_hex` REQ rejects fixed** (`733cb593`): one odd-length/non-hex
      value in `ids/authors/#e/#p/#q` made strict relays reject a whole REQ; now
      sanitized at the pool choke point (`normalizeFilterList`).
- [ ] **Remaining: logged-IN cold-start WoT/social-graph fan-out** (~94-104 REQ/s,
      bracketed by `[lists-sync-start]`…`[lists-sync-complete]`). Logged-OUT is now
      clean. The spike is per-contact hydration over the user's ~25 follows/trusted
      contacts: `kind 30000` (follow sets), `30002` (block lists), `30005/30015`
      (interest sets), `10050` (DM relay hints), plus `0` (profiles). NOTE: mutes
      (`kind 10000`) are ALREADY batched (moderationService.refreshTrustedMuteSubscriptions,
      one multi-author filter). Fix = apply the same multi-author batching to the
      other per-contact fetches (userBlocks 30002, hashtagPreferences 30005/30015,
      follow-set/contacts hydration 30000, DM 10050) and/or DEFER non-feed-critical
      ones (DM relays, interest sets) until after first render. Multi-subsystem +
      sensitive (trust) → do as a dedicated perf pass, not a rushed change.
      Source still to pin: the loop issuing 30000/30002/30005/30015 per contact.

### 22. Anti-spam: validate npub on application / submission forms
- [x] **DONE 2026-06-24.** Added a shared, testable NIP-19 validator
      (`js/utils/validateNpub.js`, exposes `window.validateNpubHex`) and wired it
      into all four embed submission forms (`components/iframe_forms/`):
        - **Application** (`applicantNpub`, required): submit is blocked unless the
          npub decodes to a 64-char hex pubkey; the hex is also written into the
          application body for canonical storage/whitelist matching.
        - **Feature-request / bug-fix / feedback** (`userNpub`, optional): the npub
          stays optional, but a non-empty value must be a valid npub or submit is
          blocked with a clear inline error.
      Validation decodes via the real nostr-tools `nip19` (checksum + prefix +
      hex shape), so spam/free-text/`note1…`/tampered npubs are rejected.
      Unit tests: `tests/validate-npub.test.mjs` (real nostr-tools). Pairs with #23
      (submissions should become structured data, not DMs).
- [ ] **VERIFY live**: open each form embed — application rejects a junk npub and
      only sends with a valid npub1…; the optional forms send when the npub is
      blank but reject a malformed one.

### 23. Admin submissions tab — structured submissions + approve/deny UI (SCALING)
- [ ] Replace the current DM-based submission flow with **custom structured data**
      (a dedicated Nostr event kind / addressable record, or app data) instead of
      free-form DMs, so submissions are parseable and actionable.
- [ ] Add an **Admin → Submissions tab** with a nicely formatted UI: each submission
      rendered with its fields and an **Approve / Deny** action that applies the
      corresponding change (add to whitelist, add to blacklist, etc.) without manual
      list-editing. This is foundational for scaling moderation as the platform grows.
- [ ] Define the submission schema + the admin action → list-mutation mapping; reuse
      the existing admin list stores (whitelist/blacklist) for the writes.

### 24. User-level allowlist override for the Web-of-Trust mute list
- [ ] Let a user keep (and import) a personal **allowlist** that the client ALWAYS
      shows content from, overriding the inherited WoT/trusted-mute list. So even if a
      trusted curator mutes an author, the user can force that author's content to
      appear in their own feeds. Persist it (NIP-51 list, encrypted/opt-in), make it
      importable, and apply it at the render-time moderation filter as a final
      allow-override after the WoT mute/block checks.

### 25. Per-video / per-event admin block list (granular moderation)
- [x] **DONE 2026-06-30 (full vertical slice).** Admins (any editor — same gate as the
      author blacklist) can now hide a SINGLE video without blocking its author.
      - **Record:** a published kind-30000 NIP-51 list under d-tag
        `bitvid:admin:event-blacklist`, carrying blocked event ids as `e` tags
        (`NOTE_TYPES.ADMIN_EVENT_BLACKLIST` schema; `participantTagName: "e"`).
        Loaded/persisted through the existing admin-list machinery
        (`adminListStore` loadNostrState/persistNostrState) and cached like the others.
      - **accessControl:** `eventBlacklist` Set + `getEventBlacklist()`/
        `isEventBlacklisted()`/`addToEventBlacklist()`/`removeFromEventBlacklist()`
        (editor-gated, normalizes hex or nevent/note) + `onEventBlacklistChange`.
      - **Render filter:** already existed (`app.blacklistedEventIds`, honored by every
        feed/grid/search/playback path) but was fed only by the static
        `ADMIN_INITIAL_EVENT_BLACKLIST` config. Now `app._rebuildBlacklistedEventIds()`
        merges that static base with the dynamic admin list, and an
        `onEventBlacklistChange` listener rebuilds + refreshes the grids on change.
      - **UI:** a "Block this video" item in the per-video ⋯ menu (editor-only, via
        `videoMenuRenderers`), handled by `handleBlacklistEventAction`
        (`js/ui/moreMenu/blacklistEventAction.js`).
      - Helpers extracted to `js/adminEventBlacklistHelpers.js` to keep adminListStore /
        accessControl / moreMenuController under their size caps. Tests:
        `tests/admin-event-blacklist.test.mjs` (9 — record helpers + editor-gated action,
        fallbacks, refusal, publish-failure). Build + lint clean; admin/access/moderation
        suites 56/56.
- [x] **Follow-up DONE 2026-07-01.** The admin pane is now organized into a sub-tab
      toolbar (Whitelist / Blacklist / Blocked videos / Moderators — Moderators tab
      super-admin-only) and a **Blocked videos** tool surfaces the per-event list:
      view every blocked video (title+author when cached, else shortened id), **unblock**
      per row (confirm → `removeFromEventBlacklist`), and **add by nevent/hex id**. Reuses
      the existing accessControl event-blacklist API + `onEventBlacklistChange` (live
      re-render) and refreshes the grids on change; no backend changes. Row logic in
      `js/ui/profileModal/blockedVideosSection.js`; wiring in `ProfileAdminController`.
      Tests: `tests/profile-blocked-videos.test.mjs` (7) + updated profile-modal-controller
      admin test for the sub-tab layout.

### 26. Video popularity / view-count chart (public, three-dots menu) — DONE 2026-06-24
- [x] **Shipped.** A "Popularity" item in the ⋯ menu opens a public views-over-time
      chart (`js/viewCountChart.js`). `buildViewCountTimeSeries` buckets the raw
      kind-30079 view events by the counter's dedupe window (one view per viewer
      per day) into a cumulative series; `buildViewCountChartSvg` renders a
      token-colored (currentColor/`text-accent`) SVG area+line — no chart lib. The
      modal fetches via `listVideoViewEventsWithDefaultClient`, shows the total,
      and **updates live** by subscribing to `subscribeVideoViewEventsWithDefaultClient`
      (debounced re-render); cleans up on close (Esc/backdrop/✕). Lazy-loaded from
      the menu handler. Tests: `tests/view-count-chart.test.mjs`. Built on the
      trustworthy #4 counts.
- [ ] FUTURE: feed the same data into a **creator dashboard** showing the creator
      their videos' ranking + performance over time (separate, larger effort).

### 27. "Trending" tab — recently-added sorted by view count — DONE 2026-06-24
- [x] **Shipped.** New `FEED_TYPES.TRENDING` tab: the active (recently-added)
      source ranked by VIEW COUNT (recency tiebreak, trusted-muted last). Gated by
      `FEATURE_TRENDING_FEED` (default ON; flag-off hides the sidebar link and skips
      registration). Relies on the now-trustworthy view counts (#4).
      - `createTrendingSorter` (sorters.js) reads counts from the injected
        `runtime.getViewCount`, which resolves each video's pointer (the app's
        canonical `deriveVideoPointerInfo`) against the shared viewCounter cache —
        the same counts the grid cards already load.
      - **Live re-rank:** `viewCounter` now emits a coalesced `onViewCountsChanged`
        signal; while the Trending view is active it debounce-re-runs the feed
        (cheap re-rank over the in-memory active set, no relay re-fetch), so the
        order settles into true trending as counts stream in. Cold cache ⇒ reads as
        recency, then improves.
      - Pipeline extracted to `js/feedEngine/trendingFeed.js` (feedCoordinator is at
        its size cap); thin delegations + a `getVideoViewCountSnapshot` export.
      - Wiring: FEED_TYPES + flag, feedCoordinator load/refresh cases, app.js
        wrappers, applicationBootstrap registration, viewManager init +
        `js/trendingView.js`, `views/trending.html`, sidebar link.
      - Tests: `tests/trending-sorter.test.mjs`.
- [ ] FUTURE: benefits from the unified streaming grid (#17d); consider a time-
      windowed "trending" (views in the last N days) once view-over-time data (#26)
      lands, instead of all-time totals.

### 31. ⋯ menu "Event Details" button does nothing (BUG) — fix landed, VERIFY
The wiring is structurally intact (menu item `event-details` → handler case →
`handleEventDetailsAction` → `EventDetailsModal.open`), so the failure was a
SILENT one: `handleEventDetailsAction` only opened the modal `if (… && payload
.video)` and never caught the async `open()` rejection, and `open()` ran the
(throwable) `renderVersion` BEFORE actually showing the modal. Hardened:
- [x] `handleEventDetailsAction` no longer fails silently — surfaces "No video
      selected" / "unavailable", falls back to `app.eventDetailsModal`, and
      `.catch()`es the open promise.
- [x] `EventDetailsModal.open` now calls `openStaticModal` FIRST, then renders in
      a try/catch, so a render hiccup can't leave the click looking dead.
- [x] The ⋯ popover is dismissed before opening the modal.
- [x] **Actual root cause (2nd live test):** BOTH Event Details and Popularity
      reported "No video selected" from the **video modal's** ⋯ button. The modal
      trigger declares its context as `data-more-dropdown="modal"`, but
      `attachMoreMenuHandlers` read only `data-context` → defaulted to `"card"` →
      skipped the modal-only video resolution → opened the popover with a **null
      video**, so the panel's `data-event-id` was empty and every action failed.
      The panel is built from `entry.context.video`, so this nulled the whole menu.
      Fixes (all in `moreMenuController.js`):
        1. Read context from `data-more-dropdown` as well as `data-context`.
        2. Modal branch falls back to `this.videoModal.activeVideo` when
           `getCurrentVideo()` is null (deep-link opens don't set playback's
           currentVideo).
        3. Defense-in-depth: `handleEventDetailsAction` resolves the video from
           `app.videosMap.get(eventId)`, and `view-stats` uses a new
           `getVideoByEventId` callback (dropping a risky `|| currentVideo`).
      Regression tests added in `tests/more-menu-controller.test.mjs`.
- [ ] **VERIFY live**: click ⋯ → Event Details AND ⋯ → Popularity in the video
      modal AND on a grid/channel card; both should open the correct video.

### 32. Whitelisted author's video won't play — "not from a whitelisted author" (BUG)
Reported 2026-06-25: a video from a known-whitelisted author refused to play
("This content is not from a whitelisted author." at `playbackCoordinator
.playVideoByEventId`). The source URL was confirmed 100% healthy (HTTP 200,
video/mp4, range + CORS `*`) — the block is the whitelist gate, not the source.
- [x] **Root cause + fix: `canAccess` format asymmetry.** `accessControl` keeps the
      whitelist in TWO sets — `whitelistPubkeys` (hex) and `whitelist` (npub) — and
      `canAccess` checked only ONE based on the caller's input format (npub→npub set,
      hex→hex set) without cross-deriving. `playbackCoordinator` passes the author's
      **npub**, so it consulted only the npub set; if the entry was present in only
      the hex set (e.g. the hex decode hadn't run / a normalization mismatch), a
      genuinely whitelisted author read as "not allowed." Fixed `canAccess` to
      cross-derive both forms and check BOTH sets (false-negatives only; a
      non-whitelisted author is still denied). Tests:
      `tests/access-control-canaccess.test.mjs`.
- [x] Added a dev-gated diagnostic at the playback rejection
      (`playbackCoordinator`) logging hex/npub, whitelistMode, set sizes, and
      `inNpubSet`/`inHexSet` — so if it still denies, we know instantly whether the
      author is genuinely off the list (→ then it's the separate "ingested foreign
      content shown in a whitelist-mode feed but unplayable" question) vs a load race.
- [ ] **VERIFY live**: replay the failing nevent. If it plays → fixed. If it still
      denies, paste the new `[playback] access denied — whitelist diagnostic` line.

### 28. Beacon torrent app stuck — spinner never resolves (BUG) — FIXED 2026-06-24
- [x] **Root cause:** the processing overlay (`torrent/app.js`) was gated on
      WebTorrent's metadata-ready callback (`client.add(magnet, opts, cb)` /
      `client.seed`). That callback only fires once metadata arrives from peers, so
      a magnet with **no live seeders** never resolved it and the spinner span
      forever — and a torrent that emits its own `'error'` (bad/duplicate magnet)
      didn't always reach the client-level handler. (NOT the `null.fill` crash
      (#10); the client constructs fine — this was a missing timeout/failure path.)
- [x] **Fix:** added a watchdog around the overlay. `beginProcessing()` arms a
      30s `PROCESSING_TIMEOUT_MS` timer; if the op hasn't completed it drops the
      overlay and warns ("still searching for peers — it'll keep trying in the
      background") while the torrent stays in the table and keeps announcing.
      `handleTorrentReady`, the client error handler, and `destroy()` all clear the
      watchdog. `addMagnet`/`seedFiles` now wrap `add`/`seed` in try/catch and
      attach a per-torrent `'error'` listener so bad magnets fail visibly.
- [x] **Tests:** `tests/torrent/beacon-watchdog.test.mjs` (JSDOM) — a no-peers
      magnet drops the spinner + warns; a ready torrent resolves it and a stale
      watchdog can't re-fire.
- [ ] **VERIFY live**: open the beacon, paste a dead magnet → spinner should clear
      with a warning after ~30s instead of hanging; paste a live magnet → resolves.

### 29. Admin-whitelisted users bypass the Web-of-Trust (anti-abuse) — DEFERRED (YAGNI)
**DECISION 2026-06-24: defer until there's a real brigading incident to scope against.**
The premise is sound (an admin vouch is a stronger, non-brigadeable signal than
crowd-sourced WoT mutes/flags), but it's a speculative anti-abuse feature and the
right *scope* is best decided against a real case. Low risk to defer at small scale:
WoT mutes come from *trusted* muters, so brigading requires coordinating people
already inside the trust graph. **One caveat:** there's currently no admin override
to rescue a creator who *does* get WoT-hidden, so if it happens, ship this promptly.

**Scaffolding already exists — when needed, this is a small, localized change:**
- `js/feedEngine/stages.js` (~1143): `adminWhitelist` is already computed per video
  (`adminStatus?.whitelisted === true`) and there's an `adminWhitelistBypass = false`
  placeholder right beside the hide decision (~1210-1229) + a `hideBypass` framework
  (`"viewer-override"` / `"feed-policy"`). Wire `"admin-whitelist"` as another reason.
- **Scope it correctly (the design refinements):**
  1. Bypass only the **WoT mute/report HIDE** layer — that's the brigadeable part.
  2. **Never** override a viewer's OWN block/mute — those are a separate, earlier
     filter (`reason: "viewer-block"`, stages.js:934), so the bypass naturally won't.
  3. **Open scope question** (decide against the real case): bypass *soft* report
     categories (nudity/spam/general mutes) only and still HIDE hard/illegal
     categories — vs. bypass everything. Categories ARE distinguished (`reportType`),
     so either is feasible. Leaning soft-only so a whitelist can't force-show illegal.
- [ ] When a real example appears: flip the placeholder with the scope above + tests.

### 30. Blossom storage support (bring to par with R2 / S3)
- [ ] Add **Blossom** (BUD-01/02 blob storage over Nostr) as a storage provider
      alongside Cloudflare R2 and generic S3. Bring it to functional parity where
      possible: upload, thumbnail, `.torrent`, public URL resolution, and
      delete/edit cleanup. Slot it into the existing storage-provider abstraction
      (`r2Service.js` / `storageService.js`) and the Storage settings pane; auth is
      a signed Nostr event per Blossom rather than S3 keys. Research the BUD spec
      coverage needed for bitvid's upload/delete flows.

### 34. NIP-71 mirror: videos show "not mirrored" + duplicate on re-mirror (BUG)
Reported 2026-06-25. Relates to #17 (NIP-71 interop) / the bitvid→NIP-71 mirror.
- [ ] **Mirrored videos report as NOT mirrored.** All videos were mirrored, but the UI
      now shows them un-mirrored even though the NIP-71 mirror events exist. The
      "is this mirrored?" detection is wrong/stale (likely the mirror-state lookup
      doesn't find the existing kind-21/22 mirror, or a flag isn't persisted/derived).
- [ ] **Re-mirroring creates DUPLICATES.** Because they read as un-mirrored, mirroring
      again publishes a SECOND NIP-71 event, so NIP-71 clients show two copies of the
      same video. The mirror should be idempotent (addressable/replaceable, or detect
      the existing mirror and update it) instead of creating a duplicate.
- [ ] Delete/un-mirror correctly removes BOTH copies (so the dedup key is shared) —
      confirms the publish path is creating a true duplicate, not a distinct event.
- [ ] Fix: make mirror detection reliable + the mirror publish idempotent. See
      `js/nostr/nip71Mirror.js` / `js/services/nip71MirrorFlags.js`.

- [x] **AUDIT done 2026-06-25.** Two root causes:
      1. **Detection is device-local.** `isMirrorEnabled(pubkey, videoRootId)`
         (`nip71MirrorFlags.js`) reads a localStorage flag (`FLAG_KEY`), NOT the actual
         published mirror events — so a cache clear / other device / lost flag reports
         "not mirrored" even though the 34235/34236 events exist on relays.
      2. **Kind is unstable → cross-kind duplicate.** `buildNip71MirrorEvent`
         (`nip71Mirror.js:177`) uses `short = hasDims && height > width` → kind 34236,
         else 34235. The d-tag is deterministic (`["d", videoRootId]`), but
         `(34235,pubkey,d)` and `(34236,pubkey,d)` are DISTINCT addressable events. When
         a video has dimensions on one mirror attempt but not another, the kind flips, so
         re-mirroring publishes the OTHER kind → two copies in NIP-71 clients. "Delete
         removes both" confirms the shared d-tag / two-kind duplicate.
- [x] **FIX (a) Idempotent publish + self-heal — DONE 2026-06-25.**
      `nip71MirrorService.publish()` now looks up the author's existing mirror (both
      kinds) via the SubscriptionManager chokepoint and **reuses the existing kind** so
      a re-publish REPLACES the same addressable coordinate instead of creating the
      cross-kind duplicate. If both kinds already exist (the bug's aftermath), it
      **self-heals** by NIP-09-deleting the stale-kind coordinate. An explicit
      `options.short` override still wins. Also added `findMirror(video)` (relay-truth
      `{mirrored, kinds, duplicate}`). Dependency-injected; 4 new scenario tests in
      `tests/nip71-mirror-service.test.mjs` (12/12 green); lint clean (no direct
      pool.list — uses `getSubscriptionManager().list`).
- [x] **FIX (b) Relay-truth detection in the UI — DONE 2026-06-29.** Added batched
      `nip71MirrorService.findMirrors(videos)` → `Map<videoRootId, {mirrored, kinds,
      duplicate}>` (one relay lookup per root via `Promise.all`, all through the
      SubscriptionManager chokepoint). `MyVideosController.renderRows` now fires
      `refreshMirrorStates(rows)` after the synchronous (local-flag) render: it looks up
      relay truth, **reconciles the device-local flag to match** (so the flag becomes a
      correct cache, not the source of truth), and corrects each mirror button's label
      ("Shared ✓" / "Share to apps"). Buttons are tagged `data-mirror-root` for the
      batched update. Fire-and-forget — never blocks render; detection failures fall back
      to the local flag. 4 new behavioral tests in
      `tests/my-videos-mirror-relay-truth.test.mjs` (jsdom: promote unmirrored→shared,
      clear stale shared, per-row batch reconcile, button tagging); build + lint clean.
- [ ] **VERIFY on unstable with Amber:** re-mirror an already-mirrored video → it should
      replace (one copy), and a previously-duplicated video should collapse to one.

### 35. Admin whitelisting tool is slow & cumbersome — improve with application forms
- [ ] The current admin whitelist tool is slow and clunky to use. Improve the UX when
      we integrate the **application/submission forms** (#22) and the **Admin
      Submissions tab** (#23) — e.g. approve-an-application → add-to-whitelist in one
      action, batch operations, and faster list mutation. Couples with #22/#23.

### 36. Storage unlock doesn't work with nsec login (BUG)
- [x] **ROOT-CAUSED + FIXED 2026-06-29.** Audited the whole nsec unlock path and built
      an empirical repro: the crypto layer is **correct** — with real nsec cipher
      closures (`createPrivateKeyCipherClosures`), `storageService.unlock` round-trips
      master-key encrypt→lock→decrypt perfectly (NIP-44). Both nsec login paths
      (`registerPrivateKeySigner`, `unlockStoredSessionActor`) register a signer exposing
      `nip04Decrypt`/`nip44Decrypt`. **The real failure is session-shape after a page
      reload** (user-confirmed repro): a persisted "remember this key" nsec session
      restores the logged-in **pubkey + UI but NOT the in-memory signer** (the private key
      is only passphrase-encrypted). `ProfileStorageController`'s fallback
      (`ensureActiveSignerForPubkey`) can only rebuild an *extension* signer, so an nsec
      user hit a dead-end: storage unlock found no signer and showed the misleading "No
      active signer found. Please login." even though they look logged in.
      **Fix:** detect this exact case (`getLockedStoredNsecSession` — a saved nsec key for
      the account being unlocked via `getStoredSessionActorMetadata`) and surface an
      **actionable** error/status ("Your saved key is locked after reload — re-enter your
      passphrase from the Login menu to unlock it, then unlock storage") in both the
      Unlock-button flow and the passive Storage-pane status text, instead of the generic
      no-signer / no-decryptor messages. New error code
      `storage-unlock-locked-nsec-session`. Tests:
      `tests/storage-unlock-locked-nsec.test.mjs` (6, behavioral). Build + lint clean.
- [x] **Follow-up (UX nicety) — DONE 2026-06-30.** Clicking "Unlock Storage" on a
      locked persisted-nsec session now **auto-opens the login modal** straight to its
      existing unlock-saved-key (passphrase) flow, so the user re-unlocks in one step.
      Added a side-effect-free `openLoginModal` service to `profileModalServices`
      (`app.loginModalController.openModal` — no add-account callback, idempotently
      ensures the modal exists first); `reportLockedNsecSession({ autoOpenLogin })` calls
      it only from the user-initiated unlock click, NOT the passive pane render (no
      surprise popups). After the user unlocks, the signer is active app-wide and
      re-opening the storage pane auto-unlocks. Tests extended (8 total: asserts auto-open
      fires on click, stays closed on passive render).
- [ ] **VERIFY on unstable:** nsec-login with "remember key" + passphrase, reload the
      page, open Profile → Storage → the status should read the actionable re-unlock hint
      (not "No active signer"); after re-entering the passphrase via Login, storage
      unlocks normally. (`[storage-unlock]` console line confirms the locked-key branch.)
- [x] **Same fix for the UPLOAD modal — DONE 2026-06-30.** The Upload modal's "Unlock
      storage" had its OWN unlock path (`UploadModal.handleUnlock`) that dead-ended on a
      reloaded persisted-nsec session with "No signer available to unlock storage."
      Added `promptStoredNsecUnlock(pubkey)`: when the active account has a locked saved
      nsec key (`getStoredSessionActorMetadata`), it shows an actionable message and opens
      the login modal's unlock-saved-key (passphrase) flow (`onRequestUnlock`, wired in
      `initUploadModal` → `app.loginModalController.openModal`) instead of the alert. After
      the user re-enters their passphrase the signer is active and the upload proceeds.
      Tests: `tests/upload-modal-nsec-unlock.test.mjs` (5). Build + lint clean.

### 37. Channel playlists — creator-curated custom note lists
- [ ] Let creators build **playlists** (custom curated lists of their videos / notes)
      surfaced on their channel. Likely a NIP-51 set (kind 30005 "curation sets" or a
      bitvid-specific addressable list) referencing video events, with create/edit/
      reorder UI on the channel page and a playlist view. Research the list shape +
      where it slots into channel profile + the feed engine.

### 38. Generic S3 doesn't work with Backblaze B2 — add B2 as a first-class provider
- [x] **DONE 2026-06-30.** Added **Backblaze B2** as its own provider
      (`PROVIDERS.B2 = "backblaze_b2"`). Root issue: B2's S3 endpoint is *region-scoped*
      (`s3.<region>.backblazeb2.com`) and a public bucket is addressed virtual-hosted, so
      the public download URL is `https://<bucket>.s3.<region>.backblazeb2.com/<key>` —
      not derivable from a pasted generic-S3 endpoint. Implementation:
      - `deriveB2Endpoint(region)` (`js/storage/s3-url.js`, re-exported from `s3Service`):
        region → `https://s3.<region>.backblazeb2.com`; returns "" for `auto`/blank/pasted
        host so callers can require a real region.
      - `storageService`: `PROVIDERS.B2` + `resolveB2Endpoint` (explicit endpoint wins,
        else derive from region) + a `PROVIDER_TESTS[B2]` handler (derived endpoint,
        `forcePathStyle:false`).
      - **Public URL strategy = S3-style virtual-hosted** (user-chosen): auto-derives to
        `https://<bucket>.s3.<region>.backblazeb2.com`; an explicit Public Access URL
        (custom domain/CDN) overrides it — the save path now passes the user's URL to
        `prepareS3Connection` (also fixes generic-S3 silently ignoring a custom CDN URL).
      - UI (`profile-modal.html` + `ProfileStorageController`): "Backblaze B2" option +
        helper; for B2 the raw Endpoint field is hidden (region drives it), Region shows a
        `us-west-004` example, force-path-style toggle hidden (B2 is virtual-hosted), and
        save/test derive the endpoint from region (clear "enter your region" error if
        missing). `UploadModal` shows B2-specific labels.
      - Tests: `tests/storage-b2-provider.test.mjs` (8 — endpoint derivation, virtual-
        hosted public URL, end-to-end validate, explicit override, object URLs). All
        s3/storage suites green (50); build + lint clean.
- [x] **VALIDATED against a real B2 account 2026-06-30.** Read-only `b2_authorize_account`
      on the live `bitvid` bucket confirmed the derivation EXACTLY: B2's reported
      `s3ApiUrl` = `https://s3.us-west-004.backblazeb2.com` = `deriveB2Endpoint("us-west-004")`;
      bucket is `allPublic` → S3-style playback URL works. Key file caps
      (read/write/list/delete) ✓.
- [x] **CORS helper modal (provider-aware) — DONE 2026-06-30.** Empirically confirmed
      the gotcha: B2's web-console "Share everything…" presets write DOWNLOAD-only CORS
      (`s3_get/s3_head`, `b2_download_*`) — **no `s3_put/s3_post`** — so browser uploads
      CORS-fail. Added a "CORS setup help" button (shown for **all** bucket providers)
      opening a **provider-aware** modal:
      - **Backblaze B2** → B2-native rules JSON (upload + ranged-playback ops) + the
        `b2 update-bucket --corsRules …` command.
      - **Custom S3** → standard S3 `CORSConfiguration` JSON + `aws s3api put-bucket-cors
        --endpoint-url <endpoint> …`.
      - **Cloudflare R2** → standard S3 JSON + Cloudflare-dashboard guidance (R2 → bucket
        → Settings → CORS Policy) and the AWS-CLI command against the derived R2 endpoint.
      Origins pre-filled from `getCorsOrigins()`; copy buttons for JSON + command. bitvid
      still auto-applies CORS on Save (R2/S3 via `ensureBucketCors`) — this is the manual
      fallback for when the key lacks CORS-write permission. Logic in
      `js/ui/profileModal/storageCorsHelp.js` (`buildCorsHelpContent` switches on
      provider; keeps the controller <1000 lines). Tests:
      `tests/storage-cors-help.test.mjs` (10 — per-provider rules/command + DOM switch).
      Build + lint clean.
- [ ] **VERIFY live** on unstable: pick Backblaze B2, enter region (`us-west-004`) +
      bucket + key/secret, Test → passes; apply the CORS helper's rules; upload a video →
      plays from `https://<bucket>.s3.<region>.backblazeb2.com/...`.
- [x] **Per-provider connections (no overwrite/clash) — DONE 2026-06-30.** The UI saved
      every provider into a single shared `"default"` connection id, so configuring B2
      overwrote R2 (etc.). The service layer + upload path + sync already supported a
      MAP of connections keyed by id (`listConnections`/`defaultForUploads`/
      `exportAccountRecord`) — only the controller collapsed them. Now each provider type
      gets its own slot keyed by provider id (`cloudflare_r2`/`backblaze_b2`/`generic_s3`):
      save writes that slot (preserving a single active `defaultForUploads`, and lazily
      migrating the legacy `"default"` slot to its provider id), and switching the provider
      dropdown loads that provider's saved credentials (or clears the fields for a fresh
      entry). Sync already carries the whole record, so all providers sync together.
      Logic extracted to `js/ui/profileModal/storageConnections.js` (`saveProviderConnection`
      + pure helpers; keeps the controller under the 1000-line cap). Tests:
      `tests/storage-connections.test.mjs` (7 — pure default/dup logic + integration:
      R2+B2 coexist with one default, re-default switch, legacy-`default` migration, and
      the export carries both). Storage + profile-modal suites 69/69; build + lint clean.
- [x] **Upload wrong-service routing FIXED 2026-06-30 (multi-provider regression).** With
      both B2 + Cloudflare configured, an upload could fail with **"S3 endpoint is
      required."** when the upload modal's tracked `activeProvider` drifted out of sync
      with `activeCredentials` (user: "selector on Backblaze but the modal set for
      Cloudflare") — an R2 connection (accountId, no endpoint) got routed through the S3
      service. Fix: `MediaUploader.uploadVideo`/`uploadThumbnail` now route by the
      CREDENTIALS' own provider (`credentials.provider || meta.provider || provider`), so
      a stale modal provider can't pick the wrong service. Test:
      `tests/media-uploader-provider-routing.test.mjs` (4). Build + lint clean.
- [ ] **Follow-up (cosmetic):** the upload modal's summary provider label can still show
      a stale provider until reloaded — refresh `loadFromStorage` when the storage default
      changes in the Storage pane (functional routing is already correct).
- [x] **B2 / generic-S3 upload contract mismatch FIXED 2026-06-30.** Uploading to a
      Backblaze B2 (or any generic-S3) bucket failed with **"S3 endpoint is required."**
      Root cause: `MediaUploader` calls `service.prepareUpload(npub, { credentials })`
      (the `r2Service` contract), but `s3UploadService.prepareUpload` took `(settings, …)`
      — so the npub string became the settings (no endpoint). Also a
      `storageService.getConnection()` result keeps `bucket`/`endpoint`/`region` under
      `.meta`, which `validateS3Connection` reads at the top level. Fix:
      `s3UploadService.prepareUpload` now accepts `(npub, { credentials })` and flattens
      meta → top-level via `flattenS3Settings`. (R2 was unaffected because its service
      already used that contract.) Also: the storage **Test** now derives/passes the B2
      public URL so it stops falsely warning "Public Bucket URL is missing." Tests:
      `tests/services/s3-upload-prepare-contract.test.mjs` (3 — flatten + npub-ignored +
      back-compat). Build + lint clean; upload/storage suites 46/46.

### 39. Image uploads should prefer uploading to configured storage (UX)
- [x] **Profile image + banner upload — FIXED 2026-06-30.** The UI was already wired
      (`ProfileEditController.handleUpload`: resolve connection → `uploadFile` → auto-fill
      the URL field), but it was **broken**: it passed a **hex** pubkey to
      `r2Service.resolveConnection()`, which only decoded `npub1…` strings
      (`safeDecodeNpub`) → hex resolved to `null` → "Storage configuration missing" and the
      Upload button stayed disabled even with storage configured. (Thumbnails worked
      because `mediaUploader` uses `listConnections(pubkey)` directly.)
      **Fix:** `resolveConnection` now accepts a hex pubkey OR an npub. The rest of the
      chain is already provider-agnostic — `resolveConnection` returns the
      `defaultForUploads` connection (any provider) with its `endpoint`/`baseDomain`/
      `forcePathStyle`, `uploadFile` routes R2 vs generic-S3 by provider, and
      `buildPublicUrl` builds the right URL — so this now works for R2 / B2 / Custom S3.
      Test: `tests/r2-resolve-connection-hex.test.mjs` (3, with `nip19.decode` throwing on
      hex to prove the hex path, not npub decoding). Build + lint clean.
- [ ] **VERIFY live:** unlock storage, Edit Profile → upload a picture/banner file →
      uploads to the active provider's bucket and the URL auto-fills.
- [ ] **Extend the pattern** to any remaining image-URL inputs that still only accept a
      pasted link (video thumbnail in upload/edit already uploads via `mediaUploader`).
      Audit for others (e.g. future channel/branding image fields) and reuse the helper.

## Open — lower priority / infra

### 10. WebTorrent `null.fill` seeding crash
- [ ] Investigate the vendored `webtorrent.min.js` `null.fill` error on wire handshake;
      may require a bundle update or patch.

### 11. Harden flaky tests (CI gate reliability)
- [ ] `tests/ui/uploadModal-reset.test.mjs` ("UploadModal Reset Logic") intermittently
      hangs/cancels (jsdom/webtorrent async-hang flake; documented in KNOWN_ISSUES,
      reproduced on pre-refactor `1b11cb1b`). Make it deterministic so it can be a
      trusted release gate. Audit e2e parallel-load flakiness too.

### 11b. SILENTLY-EXCLUDED unit tests — 20 files never run in CI (found 2026-06-23)
`scripts/run-unit-tests.mjs` only collects `*.test.mjs|*.test.js` files whose
**content contains `node:test`** (line ~54). 20 test files use bare `assert` +
top-level await instead, so the runner skips them WITHOUT WARNING and they are
referenced by no other CI script. They rot invisibly (this is how the delete-flow
test below was failing on `main` unnoticed).
- [x] **`tests/nostr-delete-flow.test.mjs` — FIXED + brought into CI** (converted to
      node:test; stale write-relay config + removed-pool.sub subscription harness
      corrected; see TEST_INTEGRITY.md 2026-06-23).
- [ ] **Add a guard so this can't recur**: make `run-unit-tests.mjs` emit a visible
      WARNING (or fail) when it finds a `*.test.{mjs,js}` lacking a `node:test` import,
      listing each skipped file. (Decide warn-vs-fail — fail would immediately red-CI
      on the ~11 broken files below until they're triaged.)
- [x] **Runner guard SHIPPED (2026-06-23).** `scripts/run-unit-tests.mjs` now collects
      EVERY `*.test.{mjs,js}` (no more node:test content filter) and runs both styles.
      Known-broken files are listed in an explicit `QUARANTINE` map — loudly reported
      on every run (never silently skipped), and a stale-entry check flags any
      quarantine path that no longer exists. The 10 PASSING orphans below now run in
      CI automatically (no per-file conversion needed).
      - PASS, now in CI: `nostr-view-event-bindings`, `nostr-rebroadcast-guard`,
        `watch-history-feed`, `subscriptions-feed`, `discussion-count-service`,
        `feed-engine`, `zap-split`, `nostr-view-events`,
        `watchHistory/watch-history-telemetry`, `unit/ui/thumbnailBinder`.
- [ ] **Triage + un-quarantine the 10 broken files** (first-error diagnosis 2026-06-23;
      each needs the stale-vs-real-bug investigation the delete-flow file got):
      - `watch-history` (#2) — DONE + UN-QUARANTINED 2026-06-23. Three stale tests,
        all spec-corrected to shipped behavior (see TEST_INTEGRITY.md):
        (1) `testWatchHistoryPartialRelayRetry` asserted snapshot THROWS on partial
        acceptance (contradicting `565a9618`) → now asserts success / no-throw /
        no-republish / queue-emptied; (2) `testWatchHistoryServiceIntegration` set a
        logged-in pubkey different from the queried actor (history files under the
        logged-in pubkey now) → aligned; (3) same test asserted `session===true` for a
        logged-in watch (the pre-fix bug) → corrected to `session!==true`. The full
        2669-line file passes via the CI runner and was removed from QUARANTINE.
      - `nostr-boost-actions` — ✅ DONE + UN-QUARANTINED 2026-06-25: STALE SPEC. The
        test required `buildRepostEvent` to throw `/missing-event-relay/` with no relay
        hint, but a relay hint is a NIP-18 SHOULD (not MUST) — the builder degrades to a
        two-element `e` tag so a user can always repost. Replaced with an exact assertion
        of the valid output (kind 16 + e/p/k tags). See TEST_INTEGRITY.md.
      - `view-counter` (#4) — ✅ DONE + UN-QUARANTINED 2026-06-24: the failures were
        (a) the deterministic-d-tag accuracy fix (no more random `d` tag, so no
        auto-`d` either), (b) the batched SubscriptionManager silently shadowing
        the legacy mocks, (c) a time-of-day-flaky dedupe-window setup, and (d) a
        moved root-timestamp unit boundary. All fixed; full file green. See
        TEST_INTEGRITY.md.
      - `zap-shared-state` (#3) — ✅ DONE + UN-QUARANTINED 2026-06-23: stale fee-fallback
        test (expected 0; the function correctly falls back to the configured default so
        a junk override can't bypass the fee) — corrected.
      - `video-modal-zap` (#3) — ✅ DONE + UN-QUARANTINED 2026-06-23: surfaced TWO real
        zap bugs (in-flight status mis-toned `warning`→`neutral`; success path now uses
        the holistic `resetZapForm`) + spec/harness fixes (completion-count reset+complete;
        receipt render asserts on the inner zapController's element after the
        VideoModal→sub-controller refactor).
      - `nwc-client` (#3) — REAL production bug FIXED 2026-06-23: `parseNwcUri` passed a
        hex secret to nostr-tools `getPublicKey` (needs bytes) → NWC connection broken.
        Fixed + guarded by the real-tools `tests/nwc-parse-uri.test.mjs`. The mock-based
        `nwc-client.test.mjs` STAYS quarantined — its nostr-tools mock is shadowed by the
        frozen canonical toolkit the bootstrap installs; needs a mock-injection rework.
      - `nostr-count-fallback` — ✅ DONE + UN-QUARANTINED 2026-06-25: STALE TEST after a
        refactor. `countUnsupportedRelays` moved from `NostrClient` to its
        `ConnectionManager`; the test read it off the client (undefined.has). Repointed the
        assertion at `client.connectionManager.countUnsupportedRelays`. No behavior change.
      - `admin-list-store` — ✅ DONE + UN-QUARANTINED 2026-06-25: STALE HARNESS (no
        production change, no assertion weakened). Community curator lists are fetched via
        the BATCHED SubscriptionManager (cold-start relay-storm fix) which the harness
        didn't mock; the mock-"hex" curator values started with "npub" so
        parseCommunityBlacklistReferences decoded them twice; and createListEvent omitted
        the `d` tag that selectNewestEventsForReferences matches on. Fixed all three to be
        faithful to production. See TEST_INTEGRITY.md.
      - `nostr-publish-rejection` — STILL QUARANTINED. Partially diagnosed 2026-06-25:
        multi-precondition setup. (1) `testPublishVideoNoteDefaultsToLiveModeInDev` needs
        dev mode — set `globalThis.__BITVID_DEV_MODE_OVERRIDE__=true` BEFORE the first
        (dynamic) config-importing import (~line 50). (2) The `publishNip71Video` sub-test
        then fails — `publishVideo`'s NIP-71 invocation path needs FEATURE_PUBLISH_NIP71 /
        condition triage; possibly more after. Quarantine note carries the steps.
      - `nostr-publish-rejection`, `nwc-client`, `user-blocks` remain quarantined
        (see QUARANTINE map in run-unit-tests.mjs for the precise reason on each).
      - `user-blocks` — STILL QUARANTINED: HANGS (async leak); needs a deterministic rewrite.

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

> **Shared requirement for #16 + #16b:** each is a NEW left **sidebar tab**, and each
> must be independently **enable/disable-able from the instance config file**
> (`config/instance-config.js`, like the existing feature flags). When a tab is
> disabled it must be completely absent — no tab, no subscriptions, no trace — exactly
> as if it were never added (the current default state). Build both behind their own
> config flags from the start.

### 16. Nostr live streams — INGEST / watch-only (zap.stream, shosho.live)
> **Dev plan: `docs/live-ingest-plan.md`** (decisions open + Phase 0 research spike).
> Ingesting live streams (watch others' streams) and PUBLISHING a stream
> ("go live", #16c) are TWO separate functions and must each have their OWN config
> flag — the maintainer wants to enable/disable ingest and publish independently.
- [ ] Likely **NIP-53 Live Activities**: kind **30311** (live event; carries the
      `streaming` URL — usually HLS .m3u8 — plus `status` live/planned/ended,
      title, host `p` tags), and kind **1311** (live chat). zap.stream and
      shosho.live publish these.
- [ ] Watch-only scope: discover/list live (status=live) events, render the HLS
      stream in the player, optionally show live chat (read).
- [ ] New **"Live" sidebar tab**, gated behind its own INGEST config flag (see
      shared requirement above) — disabled by default until shipped.
- [ ] Research: confirm NIP-53 kinds + tag shapes, how zap.stream vs shosho.live
      populate `streaming`/`recording`, and HLS playback support in the player.

### 16c. Publish live streams — "Go Live" from bitvid (like zap.stream)
> **Dev plan: `docs/live-publish-plan.md`** (FUTURE — after #16 + #16b; static
> client + optional Media Node/Bridge split; MediaMTX; NIP-98 bridge auth;
> archive→VOD reuses the s-tag/info.json model. Decisions open.)
- [ ] Let users **broadcast their own stream** (camera / desktop / arbitrary source)
      to Nostr via bitvid, the way zap.stream does: publish a NIP-53 kind-30311 live
      event (status live → ended), push the media to a streaming endpoint (HLS), and
      keep the event updated. This is the OUTBOUND counterpart to the #16 ingest.
- [ ] **Separate config flag from ingest** — the maintainer wants to enable/disable
      "go live" independently of watching live streams.
- [ ] Develop a PLAN first (this is a large effort): the streaming pipeline
      (getUserMedia/getDisplayMedia → encoder → HLS/WHIP ingest server), where the
      media is hosted (zap.stream uses an external streaming server — bitvid likely
      needs the same or a configurable endpoint), event lifecycle, and chat publish
      (kind 1311). Note: pure-static bitvid can't host the media itself; identify the
      streaming-server dependency early (relates to the CORS/edge constraints).

### 16b. Nostr short-form video notes — watch-only (new sidebar tab)
> **Dev plan: `docs/shorts-plan.md`** (decisions open; ingest already exists).
- [ ] Short-form (vertical/portrait) video is **NIP-71 kind 22** (the short-form
      counterpart to kind 21 normal video) — distinct from live streams. bitvid
      already ingests NIP-71 (see #17), so much of the parsing exists; this is about
      a dedicated **"Shorts" sidebar tab** with a short-form-appropriate UI (vertical
      player, swipe/next feel) that lists kind-22 notes.
- [ ] Gated behind its own config flag (see shared requirement above) — disabled by
      default until shipped.
- [ ] Research: confirm kind-22 tag shape vs kind 21, and whether to reuse the
      NIP-71 ingest adapter / feed pipeline or a dedicated shorts feed.
- OPEN QUESTIONS for the maintainer (raised 2026-06-23): (1) Should "Shorts" pull
      from the SAME whitelisted authors as the main feed, or its own discovery scope?
      (2) Does short-form need its own moderation/NSFW handling, or inherit the
      existing filters? (3) Same for "Live" — scope of who/what is listed?

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
      - [x] Auto-sync (89d9a62b): mirror stays in lockstep on edit/delete,
            event-driven via nostrService videos:edited/deleted (no nostrService
            growth). Edit re-publishes (or unshares if now-private); delete tears
            down + clears the flag.
      - [x] Hashtags (a1bf7b15, e793b359): the upload modal's existing NIP-71
            hashtag editor already emits `t` tags (feed scoring reads them); the
            mirror now carries them too (from t tags / nip71.hashtags). So
            publish + feed + mirror hashtags all work.
      - [ ] Remaining polish (low value): capture dimensions at upload (short 34236
            + imeta dim — defaults to 34235 now); optional account-level
            "auto-share new public videos".
      - NOTE: legacy FEATURE_PUBLISH_NIP71 (videoPublisher.js auto-21/22) stays
        OFF/dormant — superseded by the opt-in 34235/36 mirror; clean up later.
- [ ] Phase 1.5: NIP-89 handler reg (kind 31990 → "Open in bitvid" elsewhere);
      NIP-51 kind 30005 portable playlists.
- [x] Phase 2: inbound ingest of external NIP-71 videos — LIVE on unstable.
      - `js/nostr/nip71IngestAdapter.js` (foreign 21/22/34235/34236 → bitvid video;
        content-warning→isNsfw; skips bitvid mirrors; surfaces nip71.publishedAt),
        `js/services/nip71IngestService.js` (whitelist-scoped subscription,
        hydration retry, deferred-until-feed-ready, throttled refresh),
        wired in applicationBootstrap. Admin toggle `FEATURE_NIP71_INGEST`
        (instance-config) default ON.
      - Whitelist model: ingest is scoped to whitelisted authors and reuses the
        existing render-time filter (whitelist/NSFW/blacklist/private). When the
        admin disables whitelist mode, ingest opens to all authors (capped).
      - KEY FIX: the feed's resolve-posted-at stage was firing a per-video
        hydrateVideoHistory() network fetch for each ingested video (no kind-30078
        history exists) → relay storm + feed hang. Fixed by surfacing
        nip71.publishedAt so the stage short-circuits.
      - Verified live: Goblinbox (Nostube) content renders; liveness check works.

### 17c. NIP-71 on-boarding + cross-ecosystem dedup (IMPORTANT — full plan in docs/nip71-onboarding-plan.md)
Make NIP-71 interop two-way and guarantee a video is never shown twice.
**See `docs/nip71-onboarding-plan.md` for the full dev plan.** Locked decisions:
creator-initiated self-import (model A — can't forge others' notes), dedup on
explicit import-link + content hash/infohash (no fuzzy url/title), import grants
CDN url + WebTorrent (bitvid extras come free), one-shot import + re-run button.
- [x] **Phase 1: cross-ecosystem dedup** (`js/utils/videoDeduper.js`):
      `collapseCrossEcosystem` keyed per-author on `fileSha256/ox/infoHash` + an
      `eid` namespace linking on-board provenance (`importedFrom`); prefers the
      bitvid (kind-30078) version. Composed into `dedupeVideos` (root-dedup THEN
      cross-ecosystem) and routed through the shared chokepoint
      `app.dedupeVideosByRoot` → covers the feed stage + channel + search at once.
      Pure + mutation-verified. (Hash-less dual-posts still can't dedup — documented
      limitation; covered once on-boarded videos carry the provenance link.)
- [ ] **Phase 2: creator-initiated import** — discover the logged-in creator's own
      NIP-71 videos lacking a bitvid version; offer FULL import (re-host to THEIR
      storage + optional WebTorrent) or REFERENCE import (keep external URL, no
      re-host); publish a kind-30078 signed by them with an `["imported-from", <orig>]`
      provenance tag. Same-pubkey-only guard; ALLOW_NSFW gate; reuses ingest adapter
      + storage/upload + videoPublisher.
- [ ] **Phase 2b: externally-managed storage flag** — imports NOT produced by our
      storage system (reference imports / external URLs) must be explicitly flagged
      (`externalStorage: true`, durable — not just the `isUrlUnderBase` heuristic) so
      storage tooling never treats them as bitvid-owned: My Videos shows an external
      badge (never "missing from bucket"), orphan reconciliation excludes them, the
      delete "hosted file left behind" warning is suppressed, liveness stays
      unverifiable. Full (re-hosted) imports set the flag false.

### 17d. Unified video-grid loading (streaming + optimistic) — follow-ups
Goal: every grid loads with the same fast UX. Status: cross-ecosystem dedup
(17c Phase 1) is live at the shared chokepoint; main feed already streams +
has a persisted cache; channel/search now render optimistically from
`allEvents` (incl. ingested NIP-71). Remaining:
- [ ] **Streaming channel/search fetch.** `loadUserVideos` does a one-shot
      `pMapSettled(relays, pool.list)` and renders only after ALL relays settle,
      so a slow relay holds up the grid (~2-3s). Switch to the subscription
      manager's streaming + render incrementally (first-relay-wins), like the main
      feed's buffered subscription. Extract the fetch into `channelProfileVideos.js`
      (channelProfile.js is at its size cap).
- [x] **Per-channel persisted cache** (`channelProfileVideos.js`,
      `bitvid:channel-videos:v1`): cold hard-refresh of a profile now paints the
      last-seen videos from localStorage before relays connect, then the live fetch
      replaces them. Bounded (60 videos/channel, 20 channels LRU), strips raw tags.
      Tests + mutation-verified.
- [ ] **My Videos: include NIP-71** in its `allEvents` read so a creator's own
      cross-posted videos appear in management too (reuse the cross-ecosystem
      dedupe so the bitvid version wins).
- [ ] **Consolidate** the bespoke loaders (channel/search/My Videos) behind one
      shared streaming grid source so future grids inherit streaming + optimistic +
      dedupe for free.

### 17b. Channel Profile wall shows only bitvid videos, not NIP-71 (LAUNCH-BLOCKER)
- [x] **Fixed** (`js/channelProfileVideos.js`): the channel grid now fetches the
      author's NIP-71 videos (kinds 21/22/34235/34236) alongside kind-30078 via
      `buildChannelVideoFilters`, and `convertChannelEvent` routes NIP-71 events
      through `buildVideoFromNip71Event` (skips bitvid mirrors). Existing
      dedupe-by-root + canAccess in `buildRenderableChannelVideos` handle
      precedence/gating. Logic extracted to a helper so channelProfile.js stayed
      under its size cap. Tests + mutation-verified.

### 40. Dead @media queries: `var()` in media conditions is invalid — FIXED 2026-06-25
Found 2026-06-25 while fixing the profile-modal mobile grid. Many media queries use
`@media (max-width: calc(theme("screens.lg") - var(--breakpoint-edge-offset)))`.
CSS custom properties are NOT allowed inside `@media` conditions — Chromium/Brave
drop the ENTIRE block, so all those rules are DEAD (confirmed via matchMedia: the
`var()` form returns false where it should match; the literal `calc(... - 0.02px)`
works). The `--breakpoint-edge-offset` token was introduced to satisfy the
design-token lint (no raw measurements), but it silently broke every media query
that used it.
- [ ] Audit all `var(--breakpoint-edge-offset)` (and any other `var()`) inside
      `@media` conditions in `css/tailwind.source.css` and replace with a valid
      literal-resolving form (e.g. `@media (max-width: theme("screens.lg"))`, which
      compiles to a literal). The profile-modal nav grid (#7) already uses this.
- [ ] Decide whether the token-lint should EXEMPT @media conditions (so the offset
      token can stay) or whether to drop the offset pattern entirely.
- [ ] Re-verify the responsive rules that were silently dead (e.g. the profile-modal
      menu/pane-hide block, and the line ~1398/1433 player/modal rules).

- [x] **FIXED 2026-06-25.** Replaced `var(--breakpoint-edge-offset)` with the literal
      `0.02px` in all 4 `@media` conditions (`css/tailwind.source.css`). `0.02px` was
      ALREADY exempt in the design-token lint, so the offset token was never needed —
      using it just produced invalid, dead media queries. Verified valid via matchMedia.
      This RE-ACTIVATES 3 previously-dead mobile blocks (intended behavior that had
      silently never worked): full-screen modals on mobile, profile-modal menu/pane
      switching, and the video-card tap-active state — plus the profile-nav app-grid.
- [ ] **VERIFY live on a phone**: modals should now be full-screen; tapping a video
      card shows the active lift/accent/marquee; profile modal tabs are the app-grid.

### 49. Relay-ack false-negatives on the generic content-publish path (HIGH-STAKES — deferred)
> No rush — only act if it starts causing problems. Same bug class as the list-publish
> fix (commit 47f2a9a8): when no relay ACKs within the 10s `RELAY_PUBLISH_TIMEOUT_MS`
> window, `assertAnyRelayAccepted` throws even though the event was sent and almost
> always persisted (works after refresh). Already fixed for the replaceable LISTS
> (subscriptions/blocks/relay-list/dm-hints/hashtags) via
> `assertAnyRelayAcceptedOrUnconfirmed`.
- [ ] **Generic content publish still hard-errors on all-timeout.** The
      `signAndPublishEventHelper` (`js/nostr/publishHelpers.js:472`) + `rebroadcast`
      (`:1334`) + `video revert` (`js/nostr/client.js:3064`) still use bare
      `assertAnyRelayAccepted`, so a slow-ack **video publish/edit/delete/revert**
      can show "Failed to share video" (or similar) when it actually published.
      HIGH-STAKES because these are the flagship content flows.
- [ ] **Why it wasn't bundled in:** video publish feeds a relay summary into
      `describePublishOutcome` (the "shared to N relays" / warning UI). Applying
      `assertAnyRelayAcceptedOrUnconfirmed` here must keep that outcome honest (an
      unconfirmed publish should read as "shared, couldn't confirm" — NOT a hard
      failure and NOT a false "shared to N relays"). Needs its own careful pass +
      tests around the video outcome-describer and delete semantics (a false
      "deleted" is worse than a false "publish failed").
- [ ] Deletions (kind 5) especially: decide whether an unconfirmed delete should
      report success optimistically or stay conservative.

### 50. isDevMode — keep it; fix the test-harness gap (LOW priority)
- Decision (2026-07): **KEEP `isDevMode`.** It's used in ~26 files, chiefly to gate
  **runtime schema validation** in `js/nostrEventSchemas.js` (event builders validate
  against their schema only in dev — catches malformed events without the prod cost),
  plus dev-only verbose logging and dev-only feature flags (`FEATURE_SEARCH_FILTERS`).
  Removing it would drop that safety net or force validation into prod. Not a candidate
  for removal.
- [ ] **Test-harness gap (not an isDevMode bug):** `tests/nostr-publish-rejection.test.mjs`
      asserts `isDevMode === true` but never sets `globalThis.__BITVID_DEV_MODE_OVERRIDE__`
      before importing `js/config.js`, so it fails in a non-dev env (`isDevMode` falls back
      to `IS_DEV_MODE` = false). Fix: force dev mode via the override in that test's setup.
      Fails identically on committed HEAD — pre-existing, low priority.
- [ ] (Optional) sweep other tests that assume dev mode without forcing the override, for
      consistency.

## Open — rough edges found in hands-on testing (2026-07-01)
Reported by the maintainer after live testing on `unstable`. Several share a root
cause with **#36** (a persisted **nsec** session restores the pubkey + UI but NOT the
in-memory signer after a page reload, because the private key is only
passphrase-encrypted). Items 51, 56, 57 are all facets of that.

### 51. Shouldn't have to re-"unlock" storage after every refresh (UX / session)
- [ ] **Symptom:** after a page refresh the user must unlock storage again every time.
- [ ] **Root cause:** same as **#36** — the nsec signer + unlocked storage master key
      live only in memory, so a reload drops them. Today the fix (#36) makes the error
      *actionable* (re-enter passphrase), but the user still has to do it every reload.
- [x] **DONE 2026-07-01 — opt-in "keep unlocked" cache.** Decision (maintainer):
      **opt-in** tiers. On a successful nsec unlock the decrypted key is cached in a
      new `js/nostr/unlockedKeyCache.js`:
        - **session tier (default, always):** `sessionStorage` — survives refresh /
          navigation, auto-cleared on tab close. Roughly the same exposure as the
          in-memory signer, so no more PIN on every reload within a session.
        - **persistent tier (opt-in checkbox):** the unlock prompt now shows a "Keep
          me unlocked on this device" checkbox (with an inline unencrypted-at-rest
          warning); when checked the key is ALSO written to `localStorage` and survives
          until the user clears site data.
      `client.restoreUnlockedSigner(pubkey)` re-registers the signer from the cache
      WITHOUT a passphrase (verifies the key derives to that pubkey; a mismatch
      forgets it). It's called proactively from `ensureActiveSignerForPubkey` (the
      auto-login/refresh path) and lazily from `ensureEncryptionCapableSigner` before
      any prompt — so after a reload the signer is restored silently and every
      signing/encryption flow (storage, hashtags, DMs, reactions, blocks, subs) just
      works. Logout / remove-saved-profile forget the cached key
      (`forgetUnlockedSigner`). Tests: `tests/unlocked-key-cache.test.mjs` (8). Lint +
      build green.
- [x] **Storage + NWC inherit the kept-unlocked signer — DONE 2026-07-01.** Storage
      and NWC don't have their own passphrase: the storage master key and the NWC
      settings are ENCRYPTED WITH THE SIGNER (nip44/nip04 self-encryption) and unlocked
      by it. So rather than caching a second secret, both now inherit the kept-unlocked
      nsec signer. `_initAutoLogin` calls `nostrClient.restoreUnlockedSigner(pubkey)`
      BEFORE the boot re-login, so the login flow (NWC hydrate, list decrypt) and the
      existing storage auto-unlock (ProfileStorageController / UploadModal call
      `storageService.unlock` when a signer is present) all succeed silently on refresh
      — no passphrase, no manual "Unlock storage". Tied to the signer cache: persists
      exactly as long as the kept-unlocked key does (session or until site-data clear).
      (NIP-07/46 profiles no-op — nothing is cached; their extension/remote signer
      already persists.)
- [ ] **VERIFY on unstable:** unlock once (box unchecked) → refresh → no PIN, and
      Storage shows Unlocked + the wallet/NWC connection is live without re-entry;
      close the tab + reopen → PIN again. Check the box → close/reopen the browser →
      still no PIN and storage/NWC still ready; Log out or clear site data → PIN again.
- [x] **"Lock this device" control — DONE 2026-07-01.** A footer button in the profile
      modal (desktop + mobile), shown only when the active account has a cached
      "keep unlocked" key to forget (`app.isSessionKeptUnlocked`). Clicking it runs
      `app.lockKeptUnlockedSession(pubkey)`, which re-locks everything the signer
      unlocks in one action: forgets the cached key (both tiers → future reloads
      re-prompt), drops the in-memory signer (`logoutSigner` → the current session
      re-locks now), `storageService.lock(pubkey)`, and `nwcSettingsService.clearCache()`.
      Visibility refreshes on `renderSavedProfiles` + `selectPane`. Tests:
      2 in `tests/profile-modal-controller.test.mjs` (visibility gate + click locks the
      active pubkey). Lint + build green.
- [ ] **Follow-up (optional):** surface whether the current session is *persistently*
      remembered (disk vs session tier) in the UI, and consider a "keep unlocked" toggle
      in the storage/wallet panes for users who set it up there rather than via a prompt.

### 52. After editing a video, the video grids don't refresh to show the update (BUG)
- [ ] Editing a video leaves the grids showing the pre-edit version until a manual
      reload. Publishing a NEW video already refreshes the feed (**#46**); the **edit**
      path needs the same post-publish grid refresh (title/thumbnail/description/url).
      Likely wire the edit-submit success into the same `refreshAllVideoGrids` /
      `onVideosShouldRefresh` path #46 uses, keyed by `videoRootId`.

### 53. Channel-profile link in the video player modal doesn't work (BUG)
- [x] **FIXED 2026-07-02.** Event-name mismatch: `VideoModal.handleCreatorNavigation`
      dispatched `"navigate:profile"`, but ModalManager only listens for
      `"creator:navigate"` → the click went into the void (same class as the old
      `action:embed` bug). Renamed the dispatch to `"creator:navigate"` and threaded the
      modal's own creator pubkey through: the handler now passes `event.detail.pubkey`
      to `app.openCreatorChannel(pubkey)`, and `routerCoordinator.openCreatorChannel`
      accepts an optional pubkey (falls back to the active video's creator). Tests:
      `tests/video-modal-controllers.test.mjs` (+2 — dispatches creator:navigate with
      the pubkey, never the dead event; no-op without a pubkey). Lint + build green.

### 54. Like / dislike buttons in the video player modal don't work (BUG)
- [ ] The reaction (like/dislike) buttons in the player modal are unresponsive / don't
      persist. Audit `reactionController` wiring into the video modal (event binding,
      active-signer availability, publish path). Note: reactions require signing — verify
      this isn't another "lost signer after refresh" (#57) surfacing as a dead button; if
      so, prompt to unlock rather than silently no-op.
- [x] **Lost-signer variant addressed 2026-07-01.** `ReactionController.handleReaction`
      now runs the `ensureEncryptionCapableSigner` gate (`need:"sign"`) before
      publishing, so a reloaded nsec session re-unlocks with one passphrase prompt
      instead of the reaction silently failing (rolled-back button + generic error).
      Tests: `tests/reaction-signer-gate.test.mjs`. **Still VERIFY on unstable** whether
      any residual dead-button behavior remains (event binding / pointer availability),
      which would be a separate wiring bug from the signer issue.
- [x] **The actual dead-button bug — FIXED 2026-07-02.** `VideoModal.handleReactionClick`
      never derived the reaction or reached the publish path: it called
      `this.reactionsController.handleReaction(event)` — a method that does NOT exist on
      the video-modal reactions controller (which only binds buttons + does optimistic
      UI), passing the raw DOM click event as the "reaction". So the #54 signer gate was
      correct but unreachable. Now `handleReactionClick` derives `+`/`-` from the clicked
      button (`#modalLikeBtn`/`#modalDislikeBtn`) and dispatches `video:reaction` — the
      event ModalManager already routes to `app.handleVideoReaction` →
      `reactionController.handleReaction` (which signs/publishes + runs the signer gate).
      Tests: `tests/video-modal-controllers.test.mjs` (+2 — derives the reaction and
      dispatches; unrelated target is a no-op). Lint + build green.

### 55. Video-grid event caching — faster loads, cache-first + merge-new (PERF / UX)
- [x] **VERIFIED 2026-07-02: event caching already exists — no gap.** Traced end to
      end: `allEvents` (incl. ingested NIP-71 videos via `nip71IngestService.injectVideo`)
      is persisted to IndexedDB (`bitvid:eventsCache:v1`, `PersistenceManager` +
      `EventsCacheStore`), restored on boot (`restoreLocalData`), and `loadVideos` +
      the channel grid render **cache-first then merge-new** (never blank+refetch).
      Bullets 1–2 were already built; the remaining slowness is only a genuinely-cold
      first visit, already bounded by the coalescing/timeout/parity fixes.
- [x] **Media caching part 1 — Cache-Control on uploads — DONE 2026-07-02.**
      `computeCacheControl` (js/storage/s3-multipart.js) already stamped most media
      immutable; added the missing `webp`/`avif`/`ico` **and `.torrent`** (safe:
      `buildR2Key` namespaces by infohash → content-addressed). Playlists (m3u8/mpd)
      stay short-lived. Exported + tested (`tests/storage-cache-control.test.mjs`, 3).
- [x] **Media caching part 2 — SW image cache — DONE 2026-07-02.** `sw.min.js` now
      serves **cross-origin images** (thumbnails/avatars/banners — the hosts bitvid
      doesn't control headers for) **stale-while-revalidate** from `bitvid-images-v1`
      (Cache API): instant on revisit, background refresh self-heals changed images,
      LRU-capped at 300 entries, quota errors fail open (drop the cache, never break
      image loading), and every handler error falls back to plain `fetch`. The
      activate handler's wipe-all now **preserves the current image cache** (old
      versions + other caches still wiped). Same-origin assets are untouched (they
      ride the host HTTP cache + dist cache-purge pipeline). `app._initServiceWorker`
      now registers the SW at boot when none exists (same path/scope/options as
      `webtorrent.js`'s `setupServiceWorker`, so playback's later `register()` is a
      no-op on the same registration). SW_VERSION bumped. Tests:
      `tests/sw-image-cache.test.mjs` (6 — runs the REAL sw.min.js in a VM sandbox:
      cold/warm/offline/opaque flows, non-interception, activate preservation).
- [ ] **VERIFY on unstable:** revisit a feed/channel — thumbnails + avatars should
      load instantly from the SW cache (DevTools → Network shows "(ServiceWorker)");
      after an SW update the image cache survives. Optional follow-up: pull-to-refresh
      / manual refresh affordance for forced re-fetch (nice-to-have; background
      merge-new already keeps grids fresh).

### 56. Upload & edit modals: prompt to unlock storage (PIN popup), don't just error (UX)
- [ ] When storage is locked, the **upload** and **edit** modals should open the
      passphrase/PIN unlock popup instead of surfacing a raw error — for **both** the
      video-file upload and the **thumbnail** upload. **#36** already added this
      auto-open-login unlock for the **upload** modal; extend the same treatment to the
      **edit** modal and the **thumbnail** upload path.
- [ ] Combine with **51**: once unlocked, cache the state so the user isn't re-prompted
      on every upload/refresh. "Both would be nice" — actionable prompt AND cached unlock.

### 57. nsec / NIP-46 accounts: encryption ops fail after refresh — re-prompt, don't blanket-error (BUG)
- [ ] **Symptom:** adding/editing a hashtag on an **nsec**-logged-in account errors with
      *"Connect a Nostr signer that supports encryption before managing hashtag
      preferences."* Same class blocks other NIP-44/encryption list ops (subscriptions,
      blocks, DMs) after a reload.
- [ ] **Root cause (likely #36):** the reload dropped the in-memory nsec signer, so
      `nip44Encrypt`/`nip44Decrypt` aren't available even though the user "looks" logged
      in. The guard then emits a blanket "connect a signer that supports encryption."
- [ ] **Fix intent:** ALL signing/encryption functions must work across ALL signer types
      (nsec / NIP-46 / NIP-07). When the op needs a locked nsec key, **prompt to re-enter
      the PIN/passphrase to re-unlock the signer** (reuse #36's unlock flow) instead of a
      dead-end error. Cross-ref **#48** (fluent switching) and the account-switch refresh
      work (commit `87af650b`). Audit every "signer that supports encryption" guard and
      route it to the unlock prompt when a saved nsec key exists for the active pubkey.
- [x] **Shared gate built + hashtags wired — DONE 2026-07-01.** New reusable
      `app.ensureEncryptionCapableSigner({ pubkey, need, promptMessage })`
      (`js/app.js`, pure branching in `js/nostr/ensureSignerDecision.js`): checks the
      active signer's capabilities; if it can't encrypt/sign AND a **matching** locked
      nsec key exists for the account, prompts once for the passphrase and re-unlocks
      the signer app-wide via `unlockStoredSessionActor` (one unlock re-enables every
      flow until the next reload). Never unlocks a different account's key
      (pubkey-mismatch guard). Exposed to the profile modal as
      `services.ensureEncryptionCapableSigner`. **Hashtag add/edit** now routes through
      it (`ProfileHashtagController.persistHashtagPreferences`): a cancelled prompt
      silently aborts, a bad passphrase shows its own toast, and publish never runs
      until the signer is confirmed. Tests: `tests/ensure-signer-decision.test.mjs` (9),
      + 2 wiring tests in `tests/profile-modal-controller.test.mjs`. Lint + build green.
- [x] **Fast-follows wired — DONE 2026-07-01.** All remaining signing/encryption
      call sites now route through `ensureEncryptionCapableSigner`, short-circuiting
      only on the user-driven outcomes (cancel / bad-passphrase) so every other case
      still falls through to the flow's own error handling:
        - **Reactions (#54):** `ReactionController.handleReaction` gates before the
          optimistic update with `need:"sign"` (kind-7 reactions don't need encryption).
          Tests: `tests/reaction-signer-gate.test.mjs` (3).
        - **Blocks:** `authSessionCoordinator.handleProfileBlocklistMutation`
          (`need:"encrypt"`, NIP-04 mute/block lists).
        - **Subscriptions:** the channel-profile Subscribe/Unsubscribe toggle
          (`js/channelProfile.js`, `need:"encrypt"`, kind-30000).
        - **DM send:** both composers — `handleSendProfileMessage` and
          `handleDmAppShellSendMessage` (`need:"encrypt"`, NIP-17/NIP-04).
      Lint + build + related suites (decision, reaction, DM, profile-modal, switch)
      green.
- [ ] **VERIFY on unstable:** with an nsec account, reload, then (a) add a hashtag,
      (b) like/dislike a video, (c) block/unblock a creator, (d) subscribe to a channel,
      (e) send a DM — each should show ONE passphrase prompt (not a blanket error), then
      work; the single unlock should cover the rest until the next reload.
