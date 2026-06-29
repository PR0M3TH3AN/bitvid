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
  - [x] **Mobile sidebar nav → app-grid (2026-06-25).** Below the desktop breakpoint
        (<1024px), the OPEN/expanded sidebar's primary nav renders as a 3-column grid
        of icon tiles with the title centered below each icon (app-grid feel), instead
        of the desktop vertical list. Desktop + the collapsed icon rail are unchanged;
        scoped to `.sidebar-nav` (footer "More" links untouched); token-only, no
        `!important` (sidebar-expanded specificity). `css/tailwind.source.css`.
        Validated live in-browser. (Option A: shows on the open mobile menu; an
        always-on variant was deferred — would need the sidebar widened/overlaid.)
- [ ] Consider removing the CDN/WebTorrent source badge from the card (clutter).
- [ ] Run `npm run test:visual` after layout changes; update baselines deliberately.

### 8. Orphan storage garbage-collection tool
- [x] **Largely delivered by the My Videos tab** (`9d3a0df0`): lists bucket objects no
      live note references and offers per-file delete (under the user's prefix only).
- [ ] Remaining (optional): a one-click **bulk** "delete all orphans" action, and/or
      surfacing the same control from the Storage settings pane.

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
- [ ] Today admin moderation is essentially a "ban hammer" (author/community level).
      Add a **per-event (per-video) block list** so an admin can hide a SINGLE
      offending video without blocking the whole author. Define the per-event block
      record (kind/addressable + the event id / address it targets), wire it into the
      render-time filter alongside the existing author/community blacklist, and expose
      it in the moderation UI (and eventually the #23 admin tab).

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

### 35. Admin whitelisting tool is slow & cumbersome — improve with application forms
- [ ] The current admin whitelist tool is slow and clunky to use. Improve the UX when
      we integrate the **application/submission forms** (#22) and the **Admin
      Submissions tab** (#23) — e.g. approve-an-application → add-to-whitelist in one
      action, batch operations, and faster list mutation. Couples with #22/#23.

### 36. Storage unlock doesn't work with nsec login (BUG)
- [ ] With an **nsec** login, unlocking encrypted storage credentials fails. The
      storage-unlock flow likely assumes a different signer/key path than the nsec
      session provides. Audit the unlock path (`StorageService` master-key decrypt +
      `js/services/authService.js`) for the nsec case so nsec users can use hosted
      storage. (Relates to the credential-encryption work in #15.)

### 37. Channel playlists — creator-curated custom note lists
- [ ] Let creators build **playlists** (custom curated lists of their videos / notes)
      surfaced on their channel. Likely a NIP-51 set (kind 30005 "curation sets" or a
      bitvid-specific addressable list) referencing video events, with create/edit/
      reorder UI on the channel page and a playlist view. Research the list shape +
      where it slots into channel profile + the feed engine.

### 38. Generic S3 doesn't work with Backblaze B2 — add B2 as a first-class provider
- [ ] Backblaze **B2** fails under the generic-S3 path: B2's model doesn't map cleanly
      onto the assumed endpoint / public-access-URL fields (one of them is derived
      differently), so credentials fail to fetch/validate. Investigate B2's S3-compatible
      endpoint + friendly-URL/`f000`-style download host, and likely add **B2 as its own
      provider** (`PROVIDERS`) with B2-specific endpoint + public-URL derivation rather
      than forcing it through generic S3. See `js/services/storageService.js` /
      `s3Service.js` (provider abstraction from #6).

### 39. Image uploads should prefer uploading to configured storage (UX)
- [ ] Anywhere the user adds an image, prefer letting them **upload an image file to
      their configured storage** (Cloudflare R2 / S3 / B2 / Blossom) and auto-grab the
      resulting URL — rather than pasting a link. First target: the **profile image +
      banner** in Edit Profile (upload → store → auto-fill the URL). Reuse the existing
      upload pipeline (`s3UploadService` / thumbnail upload) and apply the same pattern
      to other image inputs (thumbnails already do some of this).

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
