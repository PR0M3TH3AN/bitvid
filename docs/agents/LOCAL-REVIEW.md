# Local review handoff — 2026-10-20

Status: ready for owner local review with the known minor Upload overflow below. Workers stop optional work for review. No optional work starts before owner review.

Open [the existing local preview](http://127.0.0.1:3000). It is already running; no terminal command is needed. Preview server node135479 belongs to dispatch and serves built `dist`. Build6da89895 was produced from integrated unstableb1174163, including the cold-feed fix. HTTP200 and byte equality of served and built index were verified; runtime equality for final documentation descendants will be checked before handoff. Dispatch branch is area/dispatch. Final documentation landing SHA is reported in the owner handoff; runtime/build-input equality through QA closurec017069c was verified without rebuilding.

## Changes available to review

- Disposed feed owners no longer start obsolete queued torrent/URL media probes; an active failed media probe also cannot start an orphan mirror HEAD. Shared owners and active work retain existing semantics.
- Fresh relay video updates now notify the current feed consumer, so a cold empty feed can render newly arrived eligible videos. Obsolete subscription callbacks cannot update a replacement feed.
- Bucket CORS updates preserve existing rules and append only missing origin coverage. Unexpected reads cannot overwrite policy.
- Storage cleanup safely skips malformed cached primitive fields rather than rejecting; R2 and generic S3 deletion share this service. Ownership boundaries remain enforced.
- Actual playback fallback/magnet behavior and actual profile-history removal wiring now have regression coverage. The history behavior already worked; the new test catches the historical no-op implementation.

## Evidence

Latest unchanged normal gate candidate b1174163 completed successfully across432 configured test files, with empty quarantine and no shard. Durable landing and submitted ancestry were checked independently. Retained runner output contains432 unique starts; the stored gate result is a tail, not a complete install/process transcript, and its final stdout marker is absent. No suite or gate was weakened.

Dispatch independently checked URL lifecycle18/18, CORS9/9, fallback4/4, malformed cleanup13/13, new real history wiring3/3, and cold-feed current-consumer notification7/7. Workers also recorded failing restored mutants, focused suites, lint11 stages, and normal full gates. [History evidence](../../test_logs/TEST_LOG_2026-10-20_15-41-00_client-reliability-6-landed.md) and [dispatch evidence](../../test_logs/TEST_LOG_2026-10-20_15-45-00_dispatch-review.md) retain exact scope.

Actual-app reproduction: cold Trending starts from an empty cache, receives three valid eligible local video events, and retains an empty DOM. Passive trace proves relay EVENT/EOSE, all client/app maps and filtered videos contain3, while view remainsEMPTY. Client7 fix landedb1174163 with active-consumer and stale-callback lifecycle controls plus regression coverage. The rebuilt artifact6da89895 renders all three cold-feed cards without a forced refresh. The controlled browser uses genuine cached Buffer and a genuine local VP8 fixture outside immutable app files, synthetic identity/notes and local mock relays. This does not qualify real signers, public relays or deployed CDN behavior.

## Actual-app baseline and known finding

Controlled Chromium154 on immutable build6da89895 completed Trending/Explore/ForYou/Home navigation, three-card hydration, synthetic login, Profile and Upload open/close, six Tab steps contained in each modal, exact trigger focus restoration, missing-title and missing-source validation, and no video publish from invalid forms at360×800,390×844 and1280×720. Feed cards/document fit those viewports. Genuine cached Buffer, real toolkit signature checks and local VP8 were used; public HTTP/WebSocket traffic was denied, with no page errors or local asset failures in these final runs.

The original strict baseline stopped on Upload horizontal document overflow. It remains FAILED/open: document width362 at360px and394 at390px; no overflow at1280. Targeted follow-on coverage completed independently; critical inputs, Publish and Close remain horizontally inside the viewport and close restores focus. This is not a wholly passing baseline. Exact overflowing source element is not yet established; no speculative CSS fix was made. Some measured controls are below44px; real-device usability/accessibility review remains open.

The browser, private app/relay servers and temporary dependency link were closed after the follow-on run at16:28:10.112UTC. The owner preview on3000 remains running.

See [QA evidence and screenshots](../testing/playback-qa-2-final-evidence.md) for exact final and follow-on results, preserved failures and fixture provenance.

## Suggested review in the browser

1. At desktop and narrow mobile widths, browse Trending/Explore/For You, open and close Profile and Upload, and check keyboard focus and horizontal scrolling.
2. In Upload external mode, check missing title and missing playable source errors. Avoid publishing or using real bucket credentials during this local review.
3. Check playback source/fallback messaging with content you intend to test. Controlled fallback tests do not establish live torrent availability.
4. Check history removal/clear and reload behavior using the account/signing workflow you intend to qualify; real account evidence is still open.

## Remaining scope

Real Amber/NIP46 account/switch/logout, encrypted relay persistence, live storage/IAM/provider behavior and concurrent CORS writes, real WebTorrent peers, production service-worker/offline/CDN behavior, real devices and manual release QA remain unverified. Known parallel Firefox hydration and isolated logout issues remain documented in KNOWN_ISSUES.md.

Feed/view tombstone audit remains deferred as storage-cors-3. Public-promised playback backlog remains open: RangeGET health compatibility, persistence/per-host scoring, parallel startup, hover/viewport warmup, complete mirror/Blossom discovery, ranking/status and service-worker followups. Partial existing implementations are not whole-item completion. See [quality matrix](../../fleet/QUALITY.md).

This milestone is local review/testing, not production readiness or completion of the broader roadmap. Workers idle after evidence closure; no push, deploy, spend, real cloud/account/peer operation or scheduler activation was performed.
