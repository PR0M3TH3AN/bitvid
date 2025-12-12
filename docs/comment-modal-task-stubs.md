# Comment & Modal Reliability — Codex Task Stubs

This document lists fully self-contained Codex task stubs to address the correctness, robustness, and consistency issues observed in the comment/modal stack. Each stub includes context, goals, and concrete steps with file-level pointers.

## A. Correctness fixes

### A1. Normalize event IDs and cache keys to lowercase
- **Goal:** Ensure all event IDs and comment cache keys use a canonical `trim().toLowerCase()` form to prevent cache misses and duplicate entries when casing varies.
- **Scope & references:**
  - `js/nostr/commentThreadService.js` (`getCommentCacheKey`, `applyEvent`, internal maps such as `metaById`, `eventsById`).
  - `js/ui/videoModalCommentController.js` (any place comparing or storing `videoEventId`).
  - Normalization helpers in `js/utils/nostrUtils.js` or similar.
- **Steps:**
  1. Introduce or reuse a helper (e.g., `normalizeHexId(value)`) that trims and lowercases hex IDs; export it alongside existing normalization utilities.
  2. Update `getCommentCacheKey` to return lowercase keys and ensure callers normalize before map interactions.
  3. Normalize `event.id` and `videoEventId` to lowercase wherever they are stored/compared (`applyEvent`, `metaById`, `eventsById`, controller state comparisons).
  4. Add unit tests covering mixed-case inputs for cache keys and event IDs (see `tests/comment-thread-service.test.mjs` and `tests/video-modal-comments.test.mjs`).

### A2. Normalize profile map keys for modal enrichment
- **Goal:** Ensure `modalCommentProfiles` keys are normalized pubkeys so profile lookup during comment enrichment succeeds regardless of input casing.
- **Scope & references:**
  - `js/ui/videoModalCommentController.js` (`modalCommentProfiles`, `enrichCommentEvent`, `createMapFromInput`).
  - Pubkey normalization helpers (e.g., `normalizeHexPubkey`).
- **Steps:**
  1. Add a dedicated helper to build profile maps that lowercases/normalizes keys before insertion.
  2. Use this helper when consuming `snapshot.profiles` and any live profile updates.
  3. Update enrichment logic to rely on normalized keys only; ensure both read/write paths match.
  4. Add tests that supply profiles with mixed-case pubkeys and verify enrichment attaches profiles.

### A3. Align videoEventId comparisons to canonical casing
- **Goal:** Prevent valid snapshots from being ignored due to casing differences between `snapshot.videoEventId` and modal state.
- **Scope & references:**
  - `js/ui/videoModalCommentController.js` (`handleCommentThreadReady`, state initialization, `handleCommentThreadSnapshot`).
- **Steps:**
  1. Normalize `videoEventId` to lowercase when stored in controller state and when received from snapshots.
  2. Compare using the normalized values only; consider storing the canonical form alongside raw data for display if needed.
  3. Add a regression test where snapshot and modal receive the same ID with different casing and verify comments render.

## B. Robustness and lifecycle improvements

### B1. Persist comment cache during teardown
- **Goal:** Avoid losing in-flight comments when the modal/controller is torn down shortly after new events arrive.
- **Scope & references:**
  - `js/nostr/commentThreadService.js` (`teardown`, `persistCommentCache`, `resetInternalState`).
- **Steps:**
  1. Call `persistCommentCache()` at the start of `teardown()`, wrapping in a try/catch that logs via `logger` without blocking teardown.
  2. Add tests simulating teardown after appending events to confirm cache is written.

### B2. Surface localStorage failures explicitly
- **Goal:** Make storage failures diagnosable when `localStorage` is unavailable or throws, instead of silently behaving as a cache miss.
- **Scope & references:**
  - `js/nostr/commentThreadService.js` (`getCachedComments`, `cacheComments`, logger usage).
  - UI diagnostics hooks (if any) in `js/ui/videoModalCommentController.js`.
- **Steps:**
  1. Enhance logging to use `logger.user.warn` or a dev-mode banner when storage read/write throws; include the specific error.
  2. Optionally maintain an in-memory fallback cache when persistent storage fails, gated by a feature flag or dev mode.
  3. Add tests that stub `localStorage` to throw and assert the warning path executes and behavior is explicit.

### B3. Harden optimistic comment flow against duplication
- **Goal:** Ensure optimistic comment handling cannot create duplicates or drop updates due to ID normalization differences.
- **Scope & references:**
  - `js/ui/videoModalCommentController.js` (post-publish integration path calling `processIncomingEvent`).
  - `js/nostr/commentThreadService.js` (`applyEvent`, event normalization).
- **Steps:**
  1. Normalize optimistic events’ IDs before processing so they match subscription-delivered IDs.
  2. Optionally mark optimistic events (`optimistic: true`) and de-duplicate/merge when the confirmed event arrives.
  3. Add tests ensuring an optimistic event followed by the confirmed event does not create duplicates and retains metadata.

### B4. Improve diagnostics for FEATURE_IMPROVED_COMMENT_FETCHING
- **Goal:** Make it clear which fetch path executes and why caches are rejected to ease debugging across flag states.
- **Scope & references:**
  - `js/nostr/commentThreadService.js` (feature-flagged fetch logic, cache TTL/version checks).
  - Logger utilities.
- **Steps:**
  1. Add dev-mode logs indicating whether the improved path is taken, cache acceptance/rejection reasons, and TTL/version info.
  2. Gate noisy logs behind `isDevMode` or `logger.dev.*` per logging policy.
  3. Add a small test asserting diagnostic messages when cache is skipped due to TTL/version mismatch (using a mock logger).

## C. Style, consistency, and minor improvements

### C1. Consolidate normalization helpers for hex IDs and pubkeys
- **Goal:** Provide a single canonical helper for hex normalization to reduce accidental casing mismatches across the app.
- **Scope & references:**
  - `js/utils/nostrUtils.js` (or similar shared util file).
  - Call sites in comment controllers/services and profile handling.
- **Steps:**
  1. Introduce `normalizeHexId(value)` (trim + lowercase) alongside `normalizePubkey`; update exports.
  2. Replace ad-hoc normalization of event IDs with the new helper across the comment stack.
  3. Add unit tests for the helper to ensure it handles whitespace, empty strings, and mixed casing.

### C2. Profile hydration resilience
- **Goal:** Make profile fetching failures visible and add simple resilience to reduce silent missing avatars.
- **Scope & references:**
  - `js/ui/videoModalCommentController.js` (`flushProfileQueue`, `batchFetchProfiles`).
  - Logger/error emission hooks.
- **Steps:**
  1. Log a concise dev-mode message listing pubkeys that failed to hydrate; keep user-facing errors minimal but visible.
  2. Add a limited retry (e.g., one backoff) for profile fetch failures, avoiding unbounded loops.
  3. Add tests that force `batchFetchProfiles` to reject and assert logging plus retry behavior.

### C3. Add focused edge-case tests
- **Goal:** Expand coverage for the scenarios above to prevent regressions.
- **Scope & references:**
  - `tests/video-modal-comments.test.mjs`
  - `tests/comment-thread-service.test.mjs`
- **Steps:**
  1. Implement tests for mixed-case event IDs/pubkeys, storage failures, and teardown persistence.
  2. Add fixtures/mocks for `localStorage` and `logger` as needed.
  3. Ensure tests are deterministic and clean up any global state between cases.

