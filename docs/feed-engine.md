# Feed Engine Architecture

The feed engine is a lightweight pipeline for composing bitvid feeds from one
or more data sources. It lives in `js/feedEngine/` and exposes factories for
sources, stages, sorters, and the engine itself. The goal is to make it easy to
register new feeds today while leaving room for future "open algorithm" work
that surfaces optional "why this video" metadata.

## Core Concepts

- **Feed definition** – A feed consists of a source, zero or more pipeline
  stages, an optional sorter, and optional decorators. Each feed can expose its
  own hooks and configuration defaults.
- **Feed items** – The engine normalizes everything into a `{ video, pointer?,
  metadata }` DTO so stages can reason about inputs without caring about the
  original source.
- **Context** – Every source and stage receives a context object containing the
  feed configuration, runtime helpers, registered hooks, and a `addWhy()`
  method for collecting metadata about why an item was filtered or prioritised.

## Getting Started

```js
import {
  createFeedEngine,
  createActiveNostrSource,
  createDedupeByRootStage,
  createBlacklistFilterStage,
  createChronologicalSorter,
} from "../js/feedEngine/index.js";

const engine = createFeedEngine();

engine.registerFeed("recent", {
  source: createActiveNostrSource(),
  stages: [
    createBlacklistFilterStage(),
    createDedupeByRootStage(),
  ],
  sorter: createChronologicalSorter(),
});

const { videos, metadata } = await engine.runFeed("recent", {
  runtime: {
    blacklistedEventIds: new Set(["..."]),
    isAuthorBlocked: (pubkey) => false,
  },
});
```

`metadata.why` collects the audit trail from each stage so later phases of the
open algorithm project can surface transparency UI.

## Sources

| Factory | Description |
| --- | --- |
| `createActiveNostrSource` | Wraps `nostrService.getFilteredActiveVideos(...)` and emits DTOs with a `metadata.source` of `nostr:active`. |
| `createSubscriptionAuthorsSource` | Filters the active video list down to subscribed authors using runtime hooks or `config.actorFilters`. |
| `createWatchHistoryPointerSource` | Loads pointer DTOs from `watchHistoryService.getQueuedPointers(...)`. Optional hooks can resolve the backing video if a pointer is missing it. |

Every source resolves blacklist and author-block runtime helpers so feeds
constructed today behave exactly like the existing UI.

## Stages

| Stage | Behavior |
| --- | --- |
| `createDedupeByRootStage` | Reuses the application’s `dedupeVideosByRoot` helper (falling back to `dedupeToNewestByRoot`) to drop older versions of the same videoRoot. Adds "why" metadata for removed entries. |
| `createBlacklistFilterStage` | Calls `nostrService.shouldIncludeVideo(...)` so moderators and block lists stay enforced. Each rejection logs a "blacklist" reason in the why-trail. |
| `createWatchHistorySuppressionStage` | Invokes feed-provided hooks to optionally suppress watched items. Useful for per-feed watch history preferences. |

Stages receive `(items, context)` and should return the transformed list. They
can rely on `context.addWhy(...)` to annotate decisions without mutating the
items in place.

## Sorting & Decorators

`createChronologicalSorter` is the baseline sorter that orders DTOs by
`video.created_at` (newest first by default). Additional decorators can run
after sorting to attach extra metadata or inject presentation hints.

## Configuration Hooks

Every feed inherits the default config contract:

```json
{
  "timeWindow": null,
  "actorFilters": [],
  "tagFilters": [],
  "sortOrder": "recent"
}
```

Feeds can override defaults or expose richer schemas through
`definition.defaultConfig` and `definition.configSchema`. At execution time the
engine merges `options.config` with those defaults and passes them to the
pipeline via `context.config`.

Hooks can be provided globally when registering the feed or per-execution via
`engine.runFeed(name, { hooks: { ... } })`. The watch-history suppression stage
uses this mechanism so Phase 1 feeds can plug in actor-specific suppression
logic later without changing the core pipeline.

## Why-Metadata

`context.addWhy()` records structured audit entries. All built-in stages use it
for dedupe drops, blacklist filtering, and watch-history suppression. The
engine returns these records alongside the final video list so UI components can
render transparency affordances when the open algorithm effort ships.
