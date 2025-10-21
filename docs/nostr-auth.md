# Nostr authentication storage

bitvid keeps lightweight state in `localStorage` so the UI can remember which
accounts signed in recently. This document explains the storage schema so future
updates can evolve it without breaking existing users.

## Storage keys

- `bitvid:profileCache:v1` – short-lived metadata cache for profile names and
  avatars. See `js/app.js` for TTL and eviction rules.
- `bitvid:savedProfiles:v1` – persistent list of accounts the user authenticated
  with in this browser.

Both keys live in the main origin scope. Clearing one should not affect the
other.

## Saved profile schema

`bitvid:savedProfiles:v1` is a JSON object with the shape:

```json
{
  "version": 1,
  "entries": [
    {
      "pubkey": "<hex-encoded pubkey>",
      "npub": "<bech32 npub, optional>",
      "name": "<cached display name>",
      "picture": "<cached avatar URL>",
      "authType": "<auth strategy>"
    }
  ],
  "activePubkey": "<hex pubkey or null>"
}
```

Notes:

- `pubkey` always stores a lowercase 64-character hex string and is the primary
  dedupe key.
- `npub` is optional. When omitted, the UI regenerates it on load using
  `NostrTools.nip19.npubEncode`.
- `name` and `picture` are cached hints that keep the profile switcher snappy.
  They may be empty strings and should be treated as hints, not the source of
  truth.
- `activePubkey` tracks the last account that successfully authenticated in this
  browser. It may be `null` when the user logs out but keeps saved entries.

### `authType` enum

`authType` describes how the profile authenticated:

- `"nip07"` – Browser extension flow (current default).
- `"nsec"` – Reserved for future direct key import or signer integrations. New
  auth strategies should pick a distinct string and document how migration works
  alongside any recovery tooling.

When the app reads stored entries it normalises unknown values back to
`"nip07"` but keeps recognised alternatives intact.

## Migration notes

Earlier builds only persisted a single `userPubKey` string. During startup the
app now:

1. Attempts to read `bitvid:savedProfiles:v1` and validate the payload.
2. If the key is missing (or malformed) but a legacy `userPubKey` entry exists,
   it seeds `savedProfiles` with that value and writes the new structure.
3. Once the JSON payload is written successfully, the legacy `userPubKey` entry
   is removed.

Future migrations should follow the same pattern: validate, normalise, write the
new format, then clean up legacy keys to avoid data loss.
