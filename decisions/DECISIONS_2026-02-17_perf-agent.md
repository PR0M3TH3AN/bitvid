# Decisions - 2026-02-17 (perf-agent)

## Design Choices

### 1. Bounding Concurrency in `channelProfile.js`
- **Context:** The `loadUserVideos` function was firing requests to all user relays simultaneously.
- **Decision:** Use `pMap` with `RELAY_BACKGROUND_CONCURRENCY` (3).
- **Rationale:** This prevents network saturation when a user has many relays (e.g., 20+), which could block other critical requests (like login or feed loading).
- **Tradeoff:** Fetching from *all* relays might take slightly longer in wall-clock time if many are slow, but it keeps the browser responsive.
- **Implementation:** Wraps the `nostrClient.pool.list` call in a try/catch block inside the mapper to return `{ status, value/reason }` objects, mimicking `Promise.allSettled`.

### 2. Docs Audit Scope
- **Context:** The prompt requires verifying `/content` upload docs.
- **Decision:** Audited `content/docs/guides/upload-content.md` against baseline.
- **Rationale:** This is the primary guide for users. Verified port (3000) and limits (2GB).
