# Channel subscriber counts — feature scope

> Status: **Scoped; not implemented** · Created 2026-07-26

## Goal

Show a useful subscriber/follower count on public BitVid channel profiles without
misrepresenting an estimate as a global Nostr fact or weakening private
subscriptions.

## Constraint that determines the design

BitVid subscriptions are encrypted, private NIP-51 lists. Relays cannot answer
"how many people subscribe to this creator?" from those lists. Querying public
follow lists, where they exist, would be incomplete, expensive, sybil-prone,
and would encourage users to make private follows discoverable. Therefore this
feature must not derive a global count by scanning followers' events.

## Recommended product definition

Ship a clearly labelled **BitVid followers** count, not an unqualified global
"Subscribers" count. It should count only voluntary, public follow attestations
that BitVid can verify and should remain an estimate of the BitVid-visible
audience. Keep the existing private subscription feature private and do not use
it as a counting source.

Before implementation, make one explicit product decision:

1. **Public attestation count (recommended):** a viewer may opt in to publish a
   public, signed follow attestation; BitVid counts valid unique authors for a
   creator. This has a real verifiable numerator but is necessarily partial.
2. **Creator-reported count:** creator publishes a signed number. This is cheap,
   but is self-reported and must be labelled as such.
3. **No public count:** retain private subscriptions only. This is the strongest
   privacy option.

Do not silently fall back from option 1 to option 2.

## Proposed implementation slice (option 1)

### Data model and protocol

- Research existing Nostr follow/interest conventions first; reuse an
  interoperable event if one supports a public creator follow without exposing
  the private BitVid list.
- If no suitable convention exists, write a small BitVid event proposal before
  coding: event kind, tags, replaceability/deletion semantics, creator target,
  timestamp rules, relay selection, and migration/version tag.
- Count at most one current attestation per follower/creator relationship.
- Ignore malformed events, self-follows, deleted/replaced events, and events
  outside the selected protocol version.
- Treat counts as eventually consistent and relay-scoped. Never claim a global
  Nostr total.

### Read path and caching

- Add a dedicated count service/store; do not add follower scans to
  `channelProfile.js` rendering or the normal feed bootstrap.
- Fetch only when a channel profile is opened, with a bounded relay set,
  cancellation on profile navigation, in-flight deduplication, and a short
  cache TTL.
- Render a compact skeleton or omit the count while loading. A failed count
  lookup must never block profile metadata, video loading, zap controls, or
  subscriptions.
- Expose source/coverage only in a low-noise detail surface if needed (for
  example, "BitVid-visible followers"), not as a misleading exact total.

### Channel-profile UI

- Place the count in the creator summary/stat row near videos/zaps, not in the
  profile modal.
- Use the chosen product label consistently: `BitVid followers` for public
  attestations; `Creator-reported subscribers` for self-reported data.
- Provide an accessible label and compact mobile layout; large counts use
  locale-aware formatting.
- The viewer's private Subscribe/Unsubscribe control remains unchanged. If an
  opt-in public follow is added, it is a separate, explicit privacy choice.

### Abuse and privacy safeguards

- Do not expose who follows whom by default beyond the public attestations the
  viewer chose to publish.
- Do not rank or moderate creators solely by this count.
- Rate-limit/bound relay queries and deduplicate by author; document that sybil
  resistance is not provided by a raw public count.
- Preserve viewer blocks/mutes and creator visibility rules in any optional
  follower preview; the count itself must not leak a viewer's private list.

## Tests and acceptance criteria

- Unit tests: unique-author counting, replacement/deletion, malformed events,
  self-follow exclusion, cache TTL, and formatted display values.
- Service tests: bounded/cancelled relay queries, timeout/failure returns an
  unavailable state without clearing a good cached count.
- UI tests: loading, available, unavailable, and mobile wrapping states.
- Manual QA: opening a channel profile has no visible impact on Home feed or
  private subscription list loading; toggling a private subscription publishes
  no public attestation unless the viewer explicitly opts in.

## Non-goals for the first release

- A global Nostr subscriber count.
- Inferring counts from private encrypted lists.
- Follower directories, recommendations, notifications, or monetized tiers.
- Using counts as a trust, moderation, or discovery ranking signal.

## Implementation order

1. Approve the product definition and public/private wording.
2. Complete protocol/convention research and record the selected event shape.
3. Build the bounded count store with tests and fixtures.
4. Add channel-profile presentation and responsive UI tests.
5. Run privacy/performance QA before enabling public-attestation publishing.
