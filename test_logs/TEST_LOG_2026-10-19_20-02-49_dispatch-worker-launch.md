# Worker launch verification

- Staffing commit 3514c057, merged tip c3123991; temporary exact-scope validator: exit 0, 13 expected files, no product/test/persistent gate changes.
- Queue durable status: c3123991 landed as 9e6c310d; `git log -1 unstable` confirms 9e6c310d. No full-suite pass claimed by administrative landing.
- `fleet worktrees --only client-reliability`: exit 0, created isolated branch/worktree at landed roster.
- `env -u NODE_TEST_CONTEXT fleet up --only client-reliability`: exit 0; own tmux window created. No scheduler activation.
- `fleet status` plus pane capture: client-reliability running pid 138193 and reading rules/backlog; actual model shown GPT-6.1-Sol medium from project default.
- Local preview request http://127.0.0.1:3000: HTTP 200, process preserved. No product edits, so no rebuild required for this staffing change.
- Owner launch event sent through owner mailbox. Team 2 agents including dispatch, 1 worker.
- Not verified: hang root cause/fix, remaining unit files, browser behavior, real signers, or production/release qualification.
