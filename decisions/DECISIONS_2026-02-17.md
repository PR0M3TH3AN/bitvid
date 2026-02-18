# Decisions - Perf Agent - 2026-02-17

- **Decision:** Use `pMap` with `RELAY_BACKGROUND_CONCURRENCY` (3) for DM signal publishing and DM service connection/publishing.
  - **Rationale:** Prevents network saturation when users have many relays configured. `Promise.all` launches all requests simultaneously, which can cause timeouts or UI lag.
- **Decision:** Update documentation port to 3000.
  - **Rationale:** Matches standard dev environment default.
