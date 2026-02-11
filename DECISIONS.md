# Decisions

## Log

- **Bound Relay Concurrency**: Decided to use `pMap` with `RELAY_BACKGROUND_CONCURRENCY = 3` to limit concurrent relay requests during background tasks (history hydration, metadata fetch, DM send).
  - *Rationale*: Unbounded `Promise.all` causes network congestion and can freeze the UI if many relays are configured. 3 is a conservative default.
  - *Alternative*: Could have used a global queue, but per-operation concurrency is simpler and sufficient for now.
