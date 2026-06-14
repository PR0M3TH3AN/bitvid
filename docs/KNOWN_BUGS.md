# Known Bugs (deferred)

Running list of confirmed bugs/limitations found during the data-flow refactor
(see [architecture-refactor.md](./architecture-refactor.md)) that we chose to
fix later rather than block the current phase. Distinct from the *planned*
refactor work in that doc — these are defects.

> Format: **[severity]** short title — where — what — suggested fix / phase.

---

## Open

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

### 2. Residual full-feed reload loop on list-loaded signals
- **Severity:** low–medium (bounded by the 2s throttle, but wasteful — re-fetches
  lists ~every 2s while signals keep arriving).
- **Where:** `js/app/authSessionCoordinator.js` `handleBlocksLoaded` (and peers)
  call `onVideosShouldRefresh` **unconditionally**; the forced reload re-fetches
  the lists, which re-emit "loaded".
- **Fix:** P5 — only trigger a reload when the underlying list data actually
  changed (emit-on-change at the list-loaded sources + collapse the refresh
  triggers into the Coordinator).

### 3. Direct-pool-access lint misses bare `pool.sub(` / `pool.list(`
- **Severity:** low (tooling gap — weakens the L1 chokepoint guarantee).
- **Where:** `scripts/check-direct-pool-access.mjs` — regex only matches member
  access `.pool.sub(`. Bare local-variable calls slip through, e.g.
  `js/nostr/viewEvents.js` and `js/nostr/relayBatchFetcher.js` use `pool.sub(` /
  `pool.list(` and are NOT currently flagged or allowlisted.
- **Fix:** broaden the regex to also catch `\bpool\.(sub|list)\(`, then
  re-baseline the allowlist (add the now-detected files). Do this alongside P4
  so the allowlist still only shrinks.

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

---

## Perf follow-ups (not bugs, but tracked)

- **One-time login enrichment burst** (~75 REQ frames): batched and O(relays),
  settles to idle, but could be trimmed by hydrating only on-screen cards.
- **Remove `js/devReqMonitor.js` import + `scripts/perf/*` diagnostics** in P6
  cleanup once the refactor lands.
