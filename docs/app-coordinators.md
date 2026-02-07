# Application Coordinator Architecture

The `Application` class (`js/app.js`) acts as the **composition root** for bitvid.
Business logic that previously lived directly on `Application` has been extracted
into **coordinator modules** under `js/app/`.  `Application` retains thin
delegator methods so that every public call-site continues to work unchanged.

## Coordinator Modules

| Module | File | Responsibility |
|--------|------|----------------|
| Feed | `js/app/feedCoordinator.js` | Feed registration, runtime building, refresh, video loading, URL-health helpers, feed telemetry |
| Playback | `js/app/playbackCoordinator.js` | URL-first + magnet fallback pipeline, probing, torrent status, video timestamps |
| Auth/Session | `js/app/authSessionCoordinator.js` | Signer lifecycle, profile switching, relay/block/wallet management, cleanup |
| Modal | `js/app/modalCoordinator.js` | Modal open/close, view-count subscriptions, watch-history metadata, playback logging |
| Moderation | `js/app/moderationCoordinator.js` | Moderation settings, video decoration, override/block/hide actions |

A shared helper (`js/app/bindCoordinator.js`) binds every method returned by a
coordinator factory to the `Application` instance so that `this` works as expected.

## Dependency Injection

Each coordinator is a factory function that receives a `deps` object containing
every module-level dependency it needs.  Coordinators **never import globals**
themselves; all references come through the closure created by `deps`:

```javascript
export function createFeedCoordinator(deps) {
  const { devLogger, nostrClient, watchHistoryService, ... } = deps;

  return {
    async loadVideos(forceFetch = false) {
      devLogger.log("Starting loadVideos...");  // closure var, not import
      // `this` is the Application instance (bound by caller)
      this.checkRelayHealthWarning();
      // ...
    },
  };
}
```

`Application._initCoordinators()` creates all five coordinators and injects their
dependencies from the module scope of `js/app.js`.  It is called eagerly in the
constructor and idempotently from every delegator, so test harnesses that use
`Object.create(Application.prototype)` also work.

## Delegation Pattern

Every extracted method has a matching thin delegator on `Application`:

```javascript
class Application {
  async loadVideos(...args) {
    this._initCoordinators();
    return this._feed.loadVideos(...args);
  }
}
```

This preserves the public API surface.  Callers (views, services, test harnesses)
do not need to know about coordinators.

## Old-to-New Mapping

| Old location (`Application` method) | New location |
|--------------------------------------|--------------|
| `registerRecentFeed`, `registerForYouFeed`, `registerKidsFeed`, `registerExploreFeed`, `registerSubscriptionsFeed`, `registerWatchHistoryFeed` | `feedCoordinator` |
| `buildForYouFeedRuntime`, `buildExploreFeedRuntime`, `buildRecentFeedRuntime`, `buildKidsFeedRuntime` | `feedCoordinator` |
| `refreshForYouFeed`, `refreshKidsFeed`, `refreshExploreFeed`, `refreshRecentFeed` | `feedCoordinator` |
| `loadVideos`, `loadForYouVideos`, `loadKidsVideos`, `loadExploreVideos`, `loadOlderVideos` | `feedCoordinator` |
| `renderVideoList`, `refreshVideoDiscussionCounts` | `feedCoordinator` |
| `checkRelayHealthWarning`, `hasOlderVersion` | `feedCoordinator` |
| Feed telemetry (`getFeedTelemetryState`, `emitFeedImpressions`, `recordFeedClick`, ...) | `feedCoordinator` |
| `playHttp`, `playViaWebTorrent`, `playVideoWithFallback` | `playbackCoordinator` |
| `playVideoByEventId`, `playVideoWithoutEvent` | `playbackCoordinator` |
| `probeUrl`, `probeUrlWithVideoElement`, `checkUrlParams` | `playbackCoordinator` |
| `autoplayModalVideo`, `startTorrentStatusMirrors` | `playbackCoordinator` |
| `buildModalTimestampPayload`, `resolveVideoPostedAt`, `ensureModalPostedTimestamp` | `playbackCoordinator` |
| `shouldDeferModeratedPlayback`, `resumePendingModeratedPlayback` | `playbackCoordinator` |
| `handleAuthLogin`, `handleAuthLogout`, `requestLogout` | `authSessionCoordinator` |
| `handleBlocksLoaded`, `handleRelaysLoaded`, `scheduleRelayUiRefresh` | `authSessionCoordinator` |
| `cleanup`, `waitForCleanup`, `clearActiveIntervals` | `authSessionCoordinator` |
| `handleProfileSwitchRequest`, `waitForIdentityRefresh`, `handleProfileLogoutRequest` | `authSessionCoordinator` |
| `handleProfileRelayOperation`, `handleProfileBlocklistMutation`, `handleProfileAdminMutation` | `authSessionCoordinator` |
| `handleProfileWalletPersist`, `handleProfileWalletTest`, `handleProfileWalletDisconnect` | `authSessionCoordinator` |
| `showModalWithPoster`, `hideModal`, `ensureVideoModalReady` | `modalCoordinator` |
| `subscribeModalViewCount`, `teardownModalViewCountSubscription` | `modalCoordinator` |
| `preparePlaybackLogging`, `teardownVideoElement` | `modalCoordinator` |
| `persistWatchHistoryMetadataForVideo`, `handleRemoveHistoryAction` | `modalCoordinator` |
| `setShareButtonState`, `getShareUrlBase` | `modalCoordinator` |
| `handleModerationSettingsChange`, `refreshVisibleModerationUi` | `moderationCoordinator` |
| `decorateVideoModeration`, `initializeModerationActionController` | `moderationCoordinator` |
| `handleModerationOverride`, `handleModerationBlock`, `handleModerationHide` | `moderationCoordinator` |
| `normalizeModerationSettings`, `getActiveModerationThresholds` | `moderationCoordinator` |

## Adding New Methods

When adding a method that belongs to an existing coordinator:

1. Add the method to the coordinator's return object.
2. Add a thin delegator on `Application` that calls `this._initCoordinators()`
   then delegates to the coordinator.
3. If the method uses a new module-level import, add it to the coordinator's
   `deps` destructuring and pass it from `_initCoordinators()`.
