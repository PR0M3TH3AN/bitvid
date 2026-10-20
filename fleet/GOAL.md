# bitvid fleet goal

Recorded 2026-10-19.

## Owner direction

> "lets try to work our way through some of the issues in the TODO backlog and find and bugs and generaly make the client more robust and usable. ." — owner

## Working goal

Work through the existing TODO backlog, find and fix bugs, and make the client more robust and usable. Revalidate older reports against current unstable before assigning work. Prefer small fixes to user-facing failures with reproducible evidence and regression protection.

## Success criteria

- Each selected item has a current reproduction or a documented already-fixed result.
- Fixes preserve playback, magnet safety, signer requirements, and existing test integrity.
- Relevant checks and full required gates pass; report counts and unverified behavior.
- Completed changes land through the local unstable queue before backlog closure.

## Operating limits

- No deploys, spending, production data, or real-wallet operations; conservative session-manager defaults, not additional owner rulings.
- First worker approval received 2026-10-19 via Codex desktop chat relay; routine staffing, fixes, tests/builds, and local unstable landings are authorized within this goal. Record relay provenance; no repeated routine approval required.
- No scheduler or cron activation is implied by fleet startup.

## Continuing owner direction — 2026-10-20

> "ok try to keep them working until the project is in a good place." — owner, relayed by interpreter; not represented as typed in dispatch.

Continue bounded robustness/usability/backlog work after the three-worker trial. Use fleet/QUALITY.md to track evidence and remaining gates. Passing units alone does not establish project readiness. Keep workers useful where scopes split safely; reduce idle staffing when useful independent work runs out. Stage reproductions/audits before product fixes, preserve normal local unstable landing and restricted-action limits. Amber/cloud/live peers/manual release qualification stays explicitly open until authorized real evidence exists.
