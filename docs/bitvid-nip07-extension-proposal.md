# Proposal: A Batch-Capable "bitvid nip-07" Extension

> **Status:** Exploratory / forward-looking. This is a design note, not a committed
> roadmap item. It describes a hypothetical signer extension that would remove a
> class of performance ceilings bitvid (and other Nostr web apps) hit today, and
> sketches how the client would adopt it without breaking standard NIP-07 users.

## TL;DR

Every NIP-07 call (`signEvent`, `nip04.decrypt`, `nip44.decrypt`, …) is a single
message round-trip to one browser extension that, in practice, processes requests
serially. For features that need **many** decryptions — Direct Messages, encrypted
watch history, encrypted hashtag preferences — this one straw becomes the dominant
bottleneck and forces every subsystem to compete for it. No amount of client-side
"pipelining" removes it, because all pipelines terminate at the same serialized
extension.

A purpose-built extension could parallelize this work **internally** by adding:

1. A **batch decrypt/encrypt API** (`decryptMany` / `encryptMany`) so the page hands
   over N items in one round-trip.
2. An internal **worker pool** that fans the cryptography across CPU cores.
3. Internal **conversation-key caching** so the expensive ECDH derivation happens
   once per counterparty, not once per message.
4. A **capability descriptor** so clients can feature-detect and gracefully fall back.

None of this requires exposing the user's private key, and the most valuable parts
do not even require exposing the per-conversation key. This document explains the
constraint, the proposed surface, the client adoption path, the security model, and
the classes of app this unlocks.

---

## 1. The problem, precisely

### 1.1 Where the serialization comes from

The bottleneck is **not** bitvid's request queue — it is the extension boundary
itself. A NIP-07 call crosses `page → content script → background`, and most
extensions:

- handle those messages **serially** in the background, and/or
- drop the channel under concurrent in-flight requests (the classic
  "message channel closed" / decrypt-timeout failure).

bitvid already mitigates this defensively. See
[`js/nostr/nip07Permissions.js`](../js/nostr/nip07Permissions.js):

- `Nip07RequestQueue` serializes extension calls with `maxConcurrent = 2`
  (intentionally conservative — higher concurrency triggers channel drops on some
  providers).
- `NIP07_PRIORITY` (`HIGH = 10 / NORMAL = 5 / LOW = 1`) lets critical work (e.g.
  blocklist decryption in [`js/userBlocks.js`](../js/userBlocks.js)) jump the line.
- Every extension call funnels through `runNip07WithRetry(...)`, used by
  [`js/nostr/adapters/nip07Adapter.js`](../js/nostr/adapters/nip07Adapter.js).

This is the right defensive design, but it is fundamentally a **scheduler over a
single serialized resource**. It decides _who waits_, not _how fast the work goes_.

### 1.2 The "see-saw" this produces

DM decryption, watch-history decryption, and hashtag-preference decryption all
enqueue at `NIP07_PRIORITY.NORMAL` (see the candidate wiring in
[`js/nostr/client.js`](../js/nostr/client.js) and
[`js/services/hashtagPreferencesService.js`](../js/services/hashtagPreferencesService.js)).
With only two concurrency slots and FIFO-within-tier ordering, whichever subsystem
enqueues a burst first monopolizes the extension:

- Let DMs flood the queue on login → the feed, hashtags, and watch history starve.
- Defer DMs to keep the feed responsive → DMs never surface.

This is why historically "getting DMs working" tended to break the feed and vice
versa. It is a contention problem over one serialized resource, not a logic bug in
any single feature.

> Related, already-fixed pathology: an unconditional `"fingerprint"` emit caused the
> For You feed to re-run every ~400ms, which re-triggered watch-history decryption in
> a loop and **amplified** extension contention until everything stalled. See
> [`js/watchHistoryService.js`](../js/watchHistoryService.js) (emit-on-change guard).
> That fix removed the amplifier; it did not remove the underlying single-straw
> ceiling, which is what this proposal targets.

### 1.3 Why the private key can't simply be used locally

For `nsec` / session-actor logins, bitvid already decrypts **off** the extension in a
Web Worker with the raw key (the worker candidates in `client.js` and
[`js/nostr/dmDecryptWorker.js`](../js/nostr/dmDecryptWorker.js)) — genuinely parallel,
no contention. **NIP-07 users get none of this**, by design: the private key never
leaves the extension, so the page cannot derive conversation keys or decrypt locally.
Standard NIP-07 exposes only `nip44.decrypt(pubkey, ciphertext)` — one call, one
message, key derivation hidden inside the extension. That is the hard limit this
proposal works around.

---

## 2. Design goals

1. **Throughput without key exposure.** Parallelize decryption while the private key
   stays in the extension.
2. **Graceful degradation.** A bitvid build must run unchanged against a standard
   NIP-07 extension; the fast path is purely opportunistic.
3. **Bounded blast radius.** Any optional key-sharing capability must be
   per-conversation, decrypt-only, revocable, and origin-scoped.
4. **No new trust in the page.** The default fast path should require the page to
   trust the extension _less_, not more (the extension does the work; the page just
   waits once).

---

## 3. Proposed extension surface

All additions live under a namespaced object so they never collide with the standard
spec and are trivially feature-detected:

```js
window.nostr.bitvid = {
  // Capability descriptor — clients read this to decide which path to take.
  capabilities: {
    version: 1,
    batch: true, // decryptMany / encryptMany available
    workerPool: true, // crypto parallelized across cores internally
    keyCache: true, // conversation keys cached inside the extension
    conversationKey: false // see §6 — opt-in, off by default
  },

  // Batch decrypt: one round-trip, N items, parallelized internally.
  // Returns results positionally; never throws for a single bad item.
  async decryptMany(items /* [{ id, scheme, pubkey, ciphertext }] */) {
    // -> [{ id, ok: true, plaintext } | { id, ok: false, error }]
  },

  async encryptMany(items /* [{ id, scheme, pubkey, plaintext }] */) {
    // -> [{ id, ok: true, ciphertext } | { id, ok: false, error }]
  },

  // Optional, opt-in, gated by an explicit per-origin user grant (see §6).
  // Returns a per-conversation symmetric key the page can use to decrypt
  // locally. Decrypt-only material; never the identity private key.
  async getConversationKey(pubkey, { scheme }) {
    // -> { ok: true, key: Uint8Array } | { ok: false, error }
  }
};
```

### 3.1 What each capability buys

| Capability                 | Removes                                           | Net effect                                                      |
| -------------------------- | ------------------------------------------------- | --------------------------------------------------------------- |
| `batch`                    | Per-message channel round-trips                   | 200 DMs → **1** message instead of 200                          |
| `workerPool`               | Serial CPU-bound ECDH/AEAD                        | Crypto fans across cores                                        |
| `keyCache`                 | Repeated ECDH for the same contact                | First message pays derivation; rest are cheap symmetric ops     |
| `conversationKey` (opt-in) | The extension boundary entirely, per conversation | Page decrypts locally, fully parallel — at a security cost (§6) |

The first three are pure wins with **no** change to the trust model: the key never
leaves the extension, and the page simply submits more work per round-trip.

---

## 4. Client adoption path (bitvid side)

The client stays correct against any extension by **feature-detecting and falling
back**. Conceptually:

```js
function getDecryptStrategy(ext) {
  const caps = ext?.bitvid?.capabilities;
  if (caps?.batch) {
    return new BatchDecryptStrategy(ext.bitvid); // fast path
  }
  return new SerialQueueStrategy(ext); // today's runNip07WithRetry path
}
```

Concrete integration points that already exist and would gain a fast path:

- **DM hydration** — [`js/services/dmNostrService.js`](../js/services/dmNostrService.js)
  already batches with `pMap`; it would submit one `decryptMany` call instead of N
  queued calls.
- **Decryptor selection** — [`js/dmDecryptor.js`](../js/dmDecryptor.js) ordering logic
  (nip04-first for legacy kind-4, explicit hints win) is unchanged; only the transport
  underneath changes.
- **Watch history** — [`js/watchHistoryService.js`](../js/watchHistoryService.js) /
  [`js/nostr/watchHistory.js`](../js/nostr/watchHistory.js) decrypt monthly snapshots;
  these become a single batch, which also removes the cold-load latency that currently
  blocks the fingerprint that drives the For You feed.
- **Hashtag prefs** — [`js/services/hashtagPreferencesService.js`](../js/services/hashtagPreferencesService.js).

Crucially, the existing queue and priority system stays as the **fallback** for
standard extensions, so nothing regresses for the majority of users. The batch path
is additive.

### 4.1 Even the fallback improves

Independently of any extension change, the client should keep reducing extension
calls so the serial path is rarely exercised:

- **Persisted plaintext cache** ([`js/nostr/persistedPlaintextCache.js`](../js/nostr/persistedPlaintextCache.js))
  — second visit skips the extension entirely.
- **Lazy DM hydration** — decrypt only the latest message per conversation for the
  list, and a thread's full history on open, instead of all DM history at login.
- **Fair scheduling** — reserve one of the two concurrency slots for background work
  so DMs can never fully starve the feed (and vice versa).

These are the pragmatic wins available _today_; the extension proposal is the ceiling
removal available _if_ such an extension exists.

---

## 5. Reference internal architecture (extension side)

A conforming extension would, on a `decryptMany` request:

1. Group items by counterparty `pubkey` + `scheme`.
2. For each group, derive the conversation key **once** (cache it, keyed by
   `pubkey+scheme`, with a bounded TTL/LRU).
3. Dispatch the symmetric AEAD work to a worker pool sized to `navigator.hardwareConcurrency`.
4. Resolve positionally so a single malformed item yields `{ ok: false }` without
   failing the batch.

Platform caveat: Chrome MV3 background **service workers** are ephemeral and event
-driven, which complicates a long-lived worker pool (it may be torn down between
calls). Mitigations: lazily (re)spawn workers per batch, keep batches self-contained,
and treat the key cache as best-effort. Firefox event pages are friendlier. None of
this changes the public surface.

---

## 6. Security model

### 6.1 The default fast path (batch + worker pool + key cache)

- The identity private key **never leaves the extension**.
- Per-conversation keys **never leave the extension**.
- The page submits ciphertext and receives plaintext — exactly today's trust model,
  just with more work per message and internal parallelism.
- Therefore the default fast path requires **no new trust** and should be safe to
  expose without an extra permission prompt beyond the normal decrypt grant.

### 6.2 The opt-in `getConversationKey` capability (off by default)

Exposing a per-conversation symmetric key lets the page decrypt locally with zero
further extension calls — the maximum throughput — but it widens the attack surface:

- A malicious or XSS-compromised page could decrypt **all past and future** messages
  with that one counterparty.
- It is strictly less catastrophic than leaking the identity key (scoped to one
  conversation, decrypt-only, cannot sign or impersonate), but it is still real
  exposure.

Therefore it must be:

- **Off by default**, gated behind an explicit, per-origin, human-readable grant
  ("Allow bitvid.app to read messages with @alice locally?").
- **Per-conversation**, never "all conversations".
- **Revocable** from an extension-managed permission panel.
- **Origin-scoped** and ideally **expiring**.

bitvid would treat `conversationKey` as a power-user optimization, not a default
dependency. The batch path (§6.1) already removes the bottleneck for ordinary use
without it.

### 6.3 Threat-model note for reviewers

Adding any capability here must be weighed against bitvid's existing
[DM privacy model](./dm-privacy-model.md) and
[auth architecture](./auth-architecture.md). The guiding rule: **prefer capabilities
that keep secrets in the extension** (batch, worker pool, key cache) and treat any
secret-exposing capability as opt-in with a bounded, revocable, per-conversation
scope.

---

## 7. What this unlocks (beyond bitvid)

A batch-capable signer turns "encrypted bulk data over Nostr" from a latency trap into
a routine pattern, enabling app classes that are impractical on serial NIP-07 today:

- **Encrypted messengers** with large backfill (decrypt thousands of historical DMs on
  first load without freezing the UI or starving other features).
- **Encrypted social graphs / preferences** (large mute lists, follow categories,
  per-tag preferences) decrypted in one pass.
- **Encrypted documents & collaborative apps** (notes, kanban, spreadsheets) stored as
  many encrypted chunks and rehydrated in bulk.
- **Encrypted media libraries** (per-item keys for private playlists / watch history)
  resolved as a batch instead of item-by-item.
- **Local-first / offline-capable Nostr apps** that rehydrate a large encrypted store
  on launch and stay responsive.

In each case the change is the same: the client stops being throttled by a
per-item serialized round-trip, and the signer becomes a parallel batch processor
rather than a single straw.

---

## 8. Standardization angle

The namespaced `window.nostr.bitvid.*` surface is deliberately vendor-prefixed so it
can ship and be tested without spec churn. If it proves useful, the batch primitives
(`decryptMany` / `encryptMany` + a capability descriptor) are natural candidates for a
NIP-07 extension proposal, since the underlying need — "decrypt many items efficiently
without leaking keys" — is general to the ecosystem, not specific to bitvid. The
opt-in `getConversationKey` capability is more contentious and would warrant its own
focused discussion given the security tradeoff in §6.2.

---

## 9. Summary

| Layer              | Today                                        | With a batch-capable extension            |
| ------------------ | -------------------------------------------- | ----------------------------------------- |
| Transport          | 1 message per item, serial, max 2 concurrent | 1 message per **batch**                   |
| CPU                | Serial ECDH + AEAD                           | Worker pool across cores                  |
| Key derivation     | Often repeated per message                   | Cached per counterparty                   |
| Feature contention | DMs vs feed vs history see-saw               | Bulk work no longer monopolizes one straw |
| Trust model        | Key in extension                             | **Unchanged** for the default fast path   |

The serialized NIP-07 ceiling is an implementation artifact, not a cryptographic or
browser law. A batch + worker-pool + key-cache extension would lift it while keeping
the private key — and even the per-conversation key — inside the signer. bitvid can be
written to use such an extension opportunistically today and fall back cleanly to the
existing priority queue when it is absent.
