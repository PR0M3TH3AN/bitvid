# DECISIONS: perf-agent (2026-02-16)

## Decision: Visibility Gating for Dashboard Refresh Loop

- **Decision**: Modify the `setInterval` in `dashboard/index.html` to skip rendering if `document.hidden` is true.
- **Rationale**: The dashboard currently re-renders the DOM every 30 seconds to update TTL bars, even when the tab is in the background. This wastes CPU cycles.
- **Consequences**:
  - Reduced CPU usage when tab is hidden.
  - UI might be slightly stale when tab becomes visible, so we add a `visibilitychange` listener to force an immediate update.

## Alternatives Considered
- Remove the interval entirely: Would stop updates.
- Use `requestAnimationFrame`: Still runs (sometimes throttled) and more complex to manage with 30s intervals.

## Follow-ups
- Monitor if users complain about stale data (should be mitigated by `visibilitychange`).
