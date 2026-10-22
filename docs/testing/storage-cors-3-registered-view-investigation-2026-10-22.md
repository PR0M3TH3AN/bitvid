# storage-cors-3 coordinator follow-on investigation

- Preserved candidate SHA: `89f8923c6e83b79a2b8874f811cdff2af6a809d0` (buffer/service commits already applied).
- Authorized by dispatch14:25:40Z: offline registered coordinator/feed/view/disposal investigation only. Coordinator, app, client and retained tests unchanged. No browser/full/build/queue slot used.
- Reproducer `/tmp/bitvid-storage-cors-3-registered-view-audit.mjs`; raw output `/tmp/storage3-registered-view-audit.log`.
- Command `env -u NODE_TEST_CONTEXT node /tmp/bitvid-storage-cors-3-registered-view-audit.mjs`: natural exit1;4 scenarios,2 pass,2 fail,0 cancelled/skipped;182.585705ms test duration. Zero attempted global fetch/WebSocket calls asserted per fixture. This is JSDOM/offline proof, not native browser or complete application startup proof.
- Completed and reported to dispatch by2026-10-22T14:29:48Z.

## Execution fidelity

Uses retained actual-subscription fixture from the buffer/service regressions: real client conversion/buffer/tombstone state and real service load/notifications/persistence. Synthetic signatures and fake subscription transport; metadata/IndexedDB IO virtualized as previously documented.

Creates real feed engine and invokes actual coordinator `registerRecentFeed` and `registerExploreFeed`. Source, blacklist, dedupe, moderation, posted-at and Explore scoring stages, and actual sorters execute. Uses real playback coordinator timestamp helpers and real timestamp utilities. Calls actual `loadFeedVideos`, `refreshFeed`, `renderVideoList`, `VideoListView.render` and `VideoCard` against a JSDOM document; asserts actual `[data-component="video-card"]` DOM IDs.

The controlled asynchronous IO boundary is the moderation adapter's `setActiveEventIds` method, which the registered moderation stage already awaits. Its first call containing `original` waits on an explicit deferred promise; subsequent calls resolve immediately. Moderator policy is no-reports/default, with other moderator methods absent; view-count subscriptions are disabled at the view adapter. App runtime builders provide empty/default runtimes; creator/moderation decorators are identity adapters, impression/similar-content/health-warning effects disabled. No custom engine stage/decorator or fake feed engine is inserted. This establishes registered pipeline and real list/card behavior under a controlled adapter latency, not real moderation relay timing or all navigation code.

The view replacement scenario calls real `VideoListView.destroy`, assigns a new real view, then calls actual `loadFeedVideos(EXPLORE)` which mounts it and changes actual feed telemetry ownership. It does not invoke the full application navigation/router or auth teardown entrypoint.

## Results

1. PASS: valid delayed Recent pipeline resolves and renders original+unrelated cards. Pending valid work is not categorically discarded.
2. FAIL: Recent pipeline holds before deletion; actual deletion ingestion triggers current subscription refresh and DOM becomes unrelated-only. Releasing older Recent work restores original(deleted:true)+unrelated DOM cards. Expected unrelated-only throughout after current deletion refresh.
3. FAIL: during the same overlap, destroy old view and mount replacement through actual Explore loader. Explore is active and its DOM contains unrelated-only. Releasing previous Recent work renders original(deleted:true)+unrelated into the replacement view; Explore metadata is overwritten by old Recent metadata. Expected unrelated-only and Explore ownership/metadata preserved.
4. PASS: destroy the view and set `videoListView=null`, then release pending pipeline. Actual coordinator does not remount a fully absent view. No claim of a full-app destroy lifecycle test.

The earlier buffer/service fixes do not prevent a source snapshot already captured by an asynchronous registered pipeline from passing deleted objects to the presentation boundary after later deletion. Service current active/cache snapshots remain corrected; coordinator lifecycle/late-result application is a distinct boundary.

## Fixture development failures retained

- Initial JSDOM run lacked the global `HTMLElement` constructor required by actual `VideoCard`:4 errors, no product conclusion. Added scoped constructor from this JSDOM instance, restored in teardown.
- Next attempt deferred timestamp-history IO, but all four scenarios cancelled waiting for an unreachable signal. Measured real `getKnownVideoPostedAt` returns converted `nip71Source.created_at`; no history request occurs. Debug script `/tmp/storage3-registered-view-debug.mjs` records this. Replaced the unreachable wait with the actual awaited moderation subscription adapter boundary; no timestamp fields were deleted or corrupted to force a path.
- Final four scenarios above exit naturally with strict failures and passing controls. No sleeps, retries, force exits, timeouts, assertion relaxation or product changes.

## Proposed next scope (not authorized implementation)

Coordinator should validate freshness/view ownership before applying async results, and validate latest deletion eligibility before passing results or fallback snapshots to a view. New retained regression should exercise the actual registered path, include live/current/error fallback/disposal and cross-view controls, and reject the original coordinator. A request counter alone must not authorize older work to populate a replacement view or discard unrelated current feed work. Exact ownership and semantics require dispatch routing before any coordinator/app changes.

Native browser/full-app router/manual view switching, real moderation/signature/relay timing and complete auth disposal remain unverified. Existing buffer/service candidate remains the first READY gate; its full/build/normal submission slot is still pending.
