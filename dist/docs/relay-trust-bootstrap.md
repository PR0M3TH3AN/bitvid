# Relay trust bootstrap

This document describes how `js/services/trustBootstrap.js` seeds trusted relays/actors for moderation, how it waits for relay availability, and how the relay list and admin lists are refreshed.

## Overview

`bootstrapTrustedSeeds()` is a lightweight bootstrapping step that:

1. Waits briefly for admin list hydration and relay readiness.
2. Builds a trusted seed set from admin configuration and defaults.
3. Hands that trusted seed set to `moderationService` so trusted reports, mutes, and summary stats are computed consistently.
4. Re-runs when admin/editor lists change.

## Configuration inputs

Trusted seed inputs are pulled from configuration and feature flags:

- `FEATURE_TRUST_SEEDS` (flag in `js/constants.js`): gates whether bootstrapping runs at all.
- `ADMIN_SUPER_NPUB` (from `config/instance-config.js` via `js/config.js`): always included when set.
- `accessControl.getEditors()` (from `js/accessControl.js`): editor list sourced from admin lists or defaults.
- `DEFAULT_TRUST_SEED_NPUBS` (from `config/instance-config.js` via `js/constants.js`): used only if there are no super/admin seeds.

## Seed selection and trust computation

`buildTrustedSeeds()` composes a `Set` of Nostr `npub` identifiers in this order:

1. Add the super admin (`ADMIN_SUPER_NPUB`).
2. Add editor npubs (`accessControl.getEditors()`).
3. If no seeds exist yet, fall back to `DEFAULT_TRUST_SEED_NPUBS`.

The resulting `Set` is passed to `moderationService.setTrustedSeeds(seeds)`.
`moderationService` uses these seeds as the baseline for trusted contacts and downstream trust calculations (trusted report counts, trusted mute lists, etc.), and `recomputeAllSummaries()` is called immediately after applying seeds so moderation views reflect the updated trust graph.

## Relay readiness and fallback behavior

Bootstrapping is intentionally defensive so the UI can initialize quickly:

- **Access control hydration**: `waitForAccessControl()` races `accessControl.ensureReady()` against a 3.5s timeout. If hydration times out, bootstrapping logs a dev warning and falls back to defaults.
- **Immediate apply**: Seeds are applied immediately after the first hydration attempt, even if the admin list hydration failed, so moderation does not block on relay availability.
- **Retry when relays are ready**: If hydration failed, `bootstrapTrustedSeeds()` checks for relay readiness via `nostrService.nostrClient.relays` (and pool existence). If relays become available within 3.5s, it retries admin list hydration once. If relays never become ready, it logs a dev warning and re-applies the current seeds to keep moderation functional.
- **Change listeners**: `accessControl.onWhitelistChange()` and `accessControl.onEditorsChange()` are registered so any subsequent admin/editor updates re-run seed application and recompute moderation summaries.

## Relay list persistence and refresh

`trustBootstrap` does **not** persist or update relay lists itself. Instead it relies on the shared Nostr client state maintained by the relay manager and access control:

- **Relay list loading**: `js/relayManager.js` loads a profile’s relay list from NIP-65 (kind `10002`) events, normalizes relay URLs, and falls back to `DEFAULT_RELAY_URLS` if nothing is found or the pool is unavailable. The relay manager updates the active `nostrClient` relay list in memory via `nostrClient.applyRelayPreferences()` (or by assigning to `nostrClient.relays`).
- **Relay list refresh**: Relay list changes are published to relays via `relayManager.publishRelayList()` and reloaded during profile refresh flows, which updates `nostrClient.relays` that `trustBootstrap` later observes.
- **Admin list persistence**: `js/accessControl.js` hydrates admin/editor lists from cached state in `js/adminListStore.js` (local storage). It then refreshes from relay-backed admin lists when `ensureReady()` is called. The cache ensures `bootstrapTrustedSeeds()` can use stored admin lists before relays are available.

## Data flow summary

```
config/instance-config.js
  └─> js/config.js -> js/constants.js (FEATURE_TRUST_SEEDS, DEFAULT_TRUST_SEED_NPUBS)
                         └─> js/services/trustBootstrap.js
                                ├─> accessControl.ensureReady() (admin lists + cache)
                                ├─> nostrService.nostrClient.relays (relay readiness)
                                └─> moderationService.setTrustedSeeds() + recomputeAllSummaries()
```

When the relay list or admin lists change, `accessControl` refreshes from cache/relays and the trust bootstrapper re-applies seeds so moderation stays up to date.
