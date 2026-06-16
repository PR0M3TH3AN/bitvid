# Known Bugs (deferred)

Running list of confirmed bugs/limitations found during the data-flow refactor
(see [architecture-refactor.md](./architecture-refactor.md)) that we chose to
fix later rather than block the current phase. Distinct from the *planned*
refactor work in that doc — these are defects.

> Format: **[severity]** short title — where — what — suggested fix / phase.

---

## Tracked

> Status is per-entry (RESOLVED / FIXED / Open). Items #3 and #4 below remain
> open; #0, #1, and #2 are resolved and kept here for provenance.

### 0. Encrypted lists (hashtags, DMs, blocks) fail to DECRYPT on login — RESOLVED (2026-06-16)
- **Severity:** high — the user's recurring "hashtags/DMs/watch-history don't
  load in the profile modal."
- **Diagnosed from real-env console (2026-06-14):** the lists are *fetched* (e.g.
  block events `Array(2)`) but **decryption fails**, three different ways:
  - DMs: `DM decryption helpers are unavailable` (`client.js` listDirectMessages
    → `buildDmDecryptContext` returns 0 decryptors → hard throw, no retry). Happens
    when `ensureExtensionPermissions` returns `ok:false`.
  - Blocks: `Decryption timed out; signerStatus: 'missing'/'unknown'`
    (`userBlocks.js` applyEvents) — the signer/decrypt capability isn't resolved.
  - Hashtags: `Decryption timed out after 6s` (`hashtagPreferencesService.js`).
- **Root cause (strong):** a relay-connection STORM. On cold load the app opens
  WebSockets to the user's full ~20-relay NIP-65 list (most **dead**) because
  subsystems build relay lists from `relayManager.getReadRelayUrls()` +
  `getWriteRelayUrls()` (uncapped) — e.g. `userBlocks.loadBlocksInternal`. The
  dozens of failing connections churn the main thread and starve the nip-07
  extension's postMessage round-trips → permission/decrypt calls fail or time out.
- **Partial mitigation shipped:** hashtag + subscription decrypt timeout 6s→15s.
- **Relay-storm fix SHIPPED (2026-06-14):** `capReadRelays` (in `js/nostr/toolkit.js`)
  bounds every read/subscribe path to `MAX_SUBSCRIBE_RELAYS = 8`, applied centrally
  at the chokepoints — `client.js` `applyRelayPreferences` (this.relays/readRelays)
  and `relayBatchFetcher.js` `fetchListIncrementally` (used by blocks, subs,
  hashtags). Writes stay uncapped. The helper is **user-relays-first** (a user's
  own relays are where their data authoritatively lives, and small fast-path
  limits would otherwise crowd them out — the bug that broke the first attempt)
  while RESERVING `RESERVED_DEFAULT_RELAY_SLOTS = 2` for the reliable default
  aggregators so the "~20 personal relays, all dead" case still reaches a live
  relay. Test-aware: under test the reserved core is the test-relay override, so
  harnesses stay isolated. Regression coverage: `tests/relay-subscribe-cap.test.mjs`
  (bounded + reserved-defaults + writes-uncapped), and the spec-corrected
  `user-blocks`, `subscriptions-manager`, and `nostr/client` fetch tests.
- **Real-env follow-up (2026-06-15 console):** the relay cap WORKED (every sub
  now fans out to exactly 8 relays) but exposed the true blocker: under the
  post-login burst the nip-07 extension's message port drops ("message channel
  closed"), after which EVERY decrypt hangs to its ~15s timeout, each list
  service retries forever, and the app never recovers without a page refresh
  (CPU pinned — "fans at max"). The signer-readiness gate also took ~67s.
  Two-part fix in progress ("cut the burst, then add a safety net"):
  - **Burst reduction (SHIPPED, increment 1):** stop eagerly loading DM history
    at login (`authSessionCoordinator` `dmStatePromise` now defers; DMs load
    lazily when the Messages tab opens). Removes a 50-message decrypt burst that
    competed for the channel. Test: `tests/app/login-defers-dms.test.mjs`.
  - **Channel circuit breaker (SHIPPED, increment 2):** `js/nostr/nip07Permissions.js`
    now opens a circuit after `CIRCUIT_TIMEOUT_THRESHOLD` consecutive call
    timeouts — subsequent calls fail FAST (`code: "nip07-channel-unresponsive"`)
    instead of each hanging ~15s, so the per-list retry loops stop pinning the
    CPU. A single periodic probe detects recovery; one success closes the
    circuit (no refresh). Responsive errors don't open it; interactive permission
    prompts bypass it. Test: `tests/nostr/nip07-channel-breaker.test.mjs`.
- **Resilience shipped (increments 3-6):** user-relays-first relay cap with
  reserved defaults; transient-decrypt → retry (channel-death/timeout no longer
  swallowed as "empty"); fetch/decrypt decouple + ProfileModalController
  ensureLoaded (cut the login REQ burst); subscription refresh-loop guard;
  generous decrypt budget (30s) + 60s backoff cap so a slow-but-responsive
  signer completes; permission-handshake variant timeout 3s→20s so slow signers
  aren't killed mid-grant.
- **DEFINITIVE root cause for "lists never load" (2026-06-16):** confirmed with a
  raw `window.nostr` probe in the user's browser — a single clean
  `getPublicKey → nip04.encrypt → nip04.decrypt` that bypasses ALL of bitvid
  **hung forever**, and the extension's own console showed
  `ObjectMultiplex - orphaned data for stream "background-liveness"` +
  `malformed chunk` + `MaxListenersExceededWarning`. i.e. the NIP-07 extension's
  content-script ↔ background-service-worker channel was dead/orphaned (classic
  MV3 worker death). This is an EXTENSION/environment failure, not a bitvid bug —
  no client change can force an unresponsive signer to answer. Fix is user-side:
  reload/unlock the extension + refresh.
- **Client mitigation (SHIPPED):** `js/utils/signerHealthNotice.js` — after a few
  consecutive list-decrypt timeouts with `signerStatus: "present"`, emit ONE
  rate-limited, actionable user notice ("signer isn't responding to decryption —
  unlock/reload your extension and refresh") instead of a silent forever-retry.
  Wired into blocks/hashtags/subscriptions; reset on any decrypt success.
  Test: `tests/signer-health-notice.test.mjs`.
- **Harness (`scripts/perf/nip07-channel-sim.mjs`):** with a LATENCY override it
  proves the client now loads all lists for signers answering up to the decrypt
  budget; lists only fail once per-call latency exceeds the budget (i.e. the
  signer is the wall, not the client).
- **DM decrypt resilience (SHIPPED):** `buildDmDecryptContext` now gates on
  method existence (`typeof activeSigner.nip44Decrypt === "function"`) rather than
  a possibly-stale `extensionPermissionResult`/capability snapshot, so DMs no
  longer hard-fail with "DM decryption helpers are unavailable" on a transient
  permission miss. Also fixed the Controller→Actions wrong-receiver bugs that made
  opening a conversation throw "… is not a function"
  (`ProfileDirectMessageController`/`ProfileDirectMessageActions`). Tests:
  `tests/dm-decrypt-context.test.mjs`, `tests/dm-conversation-select.test.mjs`.
- **Post-login UI freeze (SHIPPED, 2026-06-16):** once a responsive signer (nos2x)
  made decryption instant, `profileModalController.handleAuthLogin` rendered EVERY
  profile panel at login (friends list + per-contact avatars, subscriptions,
  blocks, relays, wallet, hashtags, storage) into a CLOSED modal — one main-thread
  burst that froze the tab for ~10-15s and stopped the profile panel from opening.
  Fixed by deferring panel rendering to `selectPane()` (lazy per-pane on open;
  added the missing `friends` case) and gating the block/subscription/contacts
  "change" re-renders on `isProfileModalOpen()`. DM-identity setup stays eager.
- **CONFIRMED RESOLVED in real env (2026-06-16):** after the user switched from
  KeysBand (dead MV3 worker) to **nos2x**, real-browser logs show DMs (NIP-04 +
  NIP-44), watch history (kind 30078), and contact/subscription lists all
  decrypting in milliseconds with no timeouts, no `signerStatus: missing`, no
  channel-death, and no forever-retry. The whole resilience stack
  (relay cap → DM defer → circuit breaker → transient-retry → decrypt budget →
  signer-health notice → DM receiver fixes → post-login freeze fix) is validated
  against the user's real vault. Moving #0 to resolved.
- **Still open (follow-ups, lower priority):** liveness-ranked relay health
  (see #4); optional nip-07 queue concurrency bump for slow signers (risks
  channel drops on some providers — opt-in); optional DM decrypt efficiency —
  bitvid currently tries BOTH `nip44.decrypt` and `nip04.decrypt` per message
  (half log expected `invalid base64`/`invalid payload length` errors), which
  could be halved by routing on the `?iv=` (NIP-04) ciphertext marker. Benign;
  only worth doing if large-mailbox DM load feels slow.

### 1. Logged-out: video grid stays empty until a manual refresh — FIXED (2026-06-16)
- **Severity:** medium (first-load UX, logged-out).
- **Symptom:** logged out, after dismissing the disclaimer the grid doesn't
  populate until the page is refreshed.
- **Root cause (CONFIRMED via repro):** boot order in `bootstrapInterface`
  (`js/index.js`) opens the disclaimer (which makes the background inert via
  `staticModalAccessibility`), THEN `await handleHashChange()` loads the feed
  view and renders into that inert/hidden background — so the mount/render is
  dropped — and dismissing the disclaimer never re-triggered a render.
- **Fix (SHIPPED):** `disclaimer.js` `hide()` dispatches a
  `bitvid:disclaimer-dismissed` event; `index.js` listens once and calls
  `application.loadVideos(true)` so the feed re-renders into the now-interactive
  background. Fires only when a shown disclaimer is dismissed (returning
  visitors are unaffected).
- **Repro/regression (`scripts/perf/disclaimer-grid.mjs`):** fresh context, real
  relays; waits for `#acceptDisclaimer`, dismisses, then polls the grid for 15s.
  Before: post-dismiss card timeline `0,0,0,…`, only a reload showed 132. After:
  `132,132,…` immediately on dismiss. (The earlier "couldn't reproduce
  headlessly" was because the harness didn't actually wait for/raise the
  disclaimer; once it does, the bug is deterministic.)

### 2. Residual full-feed reload loop on list-loaded signals — FIXED (P5)
- **Status:** RESOLVED 2026-06-14. `handleBlocksLoaded` now reloads the feed
  only when the block-set signature actually changes (emit-on-change guard);
  `handleRelaysLoaded` only refreshes the relay UI (never the feed), and
  `handleHashtagPreferencesChange` already deduped by signature. Regression test:
  `tests/app/blocks-loaded-reload-guard.test.mjs` (cheat-resistant).

### 3. Direct-pool-access lint still misses MULTI-LINE access
- **Severity:** low (tooling gap — weakens the L1 chokepoint guarantee).
- **Status:** partially fixed — the regex now catches bare `pool.sub(` /
  `pool.list(` (re-baselined to 22 files). Still MISSES access split across
  lines, e.g. `js/services/profileMetadataService.js` writes `nostr.pool`
  newline `.list(` — so profiles is an unflagged fetch source.
- **Fix:** normalize whitespace before matching (collapse `\.pool\s*\n\s*\.list`)
  or move to an AST/`grep -A1` check. Add profileMetadataService (and any other
  multi-line offenders) to the allowlist once detected.

### 4. Interim relay cap is static, not liveness-ranked
- **Severity:** low (acceptable interim).
- **Where:** `js/nostr/toolkit.js` `capReadRelays` — bounds the read/subscribe
  set to 8 (user relays first, 2 slots reserved for reliable defaults) but does
  NOT re-rank by live health. If a user's first 6 relays are dead, reads lean on
  the 2 reserved defaults until other paths recover; the dead ones still get a
  (bounded) connection attempt each cold load.
- **Fix:** P1's deferred `RelayHealth` — rank the bounded set by rolling liveness
  and re-resolve on health changes, so dead relays drop out of the read set
  entirely instead of consuming slots.

---

## Pre-existing test failures (predate this refactor)

Confirmed failing at the pre-session baseline (`4bd9503c`) — not caused by the
refactor, but should be triaged. Not in `KNOWN_ISSUES.md`.

### 5. `tests/nostr-delete-flow.test.mjs`
- "deleted events should not trigger subscription callbacks" — a deleted event
  reaches the feed callback (buffer delete-filter or dedupe). Investigate the
  `VideoEventBuffer` delete handling.

### 6. `tests/view-counter.test.mjs`
- "view event should append the session tag when requested" — view-event
  **publishing** tag composition (unrelated to the P3 counting refactor).

### 7. `tests/nostr-count-fallback.test.mjs`
- Fails at baseline; NIP-45 COUNT fallback path. Triage.

### 8. `tests/nostr/nip07Permissions.test.js`
- `writeStoredNip07Permissions` / `clearStoredNip07Permissions` fail under Node
  (no real `localStorage`). Likely environmental — provide a localStorage shim
  (see `tests/test-helpers/setup-localstorage.mjs`) or guard the test.

### 9. `tests/app/hydrate-sidebar-navigation.test.mjs`
- Fails at the pre-session baseline (`4bd9503c`). Triage.

### 10. `tests/app/is-user-logged-in.test.mjs`
- Fails at the pre-session baseline (`4bd9503c`). Triage.

---

## Perf follow-ups (not bugs, but tracked)

- **One-time login enrichment burst** (~75 REQ frames): batched and O(relays),
  settles to idle, but could be trimmed by hydrating only on-screen cards.
- **Remove `js/devReqMonitor.js` import + `scripts/perf/*` diagnostics** in P6
  cleanup once the refactor lands.
