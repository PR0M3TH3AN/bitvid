# TODO — what each area did NOT finish

## dispatch

- 2026-10-19: dispatch-1 startup goal and one-worker proposal landed at fa538097; preparation complete. Baseline at d9059116: lint 11/11, unit run completed 219 files before profile-modal suite timed out at 60s; isolated unrestricted rerun reproduced timeout; 205 files remain untested. fleet/TEAM-PROPOSAL.md proposes one client-reliability worker for this blocker, with queued torrent-probe lifetime as a later candidate. Await first-worker approval before adding/launching it. No product edits or workers started.

- 2026-10-19: dispatch-2: first worker approved through desktop-chat relay, routine local work authorized within GOAL. Prepare/land client-reliability roster and launch through tmux, preserving fleet-bitvid:preview on port 3000. A clean NODE_TEST_CONTEXT-free isolated reproduction also timed out at 60s; one-time roster-only validation is recorded in PROGRAM.md. No product fixes landed yet.

## client-reliability

- 2026-10-19: client-reliability-1 assigned: reproduce/classify and fix profile-modal suite hang without weakening assertions. Initial evidence: two isolated 60s timeouts (one clean environment), full baseline stopped at file 220/425; read docs/agents/prompts/client-reliability.md and claim the item. Scope excludes app.js and unrelated subsystems.
