# Context: Weekly Fuzz Agent Run (2026-02-13)

## Goal
Improve input robustness by fuzzing high-risk parsers/decoders in `js/nostrEventSchemas.js`.

## Scope
- Target: `js/nostrEventSchemas.js`
- Task: Implement a fuzz harness to generate invalid inputs for event builder functions and validators.
- Deliverables:
  - `scripts/agent/fuzz-nostr-schemas.mjs` (harness)
  - `examples/reproducers/` (if failures found)
  - `artifacts/fuzz-report-nostr-schemas-2026-02-13.json` (report)
  - Potential fixes in `js/nostrEventSchemas.js`

## Constraints
- Do not fuzz public relays.
- Keep crypto paths safe.
- Minimal dependencies.
