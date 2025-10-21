# NIP-46 Remote Signer Integration

bitvid can delegate event signing to a remote NIP-46 compatible signer. This
flow lets operators keep long-lived keys on hardened devices while approving
publish/edit/delete actions from a separate browser session.

## Connection strings

bitvid currently expects `bunker://` style URIs. They should embed the remote
signer pubkey in the host segment and may include the following query
parameters:

- `relay=` – one or more WSS relay URLs the signer watches for RPC requests.
  Repeat the parameter to advertise multiple relays.
- `secret=` – optional shared secret that must echo back during the `connect`
  handshake.
- `perms=` – optional permission string. When present bitvid forwards it during
  the initial `connect` RPC.
- `name`, `url`, `image` – optional metadata shown in the login modal so users
  can distinguish between saved signers.

URIs without `relay=` parameters fall back to bitvid’s default relay bundle
(`wss://relay.damus.io`, `wss://nos.lol`, `wss://relay.snort.social`,
`wss://relay.primal.net`, `wss://relay.nostr.band`). Make sure your signer also
publishes to at least one of these relays so both the browser and signer see the
same NIP-46 frames.

## Relay requirements

The remote signer must subscribe to `kind 24133` events targeted at the client
public key (included in the connection URI). bitvid publishes RPC requests to
whichever relay list resolves from the URI + local fallback:

1. Explicit `relay=` parameters from the bunker URI (WSS only, duplicates
   removed and sanitized).
2. The relays persisted in a previous session, if any.
3. The default bitvid relay set listed above.

For reliable operation:

- Keep at least two relays online so publish attempts succeed within the
  8&nbsp;second relay publish timeout.
- Ensure every relay allows inbound events from both the browser’s IP and the
  remote signer. Corporate VPNs and Tor bridges frequently block public WSS
  relays.
- Avoid private relays that block unsigned events from unknown clients; the
  browser session publishes unsigned requests that the signer decrypts with the
  shared secret.

## RPC expectations and timeouts

The RPC client issues the following methods:

- `connect` (optionally with `secret` and `perms`)
- `get_public_key`
- `sign_event` for publish/edit/delete flows

Each request is encrypted to the signer and published to the resolved relay set.
bitvid waits up to **8&nbsp;seconds** for a relay to accept the event and up to
**15&nbsp;seconds** for a response. `sign_event` calls allow up to
**20&nbsp;seconds** before timing out. On transient failures the client retries
once (except when the signer returns an authentication URL).

If the signer responds with `error: auth_url`, the UI surfaces the provided URL
so the user can complete any additional verification the signer requires.

## Session persistence and restoration

Successful connections write a session blob to
`localStorage` under the key `bitvid:nip46:session:v1`. The payload includes the
client key pair, remote pubkey, relay list, metadata, permissions, and the most
recent user pubkey returned by the signer.

On page load bitvid reads the stored session, updates the login modal to show a
saved signer, and silently attempts to reconnect in the background. If the
attempt fails due to network timeouts or temporary relay outages the stored
session remains intact so the user can retry manually. Fatal errors (for example
shared secret mismatches) clear the saved session automatically. Users can also
invoke “Disconnect” from the login modal to remove the stored credentials.

## Operational checklist

- Issue bunker URIs that list WSS relays reachable by both the signer and the
  browser session.
- Keep the signer online and subscribed to `kind 24133` events for the advertised
  relays.
- Respond to `connect`, `get_public_key`, and `sign_event` requests within the
  timeouts above.
- Rotate secrets or permissions as needed—bitvid surfaces signer metadata so
  operators can confirm which device they are connecting to before approving new
  sessions.
