---
name: agent-fleet
description: Use fleet-mcp tools for backlog, mailbox, landing queue, and area ownership. Do not use it to start sessions or push main.
---

Follow the fleet rules in `AGENTS.md`. Call the `agent-fleet` MCP tools for backlog, mailbox, landing-queue, area questions, and commits. Editing those files directly is also fine. Sandboxed Codex cannot write Git's index: use the `commit` tool (or `fleet commit -m "..." --area <id> -- <paths>`), not `git commit`. `submit: true` queues the landing and starts a drain. Go back to work. At your next natural checkpoint, `land_status` (or `fleet landq status <id>`) can report that submission. Waiting is optional. Do not infer the lander or the land result from silence. Other providers may use either commit path. Leave `fleet up`, worktrees, and crontab to the operator.
