# BitVid BitUnlock permission-layer plan

Status: proposed application architecture and implementation plan, 2026-07-23.

BitVid should evolve from a public Nostr video client into a creator-controlled media platform that
supports public media, purchases, rentals, creator memberships, platform subscriptions, bundles, and
pay-per-view access. BitUnlock is the reusable payment-verification and permission layer beneath those
features.

The architectural rule is:

> **BitVid owns media behavior. BitUnlock owns payment-backed permission.**

Related projects and documents:

- BitUnlock `docs/STREAMING_SUBSCRIPTION_ACCESS_PROFILE.md` — generic entitlement and streaming-access profile.
- BitUnlock `docs/GATED_ACCESS_PLATFORM_PLAN.md` — renewable/revocable entitlements and relying-party verification.
- BitUnlock `docs/ACCESS_GRANTS_PLAN_V2.md` — bring-your-own-storage capability patterns.
- BitUnlock `docs/SECURITY_AUDIT_AND_RESILIENCE_PLAN.md` — security, migration, backup, and recovery gates.
- BitVid [`nostr-event-schemas.md`](./nostr-event-schemas.md) — current NIP-71 event behavior.
- BitVid [`playback-fallback.md`](./playback-fallback.md) — current URL/WebTorrent playback behavior.

## 1. Product direction

BitVid remains a Nostr-native, creator-controlled video application, but its access model expands from
"public or hidden" into a general policy system.

BitVid should support:

- public videos;
- login-only videos;
- permanent individual purchases;
- time-limited rentals;
- creator memberships;
- platform-wide subscription catalogs;
- bundles, seasons, courses, and collection passes;
- pay-per-view premieres and livestreams;
- patron/supporter tiers;
- free previews and delayed public release;
- future prepaid or metered viewing where economically appropriate.

A single video may accept several routes. For example, a viewer may qualify through an individual
purchase, an active rental, a creator membership, or a platform subscription.

## 2. Responsibility boundary

### BitVid owns

- NIP-71 publishing and compatibility;
- channels, catalogs, playlists, seasons, bundles, and collections;
- search, discovery, feeds, recommendations, and moderation;
- profiles, watch history, favorites, and parental controls;
- access-policy authoring and resource-to-product mapping;
- checkout presentation inside the BitVid UI;
- playback-session creation and renewal;
- HLS/DASH manifests, MP4 range behavior, WebTorrent policy, storage, CDN, and origin integration;
- devices, concurrent streams, household rules, and application sessions;
- creator dashboards, pricing presentation, support, refunds, and catalog management.

### BitUnlock owns

- product registration and policy discovery;
- Lightning/NWC payment-plan creation;
- authoritative settlement verification;
- partial-payment recovery, retries, and idempotency;
- fulfillment and buyer-bound signed entitlement issuance;
- perpetual and term access semantics;
- renewal, expiration, revocation, and buyer recovery;
- generic relying-party verification;
- optional storage-capability issuance for static sellers;
- SDK, schemas, vectors, sandbox, and normalized errors.

### BitRoad's role

BitRoad may list and sell the same products, but BitRoad is not a runtime dependency for playback.
Purchases made through BitRoad and purchases initiated inside BitVid should produce compatible
BitUnlock entitlements that any compatible BitVid client can verify.

## 3. Access modes

### 3.1 Public

The video is playable by any NIP-71 client. No BitUnlock product is required.

### 3.2 Login-only

The video remains free, but BitVid requires a proven Nostr identity before playback. This can support
private communities or account features without payment.

### 3.3 Permanent purchase

The viewer buys a video or catalog item once and receives a perpetual BitUnlock entitlement. BitVid
may issue short-lived playback sessions each time, but the entitlement itself does not expire.

### 3.4 Rental

The viewer buys a term entitlement. The first MVP should use purchase-relative expiry because that is
already supported by BitUnlock. A future first-play-relative rental requires a separate activation
record and must not be inferred from payment alone.

### 3.5 Creator membership

A creator defines one or more membership products. BitVid maps each membership tier to a changing set
of videos and benefits.

Example tiers:

- Supporter — early access and badge;
- Member — premium catalog;
- Producer — premium catalog, downloads, and private livestreams.

BitUnlock verifies the tier entitlement; BitVid owns the current benefit mapping.

### 3.6 Platform subscription

BitVid defines platform-wide plans such as Basic, Premium, Family, Sports, or Annual. The active plan
entitlement grants access to application-defined catalog tiers.

BitUnlock does not need to know which videos are in each tier. BitVid resolves the catalog policy.

### 3.7 Bundle or catalog pass

One entitlement may unlock a season, trilogy, course, conference archive, creator bundle, or topical
collection.

### 3.8 Pay-per-view and livestream admission

A term entitlement may authorize a premiere, live event, conference, or limited screening, with an
optional replay window.

### 3.9 Delayed public release

A video may initially require an entitlement and become public at a specified time. BitVid evaluates
the release timestamp before invoking paid-access checks.

### 3.10 Metered viewing

Pay-per-minute or pay-per-stream is deferred until BitUnlock supports an appropriate prepaid rail and
batched fee accounting. BitVid should not create a Lightning invoice or minimum service fee for every
small playback action.

## 4. Resource access policy

BitVid should represent access as an application-owned OR-of-routes policy.

Conceptual shape:

```json
{
  "version": "bitvid-access-policy-v1",
  "mode": "any",
  "routes": [
    {
      "kind": "public-after",
      "at": 1798761600
    },
    {
      "kind": "bitunlock-entitlement",
      "servicePubkey": "<pinned-service-pubkey>",
      "productCoordinate": "<individual-purchase>"
    },
    {
      "kind": "bitunlock-entitlement",
      "servicePubkey": "<pinned-service-pubkey>",
      "productCoordinate": "<creator-membership>",
      "requireCurrentStatus": true
    },
    {
      "kind": "bitunlock-entitlement",
      "servicePubkey": "<pinned-service-pubkey>",
      "productCoordinate": "<platform-subscription>",
      "requireCurrentStatus": true
    }
  ]
}
```

The exact wire format must be reviewed before implementation. The policy must support:

- multiple acceptable entitlement products;
- public or login-only fallback;
- local release times;
- perpetual versus term expectations;
- mandatory online revocation checks where needed;
- future AND conditions for add-ons or region/catalog constraints;
- explicit service-pubkey pinning and versioning.

## 5. NIP-71 compatibility

BitVid must preserve ordinary NIP-71 interoperability.

Recommended approach:

1. Keep the standard NIP-71 video event valid and useful to other clients.
2. Add an optional reference to a separate replaceable BitVid access-policy event, or a minimal
   extension tag pointing to that policy.
3. Do not publish permanent private storage URLs, decryption keys, playback tokens, buyer identities,
   or subscription state in the public video event.
4. Clients that do not understand the access extension may show metadata and a locked state rather
   than receiving a false public playback URL.
5. Public videos continue to carry normal public playback sources.

A separate access-policy event is preferable to embedding a large mutable catalog rule directly in
every video event. It allows membership/catalog mappings to evolve without republishing media
metadata.

## 6. Viewer flow

### 6.1 Discovery

BitVid loads the NIP-71 event and associated access policy. It can render the card, title, creator, and
preview metadata without revealing protected media capabilities.

### 6.2 Authentication

The viewer signs in through BitLogin, NIP-07, or another supported Nostr signer. BitVid treats the
proven pubkey as the account identity.

### 6.3 Entitlement recovery

BitVid loads buyer-held entitlements from:

- local encrypted storage;
- the buyer's relay/vault recovery path;
- BitUnlock's authenticated buyer-recovery endpoint.

The client should cache receipts but re-evaluate expiry and required revocation status before granting
new playback.

### 6.4 Policy evaluation

BitVid checks local routes first, then verifies candidate BitUnlock receipts against:

- pinned BitUnlock service pubkey;
- authenticated buyer pubkey;
- expected product coordinate;
- supported schema and policy versions;
- entitlement term and expiry;
- current revocation status where required.

### 6.5 Checkout

When no route succeeds, BitVid presents applicable purchase choices inside the video UI:

- buy permanently;
- rent;
- join creator membership;
- subscribe to BitVid plan;
- buy event pass.

The BitUnlock SDK manages quote creation, wallet interaction, partial-payment recovery, bounded
polling, unlock, and entitlement validation.

### 6.6 Playback authorization

After a route succeeds, a trusted BitVid backend or media-origin component issues a short-lived
resource-scoped playback capability. The video bytes flow from the storage/CDN/origin to the viewer,
not through BitUnlock.

## 7. Playback architecture

### 7.1 MVP private-origin path

Use a small BitVid authorization service or edge function:

1. Receive authenticated viewer proof and buyer-presented entitlement.
2. Verify the entitlement with the BitUnlock SDK.
3. Evaluate the BitVid resource policy.
4. Create a short-lived playback session.
5. Return a signed manifest URL, signed cookie, or presigned MP4/object URL.
6. Refresh the session during long playback without requiring a new payment.

### 7.2 Capability properties

The playback capability should bind:

- buyer or delegated device identity;
- video/resource ID;
- accepted policy route and entitlement ID;
- origin/audience;
- issue and expiry time;
- session revision or nonce;
- plan quality/download permissions where applicable.

The capability should normally last minutes, even when the subscription lasts a month.

### 7.3 HLS/DASH

The design must account for:

- manifest authorization;
- segment requests after the original URL expires;
- session renewal during long playback;
- seeking and bitrate switching;
- CDN caching without making protected manifests public;
- signed cookies versus per-segment query tokens;
- CORS and CSP among BitVid, the authorization service, and the media origin.

### 7.4 MP4

For MP4 playback, preserve byte-range support and ensure session renewal does not break seeking. A
short-lived signed cookie or origin session may work better than a one-time URL with an expiry shorter
than the video.

### 7.5 WebTorrent

Public WebTorrent distribution is naturally incompatible with revocable private subscription access
once plaintext media is shared to peers. BitVid should:

- keep WebTorrent for public media;
- allow encrypted torrent payloads for permanent purchases where the buyer receives a decryption key;
- not claim that private subscription streams remain revocable after distributing a reusable
  decryption key or plaintext torrent.

## 8. Subscription MVP

The first subscription release should intentionally avoid automatic charging and household complexity.

MVP capabilities:

- one creator monthly membership product;
- one BitVid platform monthly plan;
- manual Lightning renewal;
- current plan and expiry display;
- renewal checkout against the same product;
- immutable new entitlement for each period;
- expiration and seller revocation;
- catalog-tier mapping;
- recovery on a new device;
- one active viewer session policy;
- short-lived playback session against a private test origin.

The MVP is complete when a buyer can subscribe, recover the entitlement elsewhere, play an included
video, fail after expiry/revocation, renew, and play again without mutating the old receipt.

## 9. Automatic renewal

Automatic renewal is a later phase requiring an explicit, constrained buyer NWC authorization.

Requirements include:

- merchant and product binding;
- maximum amount;
- minimum billing interval;
- period and cumulative spending limits;
- cancellation and revocation;
- duplicate-charge and replay protection;
- notifications and failed-renewal behavior;
- no seller ability to broaden permission silently.

BitVid must not market subscriptions as automatically recurring until this separate authorization flow
has been implemented and reviewed.

## 10. Devices, profiles, and household access

The root Nostr key should not be copied to every television.

Later phases should introduce:

- buyer-authorized device keys or application sessions;
- device list and remote sign-out;
- delegated scope limited to BitVid;
- maximum devices per plan;
- concurrent stream limits;
- profile records and parental controls;
- household-member authorization without sharing the root key;
- revocation and recovery.

Profiles and household rules remain BitVid application state. BitUnlock only verifies the underlying
subscription entitlement unless a future generic delegated-capability feature is intentionally added.

## 11. Creator and operator experience

Creators should be able to:

- register BitUnlock-backed purchase, rental, membership, and event products;
- connect those products to videos, playlists, or catalog groups;
- define accepted access routes;
- preview the locked viewer experience;
- revoke a term entitlement where policy permits;
- see aggregate commerce state without receiving buyer private keys or sensitive credentials;
- use BitRoad as an optional storefront while keeping BitVid-native checkout available.

Operators should be able to:

- configure the accepted BitUnlock service identity;
- configure a private media origin/CDN;
- control playback-session TTLs and concurrent-session policy;
- suspend new paid access safely during incidents;
- audit authorization failures without logging receipts or playback tokens.

## 12. Privacy and security

- Buyer receipts should remain private and buyer-presented.
- BitVid must not expose a public API allowing arbitrary enumeration of buyer purchases.
- Playback tokens, signed URLs, entitlements, NWC URIs, and storage credentials must not enter logs.
- Client-side verification may improve UX but cannot be the sole control for a private media origin.
- Copied receipts must fail for a different authenticated pubkey.
- Valid receipts for unaccepted products must fail.
- Expired and revoked subscriptions must not mint new sessions.
- Cross-video and cross-channel capability substitution must fail.
- BitUnlock's service identity and accepted schema versions must be pinned.
- BitUnlock must never proxy video bytes.
- Private storage/CDN credentials must remain application-side or narrowly scoped and encrypted.

## 13. Implementation phases

### Phase 0 — Architecture and protocol decisions

- [ ] Freeze the BitVid responsibility boundary with BitUnlock and BitRoad.
- [ ] Define `bitvid-access-policy-v1` and negative vectors.
- [ ] Decide the NIP-71 extension/reference format without breaking ordinary clients.
- [ ] Define resource IDs, catalog groups, product coordinates, and policy versioning.
- [ ] Define public, login-only, permanent, rental, membership, subscription, bundle, event, and
      delayed-public routes.
- [ ] Threat-model buyer receipt privacy, copied receipts, cross-resource substitution, and playback
      capability leakage.

### Phase 1 — BitUnlock SDK and identity integration

- [ ] Pin BitUnlock service policy and service pubkey.
- [ ] Add BitLogin/Nostr authenticated buyer context where not already available.
- [ ] Integrate entitlement recovery.
- [ ] Integrate `verifyEntitlement()` and revocation/status checks.
- [ ] Add typed access-decision results and normalized user-facing errors.
- [ ] Add unit tests for wrong buyer, wrong product, bad signature, expiry, and revocation.

### Phase 2 — Locked media UX and checkout

- [ ] Render locked cards and video pages without exposing protected playback URLs.
- [ ] Show accepted purchase/rental/subscription choices.
- [ ] Integrate BitUnlock checkout, partial-payment recovery, and completed-purchase recovery.
- [ ] Display current entitlement route, expiry, and renewal state.
- [ ] Accept entitlements produced by BitRoad purchases.
- [ ] Add sandbox fixtures for each access mode.

### Phase 3 — Playback authorization service

- [ ] Create a minimal trusted BitVid authorization service/edge function.
- [ ] Verify buyer authentication and presented entitlements server-side.
- [ ] Evaluate `bitvid-access-policy-v1`.
- [ ] Issue short-lived resource-scoped playback sessions.
- [ ] Integrate a private test origin with signed URL/cookie support.
- [ ] Add renewal during long playback and safe error recovery.
- [ ] Test cross-video, replay, expiry, and token-leak scenarios.

### Phase 4 — Subscription MVP

- [ ] Register one creator membership and one platform subscription product.
- [ ] Map subscription products to catalog groups.
- [ ] Add manual renewal UX.
- [ ] Demonstrate expiry, revocation, renewal, and new-device recovery.
- [ ] Add a subscription-management view.
- [ ] Enforce an initial concurrent-session policy.
- [ ] Complete a real mainnet end-to-end subscription and playback test after sandbox proof.

### Phase 5 — Purchases, rentals, bundles, and events

- [ ] Permanent individual video purchase.
- [ ] Purchase-relative rental.
- [ ] Bundle/season/course pass.
- [ ] Pay-per-view and replay window.
- [ ] Delayed public release.
- [ ] Creator tier benefits beyond playback.

### Phase 6 — Production streaming

- [ ] Choose HLS/DASH/CDN architecture.
- [ ] Implement manifest and segment authorization.
- [ ] Preserve MP4 range and seek behavior.
- [ ] Define CORS, CSP, cache, and origin rules.
- [ ] Add playback-session observability without leaking viewing details.
- [ ] Load-test authorization and renewal paths.
- [ ] Add incident suspension and recovery procedures.

### Phase 7 — Devices and households

- [ ] Delegated device keys or application sessions.
- [ ] Device list, revocation, and remote sign-out.
- [ ] Concurrent-stream limits by plan.
- [ ] Profiles and parental controls.
- [ ] Household-member authorization.
- [ ] Recovery without copying the root Nostr private key.

### Phase 8 — Advanced billing

- [ ] Design and audit restricted automatic NWC renewal.
- [ ] Trials, promotions, upgrades, downgrades, and plan transitions.
- [ ] Cashu/prepaid or batched metered viewing after BitUnlock fee accrual is ready.
- [ ] Creator revenue and platform-fee reporting without making BitVid custodial.

## 14. Acceptance criteria

The first complete reference implementation must demonstrate:

1. A standard public NIP-71 video still works in ordinary clients.
2. A protected video reveals no permanent private-media URL publicly.
3. A buyer purchases a monthly BitUnlock subscription inside BitVid.
4. An independently versioned BitVid authorization component verifies the entitlement.
5. The component issues a five-minute capability for the correct video.
6. The media origin serves bytes directly without BitUnlock proxying them.
7. A copied entitlement fails for another pubkey.
8. A valid but unrelated entitlement fails.
9. Expiry and revocation prevent new playback sessions.
10. Manual renewal creates a new entitlement period and restores access.
11. The buyer recovers access on a new device without repaying.
12. An individual permanent purchase is accepted as an alternate route to the same video.
13. A BitRoad-originated purchase works without BitRoad being present during playback.
14. Logs and analytics contain no entitlement plaintext, NWC secrets, storage credentials, or
    playback bearer tokens.

## 15. Explicit non-goals for the first release

- Automatic recurring charges.
- Full Netflix-style household detection.
- Strong DRM guarantees against screen capture or authorized-user copying.
- Private plaintext WebTorrent subscription streaming.
- Pay-per-minute billing.
- Geographic licensing enforcement.
- Recommendation-system redesign.
- Building BitUnlock-specific payment or entitlement logic directly into BitVid instead of using the
  public SDK and generic contracts.
