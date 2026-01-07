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

1. `"nip07"` – Browser extension flow that delegates signing to a NIP-07 compatible provider embedded in the browser.
2. `"nsec"` – Direct key import where the private key stays in the client and bitvid signs locally without an external signer.
3. `"nip46"` – Remote signer flow that relies on a NIP-46 capable relay or service to authorize requests on behalf of the user.

When introducing additional providers, choose a unique string value and extend this section (plus any related migration notes) to explain how the new strategy authenticates and how existing data should transition.

When the app reads stored entries it normalises unknown values back to
`"nip07"` but keeps recognised alternatives intact.

## Migration notes

`bitvid:savedProfiles:v1` is the sole supported auth cache in localStorage.
