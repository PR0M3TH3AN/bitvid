# Upgrade nostr-tools

## Status
- **Current (Package):** `^2.19.4`
- **Current (Vendor):** `2.17.0` (found in `vendor/nostr-tools.bundle.min.js`)
- **Latest:** `2.21.0`

## Details
`nostr-tools` is a core protocol library.
There is a discrepancy between `package.json` (2.19.4) and the vendored bundle (2.17.0).
The latest version 2.21.0 is available.

## Plan
1. Review changelogs for breaking changes between 2.17.0/2.19.4 and 2.21.0.
2. Update `package.json` to `2.21.0`.
3. Update `vendor/nostr-tools.bundle.min.js` to match the new version.
4. Verify `js/nostr/client.js` and other consumers work correctly.
5. Run full E2E and Unit tests.

## Guardrails
- Protocol library: Requires manual review.
