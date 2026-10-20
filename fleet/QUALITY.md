# Quality evidence and next milestones

Updated2026-10-20. Owner stopping milestone:"Ready for me to review and test locally"(relayed). Finish storage2/history6,faithful actual-app baseline and integrated preview/handoff;stop new optional work for review. Broader robustness backlog remains. This is a local qualification matrix,not a production-ready declaration.

| Area | Current local evidence | Next bounded work | Still unverified / release gate |
|---|---|---|---|
| Feed/load/navigation | Existing client tombstone/buffer guards and broad428-file normal gate; current CRUD spec includes delete-modal/cancel coverage | Feed/view tombstone gap deferred as storage-cors-3 behind latest storage safety priority, TODO1 seed→delete→stale refresh scenario | Full app/feed behavior and documented parallel Firefox hydration flakes; live zombie reports |
| Playback/fallback/magnets | Queued torrent/URL lifecycle fixes7d20a509/89ccb907; mirror guard0bd0b1c3; independent URL18 scenarios. QA actual coordinator/service scratch4 and local Chromium/Firefox3 each, literal hash/webseed checks | Retained QA1 landed1bb3a4fc;dispatch independently4/4,normal gate429 files | Actual WebTorrent/live peers; full-app fallback; local decoded mirror/substituted torrent does not prove real torrent |
| Profile/session/history | Real profile-history wiring regression landed b3fab032, closure386cc60e; normal431-file gate exit0, focused38/38,5 rejected mutants; dispatch independently new3/3 | Complete; current behavior passed, regression protects historical no-op | Amber NIP46 identity/switch/logout across refresh, real signers; KNOWN_ISSUES isolated logout UI failure |
| Storage/upload safety | CORS preservation d3f4c215 and malformed cached metadata guard e7b9afb3/closurec5818cfe; dispatch independent9 CORS+13 cleanup scenarios; worker430-file gate/24 focused/7 mutants | Complete within bounded contract; generic S3 shares deletion service, no counterpart invented | Live bucket/IAM/provider serialization; concurrent read-modify-write has no CAS; no credentials/cloud writes tested |
| Mobile usability | Actual integrated app boot with genuine cached Buffer; owned media actual HEAD/GET/Range checks pass,0local404/pageerrors | QA2 measured hard cold-feed notification blocker:eligible/cache3→DOM0 despite connectedview; client7 method-only regression/fix routed. Original core/mobile flows pending after fix; driver mistakes preserved separately | Real-device/manual accessibility and UX; visual baselines remain CI-canonical |
| Trustworthy validation | Unchanged normal gate candidate b3fab032 exit0;431 configured files match431 unique retained starts; no shard/quarantine. QA fallback regression1bb3a4fc independently4/4 | Durable gate tail is not a complete process transcript; stdout final marker absent, explicitly disclosed | Full broad E2E/release/manual cross-browser checks; never weaken assertions or treat mocked boundaries as live proof |
| Preview | Preserved localhost3000/node135479; build1834b6a9 from integrated1b3ef49c; build/artifact pass,HTTP200/index byte equality | Runtime/build-input diff0 through client6 closure386cc60e; preserve frozen QA snapshot | Production/live-site state not touched or qualified |

## Milestones

1. Finish prepared trial outputs: two product fixes are durable; retained QA regression is durable1bb3a4fc;next work continues under sustained goal. Report actual timings: implementation parallelism exists, but serialized duplicate full gates and39m57 dispatch wake/checkpoint lag prevent an overall speedup claim.
2. Revalidate high-priority history wiring and storage/delete safety at current HEAD;feed-view deletion gap remains deferred,not cancelled using real wiring plus controlled IO; route only reproduced defects or valuable mutant-proven regressions. No product changes authorized by investigation assignments.
3. Finish faithful local core-flow/mobile baseline and handoff,then IDLE for owner local review. Keep live Amber/cloud/peer/manual release gates and optional backlog separate;route only demonstrated hard local-review blockers.

## Resource and operating limits

Client7 cold-feed hard-blocker actual-service regression/minimalfix now cheapfocused/lint;QA browser resources released16:06:51,retains repro/evidence. Storage IDLE. Full/browser/build successor only after validated-ready grant; no optional work. No expensive competing suite/build/browser. Separate worktrees/branches; no competing product writers or app.js edits. Keep team at dispatch+3 existing workers while useful disjoint tasks exist. Clear inherited NODE_TEST_CONTEXT for CLI launches. Use mailbox/CLI/status recovery, actual send/consume times, no raw pane bodies or unattended-wakeup claim. No push/deploy/spend/real-wallet/production-data/scheduler/credentialed external operations.

## Reconciled Oct2026 upstream playback promises

Read-only origin fetch was performed by interpreter;upstream-only8d4622bb adds12 canonical TODO lines. Dispatch merges that docs-only source non-destructively through normal local queue. These items stay OPEN;static inspection below is not a live reproduction or completion claim. High-priority1/2/4 are explicitly publicly promised in the source.

| Item | Current source/local evidence | Local-review implication |
|---|---|---|
|1 HIGH:RangeGET instead ofHEAD | urlHealthController.probeUrl still fetches HEAD;existing media confirmation fallback also present | Open compatibility report;no new hard local-review blocker demonstrated solely by static search |
|2 HIGH:persist health/per-host score | URL get/store already read/write localStorage;grid torrent health uses in-memory map;per-host score not found in inspected health modules | Partial existing implementation,not whole item done;reload/torrent/per-host promise remains |
|3 parallel hosted/P2P startup | Current service/coordinator has sequential fallback/watchdogs | Not requalified as parallel startup;do not change playback policy in this bounded milestone |
|4 HIGH:hover/viewport warmup | Viewport health probes/preload metadata exist and clean up;retained playback warming not established in inspected feed code | Do not equate probe ahead-of-scroll with fulfilling promised warmup;open |
|5 alternate copies/NIP71/Blossomhash | Retained actual service regression verifies ordered hosted mirror selection;Blossom hash cross-server behavior not qualified | Partially proven mirrors,whole promise stays open |
|6 downrank/hide unknown/timeout | Existing liveness policies present;exact default-feed behavior not revalidated here | Open;no new moderation/ranking product choice |
|7 per-video status/copy | Current coordinator has per-video error/fallback strings;banner/status refresh requirement not fully audited | Open copy/UX followup,not claimed complete |
|8 SW shell/thumbnails | Existing service-worker app/image caches present | Repeat-visit/offline production behavior not qualified;BufferCDN remains baseline prep constraint |

No demonstrated new hard local-review blocker yet from the added reports. QA actual-app second pass may reveal one;report before calling milestone ready. Include these remaining promises and real Amber/cloud/live peers/manual release gates in handoff.
