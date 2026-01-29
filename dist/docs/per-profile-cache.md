# Per-profile cache system

This document explains how bitvid caches profile metadata across the app, what
data is stored, and when it is persisted or refreshed.

## Cache layers

bitvid uses two app-wide caches plus a comment-thread cache:

1. **Profile metadata cache** (`bitvid:profileCache:v1`)
   - Short-lived metadata cache persisted to `localStorage`.
   - Owned by `js/state/cache.js`, surfaced via `AuthService`.
2. **Saved profiles list** (`bitvid:savedProfiles:v1`)
   - Long-lived list of accounts authenticated in this browser.
   - Stored in `localStorage` and described in `docs/nostr-auth.md`.
3. **Comment thread profile cache** (in-memory only)
   - Per-thread cache inside `js/services/commentThreadService.js`.
   - Seeds from the app-wide profile cache when available.

## Profile metadata cache (`bitvid:profileCache:v1`)

### Storage and lifetime

- **In-memory:** `profileCache` map in `js/state/cache.js`.
- **Persistent:** `localStorage` key `bitvid:profileCache:v1`.
- **TTL:** 10 minutes (`PROFILE_CACHE_TTL_MS`).
- **Eviction:** Entries are filtered/removed on load, read, and persist when they
  exceed TTL.

### Stored data (per pubkey)

Entries are normalized before storage and include:

- `name`
- `picture` (sanitized via `sanitizeProfileMediaUrl`)
- Optional fields: `about`, `website`, `banner`, `lud16`, `lud06`,
  `lightningAddress`
- `timestamp` (cache timestamp)

### When it is loaded

`AuthService.hydrateFromStorage()` hydrates the cache at startup by calling
`loadProfileCacheFromStorage()` in `js/state/cache.js`.

### When it is written

The cache is updated through `AuthService.setProfileCacheEntry()`, which:

1. Writes the normalized entry to the cache.
2. Persists it to `localStorage` (unless disabled).
3. Syncs cached `name`/`picture` to the saved profiles list (if present).
4. Emits `profile:updated` events for UI consumers.

Common write sources:

- **Own profile load:** fast relays, background refresh, or fallback in
  `AuthService.loadOwnProfile`.
- **General profile fetch:** `AuthService.fetchProfile` when a relay response
  is received.
- **Batch profile hydration:** utilities that call `setProfileCacheEntry`
  (e.g., profile batch fetchers in list or thread hydration).

### Cache reads

`AuthService.fetchProfile` short-circuits to the cache if a non-expired entry
is available and emits a `profile:updated` event with reason `cache-hit`.

## Saved profiles list (`bitvid:savedProfiles:v1`)

The saved profiles list is the persistent “recently authenticated accounts”
store and is **not** TTL-based. It contains auth metadata plus cached
display data to keep the profile switcher responsive.

### Stored data (per entry)

See `docs/nostr-auth.md` for the full JSON schema. At a high level, each entry
stores:

- `pubkey` (hex)
- `npub` (optional)
- `name`
- `picture`
- `authType`

The payload also stores `activePubkey`.

### Sync behavior from the profile cache

Whenever `AuthService.setProfileCacheEntry` writes a new profile cache entry,
it calls `syncSavedProfileFromCache` to update the corresponding saved profile
entry’s `name` and `picture` if the profile exists in the saved list.

## Comment thread profile cache (in-memory)

`CommentThreadService` maintains an in-memory `profileCache` map scoped to the
active comment thread. It is reset on thread changes and is **not persisted**
to storage.

### How it hydrates

1. When a comment author pubkey is encountered, the thread checks the app-wide
   profile cache via `getProfileCacheEntry`.
2. If found, it is copied into the thread cache.
3. If not found, the pubkey is queued for batch hydration and later written
   back through the app-wide `setProfileCacheEntry` callback.

This keeps comment rendering responsive without repeatedly re-fetching metadata
within a single thread session.
