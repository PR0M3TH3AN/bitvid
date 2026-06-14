# bitvid Data-Flow Refactor — Dev Plan & Spec

> **Status:** Active plan. Target branch: `unstable`. Incremental — every phase
> is independently shippable, testable, and revertable. No feature removed.
>
> **Goal:** Take the existing, individually-working subsystems (videos,
> moderation, view counts, watch history, follows, hashtags, blocks, DMs,
> profiles) and put them on a shared, governed data-flow foundation so they stop
> fighting each other for the relay pool and the nip-07 signer.

---

## 1. Why "each part works, but together it's a mess"

Captured from a **real** logged-in session (the `[req-monitor]` + `ConnectionManager`
console output), not the mock harness:

- `RELAY STORM 1035 REQ/s → kind 1984=2024` (reports), `kind 30079=1760` (views).
- ~20 relays, most failing: endless `WebSocket connection failed` /
  `Circuit breaker opened`, each reconnect re-issuing **every** subscription
  (`refreshTrustedMuteSubscriptions`, `moderationService.js` report subs,
  `viewEvents.js` count subs, `watchHistory.js` fetch).
- `Decryption timed out after 6s` for hashtag prefs and the block list — the
  nip-07 signer is drowning, so encrypted lists never resolve.

### Two structural root causes

1. **Uncoordinated relay access.** Every subsystem calls `pool.sub` / `legacyList`
   directly, per-item, on the *full* relay list. "Show 30 videos" becomes
   `~30 ids × 2 data types × ~20 relays ≈ 1,200 subscriptions`, and every flaky
   reconnect re-fires all of them. There is no batching, no dedup, no concurrency
   budget, and no relay-health gating.

2. **Non-idempotent events + bidirectional flow.** Emitters fire "changed"
   unconditionally; listeners react by re-fetching/re-rendering, which emits
   again → feedback loops (already fixed cases: watch-history `fingerprint`,
   moderation `contacts`; structural cases remain). Rendering is a *side-effect*
   of these cascades and of load ordering (hence "logged-out grid is empty until
   refresh").

Each subsystem is locally fine. There is no governor and no idempotency, so in
aggregate they resonate.

---

## 2. Target architecture (4 layers, 5 invariants)

```
        ┌─────────────────────────────────────────────┐
  L4    │ View (renders from AppState; never fetches)  │
        └───────────────▲─────────────────────────────┘
                        │ state change (diffed)
        ┌───────────────┴─────────────────────────────┐
  L3    │ AppState (normalized source of truth) +      │
        │ Coordinator (debounced orchestration)        │
        └───────────────▲─────────────────────────────┘
                        │ patches (on real change only)
        ┌───────────────┴─────────────────────────────┐
  L2    │ Domain Stores: videos, profiles, moderation, │
        │ views, watchHistory, follows, hashtags,      │
        │ blocks, dms — normalized cache + decrypt-once │
        └───────────────▲─────────────────────────────┘
                        │ subscribe()/list() (batched filters)
        ┌───────────────┴─────────────────────────────┐
  L1    │ SubscriptionManager  +  RelayHealth          │
        │ (the ONLY caller of pool.sub / pool.list)    │
        └───────────────▲─────────────────────────────┘
                        │
                   relay pool (vendored nostr pool)
```

### The 5 invariants (the rules that keep it from re-rotting)

1. **Single transport chokepoint.** Nothing outside L1 calls `pool.sub` /
   `pool.list` / `legacySub` / `legacyList`. (Enforceable by lint.)
2. **Batch by filter, never per-item.** N ids → one `{kinds, "#e":[...]}`.
3. **Health-ranked, bounded relay set.** Subscribe on a small healthy core;
   never target circuit-broken relays; cap concurrent REQs per relay.
4. **Emit-on-change only.** Every store/emitter diffs before emitting.
   (Enforceable by a shared `emitIfChanged` helper + review.)
5. **Unidirectional flow.** relay → store → AppState → view. The view never
   triggers a fetch; stores never read the DOM.

---

## 3. Component specs

### 3.1 RelayHealth (L1)
Owns relay status; the SubscriptionManager asks it which relays to use.

- `getCoreRelays(n = 5)` → top-N currently-healthy relays (read set).
- `isUsable(url)` → not circuit-broken / not in backoff.
- `report(url, ok|fail, reason)` → updates rolling health + circuit breaker.
- Absorbs the existing `ConnectionManager` backoff/circuit-breaker logic
  (already present at `js/nostr/managers/ConnectionManager.js`); the new part is
  exposing a **ranked usable set** so we stop fanning to all ~20 relays.

### 3.2 SubscriptionManager (L1) — the foundation
The only module that talks to the pool. Absorbs and generalizes the existing
`relaySubscriptionService.js` + `relayBatchFetcher.js`.

```js
// Live subscription (deduped + batched). Returns a handle.
const handle = subscriptionManager.subscribe({
  key,        // logical identity for dedup, e.g. "moderation:reports"
  filters,    // nostr filters; same-key calls are merged into one REQ
  relays,     // optional; defaults to RelayHealth.getCoreRelays()
  onEvent,    // (event, relayUrl) => void
  onEose,     // optional
  priority,   // budget/ordering hint
});
handle.update({ filters });  // diff vs current; re-REQ only if changed
handle.close();

// One-shot fetch (EOSE → resolve), batched + deduped + budgeted.
const events = await subscriptionManager.list({ key, filters, relays, timeoutMs });
```

Responsibilities:
- **Dedup** by `key` (+ normalized filter signature): identical in-flight work
  shares one subscription/list.
- **Batch**: coalesce same-kind filters enqueued within a short window into one
  REQ with merged `authors` / `#e` / `#p` / `#d` arrays (chunk if a relay caps
  array size).
- **Budget**: per-relay max concurrent REQs (default ~8, below the ~20 limit) +
  a global rate limiter; overflow queues (priority-ordered).
- **Relay gating**: only target `RelayHealth.getUsable()`.
- **Reconnect-safe**: maintain a registry of *active logical subscriptions*; on a
  relay (re)connect, re-issue only those, batched — never the historical pile.

### 3.3 Store contract (L2)
Each domain store is a thin object with a uniform shape:

```js
{
  // read-through cache; returns immediately, refreshes via SubscriptionManager
  get(id) / getAll(),
  ensure(idsOrActor, opts),     // request data (batched) through L1
  subscribe(listener),          // listener invoked ONLY on real change (diffed)
  clear(),                      // on logout
}
```

Rules: normalized cache keyed by id; **decrypt-once** (persisted plaintext cache,
already exists at `js/nostr/persistedPlaintextCache.js`); `emitIfChanged` for all
notifications; no DOM access; no direct pool access.

### 3.4 AppState + Coordinator (L3)
- **AppState**: normalized maps (videos, profiles, summaries, viewCounts,
  follows, blocks, hashtagPrefs, watchHistory). Stores patch it; patches are
  diffed.
- **Coordinator**: the single place that turns "inputs changed" into "recompute
  the derived feed" — debounced/coalesced. Replaces the scattered
  `onVideosShouldRefresh` callers and the per-emitter refresh wiring. The feed
  engine reads AppState and produces the derived feed; it never fetches.

### 3.5 View (L4)
Renders from AppState; subscribes to AppState slices; mounting is independent of
data arrival (grid paints whatever is present whenever state changes). Fixes the
logged-out "empty grid until refresh".

---

## 4. Phased migration plan

Each phase: **shippable**, **behind the existing behavior or a flag**, with
acceptance criteria + verification. Worst offenders (from the real logs) first.

### P0 — Stabilize & instrument ✅ (done this session)
- Circuit-broke per-video report (1984) + view (30079) subs; contact emit-loop
  fixed; reload throttle; nip-07 fair scheduling.
- Diagnostics landed: `scripts/perf/*` + `js/devReqMonitor.js`.
- **Acceptance:** real-env `[req-monitor]` no longer shows the 1000 REQ/s storm
  for reports/views. (User to confirm fan calms on build `9745232c`.)

### P1 — SubscriptionManager + RelayHealth (the foundation)
- Build L1 as described; **route nothing through it yet** except a pilot.
- Add a lint rule (`scripts/check-direct-pool-access.mjs`) that flags new direct
  `pool.sub`/`legacyList` calls outside L1 (allowlist the not-yet-migrated ones).
- Pilot: migrate the **public video feed** (`client.js subscribeVideos`,
  `nostrService.loadVideos`) through L1.
- **Acceptance:** logged-out feed loads with ≤ (core-relay-count) REQs for video
  kind; reconnect does not multiply REQs. New unit tests for batching/dedup/
  budget/reconnect using a **multi-relay flaky mock** (see §5).
- **Rollback:** L1 is additive; revert the pilot wiring only.

### P2 — Moderation reports (kind 1984), batched → re-enable
- Replace per-video `subscribeToReports` with one L1 live subscription over the
  active video-id set (`{kinds:[1984], "#e":[...all visible ids]}`); `handle.update`
  as the visible set changes. Same for trusted-mute subs (`refreshTrustedMuteSubscriptions`).
- Flip `MODERATION_REPORT_SUBS_ENABLED` back on.
- **Acceptance:** report aggregation works; `[req-monitor]` stays < threshold
  with 30+ videos across multiple flaky relays; no churn on reconnect.

### P3 — View counts (kind 30079), batched → re-enable
- Replace per-card `ensureViewCountSubscription` with one batched count/list per
  visible set through L1. Re-enable.
- **Acceptance:** counts render; steady-state REQ ≈ 0 after load.

### P4 — Lists through stores (follows, hashtags, blocks, watch history, profiles)
- Wrap each in the Store contract; route their fetches/subs through L1 (batched,
  health-gated). Decrypt-once via persisted plaintext cache.
- **Acceptance:** no list re-fetch storm on reconnect; decrypt timeouts gone for
  a healthy core relay set; lists populate on login without manual refresh.

### P5 — AppState + Coordinator; unidirectional flow
- Introduce normalized AppState; stores patch it; collapse refresh triggers into
  the Coordinator; feed engine reads AppState only.
- Sweep remaining emitters for emit-on-change.
- **Acceptance:** no feedback loops under `[req-monitor]`; logged-out grid paints
  without refresh (disclaimer bug fixed); CPU idle at steady state.

### P6 — Cleanup
- Remove `devReqMonitor.js` import (keep file for future use), retire dead
  per-item subscription code, document the final architecture, fold the relay set
  to a health-ranked core in config.

---

## 5. Verification strategy (close the harness fidelity gap)

The mock harness lied because it used **one perfect relay**. New fixtures:

- **Flaky multi-relay mock**: spin up N mock relays (extend
  `scripts/agent/simple-relay.mjs`), some that refuse connections / drop / delay,
  to reproduce the real reconnect-resubscribe amplifier.
- **REQ-rate assertions**: every migrated phase has a headless test asserting
  steady-state REQ/s ≈ 0 and load-burst REQ count is **O(relays), not
  O(items×relays)** — reuse `scripts/perf/nip07-heat.mjs` patterns.
- **Real-env smoke**: `js/devReqMonitor.js` stays until P6; user confirms no
  `RELAY STORM` line after each phase that touches subscriptions.
- Keep all changes cheat-resistant per the repo's Dark-Factory rules
  (scenario tests, fail-without-fix proven).

---

## 6. Invariants as guardrails (so it can't re-rot)
- Lint: no direct pool access outside L1 (allowlist shrinks each phase).
- Shared `emitIfChanged(prev, next, emit)` helper; code review rejects unguarded
  emits.
- Store contract review checklist: normalized cache? decrypt-once? no DOM? no
  direct pool?

---

## 7. Risks & rollback
- **Risk:** batching changes event-delivery timing for moderation/views.
  *Mitigation:* keep ingestion logic identical; only the transport changes.
- **Risk:** L1 budget too aggressive → slow loads. *Mitigation:* tune per-relay
  cap; it's a constant.
- **Rollback:** each phase is isolated; L1 is additive; feature flags
  (`MODERATION_REPORT_SUBS_ENABLED`, etc.) gate re-enables.

---

## 8. Tracking checklist
- [x] P0 stabilize + instrument
- [x] P1 SubscriptionManager + lint guard + video-feed pilot
      (interim RelayHealth = read-relay cap in `client.js`; full liveness
      ranking deferred — the cap covers the immediate amplifier)
- [x] P2 moderation reports batched + re-enabled (single SubscriptionManager
      sub over the active id set; trusted-mute subs already batched-by-author)
- [x] P3 view counts batched + re-enabled — viewCounter shares ONE kind-30079
      sub + backfill bucketed by `#a`; watch page opts into exact NIP-45 COUNT
- [x] P4 lists via L1 — watch-history fetch, follows (kind 30000), hashtag-prefs
      (30015/30005), block list (10000/30002), and profile fetch (kind 0) all
      routed through the SubscriptionManager (dedup + reconnect re-issue;
      health-gated relays). Lint chokepoint hardened + re-baselined (22 files).
      Each keeps a manager-less fallback for tests. (Follow-ups: live profile
      subscription + comment/reaction events — lower volume; multi-line lint gap
      KNOWN_BUGS #3.)
- [~] P5 AppState + Coordinator + unidirectional flow — IN PROGRESS: emit-on-
      change sweep done (handleBlocksLoaded reloads only on block-set change →
      KNOWN_BUGS #2 FIXED). Remaining: normalized AppState + render decoupled
      from event ordering (fixes disclaimer-empty-grid #1; needs real-browser
      repro) — a large app.js rewrite to stage carefully.
- [ ] P6 cleanup + config relay-set trim + final docs
