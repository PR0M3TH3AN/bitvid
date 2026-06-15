# Known Bugs (deferred)

Running list of confirmed bugs/limitations found during the data-flow refactor
(see [architecture-refactor.md](./architecture-refactor.md)) that we chose to
fix later rather than block the current phase. Distinct from the *planned*
refactor work in that doc — these are defects.

> Format: **[severity]** short title — where — what — suggested fix / phase.

---

## Open

### 0. Encrypted lists (hashtags, DMs, blocks) fail to DECRYPT on login  *(top priority)*
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
- **Proper fix (next):** RelayHealth — bound the SUBSCRIBE/read set to a small,
  liveness-ranked healthy core that ALWAYS includes the reliable default
  aggregators, applied centrally so every subsystem (blocks, hashtags, subs,
  profiles, batch fetcher) reads from it; writes stay uncapped. Plus decrypt
  resilience: don't hard-fail DMs on a transient permission miss (retry).
  NOTE: a first attempt (`capReadRelays`) was reverted — capping the block-list
  read path broke the security-critical `user-blocks` integration test (it
  orchestrates per-relay block hydration), so this needs a test-aware rework.
  Repro: `scripts/perf/disclaimer-repro.mjs` shape; real-env console is the
  source of truth.

### 1. Logged-out: video grid stays empty until a manual refresh
- **Severity:** medium (first-load UX, logged-out).
- **Where:** initial feed render path (`js/index.js` disclaimer flow →
  `viewManager` → `feedCoordinator`); rendering is a side-effect of event
  ordering.
- **Symptom:** logged out, after dismissing the disclaimer the grid doesn't
  populate until the page is refreshed.
- **Root cause (suspected):** the grid paints as a side-effect of a data event
  that can fire before the grid container is mounted (render coupled to event
  ordering, not to state).
- **Fix:** P5 — unidirectional flow: render from AppState whenever it changes,
  decoupled from event ordering. Could not reproduce headlessly (real-relay
  feed returned nothing in the sandbox); reproduce in a real browser first.

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
- **Where:** `js/nostr/client.js` `capSubscribeRelays` — keeps the first 6
  relays (known-good defaults prioritized) but does NOT re-rank by live health.
  If a user's first relays are dead, reads degrade until other paths recover.
- **Fix:** P1's deferred `RelayHealth` — rank the subscribe set by rolling
  liveness and re-resolve on health changes.

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
