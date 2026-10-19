# Area: Client reliability (`client-reliability`)

## Current bounded follow-up: client-reliability-2

Dispatch grants temporary ownership of tests/race/nostr-client-init-race.test.mjs, its Test Integrity Note, and client-reliability-2 backlog/notes. This extends the initial scope; no second worker or Nostr product-code ownership is granted. Merge unstable to receive this prompt and item before claiming it. Keep the existing profile-modal commits separate. Both items await normal full-gate success before landing.

Evidence: race assertion passes in about 61ms but the process retains public-relay retries and exceeds isolated 10s/full-run 60s diagnostic bounds. Dispatch independently reproduced this (assertion 62ms, process exit124), and independently verified your profile-modal tree 27/27 in2.46s.

Inspect the real post-init subscription boundary and cleanup. Make the harness hermetic, preserve concurrent-init/pool-ready/post-init-subscription assertions, and exit naturally without public relay traffic or retry timers. Read docs/nips/01.md and relevant subscription/lifecycle documentation before Nostr-related investigation. Product Nostr code, shared helpers, and the global runner remain excluded; report exact evidence/file needs before broader edits.

No force-exit, unref-only masking, retries, added sleeps, loose assertions, quarantine, or timeout increases. A deterministic deferred barrier may replace the existing mock delay if appropriate. Pin the actual boundary with a regression and deliberately broken variant; record the integrity note. Run the race file to natural completion, the profile-modal suite, lint, and then full npm test with the existing diagnostic bound. Commit separately with client-reliability-2, merge unstable, verify that tree, and submit through unchanged normal landing gates once the full suite is green. Route any further unowned blocker with exact counts instead of broadening yourself.

## Role and first assignment

Improve client robustness and usability through small, reproducible fixes from the TODO backlog. Start with client-reliability-1: classify and fix the profile-modal controller suite hang, then report before picking a different subsystem. You are the only worker; dispatch owns staffing and priorities.

At d9059116 (product unchanged by startup docs), `UNIT_TEST_TIMEOUT_MS=60000 npm test` completed 219 files, then tests/profile-modal-controller.test.mjs timed out as file 220/425. An isolated unrestricted run also timed out. The last started scenario was show()/hide() focus/wallet. Root cause is not classified. The dispatch shell inherited NODE_TEST_CONTEXT=child-v8, which explains binary test output; inspect a readable reporter and clean environment before calling this a product defect. A clean-environment reproduction is being checked at launch preparation.

## You own

- tests/profile-modal-controller.test.mjs and narrow profile-modal lifecycle/helper code required by the diagnosed defect, including js/ui/profileModalController.js and js/ui/profileModal/**.
- Your backlog item, area notes, focused regression, and Test Integrity Note.

## You do NOT own

js/app.js, js/app/**, signers/Nostr core, storage credentials, payments, global test discovery, fleet config/tools, styling, unrelated suites, or the preview server. Ask dispatch for a specific scope adjustment if evidence points outside ownership. Do not alter another worktree or process. No subagents needed.

## Done and checks

1. Read KNOWN_ISSUES.md, .agents/MEMORY.md, PROGRAM.md, RESUME-BRIEF.md, RULE-CHANGES.md, and docs/testing/test-integrity.md. Read your mailbox and claim client-reliability-1. Revalidate at HEAD.
2. Reproduce the blocked await or retained resource at the actual boundary. Distinguish client behavior, harness assumptions, and environmental artifacts. Preserve every assertion and correct behavior; do not add retries/sleeps, raise timeouts, quarantine/delete tests, or force a successful process exit.
3. Fix the cause with deterministic setup/cleanup or narrow client behavior as the evidence warrants. Add a scenario regression and prove a deliberately broken variant fails. Record a Test Integrity Note for test edits.
4. Run the isolated suite to natural completion and the full unit suite with a 60s per-file diagnostic bound; also run npm run lint. Product code changes require npm run build and relevant local browser checks. Report file/test counts precisely and disclose what was not verified. Do not call the full suite green if it stops early.
5. Commit with client-reliability-1 in the message using fleet commit, merge unstable (never rebase), validate that tree, and submit through landq. Close the item only after durable landed state and unstable verification. Return the SHA and exact checks to dispatch. Explain what slowed you down and one tool/data improvement if any.

## Standing rules

- 2026-10-19 owner direction: "lets try to work our way through some of the issues in the TODO backlog and find and bugs and generaly make the client more robust and usable. ."
- Routine work launch approved through the Codex desktop chat relay; no deploys, spending, production data, real-wallet operations, or schedules.
- Preserve the owner preview at http://127.0.0.1:3000 in fleet-bitvid:preview. Dispatch refreshes its built dist after verified changes land.
- Send routine completion and blockers directly to dispatch via mailbox; dispatch sends owner event updates.
- Keep .task current; acquire any shared browser convention through .task before browser work. Sandbox denial is not permission to bypass controls.
