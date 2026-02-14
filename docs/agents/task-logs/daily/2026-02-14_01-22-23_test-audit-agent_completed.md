# Test Audit Agent: Completed

**Date:** 2026-02-14
**Agent:** test-audit-agent
**Cadence:** daily

## Summary
Test audit completed. Coverage report generated.
See detailed report below.

---

# Test Audit Report: 2026-02-14

## Summary
- **Test Runner:** `node:test` via `scripts/run-unit-tests.mjs`
- **Coverage Tool:** `c8`
- **Flakiness Check:** 1 runs (Timeout issues encountered)

## Flakiness
Flakiness run timed out after 1 iteration.

## Suspicious Tests
### Skipped Tests (.skip)
- tests/nostr/sessionActor.test.mjs

### Focused Tests (.only)
None

### Sleep Usage (setTimeout/sleep)
- tests/admin-list-store.test.mjs
- tests/auth-service.test.mjs
- tests/comment-thread-service.test.mjs
- tests/compliance/nip07_compliance.test.mjs
- tests/dm-normalization.test.mjs
- tests/feed-engine.test.mjs
- tests/hashtag-preferences.test.mjs
- tests/modal-accessibility.test.mjs
- tests/moderation/submit-report.test.mjs
- tests/moderation/video-card.test.mjs
- tests/nip07-concurrency.test.mjs
- tests/nostr/client.test.mjs
- tests/nostr/comment-events.test.mjs
- tests/nostr/dm-direct-message-flow.test.mjs
- tests/nostr/dmSignalEvents.test.mjs
- tests/nostr/integration-remote-flow.test.mjs
- tests/nostr/nip07Permissions.test.js
- tests/nostr/sign-request-queue.test.mjs
- tests/nostr/toolkit.test.mjs
- tests/nostr/watchHistory.test.js
- tests/nostr-login-permissions.test.mjs
- tests/nostr-nip46-queue.test.mjs
- tests/nostr-private-key-signer.test.mjs
- tests/nostr-send-direct-message.test.mjs
- tests/nostr-service-access-control.test.mjs
- tests/nostr-signer-race.test.mjs
- tests/nwc-client.test.mjs
- tests/profile-cache.test.mjs
- tests/profile-modal-controller.test.mjs
- tests/services/link-preview-service.test.mjs
- tests/services/playbackService_forcedSource.test.mjs
- tests/services/profileMetadataService.test.mjs
- tests/services/relay-health-service.test.mjs
- tests/services/trustBootstrap.test.mjs
- tests/sign-request-queue.test.mjs
- tests/state/cache.test.mjs
- tests/subscriptions-manager.test.mjs
- tests/torrent/toast-service.test.mjs
- tests/ui/uploadModal-integration.test.mjs
- tests/ui/url-health-controller.test.mjs
- tests/unit/client-count-resilience.test.mjs
- tests/unit/notificationController.test.mjs
- tests/user-blocks.test.mjs
- tests/video-card-source-visibility.test.mjs
- tests/view-counter.test.mjs
- tests/watch-history.test.mjs
- tests/watchHistory/watch-history-telemetry.test.mjs
- tests/webtorrent-handlers.test.mjs
- tests/webtorrent-regression.test.mjs
- tests/zap-split.test.mjs

### Console Usage
- tests/admin-list-store.test.mjs
- tests/app-batch-fetch-profiles.test.mjs
- tests/comment-thread-service.test.mjs
- tests/discussion-count-service.test.mjs
- tests/event-schemas.test.mjs
- tests/feed-engine.test.mjs
- tests/nostr/countDiagnostics.test.mjs
- tests/nostr/dmDecryptWorkerClient.test.mjs
- tests/nostr/nip04WorkerClient.test.mjs
- tests/nostr-boost-actions.test.mjs
- tests/nostr-count-fallback.test.mjs
- tests/nostr-delete-flow.test.mjs
- tests/nostr-publish-rejection.test.mjs
- tests/nostr-rebroadcast-guard.test.mjs
- tests/nostr-view-event-bindings.test.mjs
- tests/nostr-view-events.test.mjs
- tests/performance/resolvePostedAt.test.mjs
- tests/services/exploreDataService.test.mjs
- tests/services/link-preview-service.test.mjs
- tests/subscriptions-feed.test.mjs
- tests/ui/components/debug_hashtag_strip_helper.test.mjs
- tests/ui/profileModalController-addProfile.test.mjs
- tests/ui/uploadModal-reset.test.mjs
- tests/utils/domUtils.test.mjs
- tests/video-modal-accessibility.test.mjs
- tests/view-counter.test.mjs
- tests/watch-history-feed.test.mjs
- tests/watch-history.test.mjs
- tests/webtorrent-regression.test.mjs
- tests/zap-shared-state.test.mjs
- tests/zap-split.test.mjs

## Coverage Gaps (Critical Files)
| File | Coverage % | Lines Hit | Total Lines |
|------|------------|-----------|-------------|
| js/relayManager.js | 49.94% | 385 | 771 |
| js/userBlocks.js | 25.87% | 596 | 2304 |
| js/nostr/dmDecryptWorker.js | 71.80% | 191 | 266 |
| js/nostr/watchHistory.js | 58.14% | 1285 | 2210 |
| js/services/authService.js | 77.35% | 1021 | 1320 |

## Recommendations
1. **Investigate Skipped Tests:** 1 tests are skipped. Check if they are obsolete or need fixing.
2. **Remove Console Logs:** 31 test files contain console logs. Clean them up.
3. **Address Coverage Gaps:** Several critical files have low coverage. Focus on `js/services/authService.js` and `js/relayManager.js` if below 70%.
4. **Fix Flakiness:** The test suite is slow and timed out during flakiness check. Optimize tests or increase timeout.

## Detailed Coverage Log (Snippet)
```

→ Running tests/app-batch-fetch-profiles.test.mjs
TAP version 13
# Subtest: batchFetchProfiles handles fast and failing relays
ok 1 - batchFetchProfiles handles fast and failing relays
  ---
  duration_ms: 6.957839
  type: 'test'
  ...
# Subtest: batchFetchProfiles respects forceRefresh
ok 2 - batchFetchProfiles respects forceRefresh
  ---
  duration_ms: 1.482144
  type: 'test'
  ...
1..2
# tests 2
# suites 0
# pass 2
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 26.235092

→ Running tests/app-state.test.mjs
TAP version 13
# Subtest: AppState
    # Subtest: Initial state is clean
    ok 1 - Initial state is clean
      ---
      duration_ms: 2.807049
      type: 'test'
      ...
    # Subtest: setPubkey() updates state and notifies subscribers
    ok 2 - setPubkey() updates state and notifies subscribers
      ---
      duration_ms: 0.995842
      type: 'test'
      ...
    # Subtest: setCurrentUserNpub() updates state
    ok 3 - setCurrentUserNpub() updates state
      --...
```
