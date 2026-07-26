# BitVid BitUnlock permission-layer TODO

Date: 2026-07-23

Authoritative design: [`../docs/BITUNLOCK_PERMISSION_LAYER_PLAN.md`](../docs/BITUNLOCK_PERMISSION_LAYER_PLAN.md)

BitUnlock generic profile: `PR0M3TH3AN/bitunlock/docs/STREAMING_SUBSCRIPTION_ACCESS_PROFILE.md`

## Goal

Evolve BitVid into a creator-controlled Nostr media platform supporting public videos, purchases,
rentals, memberships, platform subscriptions, bundles, and events while using BitUnlock as the single
generic payment-verification and entitlement layer.

BitVid owns catalog and playback behavior. BitUnlock owns payment-backed permission. BitRoad remains an
optional storefront and is never required during playback.

## Execution order

Complete phases in order unless a documented dependency explicitly permits parallel work. Do not start
automatic recurring billing, households, or metered viewing before the single-user manual-renewal
subscription path is proven end to end.

## Phase 0 — Freeze the boundary and policy format

- [ ] Approve the responsibility split among BitVid, BitUnlock, BitRoad, and the media origin/CDN.
- [ ] Define `bitvid-access-policy-v1` as an OR-of-routes policy.
- [ ] Define routes for public, login-only, permanent purchase, purchase-relative rental, creator
      membership, platform subscription, bundle/catalog pass, event admission, and delayed public
      release.
- [ ] Decide whether NIP-71 events reference a separate replaceable access-policy event or carry a
      minimal policy-coordinate tag.
- [ ] Preserve ordinary public NIP-71 interoperability.
- [ ] Define resource IDs, catalog groups, product coordinates, policy versions, and migration rules.
- [ ] Add schemas and negative vectors for malformed policies and cross-resource substitution.
- [ ] Threat-model receipt privacy, copied receipts, wrong buyers, wrong products, expired/revoked
      terms, capability leakage, and public metadata disclosure.

### Exit criterion

A public video remains playable in an ordinary NIP-71 client, while a protected test video can publish
metadata and a locked state without exposing a permanent private playback URL.

## Phase 1 — Identity, entitlement recovery, and verification

- [ ] Pin the production and sandbox BitUnlock service identities.
- [ ] Reuse BitVid's signer facade for buyer authentication; add BitLogin as an adapter/integration
      path without creating a second identity stack.
- [ ] Add a buyer entitlement store with local encrypted cache and recovery adapters.
- [ ] Integrate BitUnlock buyer recovery.
- [ ] Integrate `verifyEntitlement()` for buyer, service, product, signature, schema, and policy checks.
- [ ] Integrate expiry evaluation and online revocation/status checks where the route requires them.
- [ ] Return typed access decisions rather than booleans.
- [ ] Add unit tests for copied receipt, wrong buyer, wrong product, unsupported version, bad signature,
      expiry, revocation, and unavailable status service.
- [ ] Ensure no public endpoint can enumerate a buyer's purchases.

### Exit criterion

A separately generated sandbox entitlement can be recovered and correctly accepted or rejected by
BitVid without custom payment or cryptographic logic outside the BitUnlock SDK.

## Phase 2 — Locked media UX and checkout

- [ ] Render locked video cards and modal/page states.
- [ ] Display the accepted routes for a protected video: buy, rent, join creator, subscribe, or buy
      event pass.
- [ ] Integrate BitUnlock quote creation and wallet presentation.
- [ ] Resume partially paid orders without repaying settled legs.
- [ ] Unlock and validate the resulting fulfillment/entitlement.
- [ ] Recover completed purchases after refresh or on a new device.
- [ ] Display which route currently grants access and when it expires.
- [ ] Add manual renewal entry points.
- [ ] Accept compatible entitlements created by purchases initiated in BitRoad.
- [ ] Add fake-sats fixtures for every supported route.

### Exit criterion

A viewer can complete, interrupt, resume, and recover a sandbox purchase or subscription entirely from
the BitVid interface.

## Phase 3 — Trusted playback authorization

- [ ] Choose the minimal BitVid authorization-service/edge-function architecture.
- [ ] Require server-side buyer authentication for private-origin access.
- [ ] Verify buyer-presented BitUnlock entitlements in the trusted component.
- [ ] Evaluate `bitvid-access-policy-v1` server-side.
- [ ] Issue a short-lived, resource-scoped playback capability.
- [ ] Bind capabilities to buyer or delegated device, resource, route/entitlement, audience, expiry,
      and session revision.
- [ ] Integrate one private test origin using a signed URL, signed cookie, or opaque origin session.
- [ ] Keep all video bytes out of BitUnlock.
- [ ] Exclude entitlements, signed URLs, playback tokens, storage credentials, and NWC data from logs.
- [ ] Test replay, cross-video substitution, wrong audience, token expiry, and session revocation.

### Exit criterion

An independently versioned BitVid authorization component verifies a subscription entitlement and
issues a five-minute capability for exactly one protected video, with bytes served directly by the
private origin.

## Phase 4 — Manual-renewal subscription MVP

- [ ] Register one creator monthly membership product in BitUnlock.
- [ ] Register one BitVid platform monthly subscription product.
- [ ] Map those products to separate catalog groups.
- [ ] Add current-plan and expiry UI.
- [ ] Add manual Lightning renewal against the same product.
- [ ] Confirm each renewal creates a new immutable entitlement period.
- [ ] Demonstrate seller revocation and natural expiry.
- [ ] Recover the active entitlement on another device/client.
- [ ] Enforce an initial one-active-playback-session policy.
- [ ] Complete the full flow in fake-sats sandbox.
- [ ] Complete one controlled real-mainnet subscription and playback test after sandbox proof.

### Exit criterion

A buyer subscribes, plays an included video, loses access after expiry/revocation, renews, regains
access, and recovers that access on another client without mutating the old receipt or repaying an
already completed period.

## Phase 5 — Purchases, rentals, bundles, and events

- [ ] Permanent individual-video purchase accepted as an alternate route to a subscription video.
- [ ] Purchase-relative rental.
- [ ] Season/course/collection pass.
- [ ] Pay-per-view event with optional replay window.
- [ ] Delayed public release.
- [ ] Creator patron tiers with benefits beyond playback.
- [ ] Clear UX when several routes are available or already owned.
- [ ] Refund/revocation policy documentation appropriate to each route.

## Phase 6 — Production streaming

- [ ] Select HLS/DASH packaging and CDN/origin architecture.
- [ ] Define manifest and segment authorization.
- [ ] Choose signed cookies, session headers, or query tokens based on CDN behavior.
- [ ] Renew playback authorization during long videos without another payment prompt.
- [ ] Preserve adaptive bitrate switching and seeking after session renewal.
- [ ] Preserve MP4 byte-range behavior.
- [ ] Define CORS and CSP for BitVid, authorization service, and media origins.
- [ ] Define cache behavior that does not make protected manifests public.
- [ ] Keep WebTorrent for public content; document encrypted permanent-purchase use and reject claims
      of revocable private plaintext torrent streaming.
- [ ] Load-test authorization, renewal, and failure recovery.
- [ ] Add operational suspension and incident recovery.

## Phase 7 — Devices, profiles, and households

- [ ] Design buyer-authorized delegated device keys or application sessions.
- [ ] Add device naming, listing, expiry, and remote sign-out.
- [ ] Limit delegation to the BitVid audience and subscription scope.
- [ ] Add maximum-device and concurrent-stream policies by plan.
- [ ] Add profiles and parental controls as BitVid application state.
- [ ] Add household-member authorization without sharing the root Nostr key.
- [ ] Add recovery when a television/device key is lost.
- [ ] Threat-model stolen device sessions and delegation replay.

## Phase 8 — Advanced billing

- [ ] Write a separate automatic-renewal design using explicitly restricted buyer NWC authorization.
- [ ] Require merchant/product binding, amount cap, billing interval, cumulative limit, cancellation,
      notification, and duplicate-charge protection.
- [ ] Complete independent security review before enabling automatic charges.
- [ ] Add trials, promotions, upgrades, downgrades, and plan transitions.
- [ ] Add Cashu/prepaid or batched metered viewing only after BitUnlock's batched fee accounting exists.
- [ ] Define non-custodial creator/platform revenue reporting.

## Security and privacy gates

- [ ] Client-side verification is never the sole control for a private origin.
- [ ] A copied entitlement fails for a different authenticated pubkey.
- [ ] A valid entitlement for an unaccepted product fails.
- [ ] Expired and revoked terms cannot create new playback sessions.
- [ ] Access policy, service identity, and schema versions are pinned.
- [ ] Protected NIP-71 metadata exposes no permanent private object URL or key.
- [ ] Buyer receipt recovery remains private and buyer-scoped.
- [ ] Logs contain no NWC credentials, storage credentials, entitlement plaintext, or bearer tokens.
- [ ] Cross-channel, cross-video, cross-product, and cross-tenant substitutions fail closed.
- [ ] BitUnlock is never used as a media proxy.

## Reference acceptance suite

- [ ] Public video works without BitUnlock.
- [ ] Login-only route works without payment.
- [ ] Permanent purchase route works.
- [ ] Rental route expires correctly.
- [ ] Creator membership route works.
- [ ] Platform subscription route works.
- [ ] Bundle/event routes work.
- [ ] Several routes can authorize the same video.
- [ ] BitRoad-originated entitlement works inside BitVid.
- [ ] Interrupted checkout recovers without duplicate payment.
- [ ] New-device entitlement recovery works.
- [ ] Wrong buyer/product/resource and copied receipts fail.
- [ ] Revocation and expiry stop new sessions.
- [ ] Playback capability is short-lived and resource-scoped.
- [ ] Origin serves bytes directly.

## Deferred non-goals

- Automatic charging in the first subscription release.
- Full household detection in the first subscription release.
- Strong DRM claims against screen capture or authorized-user copying.
- Private plaintext WebTorrent subscription delivery.
- Pay-per-minute Lightning invoices.
- Geographic media-rights enforcement.
