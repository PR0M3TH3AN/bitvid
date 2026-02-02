# Direct message privacy model (NIP-17 / NIP-59 / NIP-44)

This guide summarizes how bitvid delivers private direct messages, how relay
hints are chosen, and which user controls affect delivery. It is meant to be
read alongside the protocol references in `docs/nips/17.md`, `docs/nips/59.md`,
and `docs/nips/44.md`.

## Privacy layers: rumor → seal → gift wrap

When privacy mode is enabled, bitvid uses the NIP-17 pipeline:

1. **Rumor (kind 14 / 15)**: a plaintext DM or attachment payload is created.
2. **Seal (kind 13)**: the rumor is encrypted with NIP-44 to produce a sealed
   event signed by the sender.
3. **Gift wrap (kind 1059)**: the seal is encrypted again with NIP-44 using a
   freshly generated ephemeral keypair. The outer wrap is what relays receive.

This layered approach hides the sender/recipient metadata and message timing
from public relays while still allowing the receiver to unwrap the message.
bitvid randomizes timestamps for seals and wraps to reduce correlation, and
publishes a sender copy of the wrap so the sender can sync their own history.

## Relay hint selection

Relay hints decide where gift-wrapped NIP-17 events are published. Selection
uses the following priority order:

1. **Explicit hints** – If the caller provides `recipientRelayHints` or
   `senderRelayHints`, those are used immediately.
2. **Recipient discovery** – Otherwise, the client queries the configured read
   relays for the recipient's `kind:10050` relay list and uses any `relay` tags
   it finds.
3. **Fallback relays** – If no relay list is found, the client falls back to the
   configured write relays (or the default relay list), and flags the selection
   as a privacy fallback.

This logic is shared by the DM service helper `resolveDmRelaySelection()` and
by `NostrClient.sendDirectMessage()` when `useNip17` is enabled.

### Legacy NIP-04 relay selection

When privacy mode is disabled, bitvid sends a traditional kind `4` DM:

- It attempts to load the recipient's NIP-65 relay list (`kind:10002`) from the
  configured read relays.
- If no relay list is available, it falls back to the configured write relays
  (or the default relay list).

The final relay set is where the signed NIP-04 ciphertext is published.

## User controls that affect privacy

### Privacy toggle (NIP-17 vs NIP-04)

The DM composer exposes a privacy toggle that switches between NIP-04 and
NIP-17 delivery. When the toggle is enabled, the UI explains that NIP-17
gift-wraps the message so relays only see the wrapper and relay hints.

### Relay hint management

Users can curate their own DM relay hints list in the profile modal. The UI
lets them add and remove WSS relay URLs and publish the resulting list as a
`kind:10050` event. This list is what other clients query during the relay
selection phase above.

### Read receipts & typing indicators

Additional DM privacy toggles (read receipts and typing indicators) live in the
same profile modal and persist to local state. Turning them off reduces
metadata leaks by preventing extra ephemeral events from being sent.
