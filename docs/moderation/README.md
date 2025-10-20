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

## Runtime flow (blur, hide, override)
- [`ModerationService`](../../js/services/moderationService.js) orchestrates ingest and scoring. Review the service for the trusted-report math and helper entry points.
- [`createModerationStage`](../../js/feedEngine/stages.js) wires the service into the feed engine where moderation summaries decorate timeline items.
- [`bitvidApp.decorateVideoModeration`](../../js/app.js) connects stage output to the UI layer alongside feature-flag plumbing.
- [`VideoCard.refreshModerationUi`](../../js/ui/components/VideoCard.js) applies badges, blur states, and "show anyway" toggles.

## Where to extend
Thread new moderation behaviors through the same service → stage → app → UI flow above. Extending the existing layers keeps overrides, feature flags, and QA hooks consistent—avoid spinning up parallel moderation modules unless the architecture document explicitly calls for it.

## Defaults (policy)
- Blur video thumbnails if **≥ 3** F1 friends report `nudity`.
- Disable autoplay preview if **≥ 2** F1 friends report `nudity`.
- Downrank author when any F1 has them in mute list (10000).
- Opt-in admin lists (30000 with `d=bitvid:admin:*`) can hard-hide content.

> You can override all defaults in **Settings → Safety & Moderation**.

## Files in this folder
- `web-of-trust.md` — how we compute trust signals and thresholds
- `nips.md` — exact NIPs and kinds bitvid uses
- `relays.md` — relay compatibility and COUNT fallbacks
- `testing.md` — QA checklist + test vectors
