# Quality evidence and next milestones

Updated2026-10-20. Owner stopping milestone:"Ready for me to review and test locally"(relayed). Finish storage2/history6,faithful actual-app baseline and integrated preview/handoff;stop new optional work for review. Broader robustness backlog remains. This is a local qualification matrix,not a production-ready declaration.

| Area | Current local evidence | Next bounded work | Still unverified / release gate |
|---|---|---|---|
| Feed/load/navigation | Existing client tombstone/buffer guards and broad428-file normal gate; current CRUD spec includes delete-modal/cancel coverage | Feed/view tombstone gap deferred as storage-cors-3 behind latest storage safety priority, TODO1 seed→delete→stale refresh scenario | Full app/feed behavior and documented parallel Firefox hydration flakes; live zombie reports |
| Playback/fallback/magnets | Queued torrent/URL lifecycle fixes7d20a509/89ccb907; mirror guard0bd0b1c3; independent URL18 scenarios. QA actual coordinator/service scratch4 and local Chromium/Firefox3 each, literal hash/webseed checks | Retained QA1 landed1bb3a4fc;dispatch independently4/4,normal gate429 files | Actual WebTorrent/live peers; full-app fallback; local decoded mirror/substituted torrent does not prove real torrent |
| Profile/session/history | Profile fixture hang fixedde6918ce;27 focused historical scenarios and current broad suite. History lazy-init test injects fake renderer | client-reliability-6 test-only real wiring regression after current pass/historical-noop failure, TODO2 regression gap | Amber NIP46 identity/switch/logout across refresh, real signers; KNOWN_ISSUES isolated logout UI failure |
| Storage/upload safety | CORS productd3f4c215,closure7f99c045; independent9 CORS scenarios,worker focused13/10mutants/full428/lint/build; content-addressed/cleanup safeguards documented | storage-cors-2 narrow metadata no-throw guard after2 reproduced rejects/6controls | Live bucket/IAM/provider serialization; concurrent read-modify-write has no CAS; no credentials/cloud writes tested |
| Mobile usability | No fresh local mobile flow/visual qualification from trial | QA2 first360pass BLOCKED:static genuineBufferCDN guard+missing generatedCSS,remainingflows unverified. Genuinecached pinned mirror+verified builtartifact prep ready;secondpass afterstorage2 integration,no UI edits | Real-device/manual accessibility and UX; visual baselines remain CI-canonical |
| Trustworthy validation | Unchanged normal gates and restored failing mutants; latest product gate428 files. QA retained regression429-file diagnostic+normal gate passed1bb3a4fc | Retain exact counts, ancestry, fixture boundaries, failed mutants and Known Issues classification | Full broad E2E/release/manual cross-browser checks; never weaken assertions or treat mocked boundaries as live proof |
| Preview | Preserved localhost3000,storage integrated7f99c045; build/artifact pass,HTTP200/index matches dist | Refresh after each verified product landing; QA is test-only so inspect product delta before rebuilding | Production/live-site state not touched or qualified |

## Milestones

1. Finish prepared trial outputs: two product fixes are durable; retained QA regression is durable1bb3a4fc;next work continues under sustained goal. Report actual timings: implementation parallelism exists, but serialized duplicate full gates and39m57 dispatch wake/checkpoint lag prevent an overall speedup claim.
2. Revalidate high-priority history wiring and storage/delete safety at current HEAD;feed-view deletion gap remains deferred,not cancelled using real wiring plus controlled IO; route only reproduced defects or valuable mutant-proven regressions. No product changes authorized by investigation assignments.
3. Establish fresh local core-flow/mobile baseline after those checks; keep live Amber/cloud/peer/manual release gates separate. Continue useful bounded work under existing authority; surface substantive blockers/owner product choices instead of inventing features or keeping agents busy.

## Resource and operating limits

QA currently owns full/normal gate; other investigations may use cheap focused local checks, no expensive full suite/build/browser without dispatch slot. Separate worktrees/branches; no competing product writers or app.js edits. Keep team at dispatch+3 existing workers while useful disjoint tasks exist. Clear inherited NODE_TEST_CONTEXT for CLI launches. Use mailbox/CLI/status recovery, actual send/consume times, no raw pane bodies or unattended-wakeup claim. No push/deploy/spend/real-wallet/production-data/scheduler/credentialed external operations.

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
