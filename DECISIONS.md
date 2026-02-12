# Decisions Log

## Performance
- **2026-02-xx:** Use `pMap` with `RELAY_BACKGROUND_CONCURRENCY` (3) for comment publishing and fetching.
  - **Rationale:** `Promise.all` floods the network when users have many relays. Bounding concurrency prevents resource exhaustion.

## Documentation
- **2026-02-xx:** Standardize local dev port to 3000 in docs.
  - **Rationale:** Matches `npm start` default and `README.md`.
