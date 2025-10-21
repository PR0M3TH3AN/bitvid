# NIP-46 Remote Signer Integration

bitvid can delegate event signing to a remote NIP-46 compatible signer. This
flow lets operators keep long-lived keys on hardened devices while approving
publish/edit/delete actions from a separate browser session.

## Connection workflow

### Client-initiated handshake (preferred)

When an operator chooses the remote signer option, bitvid now generates a fresh
`nostrconnect://` URI and displays it alongside a QR code. The URI encodes:

- A short-lived client key pair dedicated to the session.
- The default WSS relay bundle (`wss://relay.damus.io`, `wss://nos.lol`,
  `wss://relay.snort.social`, `wss://relay.primal.net`,
  `wss://relay.nostr.band`).
- A random `secret` value that must be echoed back by the signer to prevent
  spoofed acknowledgements.
- Optional metadata (`name`, `url`, `image`) so the signer can display the
  client branding during pairing.
- Optional `perms` requested by the client.

Remote signers should scan the QR code or otherwise receive the
`nostrconnect://` link, subscribe to the advertised relays, and respond with a
`connect` acknowledgement signed by the remote signer key. The response must
include the `secret` value that was present in the URI. bitvid listens for this
acknowledgement before attempting the RPC `connect` call so operators see a
clear “waiting for signer” status in the modal.

### Fallback bunker links

Some signers still distribute `bunker://` URIs that point to the remote signer
pubkey. The modal keeps a “paste bunker link” toggle so operators can supply the
URI manually when QR pairing isn’t available. These URIs can advertise the same
`relay=`, `secret=`, `perms=`, `name`, `url`, and `image` parameters described
above. If no relays are specified the default bundle listed earlier is used.

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
