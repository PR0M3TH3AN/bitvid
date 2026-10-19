# TODO — what each area did NOT finish

## dispatch

- 2026-10-19 checkpoint: reviewed dbdac18d/6da037f5, independently verified profile-modal27/27 in2.46s and isolated race assertion62ms/process timeout10s. Routed client-reliability-2 to the existing worker for one-test harness cleanup. Preserve separate commits and normal full gates; no preview rebuild before verified landing.

- 2026-10-19: dispatch-1 startup goal and one-worker proposal landed at fa538097; preparation complete. Baseline at d9059116: lint 11/11, unit run completed 219 files before profile-modal suite timed out at 60s; isolated unrestricted rerun reproduced timeout; 205 files remain untested. fleet/TEAM-PROPOSAL.md proposes one client-reliability worker for this blocker, with queued torrent-probe lifetime as a later candidate. Await first-worker approval before adding/launching it. No product edits or workers started.

- 2026-10-19: dispatch-2: first worker approved through desktop-chat relay, routine local work authorized within GOAL. Roster landed at 9e6c310d and client-reliability worker launched in its own tmux window (pid 138193); fleet-bitvid:preview on port 3000 preserved (HTTP 200). Next: monitor blocker/fix evidence, normal landings, and refresh preview after verified product changes. A clean NODE_TEST_CONTEXT-free isolated reproduction also timed out at 60s; one-time roster-only validation is recorded in PROGRAM.md. No product fixes landed yet.

## client-reliability

- 2026-10-19: client-reliability-1 assigned: reproduce/classify and fix profile-modal suite hang without weakening assertions. Initial evidence: three isolated 60s timeouts (one clean environment), full baseline stopped at file 220/425; read docs/agents/prompts/client-reliability.md and claim the item. Scope excludes app.js and unrelated subsystems.

- 2026-10-19: client-reliability-1 fix committed at dbdac18d (test-only fixture, original assertions preserved; native focus contract and both mutants fail when broken). Isolated27/27 natural exit2.44s, lint11/11. Full60s/file run passed226/425 files including profile-modal; file227 tests/race/nostr-client-init-race.test.mjs timed out;198 later files untested. Await dispatch routing for this unowned blocker before normal landing/close. No product/browser/build qualification or landing claimed. See test_logs/TEST_LOG_2026-10-19_20-13-00_client-reliability-final.md.

- 2026-10-19: client-reliability-1 and client-reliability-2 ready for normal landing at181eae95: profile27/27 and race1/1 natural exit; all425 unit files passed with60s/file bound; lint11/11. Four deliberately broken variants fail and are reverted. Dispatch routing unblocked the second item; no product Nostr/shared-runner changes. Remaining: durable normal queue landing, unstable verification, then backlog close. Browser/build and real IO unverified (test-only scope). See test_logs/TEST_LOG_2026-10-19_20-35-00_client-reliability-both.md.
