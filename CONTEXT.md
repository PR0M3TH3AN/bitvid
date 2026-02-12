# CONTEXT - bitvid-perf-agent

## Goal
Daily, measurable improvement of app responsiveness by identifying and remediating background CPU/network work that degrades UX — while also ensuring user-facing docs (/content) reflect the actual runtime behavior of upload/contribution flows.

## Scope
- Repo: `PR0M3TH3AN/bitvid` (unstable branch).
- Focus Areas:
  - P0: Login/auth, relay initialization, decryption (hashtags, subscriptions, blocks, watch history).
  - P1: Initial UI responsiveness (profile cache, relay load).
  - P2: User-initiated background features (WebTorrent).
  - Docs: `/content` (user-facing docs), ensuring upload/contribution docs match code.

## Constraints
- Never invent files, APIs, libraries, or behaviors.
- Prefer minimal incremental changes.
- Keep build/tests green.
- Preserve repo style and architecture.
- Security-critical changes require human signoff.

## Definition of Done
- Performance issues identified and fixed with small, safe PRs.
- Docs in `/content` matched to code.
- `daily-perf-report` generated.
- Artifacts (`TODO.md`, `DECISIONS.md`, `TEST_LOG.md`) updated.
