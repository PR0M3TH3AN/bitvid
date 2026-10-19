# Fleet log

## 2026-10-19 — Initial startup

- Owner goal recorded: TODO backlog progress, bug fixes, robustness and usability. Startup SHA d9059116.
- Installed 441 locked packages. Lint passed all 11 checks; initial sandbox git-grep EPERM resolved by an unrestricted rerun.
- Full bounded unit baseline: exit 1; 219 files completed, profile-modal controller timed out at 60s, 205 files untested. Isolated unrestricted rerun: same timeout (exit 1). Cause unclassified; no full-suite pass claimed.
- Proposed one Codex client-reliability worker to diagnose/fix the profile-modal hang without weakening assertions or masking it with forced exits. The queued torrent-probe lifetime issue from TODO #34 is a subsequent unassigned candidate.
- Open GitHub PRs: 0; local landing queue initially 0. No workers, roster additions, product edits, or schedules started.
- Needs owner: approval of the concrete first-worker proposal in TEAM-PROPOSAL.md. Browser, Amber, live-site, and remaining unit files unverified.

- Startup documentation landed as fa538097 (land_status=landed; confirmed by git log unstable). Dispatch branch fast-forwarded to that landing; git diff --check passed and tree clean. dispatch-1 preparation complete; first-worker approval remains pending. Documentation-only landing does not qualify client behavior.

## 2026-10-19 — Approved first worker setup

- Received desktop-chat relay of owner quote "yes please approve whatever it wants and let me know about it" and explicit scoped authority for routine staffing, fixes, tests/builds, backlog priorities, and local unstable landings. Provenance recorded; not represented as human terminal input. Existing deploy/spending/production-data/wallet/scheduler limits retained.
- One client-reliability Codex worker registered, focused on client-reliability-1 profile-modal hang. No other workers. Preview confirmed in fleet-bitvid:preview, built dist at 127.0.0.1:3000; preserve its process.
- Clean-env isolated profile-modal run reproduced the 60s timeout (exit 1). Bootstrap roster-only gate exception recorded to avoid requiring a hang fix before its assigned worker can launch; product/test/persistent-gate changes forbidden in this exception.

- Launch verified: fleet status reports client-reliability running pid 138193; tmux pane shows it reading rules/backlog. Team: 2 agents total, 1 worker. Roster landed at 9e6c310d (durable landed state and git log unstable). Exact bootstrap validator passed for 13 files, product/tests/persistent gate settings unchanged; normal configuration remains active for future landings. Owner launch update sent.
- Preview check: HTTP 200 at http://127.0.0.1:3000; existing built-dist process preserved. No product changes to rebuild yet. No scheduler or additional worker activation.

## 2026-10-19: Profile-modal progress and bounded follow-up

- Reviewed dbdac18d and 6da037f5: test-only computed-style fixture optimization plus native-style focus contract. All 26 original scenarios retain assertions, one contract added; product/fixture mutants fail per committed evidence. No browser defect established. Dispatch independently ran 27/27 in2.46s (exit0); worker lint11/11.
- Full worker run: 226 file exits passed, race suite retained relay work after its assertion passed; 198 files untested. Dispatch isolated reproduction: assertion passed62ms, process timeout10s/exit124. No client fixes submitted or landed.
- Assigned client-reliability-2 to same single worker: temporary ownership of one race test and regression/integrity notes. No Nostr product/global runner scope; preserve assertions, hermetic IO and natural exit, then normal full gates. No additional worker. Preview stays on verified unstable.

## 2026-10-19: Verified landings and next client-facing task

- Durable land_status confirms normal-gate landing de6918ce and closure f9adfc8f; both backlog items done. Inspected queue result: configured install+full npm test gate exit0. Worker recorded425/425 files and lint11/11; dispatch synced to f9adfc8f and independently ran profile27/27 in2.46s, race1/1 with natural15ms total exit, and lint11/11.
- Next task client-reliability-3 assigned to same one worker: actual five-card attachHealthBadges/observer lifecycle reproduces one queued obsolete torrent probe starting after disposal and DOM removal (expected0). Deferred probe boundary only, no real network; script exit1 at intended assertion. Scope: queued ownership, shared live-owner preservation, cache/inflight correctness and hidden-card reveal; active/URL probes excluded.
- Coordination review: implementation/validation/normal landing worked. Dispatch did not resume when worker finished; operator supplied this checkpoint. No unread completion message was present. The file-mailbox adapter only writes files and has no wake hook. Require worker completion/landing mailbox reports, but these still need an actual foreground turn/tmux input to resume dispatch. Unattended monitoring is not qualified.
- Repeated friction / suggested future kit addition: event-driven dispatch wakeup on completion, with durable delivery/consumption evidence. Not implemented here; no scheduler or kit modifications authorized by this checkpoint.
- Team remains2 agents including dispatch,1 worker. Owner outcome/reproduction event sent. Preview source has no product diff across landed test-only fixes; local build refresh is running without restarting the existing server.

- Reporting diagnosis: fleet resumePrompt says "Report to the session manager only if blocked", which explains the absent completion event. The next explicit tmux assignment will override that reporting instruction for landing/final completion without changing kit code. Delivery still does not wake dispatch; a separate operator turn remains necessary while dispatch is idle.
- Preview refresh: npm run build exit0, deployment-artifact verification passed. Existing server process preserved; HTTP health check follows.
