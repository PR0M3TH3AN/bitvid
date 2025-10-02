# Watch History Logging Cheatsheet

The watch history publisher emits developer-mode console messages from `publishWatchHistorySnapshot()`.

- `Watch history snapshot updated` (info) &mdash; all chunks and the index event were accepted by at least one relay. The summary includes:
  - `actor`: abbreviated pubkey that authored the snapshot.
  - `itemCount`: number of watch history entries that made it into the snapshot payload.
  - `snapshot`: identifier constructed from the current unix timestamp and a random suffix.
  - `latestPointer`: truncated pointer key for the newest watch entry that survived chunking.
  - `latestWatchedAt`: ISO timestamp derived from the most recent entry's `watchedAt` (falls back to `Date.now()` when missing).
- `Watch history snapshot publish incomplete` (warning) &mdash; at least one chunk or the index event failed to reach any relay. When this fires the snapshot is still cached locally and the client will retry publication later.

Errors that precede the info log do **not** necessarily indicate a failure. For example, a message like `WebSocket connection to 'ws://127.0.0.1:4869/' failed` simply means one relay in the user's configured relay list is offline. The publisher only requires that at least one relay accepts each chunk before reporting success.

Refer to the log source in `js/nostr.js` for the exact structure and retry behavior.
