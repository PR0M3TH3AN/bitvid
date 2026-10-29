# QA2: demonstrated cold-feed refresh gap (client7 routed)

Dispatch16:08:41 classified this as a hard local-review blocker and routed a method-only actual-service
regression/fix to client-reliability-7. QA is product-read-only and holds browser closed until durable fix+
refreshed built artifact. No forced refresh/render is an acceptable baseline substitute.

## Trigger and observation

Fresh actual app at1b3ef49c/build1834b6a9,empty browser cache,existing local mock relay preseeded3 synthetic
kind30078 video events. Hosted media is genuine local VP8 with real HEAD/GET/Range semantics;crypto uses genuine
canonical toolkit and local pinned Buffer mirror. Runtime artifact,external deny guard,inputs and3-card15s bound unchanged.

Granted targeted passive run16:06:34.174→16:06:51.787Z(17.613s),Chromium154.0.8037.97,360×800:
- Actual local relay video REQ returns3 EVENTs plus EOSE;client and app caches contain3.
- Actual getFilteredActiveVideos returns3;all3 shouldIncludeVideo and canAccess decisions aretrue.
- No private,NSFW,deleted,invalid,author-blocked or event-blacklisted flags. Whitelistfalse,lockdownfalse,hydratedtrue.
- Passive service chronology:initial videos:updated cache count0,then videos:cache size3 and videos:updated subscription count3.
- View remains currentVideos0,renderedIDs0,last signature__EMPTY__,metadata.reason=cache;actualDOM cards0 after15s.
- View container connected and matches activevideoList;bodynotinert,documentvisible. This rules out the measured
  access/private/NSFW/blacklist and mount/visibility candidates for this reproduction.

[Actual empty styled Trending screenshot](playback-qa-2-render-diagnostic.png)

First missing observed notification/render boundary is after allowed subscription data enters the service/appmap.
Source:js/services/nostrService.js loadVideos applyAndNotify invokes onVideos for cache/optimistic paths;
live subscription callback caches/emits but never invokes that callback. js/app/feedCoordinator.js onVideos owns
refreshFeed/render;applicationBootstrap binds subscription:changed but not videos:updated for main-feed rendering.
This is the minimal owner/file boundary sent to dispatch,not a product edit by QA. Client7 owns reproduction/fix.

## Fidelity and interventions

Original diagnostic seed omitted canonical s tag. Actual schema rejects that omission,while actual converter and
service eligibility accept all3,and wire/ingest/allow decisions are measured. Thus this schema mismatch did not
prevent the observed ingestion/eligibility and must not be presented as the empty-render cause. The post-fix
baseline should retain the established canonical fixture shape;no input or assertion was silently changed here.

An early passive observer initScript had1 pageerror for relative module resolution on the initial document.
The observer subsequently DID attach on the actual app and captured the exact cache/subscription chronology below.
This is an instrumentation error,not a product error. Product methods were not wrapped/replaced;only event listeners
and read-only queries were added. No refresh/render invocation,manual card insertion,cache mutation,new seeds,
fake media events/health,extra mirror or product change. Existing earlier driver interventions remain preserved in
[second-pass history](playback-qa-2-second-pass.md).

All owned browser/context/app+relay servers closed16:06:51.787Z,explicit RELEASE16:07:45Z;temporary dependency
symlink removed. Preview3000 and other processes untouched. No login/navigation/Profile/Upload/remaining viewport
checks were executed. Full core/mobile baseline is blocked,not done. QA will resume original assertions only after
client7 durable landing,integrated preview rebuild and dispatch browser clearance.

## Exact captured decisions

```json
{
  "started": "2026-10-20T16:06:34.174Z",
  "ended": "2026-10-20T16:06:51.787Z",
  "downstream": {
    "activeVideos": 3,
    "filteredVideos": 3,
    "whitelistMode": false,
    "lockdownActive": false,
    "accessHydrated": true,
    "decisions": [
      {
        "id": "d8214f91f51180561f0fac563d163c4d3a049f53ea6dd24d0a3c892f918777e1",
        "isPrivate": false,
        "isNsfw": false,
        "deleted": false,
        "invalid": false,
        "accessAllowed": true,
        "serviceInclude": true,
        "authorBlocked": false,
        "eventBlacklisted": false
      },
      {
        "id": "1895c1e24ab449778121178f2301a2d5b9d296f6a76c2703900cd9141034058f",
        "isPrivate": false,
        "isNsfw": false,
        "deleted": false,
        "invalid": false,
        "accessAllowed": true,
        "serviceInclude": true,
        "authorBlocked": false,
        "eventBlacklisted": false
      },
      {
        "id": "11939f8c1f39254c8ff49905e9ec8c78c19d362e7f131d99eb0f2bb5eecaee22",
        "isPrivate": false,
        "isNsfw": false,
        "deleted": false,
        "invalid": false,
        "accessAllowed": true,
        "serviceInclude": true,
        "authorBlocked": false,
        "eventBlacklisted": false
      }
    ],
    "viewExists": true,
    "viewCurrentVideos": 0,
    "viewRenderedIds": 0,
    "viewLastSignature": "__EMPTY__",
    "viewContainerConnected": true,
    "viewContainerMatches": true,
    "latestMetadata": {
      "why": [],
      "config": {
        "timeWindow": null,
        "actorFilters": [],
        "tagFilters": [],
        "sortOrder": "recent"
      },
      "reason": "cache",
      "preserveOrder": true
    },
    "viewMetadata": {
      "why": [],
      "config": {
        "timeWindow": null,
        "actorFilters": [],
        "tagFilters": [],
        "sortOrder": "recent"
      },
      "reason": "cache",
      "preserveOrder": true
    },
    "bodyInert": false,
    "documentVisibility": "visible",
    "passiveFeedEvents": [
      {
        "type": "observer-attached",
        "at": 1792512395999
      },
      {
        "type": "videos:updated",
        "at": 1792512396468,
        "reason": "cache",
        "count": 0
      },
      {
        "type": "videos:cache",
        "at": 1792512396487,
        "size": 3
      },
      {
        "type": "videos:updated",
        "at": 1792512396487,
        "reason": "subscription",
        "count": 3
      }
    ]
  },
  "fixtureHttp": {
    "head": 200,
    "get": 200,
    "range": 206,
    "bytes": 1019,
    "contentType": "video/webm"
  },
  "pageErrors": [
    "Failed to resolve module specifier '/js/applicationContext.js'"
  ],
  "resourcesClosed": true
}
```

Diagnostic source SHA2567867eaced118cad69ae9f5e5dd0054149d71b8c892772a5a75fda2225d8b2715;
full report retained at own scratch render-result.json. Original822file runtime manifest remains
662fa755e3cde021058f5bf9a5bd2825698bad064ab80472a5ba70e651d764b1.
No actual WebTorrent/live peer/provider/signer/production/release qualification is implied.
