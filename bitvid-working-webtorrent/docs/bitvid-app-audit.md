# Application Responsibility Audit

This document catalogs the major responsibilities still implemented inside `Application` (formerly `bitvidApp`). Each area is a candidate for future extraction into dedicated service or UI modules.

## Auth & Profile Coordination
- Instantiates `AuthService`, wires login/logout/profile listeners, and exposes helper methods for cached profile state management.【F:js/app.js†L221-L314】【F:js/app.js†L620-L772】
- Manages profile modal lifecycle, navigation between panes, and account switching UI state.【F:js/app.js†L283-L420】【F:js/app.js†L1328-L1822】

## Playback Orchestration
- Configures `PlaybackService`, logs telemetry callbacks, and tracks the active playback session lifecycle.【F:js/app.js†L224-L323】【F:js/app.js†L2805-L3352】
- Coordinates view logging, cooldown keys, and watch-count subscriptions for the primary player and modal overlays.【F:js/app.js†L4305-L4592】【F:js/app.js†L4972-L5332】

## Modal & UI Composition
- Constructs upload, edit, revert, and video modals; registers their event listeners; and bridges UI events back into application logic.【F:js/app.js†L340-L615】【F:js/app.js†L2382-L2799】
- Builds and manages the `VideoListView` component, injecting helpers for health badges, share links, and context menu actions.【F:js/app.js†L516-L744】【F:js/app.js†L2149-L2376】

## Routing & View Bootstrapping
- Handles initial view loading, hash-based navigation, and video list mounting during application startup.【F:js/app.js†L903-L959】【F:js/app.js†L1932-L2124】
- Provides navigation helpers for channel/profile transitions tied to hash routing.【F:js/app.js†L934-L968】

## State & Watch History Management
- Synchronizes watch-history preferences, local metadata caching, and publication of watch history events to services.【F:js/app.js†L1975-L2093】【F:js/app.js†L4087-L4478】
- Tracks app-level state such as active intervals, cleanup routines, view counters, and URL/magnet health caches.【F:js/app.js†L200-L323】【F:js/app.js†L3354-L4075】

These clusters outline the remaining cross-cutting responsibilities that can be incrementally migrated into focused modules under `js/services` and `js/ui`.
