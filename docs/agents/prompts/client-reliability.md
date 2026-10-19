# Area: Client reliability (client-reliability)

## Current assignment: client-reliability-3

Improve robustness/usability with one bounded client-facing fix from pre-launch TODO #34 Stage3: cancel queued torrent health probes when the last card/feed owner is disposed. Prior items1 and2 are done, normally landed at de6918ce and closed at f9adfc8f (425/425 unit files, lint11/11). Do not redo them.

## Current evidence

At f9adfc8f, dispatch ran /tmp/bitvid-dispatch-obsolete-probe-scenario.mjs. It imports actual gridHealth.js and torrentClient, uses real DOM cards and attachHealthBadges with a controllable IntersectionObserver, and replaces only the external probePeers boundary with deferred promises (no live network). Five cards enter: four probes start, one waits. Dispose the returned observer registration, remove feed DOM, then release active probes: one obsolete probe still starts, expected zero. The assertion fails with1!==0. This is stronger than the earlier isolated ProbeQueue class inspection; it is not a browser CPU or real-torrent measurement. Inspect the diagnostic for fixture details and reproduce against your own worktree before editing. Retain a proper regression in the repository.

## Ownership for this item

Temporary explicit ownership: js/gridHealth.js; a small queue/owner helper if needed (prefer js/gridHealthQueue.js); focused lifecycle tests (prefer tests/grid-health-lifecycle.test.mjs); relevant existing grid-health tests and Test Integrity Note; your backlog/evidence/area notes. Existing js/dom/cardObserver.js already exposes onCardUnregister: use that boundary. Report specific evidence before editing that shared module or VideoListView lifecycle.

Do not edit js/app.js, URL-health plumbing, js/webtorrent.js or vendor bundle, active-probe abort behavior, playback/magnet helpers, cache policy/TTLs, concurrency limits, signers, payments, styling, test runner, fleet config, or kit infrastructure. No other worker owns this bounded scope. No subagents needed.

## Plan and done

1. Read current RULE-CHANGES, PROGRAM, RESUME-BRIEF, KNOWN_ISSUES, AGENTS, repo memory and test integrity standard. Merge unstable, claim client-reliability-3, reproduce actual five-card lifecycle before edits, and record started/queued counts.
2. Associate queued work with live card/feed owners. Disposing the last owner prevents the queued probe from starting; discarding one owner must not cancel shared work needed by a live card. Leave already-active probe behavior unchanged.
3. Preserve deduplication, priority and current concurrency (four), healthy/negative TTLs, valid magnet bytes and WSS policy. Cancelled jobs must settle without creating unhealthy cache entries or deleting newer inflight entries. Later live cards must be able to request the same source. Disposed registrations must not receive stale UI effects.
4. Test actual observer/queue/probe boundaries: last-owner disposal, two owners sharing a queued source, re-request after cancellation, concurrency/priority preservation, and a healthy hidden-card reveal path. Use controlled probes and no public relay/torrent traffic. Kill a deliberately broken variant for each new scenario or explain grouped mutant coverage; include integrity notes. No arbitrary sleeps/retries/relaxed assertions.
5. Run focused suites, full npm test with the existing60s/file diagnostic bound, npm run lint, npm run build, and a local browser lifecycle/health smoke where available. This is product code: report browser/source-fallback verification and any gap honestly. Reserve the shared browser in .task. No CPU improvement claim without measurement; this item measures obsolete starts, not the entire performance plan.
6. Commit with client-reliability-3, merge unstable (never rebase), verify merged tree, submit through unchanged normal landq, verify durable landed status and unstable ancestry, then close item. Route new out-of-scope failures to dispatch; do not weaken gates or broaden automatically.

## Completion handoff and operating limits

Send a dispatch mailbox event when blocked, when code lands, and at final completion, including SHA, exact checks/counts, unverified behavior and next step. The generated startup message said to report only when blocked; the new assignment explicitly replaces that reporting instruction with landing/final-completion events as well. The previous completion left no unread dispatch event. File-mailbox delivery only records a message: it does not start a Codex turn or wake idle dispatch. The operator currently supplies the new turn/tmux input; do not claim unattended monitoring. No scheduler or kit changes in this task. No additional work after this item without routing.

Owner routine-work delegation was relayed from Codex desktop chat and recorded with provenance in PROGRAM. No deploys, spending, production data, real-wallet operations, or schedulers. Preserve fleet-bitvid:preview at http://127.0.0.1:3000; dispatch syncs and rebuilds after verified product changes land. Keep .task current, communicate directly via mailbox, and disclose tool/permission blockers without bypassing controls.
