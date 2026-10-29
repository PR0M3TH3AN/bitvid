# client-reliability-5 active URL investigation

## Scope and source

- HEAD `0c1dd7e86be3e28edc96aca47f7753a98990dde0`; compared filedAt `3f627f5df3da7bcd28d910d9f8161844fa77ff74`: no observer/controller product differences. Claimed item5 after merge/read updated routing; no product or regression changes.
- Scratch `/tmp/bitvid-client-reliability-5-active-url.mjs`, SHA256 `31c7fa62c306b28008ee663fc69d25834904ee38cbf34711230ff0d3cdc66fd7`.
- Real attachUrlHealthBadges/cardObserver/controller/probeUrlList/probeUrl/media wait queue and actual state/cache functions. Callback shape matches VideoListView and feedCoordinator. jsdom/native DOM event APIs; only external fetch responses and media load/pause are controlled. Deferred fetch records and explicit loadeddata/error events; node:test mock clock advances the real configured4000ms deadline. No sleeps/retries/live network/forced exit. Mock timers reset and DOM closed before failing assertion. Real media decoding/resources are virtualized; counts describe IO boundary retention, not CPU/RSS.
- First mailbox_read hit automatic approval-review deadline, not rejection; one allowed retry succeeded. Pickup reported to dispatch; no bypass/control change.

## Commands and observations

All commands use `env -u NODE_TEST_CONTEXT node /tmp/bitvid-client-reliability-5-active-url.mjs <mode>`. Each uses one event/source, optional mirror and actual in-flight deduplication. Initial primary HEAD is explicitly resolved to create one active media probe before disposal. Disposed DOM stays connected to expose stale UI. Before/after disposal: HEAD starts1, media resource1, active slot1, queued0, settled0, no cache. Observer disconnect confirmed.

- `success`: natural exit0. Explicit loadeddata after disposal releases resource/slot to0, settles1, stores healthy once; old connected badge remains checking. Later same-source registration uses healthy cache, adds0 HEAD requests and paints healthy. This is intentional bounded active caching, not a demonstrated leak.
- `timeout`: natural exit0. Advancing real4000ms media deadline with mock clock releases resource/slot to0, settles1, no health cache or additional media. Existing longer retry option is configured via actual cache constants, but no-owner lifecycle prevents another media start. Later same source starts1 fresh HEAD/media and paints healthy; final settled2, one healthy store from retry only.
- `mirror-disposed --expect-no-obsolete-head`: natural exit1 AFTER cleanup/retry, AssertionError `1 !== 0` at line50, message `disposed last-owner active failure must not start a fresh mirror HEAD`. Primary media error after disposal starts mirror HEAD2: obsolete new HEAD count1(expected0), unresolved HEAD1, media resource0, active slot0, queued0, unsettled original promise. Resolving that controlled mirror HEAD eventually settles original null with no cache and no new media/stale badge. Later retry starts1 fresh primary HEAD/media, healthy cache/badge, all media/slots0; final settled2.
- `mirror-shared`: natural exit0. A second live registration requests same event/source before original disposal: still1 initial HEAD and1 in-flight promise. Primary error starts one ordered mirror HEAD; resolving it starts one mirror media and loadeddata settles healthy for live badge; disposed badge stays checking. Final initial-chain media/slots0, settled1, healthy cache, later retry adds0 HEAD.
- `mirror-rejoin`: natural exit0. Same as shared control, but the second same-source registration arrives AFTER original disposal while its primary media remains active. It deduplicates onto original promise, restores live ownership, and mirror success paints healthy; no duplicated primary request, stale badge or retained media/slot after completion.

## Smallest reproduced defect and proposed routing

Active primary media failure after the LAST owner is disposed starts a NEW mirror HEAD request. This is additional obsolete work and promise retention, distinct from allowing an already-active bounded probe to settle/cache. `probeUrlList` moves from a completed error result to the next candidate without checking live ownership; the media-stage guard is later, after that mirror HEAD has started.

Proposed scope: `js/ui/urlHealthController.js` lifecycle check BEFORE starting a subsequent candidate, focused URL lifecycle regression scenarios, Test Integrity Note and evidence. Existing observer token/unregister hook is sufficient. No active HEAD/media/HLS/torrent abort, shared observer/app/cache-module edits, TTL/limit changes or broad Stage3 work proposed.

Acceptance:0 new mirror HEAD starts after last-owner active error; cancelled chain settles without negative cache/stale effects; active healthy caching remains; shared live/rejoining owner still gets ordered mirror success; timeout and later same-source requests retain slot/cache/inflight safety. Preserve existing mirror fallthrough for live owners.

Unverified: active HEAD/HLS/torrent teardown, real media decoding/network/browser fallback/live peers, CPU/RSS and whole Stage3. No browser/full-suite/lint/build reruns for evidence-only investigation; prior item4 qualification not repeated. Preview3000 untouched. Await dispatch independent assessment and routing before product/tests.
