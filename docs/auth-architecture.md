# Auth architecture overview

This document consolidates how bitvid authentication works today, with a focus on
`js/services/authService.js` and the provider implementations in
`js/services/authProviders/`. It complements the storage details in
[`docs/nostr-auth.md`](nostr-auth.md) and the remote signer specifics in
[`docs/nip46-remote-signers.md`](nip46-remote-signers.md).

## Core building blocks

- **AuthService (`js/services/authService.js`)** orchestrates login/logout flows,
  maintains the active identity, updates saved profile storage, and emits auth
  events for the rest of the app.
- **Auth providers (`js/services/authProviders/`)** are pluggable adapters that
  implement `login()` for a specific signing strategy:
  - `nip07` (browser extension signer)
  - `nsec` (direct/private key signer stored locally)
  - `nip46` (remote signer via Nostr Connect)
- **State + storage** lives in `js/state/appState.js` and `js/state/cache.js`,
  backed by `localStorage` keys described in `docs/nostr-auth.md`.

## AuthService responsibilities

### Provider selection and normalization

`AuthService.requestLogin()` is the entry point for logins. It:

1. Normalizes the requested provider id (defaults to `nip07`).
2. Calls the provider’s `login()` method with the active `nostrClient` and
   provider-specific options.
3. Normalizes the provider result into `{ pubkey, authType, signer }`.
4. For NIP-07, requests extension permissions before continuing.
5. Either returns the normalized result (when `autoApply: false`) or calls
   `login()` to apply the identity.

### Applying a login

`AuthService.login(pubkey, options)` is responsible for applying the session:

- **Identity + session state**
  - Normalizes the pubkey to hex, writes it to `appState` (`setPubkey`) and
    stores the bech32 `npub` (`setCurrentUserNpub`).
  - Updates `nostrClient.pubkey` so downstream services use the new identity.
- **Saved profile persistence**
  - Reads + updates the saved profile list in `js/state/cache.js`.
  - Persists `bitvid:savedProfiles:v1` with the latest `authType` + `providerId`.
  - Ensures there is an `activePubkey` entry when `persistActive` is true.
- **Post-login hydration**
  - Kicks off async profile/block/relay loading via `applyPostLoginState()` and
    emits `auth:post-login` for consumers (UI updates, etc.).

### Logout and profile switching

- `logout()` clears the active pubkey/npub, resets moderation + caches, and
  keeps the saved profile list intact so users can quickly re-auth.
- `switchProfile()` replays the login flow for a previously saved pubkey and
  moves it to the front of the saved list.

## Provider flows

### NIP-07 (browser extension signer)

- Implemented by `js/services/authProviders/nip07.js`.
- Delegates `login()` to `nostrClient.login()` and expects a pubkey (and optional
  signer) in the result.
- After provider login, `AuthService` requests extension permissions before
  completing the session. Permission failure aborts the login.

**Key behavior:** signing stays inside the browser extension; bitvid only stores
pubkey metadata in `localStorage`.

### nsec (local signer)

- Implemented by `js/services/authProviders/nsec.js`.
- Supports two modes:
  - **Unlock stored key** (`unlockStored: true`): uses
    `nostrClient.unlockStoredSessionActor()` and requires a passphrase.
  - **Direct secret**: derives a key from an `nsec`, hex key, or seed via
    `nostrClient.derivePrivateKeyFromSecret()` and registers a local signer with
    `nostrClient.registerPrivateKeySigner()`.
- Can optionally persist the encrypted key on the device; authService still only
  stores public metadata in the saved profile list.

**Key behavior:** signing happens locally in the browser with a derived private
key; storage of the private key is optional and encrypted when persisted.

### NIP-46 (remote signer / Nostr Connect)

- Implemented by `js/services/authProviders/nip46.js`.
- Supports three paths:
  - **Reuse stored session** (`reuseStored: true`): use
    `nostrClient.useStoredRemoteSigner()` to resume the saved NIP-46 session.
  - **Manual connection** (`mode: "manual"`): use a provided
    `connectionString` (e.g., `nostrconnect://` or `bunker://`).
  - **Handshake flow** (`mode: "handshake"`, default): generate a handshake via
    `nostrClient.prepareRemoteSignerHandshake()` and then connect using the
    returned connection string + client keypair.

**Key behavior:** signing happens on a remote device. Session material is stored
in `bitvid:nip46:session:v1` as described in
[`docs/nip46-remote-signers.md`](nip46-remote-signers.md).

## Session state + persistence

Auth state is intentionally small and split across caches:

- **Active identity:** `js/state/appState.js` keeps the current `pubkey` + `npub`
  in memory and updates `nostrClient.pubkey` on login.
- **Saved profiles:** `js/state/cache.js` manages
  `bitvid:savedProfiles:v1`, including `authType` + `providerId` for each entry.
  See [`docs/nostr-auth.md`](nostr-auth.md) for the schema and migration notes.
- **Profile cache:** `bitvid:profileCache:v1` is used to show display names +
  avatars quickly; it is updated during `loadOwnProfile()` calls.
- **Remote signer session:** `bitvid:nip46:session:v1` stores handshake/session
  data for NIP-46 reconnects. See
  [`docs/nip46-remote-signers.md`](nip46-remote-signers.md) for details.

## NIP-04 / NIP-44 considerations

AuthService and the provider adapters do **not** implement NIP-04 or NIP-44
message encryption/decryption directly. They simply supply a pubkey and (when
available) a signer object back to the caller. When other features (like direct
messages) need NIP-04 or NIP-44 capabilities, they rely on the active signer
implementation on the `nostrClient`. Remote signers and extensions must support
those encryption methods for DM features to work, while local `nsec` signers can
provide the primitives directly.

Signing/encryption requests always flow through the signer adapter registry in
`js/nostr/client.js` (accessed via `js/nostrClientFacade.js`). The registry
selects the active signer, falls back to the strongest supported capability, and
triggers permission prompts (for example, the NIP-07 extension handshake) before
attempting privileged calls.

## Related docs

- [`docs/nostr-auth.md`](nostr-auth.md)
- [`docs/nip46-remote-signers.md`](nip46-remote-signers.md)
