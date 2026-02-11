# Context

## Goal
Improve app responsiveness by identifying and remediating background CPU/network work that degrades UX, while ensuring user-facing docs (/content) reflect the actual runtime behavior of upload/contribution flows.

## Scope
- Repository: `PR0M3TH3AN/bitvid` (unstable branch)
- Focus Areas:
    - P0: Login/auth, relay initialization & profile hydration, decryption of user lists.
    - P1: Initial UI responsiveness (profile cache, relay load).
    - P2: Background features (WebTorrent).
    - Docs: `/content` (upload/contribution flows).

## Assumptions
- The codebase uses vanilla JS/ES modules.
- `js/utils/logger.js` is the standard logging mechanism.
- `js/constants.js` contains feature flags.
- `config/instance-config.js` contains instance-specific config.

## Constraints
- Never invent files, APIs, libraries, or behaviors.
- Prefer minimal incremental changes.
- Keep build/tests green.
- Security-critical changes require human signoff.

## Definition of Done
- Performance improvements are verified with metrics or manual tests.
- Documentation updates are verified against code and runtime behavior.
- PRs include `CONTEXT.md`, `TODO.md`, `DECISIONS.md`, `TEST_LOG.md`.
