# Nostr Wallet Connect Coverage

This note cross-references bitvid's current Nostr Wallet Connect (NIP-47) implementation with the official
specification so we can quickly spot regressions or missing features.

## URI handling

* `parseNwcUri()` accepts all aliases we see in the wild (`nostr+walletconnect://`, `walletconnect://`, and `nwc://`)
  and rejects unknown schemes before continuing. It extracts the wallet pubkey, all relay query parameters, and the
  32-byte secret required for signing. The helper lowercases the secret, reserializes the URI in canonical form, and
  derives the client public key from the secret so downstream calls can sign events without leaking user keys. It also
  surfaces any connection `budget` (in msats) plus renewal metadata from the query parameters so callers can enforce
  wallet allowances consistently.

## Connection lifecycle

* `ensureActiveState()` caches the parsed connection and keeps WebSocket state so repeated actions reuse the same
  subscription. When a new URI is supplied we tear down the previous socket, update the relay list, reset encryption
  state, and initialize a per-connection budget tracker (spent vs. total) before reconnecting.
* `connectSocket()` opens a WebSocket to the relay, subscribes to kind `23195` responses authored by the wallet and
  addressed to the client pubkey, and hooks message/error/close callbacks so we can retry or surface failures.

## Request flow

* `ensureWallet()` validates that the user configured an NWC URI, connects to the relay if needed, and negotiates an
  encryption scheme before returning the active context.
* `encryptRequestPayload()` serializes the JSON-RPC payload, encrypts it with the selected scheme, and creates the
  Nostr event with kind `23194`, `pubkey` set to the client key, a `p` tag pointing at the wallet, and an
  `encryption` tag mirroring the algorithm that was used. Events are signed with the secret from the connection URI
  so relays will accept them.
* `sendPayment()` resolves the msat amount that will be charged (from explicit params or by decoding the invoice),
  compares it against the remaining budget, and short-circuits with a `NWC_BUDGET_EXHAUSTED` error when the new spend would
  exceed the allowance. Successful payments increment the tracked spend, and wallet responses that report allowance
  exhaustion mark the tracker as depleted so follow-up requests fail fast.

## Response flow

* `subscribeToResponses()` issues a `REQ` for kind `23195` events authored by the wallet and tagged for the client.
* `handleSocketMessage()` decrypts responses, matches them against pending `id`s (or the `e` tag), clears pending
  timeouts, and surfaces either the `result` or `error.code`/`error.message` back to callers.

## Encryption negotiation

* `requestInfoEvent()` fetches the wallet's replaceable kind `13194` info note and passes the result to
  `getWalletSupportedEncryption()` so we only pick schemes advertised by the wallet service.
* `getEncryptionCandidates()` prefers NIP-44 (`nip44_v2`) when both sides support it and falls back to NIP-04 when
  necessary. We also remember schemes that failed so future retries skip them.

## Current gaps

* We only connect to the first relay supplied by the URI. If a wallet publishes multiple relays we should consider
  retrying additional ones when the primary is offline.
* The client currently implements the `pay_invoice` command. Other optional commands (`make_invoice`,
  `get_balance`, `multi_pay_invoice`, etc.) and notification handling (kinds `23196`/`23197`) would require follow-up
  work.
* Wallet responses that signal `UNSUPPORTED_ENCRYPTION` as an error today bubble straight back to the caller. The
  transport already retries once when we encounter that error during submission, but we could add richer UX (e.g.
  prompting the user to reconnect) in the future.
