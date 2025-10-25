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

### Moderation badge pipeline

- Every moderation payload now includes a `blurReason` that records why a thumbnail was blurred (`trusted-report`, `trusted-mute`, or a hide reason such as `trusted-mute-hide`). This travels with both the metadata stage output and the decorated `video.moderation.original` snapshot so UI can explain the decision even after a viewer override.
- When a trusted mute forces a blur (without a report threshold firing) the badge copy shortens to **"Muted by a trusted contact"** so we don't repeat the blur state in the label. Reports still surface as "Blurred · {reason}" until the viewer taps "Show anyway".
- The moderation badge now renders as a dedicated yellow chip with an icon and "Show anyway" pill that matches the rest of the design system tokens. Override states flip to the neutral palette and swap the icon for a confirmation check so operators can tell the difference at a glance.
- The badge tooltip and `aria-label` continue to list the specific trusted contacts who muted or reported the content when that metadata is available.
- Viewers who override a trusted mute hide keep a **Hide** pill on the same badge so they can re-hide the clip without hunting through another menu.
- Trusted mute decisions now block autoplay even when report thresholds have not fired, and any associated avatars or channel banners adopt the blurred state alongside the primary thumbnail so the entire card reflects the moderation choice.

## Where to extend
Thread new moderation behaviors through the same service → stage → app → UI flow above. Extending the existing layers keeps overrides, feature flags, and QA hooks consistent—avoid spinning up parallel moderation modules unless the architecture document explicitly calls for it.

## Defaults (policy)
- Blur video thumbnails when trusted `nudity` reports meet `DEFAULT_BLUR_THRESHOLD`.
- Disable autoplay preview when the trusted `nudity` report count reaches `DEFAULT_AUTOPLAY_BLOCK_THRESHOLD`.
- Hide videos when `DEFAULT_TRUSTED_MUTE_HIDE_THRESHOLD` trusted contacts mute the author. Cards render with `data-moderation-hidden="true"`, the badge reads `Hidden · {count} trusted mute(s)`, and a "Show anyway" button becomes available.
- Hide videos when `DEFAULT_TRUSTED_SPAM_HIDE_THRESHOLD` trusted contacts file spam reports. The badge copy escalates to `Hidden · {count} trusted spam report(s)` and the card stays hidden until the viewer overrides it.
- Downrank author when any F1 has them in mute list (10000).
- Opt-in admin lists (30000 with `d=bitvid:admin:*`) can hard-hide content, but whitelist entries no longer bypass moderation gates—they only influence Discovery rankings when a viewer opts into that list.
- Trust seeds now come from the Super Admin plus every active moderator, so their reports shape anonymous/default visitor filters automatically. The `DEFAULT_TRUST_SEED_NPUBS` export only activates as an emergency fallback when those live lists cannot be loaded (toggle via `FEATURE_TRUST_SEEDS`).

> Default thresholds now come directly from [`config/instance-config.js`](../../config/instance-config.js). Look for the exports `DEFAULT_BLUR_THRESHOLD`, `DEFAULT_AUTOPLAY_BLOCK_THRESHOLD`, `DEFAULT_TRUSTED_MUTE_HIDE_THRESHOLD`, and `DEFAULT_TRUSTED_SPAM_HIDE_THRESHOLD` to adjust the instance-wide behavior before deploying. The upstream repo currently publishes example values of 3 trusted reports for blur, 2 for autoplay blocking, 1 trusted mute to hide authors, and 3 trusted spam reports to hide videos.

> Operators can still override these thresholds on a per-viewer basis in **Settings → Safety & Moderation**; leaving the UI fields blank restores the config-driven defaults. Update [`config/instance-config.js`](../../config/instance-config.js) to change what new viewers receive out of the box.

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

The profile modal now exposes blur, autoplay, and hide thresholds so operators can dial in stricter or more permissive behavior. Enter a non-negative whole number to override the default or leave the field blank to fall back to the baseline values from [`config/instance-config.js`](../../config/instance-config.js) (`DEFAULT_BLUR_THRESHOLD`, `DEFAULT_AUTOPLAY_BLOCK_THRESHOLD`, `DEFAULT_TRUSTED_MUTE_HIDE_THRESHOLD`, `DEFAULT_TRUSTED_SPAM_HIDE_THRESHOLD`). Adjustments are stored locally, applied immediately to the active feed, and rehydrate on every load. Update the config file to change the per-instance defaults that new viewers see.

### Personal hashtag preferences

- The Profile modal’s Hashtags tab is wired to [`HashtagPreferencesService`](../../js/services/hashtagPreferencesService.js), which maintains a local snapshot of the viewer’s interests and disinterests, normalizes every tag, and guarantees that the two sets stay mutually exclusive before broadcasting UI change events.【F:js/services/hashtagPreferencesService.js†L206-L276】【F:js/services/hashtagPreferencesService.js†L304-L324】
- `bitvidApp` resolves the active pubkey’s preferences at login, listens for `CHANGE` events, and forwards the normalized snapshot to controllers so moderation and discovery logic can react without querying relays again.【F:js/app.js†L3811-L3906】【F:js/app.js†L3940-L4050】
- Publishing writes a replaceable `kind 30005` list with `d=bitvid:tag-preferences`, encrypting the `{ version, interests, disinterests }` payload via the best available NIP-44/NIP-04 scheme before hitting every configured write relay.【F:docs/nostr-event-schemas.md†L150-L168】【F:js/services/hashtagPreferencesService.js†L520-L711】

### Runtime flags

- `TRUSTED_MUTE_HIDE_THRESHOLD` — numeric default for the trusted mute hide control. Initialized from `DEFAULT_TRUSTED_MUTE_HIDE_THRESHOLD` in [`config/instance-config.js`](../../config/instance-config.js); the upstream config sets this to `1`, but adjust the export to match your policy.
- `TRUSTED_SPAM_HIDE_THRESHOLD` — numeric default for the trusted spam hide control. Initialized from `DEFAULT_TRUSTED_SPAM_HIDE_THRESHOLD` in [`config/instance-config.js`](../../config/instance-config.js); the upstream config example is `3`.
- `FEATURE_TRUSTED_HIDE_CONTROLS` — boolean toggle to hide/show the new trusted hide controls in the UI (default `true`).

## Files in this folder
- `web-of-trust.md` — how we compute trust signals and thresholds
- `nips.md` — exact NIPs and kinds bitvid uses
- `relays.md` — relay compatibility and COUNT fallbacks
- `testing.md` — QA checklist + test vectors
