# storage-cors-3: offline tombstone investigation

- Baseline SHA: `c5b678f7c9d0b92fbf786b16ae831f1be1d0b899` (own clean branch fast-forwarded from `6609269e`). Item filed at `7f99c0456931c917082d6a6680c79655221dcc82`; current paths still exhibit the gap.
- Start: 2026-10-22T14:08:34Z. First reproduction completed by 14:11:03Z. No browser/gate wait; one Git metadata sandbox denial resolved by approved ff-only escalation.
- Routing: dispatch message 20261022T140749; current campaign/rules permit investigation and unique evidence only. No product or retained test changes.
- Reproducer: `/tmp/bitvid-storage-cors-3-audit.mjs`.
- Command: `env -u NODE_TEST_CONTEXT node /tmp/bitvid-storage-cors-3-audit.mjs`.
- Result: natural exit 1; 7 scenarios, 3 pass, 4 fail, 0 cancelled/skipped. Every fixture asserts zero attempted fetch/WebSocket calls.

## Real execution and virtualized boundaries

Real `NostrClient.subscribeVideos` creates the real `VideoEventBuffer`; a fake subscription-manager transport supplies synthetic kind-30078 events and explicit EOSE. Real conversion, root timestamps, tombstones, active/history maps, `NostrService.loadVideos`, filtering, notifications, service map, and filtered localStorage persistence execute. Synthetic verification accepts fixture IDs; unrelated NIP-71 metadata hydration and client IndexedDB scheduling are stubbed IO boundaries. No signer, relay, cloud, storage delete, browser, build or full suite runs.

The stale-refresh scenario also executes actual feed engine, active source and coordinator `refreshFeed`. A controlled deferred decorator holds one completed source snapshot while a second refresh finishes. `renderVideoList` is captured at the presentation boundary; actual DOM/card rendering and the entire registered production stage pipeline are not exercised.

## Passing controls

1. Live original at t100 and unrelated root at t110 populate active state and service notifications.
2. Tombstone t200 followed by late nondeleted t90 leaves target absent from active map and actual active feed source; older stored event is marked deleted; unrelated remains.
3. Tombstone t200 followed by live same-root t300 allows the newer content under existing timestamp semantics.

## Strict failures

1. **Service snapshot/persistence:** original t100 followed by tombstone t200 correctly removes original from client active map. Service removes only the tombstone event ID, leaving original ID in service map. Callback and persisted filtered list contain `original` with `deleted:true` plus unrelated. Expected only unrelated.
2. **Reload/view consumer replacement:** another `loadVideos` emits `persistent-cache` containing original(deleted:true), then emits correct active cache containing unrelated only. Expected no deleted target in either notification. `shouldIncludeVideo` does not reject deleted entries.
3. **Newer live content loss:** live t300 then late tombstone t200 leaves newer history object `deleted:false`, but removes it from active map. `recordTombstone` correctly preserves newer state; `VideoEventBuffer` subsequently unconditionally deletes the active key for a deletion marker. Expected newer and unrelated remain; actual unrelated only.
4. **Stale refresh:** older run captures original/unrelated; delete arrives; newer refresh renders unrelated; release older run and it renders original(deleted:true)/unrelated last. Expected unrelated only. Coordinator applies async run results without checking current refresh/view ownership or deletion state.

`VideoListView.render` source inspection at lines353–410 shows filtering for NSFW/private, with no deleted guard. This is source evidence, not browser/DOM qualification.

## Proposed routing, not implementation

- `js/nostr/videoEventBuffer.js`: preserve live active entries newer than a deletion marker, keeping existing timestamp guard semantics.
- `js/services/nostrService.js`: prevent deleted/tombstone-covered entries in public feed snapshots and optimistic persistence notifications, prune affected stale service entries rather than relying on matching tombstone event IDs. Preserve unrelated and strictly newer live content.
- `js/app/feedCoordinator.js`: investigate smallest refresh/view ownership and final eligibility guard before rendering stale results; do not assume a same-feed request counter alone covers delayed cross-view work.
- New unique retained integration regression after routing, with actual ingest/service and coordinator controls; old implementation must fail. No existing assertions changed.

Dispatch received reproduction/script/counts and proposed scopes at14:11:18Z. Await independent reproduction and precise ownership routing before product/test edits. Full registered pipeline, DOM/browser view switching, equal-timestamp edge cases, legacy d-tag fallback, real signature verification, NIP-09 kind5 ingest, restart persistence/IndexedDB, public relay/cloud behavior remain unverified. These findings concern existing kind30078 soft-delete markers; they do not establish additional deletion policy.

## Invocation limitation retained

An initial `env -u NODE_TEST_CONTEXT node --test /tmp/bitvid-storage-cors-3-audit.mjs` returned only a child-file failure (exit1, no scenario output). The direct Node invocation above exposes all seven scenarios naturally. No runner/gate configuration changed and the opaque wrapper result is not counted as product evidence.
