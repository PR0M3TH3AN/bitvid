# Rule changes

Newest first. One `## YYYY-MM-DD` heading per day, then a line per change.
Read this file newest first now and before every backlog item. These lines
override a stale system prompt. Nothing filters them down to a window of days.

The session manager adds a line here whenever a rule, a prompt, a tool's usage, or
a landing rule changes.

## 2026-10-19

- Bounded routing: existing client-reliability worker temporarily owns tests/race/nostr-client-init-race.test.mjs plus its regression/integrity notes for client-reliability-2. Nostr product code and global runner remain excluded. Preserve assertions, separate commits, and normal landing gates.

- One-time first-worker bootstrap: the administrative roster/brief commit may land through a temporary queue configuration with an exact roster-and-documentation-only validator because the worker is assigned to the existing full-suite hang. No product/test/persistent-gate change is permitted by this check. Record the exception and actual result; subsequent code uses the normal full gate.

- Owner direction relayed from Codex desktop chat authorizes dispatch to operate tmux, start the approved single client-reliability worker, and make routine staffing, prioritization, test/build, fix, and local unstable landing decisions without repeated approval. Record relay provenance; this is not approval for deploys, spending, production data, real-wallet operations, or schedulers. Send owner-mailbox event updates and refresh the existing local preview after verified changes.
