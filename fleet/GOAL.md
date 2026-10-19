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
