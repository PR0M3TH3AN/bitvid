# Repo Memory

Curated, reviewed knowledge for coding agents working in this repository.
Memory is an accelerator, not a second source of truth.

## Precedence (highest first)

1. Source code and tests
2. Executable configuration
3. Accepted design records / docs
4. `AGENTS.md`
5. This memory

If memory conflicts with anything above it, the memory is stale — propose a fix.

## Topics

- `memory/architecture.md` — durable architectural decisions and constraints
- `memory/conventions.md` — validated conventions not obvious from the code
- `memory/lessons.md` — hard-won lessons and recurring landmines
- `memory/decisions.jsonl` — structured decision records (one JSON object per line)

## Write policy

Agents MAY read everything here and MAY add candidates under `proposals/`
(one file per proposal, named `YYYY-MM-DD-<slug>.md`, with evidence links).
Agents MUST NOT edit `memory/` directly; trusted memory changes only through
reviewed commits that promote a proposal.

## Prohibited content

Credentials or secrets, personal data, raw transcripts or tool logs, session
TODOs, high-frequency agent state, unverified external claims.
