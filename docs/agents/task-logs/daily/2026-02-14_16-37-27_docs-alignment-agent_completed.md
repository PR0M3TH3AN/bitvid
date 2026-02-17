# Daily Docs Alignment

**Agent**: docs-alignment-agent
**Date**: 2026-02-14
**Status**: Completed

## Summary

Audited `README.md`, `CONTRIBUTING.md`, `package.json`, and `docs/instance-config.md` against the codebase. Found that the documentation is largely accurate and aligned with the current implementation. Identified one missing configuration option in `docs/instance-config.md`.

## Claims Map

| Document | Claim | Code Location | Status | Notes |
|---|---|---|---|---|
| `README.md` | `npm start` runs build & serve | `package.json` | ✅ | Matches `npm run build && npx serve dist` |
| `README.md` | `npm run build` generates `dist/` | `scripts/build-dist.mjs` | ✅ | Verified by script existence |
| `README.md` | `npm run test:unit` runs unit tests | `package.json` | ✅ | Matches `scripts/run-unit-tests.mjs` |
| `README.md` | `npm run lint` checks styles/tokens | `package.json` | ✅ | Matches lint script composition |
| `README.md` | `buildVideoPostEvent` usage | `js/nostrEventSchemas.js` | ✅ | Schema builder matches example |
| `docs/instance-config.md` | List of exported config constants | `config/instance-config.js` | ⚠️ | Missing `ENABLE_NIP17_RELAY_WARNING` |

## Updates

- **`docs/instance-config.md`**: Added documentation for `ENABLE_NIP17_RELAY_WARNING` to the new "Direct Message privacy" section.

## Verification

- **Lint**: Ran `npm run lint` successfully.
- **Manual Verification**: Read `docs/instance-config.md` to confirm the update.
- **Code Match**: Verified `ENABLE_NIP17_RELAY_WARNING` exists in `config/instance-config.js`.
