# SigningAdapter guide

`SigningAdapter` is the lightweight interface bitvid uses to sign direct-message
payloads and message metadata without depending on a specific auth provider.
The canonical implementations live in `js/auth/signingAdapter.js`, and callers
such as `NostrClient.sendDirectMessage()` and the DM composer accept a
`signingAdapter` option so they can work with NIP-07 extensions, remote signers,
or test doubles.

## Interface contract

A `SigningAdapter` is an object with the following async methods:

- `getPubkey()` → resolves the hex public key that should be used as the DM
  author.
- `getDisplayName()` → optional display name string for UI metadata.
- `signEvent(unsignedEvent)` → returns a fully signed Nostr event object.
- `signMessage(message)` → returns a signature for an arbitrary string.

`signEvent()` is required for DM publishing; `signMessage()` is optional but is
used by the DM composer to attach a signature to the outgoing payload metadata.

## Implementing a new adapter

1. **Normalize the pubkey**: resolve and return a lowercased hex pubkey from
   `getPubkey()`. The NIP-07 adapter does this by delegating to
   `window.nostr.getPublicKey()` and normalizing the result.
2. **Provide signing primitives**:
   - `signEvent()` must return an event with `id` and `sig` populated.
   - `signMessage()` should return a stable signature string for the message
     body when you need message-level signatures (for example, the DM composer
     includes this for UI payloads).
3. **Expose a type label**: include a `type` field (for example `nip07`, `dev`,
   or `test`) to make debugging easier.

Reference implementations:

- `createNip07SigningAdapter({ extension })` uses a browser extension signer.
- `createEphemeralDevSigningAdapter()` generates a local, throwaway keypair for
  development flows.
- `createTestSigningAdapter()` returns deterministic signatures for tests.

## Testing a SigningAdapter

### Unit tests

For Node-based tests, use `createTestSigningAdapter()` so signatures are stable
and deterministic. You can pass it directly to `NostrClient.sendDirectMessage()`
through the `options.signingAdapter` field to avoid relying on active signers:

```js
import { createTestSigningAdapter } from "../js/auth/signingAdapter.js";
import { nostrClient } from "../js/nostrClientFacade.js";

const adapter = createTestSigningAdapter({
  pubkey: "f".repeat(64),
});

const result = await nostrClient.sendDirectMessage(
  "npub...",
  "hello",
  null,
  { signingAdapter: adapter }
);
```

Assertions can then verify that `result.ok` is `true` and that the signed event
was built with the adapter's pubkey and signatures.

### Manual smoke checks

For browser-only checks, wire the adapter into the DM composer by passing it in
as the `signingAdapter` prop. The composer will call `getPubkey()`,
`getDisplayName()`, and `signMessage()` while building the outgoing payload
object so you can inspect the resulting metadata in your handler.

## Usage reminders

- When the signer does **not** implement NIP-44 encryption, NIP-17 sends are
  blocked; keep the privacy toggle disabled until encryption is available.
- Always surface errors from `getPubkey()` or `signMessage()` to the caller so
  the UI can display a meaningful failure state.
