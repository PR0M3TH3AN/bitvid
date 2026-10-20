# Quality evidence and next milestones

Updated2026-10-20. Goal: improve robustness/usability against pre-launch TODO and KNOWN_ISSUES. This is a local qualification matrix, not a project-ready/release declaration.

| Area | Current local evidence | Next bounded work | Still unverified / release gate |
|---|---|---|---|
| Feed/load/navigation | Existing client tombstone/buffer guards and broad428-file normal gate; current CRUD spec includes delete-modal/cancel coverage | storage-cors-2 temporary read-only feed/view tombstone coverage audit, TODO1 seed→delete→stale refresh scenario | Full app/feed behavior and documented parallel Firefox hydration flakes; live zombie reports |
| Playback/fallback/magnets | Queued torrent/URL lifecycle fixes7d20a509/89ccb907; mirror guard0bd0b1c3; independent URL18 scenarios. QA actual coordinator/service scratch4 and local Chromium/Firefox3 each, literal hash/webseed checks | playback-qa-1 retained regression full/normal landing currently active | Actual WebTorrent/live peers; full-app fallback; local decoded mirror/substituted torrent does not prove real torrent |
| Profile/session/history | Profile fixture hang fixedde6918ce;27 focused historical scenarios and current broad suite. History lazy-init test injects fake renderer | client-reliability-6 read-only actual history removal wiring audit, TODO2 regression gap | Amber NIP46 identity/switch/logout across refresh, real signers; KNOWN_ISSUES isolated logout UI failure |
| Storage/upload safety | CORS productd3f4c215,closure7f99c045; independent9 CORS scenarios,worker focused13/10mutants/full428/lint/build; content-addressed/cleanup safeguards documented | Complete CORS evidence/current integration; follow bounded caller/provider issues only if reproduced | Live bucket/IAM/provider serialization; concurrent read-modify-write has no CAS; no credentials/cloud writes tested |
| Mobile usability | No fresh local mobile flow/visual qualification from trial | After current investigations, select bounded viewport navigation/modal/card smoke from TODO7; inspect before redesign | Real-device/manual accessibility and UX; visual baselines remain CI-canonical |
| Trustworthy validation | Unchanged normal gates and restored failing mutants; latest product gate428 files. QA new regression full run in progress | Finish QA gate; retain exact counts, ancestry, fixture boundaries, failed mutants and Known Issues classification | Full broad E2E/release/manual cross-browser checks; never weaken assertions or treat mocked boundaries as live proof |
| Preview | Preserved localhost3000,storage integrated7f99c045; build/artifact pass,HTTP200/index matches dist | Refresh after each verified product landing; QA is test-only so inspect product delta before rebuilding | Production/live-site state not touched or qualified |

## Milestones

1. Finish prepared trial outputs: two product fixes are durable; retained QA regression still needs full/normal landing. Report actual timings: implementation parallelism exists, but serialized duplicate full gates and39m57 dispatch wake/checkpoint lag prevent an overall speedup claim.
2. Revalidate high-priority history and feed deletion gaps at current HEAD using real wiring plus controlled IO; route only reproduced defects or valuable mutant-proven regressions. No product changes authorized by investigation assignments.
3. Establish fresh local core-flow/mobile baseline after those checks; keep live Amber/cloud/peer/manual release gates separate. Continue useful bounded work under existing authority; surface substantive blockers/owner product choices instead of inventing features or keeping agents busy.

## Resource and operating limits

QA currently owns full/normal gate; other investigations may use cheap focused local checks, no expensive full suite/build/browser without dispatch slot. Separate worktrees/branches; no competing product writers or app.js edits. Keep team at dispatch+3 existing workers while useful disjoint tasks exist. Clear inherited NODE_TEST_CONTEXT for CLI launches. Use mailbox/CLI/status recovery, actual send/consume times, no raw pane bodies or unattended-wakeup claim. No push/deploy/spend/real-wallet/production-data/scheduler/credentialed external operations.
