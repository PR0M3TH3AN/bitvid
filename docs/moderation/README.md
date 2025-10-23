# bitvid Moderation Overview

## What we’re building
bitvid is follow-centric. Your Home feed comes from people you follow (F1). Discovery can optionally expand to friends-of-friends (F2) and ranked sources. Moderation is **client-side** and **user-controlled** with optional admin lists.

## Core principles
- **Freedom to choose**: User picks filters. Defaults are safe but reversible.
- **Explain decisions**: Every blur/hide shows a “why” badge and a “show anyway” control.
- **Whitelist > blacklist**: Prefer showing content from trusted networks over fighting global spam.
- **Minimal central power**: Admin lists are opt-in; users can unsubscribe.

## Threat model (short)
- Spam/bots, impersonation, malware, NSFW thumbnails, illegal content, brigading/dogpiles, Sybil report attacks.

## Building blocks (Nostr)
- **Reports**: NIP-56 (`kind 1984`) with types like `nudity`, `spam`, `illegal`, `impersonation`, etc.
- **Lists**: NIP-51 (mute list 10000, categorized people 30000, bookmarks 30001).
- **Replies/threads**: NIP-10 (comments).
- **Counts**: NIP-45 (relay COUNT; optional fallbacks).
- **View metrics**: [`js/nostr/viewEventBindings.js`](../../js/nostr/viewEventBindings.js) wraps the shared client so moderation
  toggles hit the same record/list/subscribe/count helpers that enforce our NIP-71/NIP-78 guard rails when relays disable optional
  methods.

## Runtime flow (blur, hide, override)
- [`ModerationService`](../../js/services/moderationService.js) orchestrates ingest and scoring. Review the service for the trusted-report math and helper entry points.
- [`createModerationStage`](../../js/feedEngine/stages.js) wires the service into the feed engine where moderation summaries decorate timeline items.
- [`bitvidApp.decorateVideoModeration`](../../js/app.js) connects stage output to the UI layer alongside feature-flag plumbing.
- [`VideoCard.refreshModerationUi`](../../js/ui/components/VideoCard.js) applies badges, blur states, hide metadata (`data-moderation-hidden`), and the "show anyway" toggles.

## Where to extend
Thread new moderation behaviors through the same service → stage → app → UI flow above. Extending the existing layers keeps overrides, feature flags, and QA hooks consistent—avoid spinning up parallel moderation modules unless the architecture document explicitly calls for it.

## Defaults (policy)
- Blur video thumbnails if **≥ 3** F1 friends report `nudity`.
- Disable autoplay preview if **≥ 2** F1 friends report `nudity`.
- Hide videos when **≥ 1** trusted contact mutes the author (`TRUSTED_MUTE_HIDE_THRESHOLD`). Cards render with `data-moderation-hidden="true"`, the badge reads `Hidden · 1 trusted mute`, and a "Show anyway" button becomes available.
- Hide videos when **≥ 3** trusted contacts file spam reports (`TRUSTED_SPAM_HIDE_THRESHOLD`). The badge copy escalates to `Hidden · 3 trusted spam reports` and the card stays hidden until the viewer overrides it.
- Downrank author when any F1 has them in mute list (10000).
- Opt-in admin lists (30000 with `d=bitvid:admin:*`) can hard-hide content.
- Trust seeds from `DEFAULT_TRUST_SEED_NPUBS` count as baseline F1 contacts (toggle via `FEATURE_TRUST_SEEDS`).

> You can override all defaults in **Settings → Safety & Moderation**.

### Hide thresholds & feature flags

- `TRUSTED_MUTE_HIDE_THRESHOLD` and `TRUSTED_SPAM_HIDE_THRESHOLD` determine when moderation metadata marks an item as hidden. Both feed the `original.hide*` fields that `VideoCard` inspects before deciding whether to render the hidden summary container.
- `FEATURE_TRUSTED_HIDE_CONTROLS` shows the additional threshold inputs in the profile modal so operators can raise/lower the hide triggers client-side.
- When any hide threshold fires we persist the active counts (`hideCounts.trustedMuteCount`, `hideCounts.trustedReportCount`) so analytics/debugging tools can show why an item disappeared.
- Cards that arrive with `original.hidden === true` automatically expose the "Show anyway" chip so viewers can inspect hidden content. Activating the override clears blur/autoplay restrictions alongside the hidden state.

## Community blacklist federation

Operators can delegate hard-hide decisions to trusted curators without giving them full admin powers. The flow is:

1. The super admin maintains a `kind 30000` list with `d=${ADMIN_LIST_NAMESPACE}:${ADMIN_COMMUNITY_BLACKLIST_SOURCES}`. Each `a` tag references a community curator’s blacklist as `30000:<curator hex pubkey>:${ADMIN_LIST_NAMESPACE}:${ADMIN_COMMUNITY_BLACKLIST_PREFIX}:<slug>`.
2. Every curator publishes their own `kind 30000` list using the referenced `d` tag (`${ADMIN_LIST_NAMESPACE}:${ADMIN_COMMUNITY_BLACKLIST_PREFIX}:<slug>`) and fills it with `p` tags for accounts they want hidden.
3. bitvid automatically fetches each referenced list, merges the entries into the global blacklist, and removes any duplicates or guard-protected accounts (super admin, editors, or whitelist members).

To add a community list, append a new `a` tag to the super-admin source list and ask the curator to publish their companion `p` list. To remove a list, delete the `a` tag or ask the curator to clear their `p` entries; the client stops ingesting it on the next refresh.

New operators should also note that fresh viewer accounts automatically inherit the merged admin + community blacklist on their first login. The client seeds the user’s personal block list with that baseline once, so moderators can rely on a shared floor while still allowing operators to remove entries locally without having them reappear.

### Safety & Moderation controls

The profile modal now exposes blur, autoplay, and hide thresholds so operators can dial in stricter or more permissive behavior. Enter a non-negative whole number to override the default or leave the field blank to fall back to the baseline values above. Adjustments are stored locally, applied immediately to the active feed, and rehydrate on every load.

### Runtime flags

- `TRUSTED_MUTE_HIDE_THRESHOLD` — numeric default for the trusted mute hide control (default `1`).
- `TRUSTED_SPAM_HIDE_THRESHOLD` — numeric default for the trusted spam hide control (default `3`).
- `FEATURE_TRUSTED_HIDE_CONTROLS` — boolean toggle to hide/show the new trusted hide controls in the UI (default `true`).

## Files in this folder
- `web-of-trust.md` — how we compute trust signals and thresholds
- `nips.md` — exact NIPs and kinds bitvid uses
- `relays.md` — relay compatibility and COUNT fallbacks
- `testing.md` — QA checklist + test vectors
