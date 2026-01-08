# Video Grid Filtering

This document describes how entries are filtered before they render inside the
video grids (Most Recent, Subscriptions, Channel Profile, etc.). For a broader
overview of feed pipeline architecture, see
[`docs/feed-engine.md`](feed-engine.md).

## Primary filtering entry points (nostrService)

The first set of guardrails live in `js/services/nostrService.js`:

- **`shouldIncludeVideo(video, options)`**
  - Enforces **NSFW** and **privacy** constraints by checking `video.nsfw` and
    `video.isPrivate`.
  - Drops videos with **blacklisted event IDs** (e.g., moderation hides or
    locally blocked event IDs).
  - Applies **author blocks** by consulting the runtime `isAuthorBlocked`
    helper.
  - Handles **access control** rules so restricted events never enter the
    grid.
- **`filterVideos(videos, options)`**
  - Applies `shouldIncludeVideo` across a list and returns the filtered
    collection.
  - Used by feed sources and legacy list fetches to ensure consistent behavior
    before anything reaches the feed engine pipeline.

These checks are the canonical “do we ever show this video?” gate and must stay
aligned with moderation, privacy, and access rules.

## Feed engine stages that affect grid output

Once the feed engine is involved, additional filtering happens inside
`js/feedEngine/stages.js`:

- **`createBlacklistFilterStage()`**
  - Invokes `nostrService.shouldIncludeVideo` again within the pipeline so that
    blacklist/author-block/NSFW/privacy gates remain enforced for feed-sourced
    items.
- **`hasDisinterestedTag(video, tagPreferences)`**
  - Interprets **tag disinterest** preferences, returning `true` when a video’s
    tags match a user’s “not interested” preferences.
- **Watch-history suppression stage (`createWatchHistorySuppressionStage`)**
  - Applies watch-history rules (for example, “hide watched videos”) before
    items reach the sorter and view layer.

`tagPreferences` disinterests are evaluated by `hasDisinterestedTag` and used
by the relevant stage to drop or down-rank items (depending on the feed’s
configuration) before the results are rendered.

## Where grids render

The filtered feed output eventually drives the video grids in these views:

- `views/most-recent-videos.html`
- `views/subscriptions.html`
- `views/channel-profile.html`

These views rely on `VideoListView` (`js/ui/views/VideoListView.js`) to render
items. The feed output is passed into `VideoListView` so the UI only receives
videos that have already survived the filtering stages above.

## Data flow overview (source → stages → sorter → render)

1. **Source**
   - Feed sources (for example, active Nostr lists) fetch raw events and call
     `nostrService.filterVideos(...)` so `shouldIncludeVideo` can enforce
     NSFW/`isPrivate`/blacklist/author-block/access-control rules.
2. **Stages**
   - `createBlacklistFilterStage` re-checks `nostrService.shouldIncludeVideo` in
     the feed pipeline.
   - `hasDisinterestedTag` and the watch-history suppression stage prune items
     based on tag disinterest and watch-history preferences.
3. **Sorter**
   - The feed’s configured sorter (for example, chronological or relevance)
     orders the surviving entries.
4. **Render**
   - The feed engine hands the final list to `VideoListView`, which renders
     grids in `views/most-recent-videos.html`, `views/subscriptions.html`, and
     `views/channel-profile.html`.
