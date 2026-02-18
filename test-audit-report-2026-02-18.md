# Test Audit Report - 2026-02-18

## Run Metadata
- **Date**: 2026-02-18T20:13:50.582Z
- **Node Version**: v22.22.0
- **NPM Version**: 11.7.0
- **Test Command**: `npm run test:unit` (with c8 coverage)

## Summary
- **Flaky Tests**: 0
- **Suspicious Files**: 91
- **Critical Coverage Gaps**: 5

## Flakiness Detection
No flaky tests detected (based on run matrix).

## Suspicious Patterns
Found suspicious patterns in 91 files:
### tests/admin-list-store.test.mjs
- Time dependence (sleep/timeout) (2 occurrences)
- Console usage (4 occurrences)
### tests/app/feedCoordinator.test.mjs
- Network dependence (fetch/WebSocket) (1 occurrences)
### tests/app-batch-fetch-profiles.test.mjs
- Network dependence (fetch/WebSocket) (2 occurrences)
- Console usage (3 occurrences)
### tests/auth-service.test.mjs
- Time dependence (sleep/timeout) (2 occurrences)
### tests/comment-thread-service.test.mjs
- Time dependence (sleep/timeout) (1 occurrences)
- Network dependence (fetch/WebSocket) (78 occurrences)
- Console usage (1 occurrences)
### tests/compliance/nip07_compliance.test.mjs
- Time dependence (sleep/timeout) (1 occurrences)
### tests/discussion-count-service.test.mjs
- Network dependence (fetch/WebSocket) (2 occurrences)
- Console usage (1 occurrences)
### tests/dm-normalization.test.mjs
- Time dependence (sleep/timeout) (2 occurrences)
### tests/edit-modal-submit-state.test.mjs
- Network dependence (fetch/WebSocket) (3 occurrences)
### tests/event-schemas.test.mjs
- Console usage (3 occurrences)
### tests/feed-engine.test.mjs
- Time dependence (sleep/timeout) (1 occurrences)
- Console usage (1 occurrences)
### tests/hashtag-preferences.test.mjs
- Time dependence (sleep/timeout) (2 occurrences)
- Network dependence (fetch/WebSocket) (8 occurrences)
### tests/login-modal-controller.test.mjs
- Time dependence (sleep/timeout) (6 occurrences)
### tests/minimal-webtorrent.test.mjs
- No assertions found
### tests/modal-accessibility.test.mjs
- Time dependence (sleep/timeout) (1 occurrences)
- Network dependence (fetch/WebSocket) (4 occurrences)
### tests/moderation/submit-report.test.mjs
- Time dependence (sleep/timeout) (1 occurrences)
### tests/moderation/video-card.test.mjs
- Time dependence (sleep/timeout) (6 occurrences)
### tests/nip07-concurrency.test.mjs
- Time dependence (sleep/timeout) (2 occurrences)
### tests/nostr/client.test.mjs
- Time dependence (sleep/timeout) (3 occurrences)
- Network dependence (fetch/WebSocket) (13 occurrences)
### tests/nostr/comment-events.test.mjs
- Time dependence (sleep/timeout) (1 occurrences)
### tests/nostr/countDiagnostics.test.mjs
- Console usage (4 occurrences)
### tests/nostr/dm-direct-message-flow.test.mjs
- Time dependence (sleep/timeout) (2 occurrences)
### tests/nostr/dmDecryptWorkerClient.test.mjs
- Console usage (4 occurrences)
### tests/nostr/dmSignalEvents.test.mjs
- Time dependence (sleep/timeout) (1 occurrences)
### tests/nostr/integration-remote-flow.test.mjs
- Time dependence (sleep/timeout) (1 occurrences)
### tests/nostr/nip04WorkerClient.test.mjs
- Console usage (2 occurrences)
### tests/nostr/nip07Permissions.test.js
- Time dependence (sleep/timeout) (1 occurrences)
### tests/nostr/nip71.test.js
- Network dependence (fetch/WebSocket) (10 occurrences)
### tests/nostr/sessionActor.test.mjs
- Focused or skipped test (1 occurrences)
### tests/nostr/sign-request-queue.test.mjs
- Time dependence (sleep/timeout) (3 occurrences)
### tests/nostr/toolkit.test.mjs
- Time dependence (sleep/timeout) (1 occurrences)
### tests/nostr/watchHistory.test.js
- Time dependence (sleep/timeout) (1 occurrences)
- Network dependence (fetch/WebSocket) (5 occurrences)
### tests/nostr-boost-actions.test.mjs
- Network dependence (fetch/WebSocket) (2 occurrences)
- Console usage (1 occurrences)
### tests/nostr-count-fallback.test.mjs
- Console usage (4 occurrences)
### tests/nostr-delete-flow.test.mjs
- Console usage (1 occurrences)
### tests/nostr-login-permissions.test.mjs
- Time dependence (sleep/timeout) (1 occurrences)
### tests/nostr-nip46-queue.test.mjs
- Time dependence (sleep/timeout) (3 occurrences)
### tests/nostr-private-key-signer.test.mjs
- Time dependence (sleep/timeout) (1 occurrences)
### tests/nostr-publish-rejection.test.mjs
- Console usage (1 occurrences)
### tests/nostr-rebroadcast-guard.test.mjs
- Network dependence (fetch/WebSocket) (1 occurrences)
- Console usage (1 occurrences)
### tests/nostr-send-direct-message.test.mjs
- Time dependence (sleep/timeout) (2 occurrences)
### tests/nostr-service-access-control.test.mjs
- Time dependence (sleep/timeout) (1 occurrences)
### tests/nostr-signer-race.test.mjs
- Time dependence (sleep/timeout) (1 occurrences)
### tests/nostr-view-event-bindings.test.mjs
- Console usage (1 occurrences)
### tests/nostr-view-events.test.mjs
- Console usage (1 occurrences)
### tests/nwc-client.test.mjs
- Time dependence (sleep/timeout) (2 occurrences)
### tests/performance/resolvePostedAt.test.mjs
- Network dependence (fetch/WebSocket) (2 occurrences)
- Console usage (2 occurrences)
### tests/profile-cache.test.mjs
- Time dependence (sleep/timeout) (2 occurrences)
### tests/profile-modal-controller.test.mjs
- Time dependence (sleep/timeout) (3 occurrences)
- Network dependence (fetch/WebSocket) (3 occurrences)
### tests/race/nostr-client-init-race.test.mjs
- Time dependence (sleep/timeout) (1 occurrences)
### tests/revert-modal-controller.test.mjs
- Network dependence (fetch/WebSocket) (2 occurrences)
### tests/services/attachmentService.test.mjs
- Network dependence (fetch/WebSocket) (12 occurrences)
### tests/services/discussionCountService.test.mjs
- Network dependence (fetch/WebSocket) (1 occurrences)
### tests/services/exploreDataService.test.mjs
- Console usage (4 occurrences)
### tests/services/link-preview-service.test.mjs
- Time dependence (sleep/timeout) (1 occurrences)
- Network dependence (fetch/WebSocket) (7 occurrences)
- Console usage (1 occurrences)
### tests/services/nostr-service.test.mjs
- Network dependence (fetch/WebSocket) (3 occurrences)
### tests/services/playbackService_forcedSource.test.mjs
- Time dependence (sleep/timeout) (3 occurrences)
### tests/services/profileMetadataService.test.mjs
- Time dependence (sleep/timeout) (1 occurrences)
- Network dependence (fetch/WebSocket) (13 occurrences)
### tests/services/relay-health-service.test.mjs
- Time dependence (sleep/timeout) (1 occurrences)
- Network dependence (fetch/WebSocket) (1 occurrences)
### tests/services/trustBootstrap.test.mjs
- Time dependence (sleep/timeout) (2 occurrences)
### tests/sign-request-queue.test.mjs
- Time dependence (sleep/timeout) (3 occurrences)
### tests/state/cache.test.mjs
- Time dependence (sleep/timeout) (1 occurrences)
### tests/subscriptions-feed.test.mjs
- Network dependence (fetch/WebSocket) (1 occurrences)
- Console usage (1 occurrences)
### tests/subscriptions-manager.test.mjs
- Time dependence (sleep/timeout) (1 occurrences)
- Network dependence (fetch/WebSocket) (3 occurrences)
### tests/torrent/service-worker-fallback-message.test.mjs
- Network dependence (fetch/WebSocket) (1 occurrences)
### tests/torrent/toast-service.test.mjs
- Time dependence (sleep/timeout) (1 occurrences)
### tests/ui/components/debug_hashtag_strip_helper.test.mjs
- No assertions found
- Console usage (3 occurrences)
### tests/ui/creatorProfileController.test.mjs
- Network dependence (fetch/WebSocket) (12 occurrences)
### tests/ui/profile-modal-moderation-settings.test.mjs
- Network dependence (fetch/WebSocket) (2 occurrences)
### tests/ui/profileModalController-addProfile.test.mjs
- Network dependence (fetch/WebSocket) (2 occurrences)
- Console usage (2 occurrences)
### tests/ui/uploadModal-integration.test.mjs
- Time dependence (sleep/timeout) (1 occurrences)
- Network dependence (fetch/WebSocket) (7 occurrences)
### tests/ui/uploadModal-reset.test.mjs
- Network dependence (fetch/WebSocket) (1 occurrences)
- Console usage (1 occurrences)
### tests/ui/url-health-controller.test.mjs
- Time dependence (sleep/timeout) (5 occurrences)
- Network dependence (fetch/WebSocket) (3 occurrences)
### tests/unit/client-count-resilience.test.mjs
- Time dependence (sleep/timeout) (1 occurrences)
### tests/unit/editModalController.test.mjs
- Network dependence (fetch/WebSocket) (2 occurrences)
### tests/unit/notificationController.test.mjs
- Time dependence (sleep/timeout) (1 occurrences)
### tests/unit/services/r2Service.storage-config.test.mjs
- Network dependence (fetch/WebSocket) (3 occurrences)
### tests/unit/ui/videoModalController.test.mjs
- Time dependence (sleep/timeout) (2 occurrences)
### tests/user-blocks.test.mjs
- Time dependence (sleep/timeout) (2 occurrences)
### tests/utils/domUtils.test.mjs
- Console usage (2 occurrences)
### tests/video-card-source-visibility.test.mjs
- Time dependence (sleep/timeout) (2 occurrences)
### tests/video-modal-accessibility.test.mjs
- Network dependence (fetch/WebSocket) (5 occurrences)
- Console usage (4 occurrences)
### tests/video-modal-zap.test.mjs
- Network dependence (fetch/WebSocket) (4 occurrences)
### tests/view-counter.test.mjs
- Time dependence (sleep/timeout) (2 occurrences)
- Network dependence (fetch/WebSocket) (6 occurrences)
- Console usage (4 occurrences)
### tests/watch-history-feed.test.mjs
- Console usage (1 occurrences)
### tests/watch-history.test.mjs
- Time dependence (sleep/timeout) (4 occurrences)
- Network dependence (fetch/WebSocket) (14 occurrences)
- Console usage (19 occurrences)
### tests/watchHistory/watch-history-telemetry.test.mjs
- Time dependence (sleep/timeout) (1 occurrences)
### tests/webtorrent-handlers.test.mjs
- Time dependence (sleep/timeout) (3 occurrences)
### tests/webtorrent-regression.test.mjs
- Time dependence (sleep/timeout) (2 occurrences)
- Console usage (1 occurrences)
### tests/zap-shared-state.test.mjs
- Console usage (1 occurrences)
### tests/zap-split.test.mjs
- Time dependence (sleep/timeout) (1 occurrences)
- Network dependence (fetch/WebSocket) (7 occurrences)
- Console usage (1 occurrences)

## Critical Coverage Gaps
Critical modules with low coverage (< 70%):
- **js/services/authService.js**: Lines: 77.34%, Statements: 77.34%, Functions: 61.9%, Branches: 62.71%
- **js/relayManager.js**: Lines: 56.75%, Statements: 56.75%, Functions: 73.33%, Branches: 51.93%
- **js/nostr/dmDecryptWorker.js**: Lines: 71.8%, Statements: 71.8%, Functions: 100%, Branches: 31.66%
- **js/nostr/watchHistory.js**: Lines: 58.14%, Statements: 58.14%, Functions: 69.64%, Branches: 40.68%
- **js/userBlocks.js**: Lines: 25.77%, Statements: 25.77%, Functions: 33.33%, Branches: 29.2%

## Prioritized Remediation
### High Priority (P0)
- [ ] Increase coverage for `js/services/authService.js` (currently < 70%).
- [ ] Increase coverage for `js/relayManager.js` (currently < 70%).
- [ ] Increase coverage for `js/nostr/dmDecryptWorker.js` (currently < 70%).
- [ ] Increase coverage for `js/nostr/watchHistory.js` (currently < 70%).
- [ ] Increase coverage for `js/userBlocks.js` (currently < 70%).

### Medium Priority (P1)
- [ ] Review suspicious tests (time dependence, network usage) and replace with deterministic patterns.
