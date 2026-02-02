# Relay Compatibility & Fallbacks

## COUNT (NIP-45)
- Use COUNT when available to fetch totals efficiently.
- If a relay doesn’t support COUNT:
  - Show “—” placeholder.
  - Fall back to client-side counting when cheap (narrow queries only).
  - Avoid heavy per-relay scans; cap by time window and result size.

## Query hygiene
- Prefer specific filters: `authors`, `kinds`, `#e`, `#p`, `since/until`.
- Batch requests across relays; debounce UI updates.
- Cache viewer’s F1 set (pubkeys you follow) and their report summaries.

## Media/thumbnail considerations
- Never block media fetch solely on relay count results.
- Thumbnails respect blur rules locally; “show anyway” toggles do not re-query relays.

## Timeouts & errors
- Per-relay timeout (e.g., 1500–2500 ms); proceed with partial results.
- Surface a subtle “partial results” indicator when some relays fail.

## Privacy notes
- Do not leak the viewer’s F1 set to third-party endpoints.
- If using a reputation provider, pass pubkeys in batches; avoid attaching viewer identity unless needed.
