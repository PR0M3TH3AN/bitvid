# Proposed first team — 2026-10-19

Status: awaiting owner approval. No worker area registered or launched.

## Team

- dispatch: triage TODOs, verify evidence and landings, keep the team small; no product code.
- client-reliability: one Codex worker on the configured project-default model. First item: diagnose and fix the profile-modal suite hang that prevents a complete validation baseline, then return to one bounded client bug at a time.

## First item: restore meaningful profile-modal validation

Evidence at d9059116:

- Full unit baseline with `UNIT_TEST_TIMEOUT_MS=60000 npm test`: exit 1. 219 files completed with exit 0; file 220, tests/profile-modal-controller.test.mjs, timed out after 60s. 205 files were not reached.
- Isolated rerun outside the sandbox, same runner/filter and 60s bound: exit 1, same timeout. This is reproducible outside the sandbox, but its cause is unclassified.
- Isolated output last starts the show()/hide() focus/wallet scenario; use readable reporter output to identify the blocked await or retained resources. This clue is not a root-cause claim.
- Lint passed all 11 checks outside the sandbox. Public open PRs: 0; local landing queue initially empty; roster has only dispatch.
- Pre-launch TODO #11 calls for reliable tests; #2 explicitly requests additional profile-pane history wiring coverage. Do not expand into #2 until the first item is complete.

Ownership: tests/profile-modal-controller.test.mjs and narrow profile-modal lifecycle/helper code needed for the diagnosed defect, plus a focused regression and Test Integrity Note. Do not edit js/app.js, global test discovery, unrelated test files, signers, storage credentials, payments, or styling. Request a scope adjustment if the evidence points elsewhere.

Done:

1. Classify the hang as client behavior, harness behavior, or resource cleanup; reproduce the real boundary before fixing it.
2. Preserve all assertions and their intended behavior. No retries, extra sleeps, timeout increases, quarantine, deletion, or forced successful exits. Use proper cleanup and deterministic boundary mocks as indicated by evidence.
3. Pin the root cause with a scenario regression and a deliberately broken variant that fails; include the required Test Integrity Note.
4. Run the isolated suite and full unit suite to natural completion, required lint, and relevant build/browser checks if product code changes. Report exact counts and any remaining environmental blockers.
5. Commit with backlog id, merge unstable, check the merged tree, and submit through landq. Close only with durable landed status plus unstable ancestry.

## Next candidate, unassigned

TODO #34 Stage 3: prune obsolete queued torrent source-health work when its last card/grid owner disappears. js/gridHealth.js has no queue ownership/cancellation handle, and observer disposal has no unregister callback for queued probes. A dependency-free probe of its actual ProbeQueue class retained one waiting job and ran it once after the blocker released; cancellation API was absent. This demonstrates queue behavior, not browser CPU or an end-to-end navigation reproduction. Preserve shared live-card checks, priority, deduplication, concurrency limits, and hidden-card reveal. Reassess after the validation gate is usable.

## Boundaries

No deploys, spending, production data, real-wallet operations, or schedules. Older backlog fixes awaiting real-phone/Amber or live-site evidence remain open. No additional workers proposed now.
