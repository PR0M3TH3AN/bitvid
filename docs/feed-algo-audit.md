# Feed Algorithm ↔ Lists/Notes — Wiring Audit

> Read-only audit (no code changed). Goal: confirm whether the **For You** feed is
> actually driven by the user's lists/notes (follows, hashtag prefs, watch
> history, blocks/moderation), now that those lists load reliably after the
> data-flow refactor. Source of truth: `js/app/feedCoordinator.js`
> (`registerForYouFeed`, `buildForYouFeedRuntime`) + `js/feedEngine/*`.

## For You pipeline, as built today

```
source:  createActiveNostrSource         // ALL active videos (block-filtered only)
stages:
  1. createTagPreferenceFilterStage()    // hashtag interests/disinterests
  2. createBlacklistFilterStage()        // blocks + admin blacklist
  3. createWatchHistorySuppressionStage()// drop already-watched
  4. createDedupeByRootStage()
  5. createModerationStage()             // NIP-56 reports + trusted mutes
  6. createResolvePostedAtStage()
sorter:  createChronologicalSorter()     // newest-first
```

Runtime inputs (`buildForYouFeedRuntime`): `blacklistedEventIds`,
`isAuthorBlocked`, `tagPreferences {interests, disinterests, available}`,
`moderationThresholds`, `watchHistory.shouldSuppress`.

## What IS correctly wired (drives the feed) ✅

- **Hashtag interests/disinterests** — from the real `hashtagPreferencesSnapshot`.
  Interests are a **hard filter** (see gap 3); disinterested tags are dropped.
- **Blocks / admin blacklist** — `isAuthorBlocked` + `blacklistedEventIds`.
- **Watch history** — watched items are **suppressed** (removed) via
  `runtime.watchHistory.shouldSuppress`.
- **Moderation** — NIP-56 trusted reports + trusted mutes, threshold-gated.

So the refactor's payoff is real: these lists now load and *do* shape For You.

## Gaps (the deliverable)

### G1 — Follows/subscriptions have ZERO effect on For You  *(highest impact)*
For You's source is `createActiveNostrSource` (all videos); the runtime passes no
`subscriptionAuthors`. Follows are used only by the **separate** Subscriptions
feed. So "who you follow" does not include, boost, or rank anything in For You.
For a feed meant to be "driven by your lists," this is the biggest miss.

### G2 — For You is chronological, not relevance-ranked
The tag-preference stage records `metadata.matchedInterests`, but the sorter is
`createChronologicalSorter()`, so match strength/count never affects order. There
is no scoring that blends interest strength + freshness + follows. (Explore *does*
have `createExploreScorerStage`; For You does not.)

### G3 — Interest filter is binary/exclusive
If the user has any interests set, For You keeps **only** videos with a matching
tag and drops the rest. Niche interests or sparsely-tagged videos → a thin or
empty For You. No "boost-but-don't-exclude" mode and no fallback when matches are
too few.

### G4 — Watch-history *topic affinity* is unused in For You
For You only uses watch history to *suppress* watched items. The topics you watch
(`watchHistoryTagCounts`) are **not** an interest signal here — though Explore's
runtime *does* compute and use them. So For You ignores a strong implicit signal.

### G5 — No weighting/blending overall
For You = a chain of hard filters + chronological. "Driven by lists" today means
"filtered by hashtag prefs, newest-first" — missing follows weighting, interest
ranking, and watch-topic affinity working together.

## Suggested fix order (incremental, each shippable)

1. **G1**: feed follows into For You — add `subscriptionAuthors` to the runtime
   and either (a) blend a follows-boost into a scorer, or (b) merge a
   follows-source with the active source. (Biggest UX win.)
2. **G2 + G3**: replace the chronological sorter with a **For You scorer** that
   *ranks* by interest matches + freshness + follows instead of hard-excluding,
   with a graceful fallback so the feed is never empty.
3. **G4**: pass `watchHistoryTagCounts` into the For You runtime and factor watch-
   topic affinity into the score (reuse Explore's machinery).

Open question for product: should For You be **inclusive+ranked** (show lots,
order by relevance — recommended) or **strict** (only interest/follow matches)?
This decides G2/G3.
