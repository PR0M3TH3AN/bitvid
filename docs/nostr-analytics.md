# Nostr Analytics Knobs

BitVid's view counter emits Nostr events so operators can track engagement without duplicating storage. Tune the following exports in `config/instance-config.js` to match your retention and performance goals:

- `VIEW_COUNT_DEDUPE_WINDOW_SECONDS` (default: `86_400`): repeat plays from the same viewer inside this window are treated as duplicates so stalled reloads do not inflate totals. Shorten the window to count more aggressive replays, or extend it if you want conservative numbers.
- `VIEW_COUNT_BACKFILL_MAX_DAYS` (default: `90`): controls how far back hydrators should walk history when a new analytics worker boots. Longer windows deliver deeper trend lines at the cost of heavier relay scans.
- `VIEW_COUNT_CACHE_TTL_MS` (default: `5 * 60 * 1000`): defines how long cached aggregates remain trustworthy before clients refresh them. Lower values surface spikes faster, while higher ones smooth traffic for relay-friendly dashboards.

Most operators can ship with the defaults—24-hour deduplication, a 90-day backfill horizon, and five-minute cache TTLs match what we run in production. Deviate only if your relays have unusual load constraints or your reporting needs stricter fidelity.
