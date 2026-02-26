# Decisions

## Module Boundaries
- `src/roster.mjs`: Handles loading roster from file or environment. Used by `cmdCheck`, `cmdLock`.
- `src/lock-ops.mjs`: Handles low-level Nostr operations (`queryLocks`, `publishLock`) and parsing.
- `src/dashboard.mjs`: Handles the HTTP server for the dashboard.
- `src/torch-config.mjs`: Now includes "effective config" getters (`getRelays`, etc.) to centralize config logic.

## Naming
- Used `lock-ops.mjs` instead of `lock.mjs` to avoid confusion with the action "lock".
- Preserved existing function names to minimize refactor impact.

## Exports
- `src/lib.mjs` will re-export `cmdDashboard` etc. if they were previously exported, to maintain library interface.
