# Nostr Analytics Knobs

bitvid's view counter emits Nostr events so operators can track engagement without duplicating storage. Tune the following exports in `config/instance-config.js` to match your retention and performance goals:

- `VIEW_COUNT_DEDUPE_WINDOW_SECONDS` (default: `86_400`): repeat plays from the same viewer inside this window are treated as duplicates so stalled reloads do not inflate totals. Shorten the window to count more aggressive replays, or extend it if you want conservative numbers.
- `VIEW_COUNT_BACKFILL_MAX_DAYS` (default: `90`): controls how far back hydrators should walk history when a new analytics worker boots. Longer windows deliver deeper trend lines at the cost of heavier relay scans.
- `VIEW_COUNT_CACHE_TTL_MS` (default: `5 * 60 * 1000`): defines how long cached aggregates remain trustworthy before clients refresh them. Lower values surface spikes faster, while higher ones smooth traffic for relay-friendly dashboards.

Most operators can ship with the defaults—24-hour deduplication, a 90-day backfill horizon, and five-minute cache TTLs match what we run in production. Deviate only if your relays have unusual load constraints or your reporting needs stricter fidelity.

## View Event Lifecycle

### Anonymous session keys

Playback telemetry runs even when a viewer has not connected a Nostr account. The client first calls [`ensureSessionActor`](../js/nostr/client.js#L2445-L2504) to mint or restore an ephemeral keypair stored in `localStorage`. That session actor signs view events until the user authenticates, ensuring relays still see consistent pubkeys without blocking anonymous playback.

### Publish latency expectations

When a player crosses the 12-second watch threshold, bitvid invokes [`publishViewEvent`](../js/nostr/viewEvents.js#L662-L838) through the view-only [`recordVideoView`](../js/nostr/viewEvents.js#L854-L879) contract. The helper considers the publish successful as soon as any configured relay acknowledges the event, which in practice keeps latency under a second on public relays. The UI optimistically increments totals by feeding the signed event into [`ingestLocalViewEvent`](../js/viewCounter.js#L619-L633), so cards and modals reflect the new view immediately even while other relays finish syncing.

After a view is recorded, the watch history service updates the actor's queue
and publishes snapshots as needed, keeping analytics and history in sync.

To avoid double-counting the same session, the playback stack respects the cooldown keys generated in [`js/app.js`](../js/app.js#L6825-L6893). The combination of pointer identity and viewer fingerprint prevents re-logging until the dedupe window expires or the user switches accounts.

Every view event includes a unique `#d` tag derived from the pointer scope, the signing actor, and high-entropy randomness. Because kind `30079` is parameterized, this `#d` tag is what keeps individual view notes permanent—without it, a fresh event would overwrite the previous one from the same actor. Leave the tag intact (or provide one when overriding the schema) so relays retain the full stream of view history.

### Client bindings & feature toggles

When wiring moderation or playback toggles into view analytics, import helpers from the [NIP-71](https://github.com/nostr-protocol/nips/blob/master/71.md) facade and let it reach into the binding layer for you:

```js
import { recordVideoView, subscribeVideoViewEvents } from "../nostrViewEventsFacade.js";
```

The facade wraps [`js/nostr/viewEventBindings.js`](../js/nostr/viewEventBindings.js) so feature flags, relay discovery, and COUNT/LIST fallbacks all run through the same guard clauses that enforce the NIP-71/NIP-78 schemas. Modules that need to no-op when relays disable optional methods can rely on the binding’s "unavailable" errors to short-circuit cleanly.

### Hydration, COUNT, and UI sync

Background hydration keeps optimistic counts honest. The view counter subscribes to live events while simultaneously fetching historical lists and issuing a `COUNT` request. Whenever the authoritative total returned by `COUNT` exceeds the locally accumulated sum, the hydration routine overwrites the optimistic value so the UI stays aligned with relay truth. If `COUNT` falls back (because relays reject it or the browser is offline), the locally deduped history still anchors totals, and the next successful hydration pass reconciles any drift. This interplay means cards, modals, and dashboards settle on the same number without requiring a full page reload.

## Feed telemetry (tag preference filtering)

The feed engine emits a lightweight telemetry record whenever a video is filtered
by the tag preference stage. These events are routed through the local
`FeedTelemetry` logger (via `logger.dev`) and only include counts and booleans—no
raw tag strings, interests, or disinterests are emitted. The payload includes:

- `feed` and `feedVariant` (string identifiers for the feed context)
- `position` (index of the filtered item in the feed run)
- `matchedTagCount` (count of tag matches that triggered filtering)
- `matchedInterestCount` / `hasInterestMatch`
- `matchedDisinterestCount` / `hasDisinterestMatch`
- `hasMatch` (derived boolean indicating any tag match)
