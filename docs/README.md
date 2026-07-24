# Documentation Index

Welcome to the bitvid documentation. This directory contains detailed architectural guides, API references, and system overviews.

## Core Systems

- **[BitUnlock Permission Layer](./BITUNLOCK_PERMISSION_LAYER_PLAN.md)**: Architecture and phased plan for purchases, rentals, creator memberships, platform subscriptions, bundles, events, and short-lived playback authorization using BitUnlock as BitVid's permission layer.
- **[Application Coordinators](./app-coordinators.md)**: Overview of the coordinator pattern used to manage app-wide state and services.
- **[Data-Flow Refactor — Dev Plan & Spec](./architecture-refactor.md)**: The incremental plan to put all subsystems on a shared, governed relay/data foundation (SubscriptionManager, stores, unidirectional flow).
- **[Known Bugs (deferred)](./KNOWN_BUGS.md)**: Confirmed defects/limitations found during the refactor, queued to fix later.
- **[Feed Algorithm ↔ Lists Audit](./feed-algo-audit.md)**: Read-only audit of whether the For You feed is actually driven by the user's follows/hashtags/watch-history, with the gaps and a fix order.
- **[Authentication Architecture](./auth-architecture.md)**: How session management, login flows, and signer integration work.
- **[Feed Engine](./feed-engine.md)**: The pipeline for fetching, filtering, scoring, and sorting video feeds.
- **[Playback & Fallback](./playback-fallback.md)**: The URL-first playback strategy with WebTorrent fallback orchestration.
- **[Watch History System](./watch-history-system.md)**: Encrypted watch history synchronization and storage.

## Nostr Protocol

- **[Nostr Event Schemas](./nostr-event-schemas.md)**: The definitive catalogue of all Nostr event kinds and data structures used by bitvid.
- **[DM Privacy Model](./dm-privacy-model.md)**: How Direct Messages are handled, including NIP-17 relays and privacy controls.
- **[NIP-46 Client Overview](./nip46-client-overview.md)**: Details on the NIP-46 remote signer implementation.
- **[Batch-Capable nip-07 Extension Proposal](./bitvid-nip07-extension-proposal.md)**: Exploratory design for a signer extension that parallelizes bulk decryption (DMs, watch history) without exposing keys.

## Moderation & Safety

- **[Moderation Service](./moderation-service-overview.md)**: How content moderation, reporting, and admin lists function.
- **[Logging Strategy](./logging.md)**: Guidelines for using `devLogger` vs `userLogger` and production logging policies.

## Design & UI

- **[Design System](./design-system.md)**: Guide to the token-based design system and CSS architecture.
- **[Menus & Popovers](./menus.md)**: Documentation for the menu and popover system.

## Operations

- **[Instance Configuration](./instance-config.md)**: Guide to configuring a bitvid instance.
- **[Deployment Notes](./deployment-notes.md)**: Notes and checklists for deploying bitvid.
- **[Manual QA Checklist](./qa.md)**: The standard manual QA script for releases.

## Active plans

- **[BitUnlock Permission-Layer TODO](../todo/TODO_2026-07-23_bitunlock-permission-layer.md)**: Ordered implementation checklist for the BitUnlock-backed media permission and subscription work.

For more details on contributing, please see [CONTRIBUTING.md](../CONTRIBUTING.md).
