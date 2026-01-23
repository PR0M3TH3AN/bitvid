# Kids feed

The Kids feed (`kids`) is a curated feed-engine pipeline that only surfaces
videos explicitly marked for kids and then re-ranks them using age-appropriate
scoring. It lives in the feed registry in `js/app.js` and runs through the
feed engine stages documented below.

## Hard include/exclude rules

The Kids feed hard-gates content before scoring:

- **Must be marked for kids**: `video.isForKids` must be `true` or the item is
  dropped.
- **Never allow NSFW**: `video.isNsfw === true` is always excluded.
- **Drop invalid or blocked items**: Videos marked `invalid`, or rejected by the
  standard `shouldIncludeVideo` checks (privacy, access control, blacklists,
  author blocks) are excluded.
- **Content warnings**: Any `video.contentWarning` entry that matches the
  `disallowedWarnings` list removes the item from the feed.

The default `disallowedWarnings` list is:
`nudity`, `sexual`, `graphic-violence`, `self-harm`, and `drugs`. Feed config or
runtime overrides can replace or extend this list.

## Age-group definitions + duration bounds

Age groups tune the scoring defaults (preferred tags, educational tags, and
maximum duration). The feed defaults to the **preschool** profile unless
`config.ageGroup` or a runtime override is supplied.

| Age group | Max duration | Preferred tags (default) | Educational tags (default) |
| --- | --- | --- | --- |
| `toddler` | 5 minutes | toddler, baby, nursery, colors, shapes, lullaby | abc, numbers, counting, learning, alphabet |
| `preschool` | 10 minutes | preschool, kindergarten, storytime, letters, phonics | counting, alphabet, reading, learning, math |
| `early` | 15 minutes | early, kids, reading, science, animals, art | science, math, reading, history, geography |
| `older` | 20 minutes | tween, teens, tutorial, stem, coding, music | stem, coding, history, geography, tutorial |

Duration affects the **age-appropriateness** score. Videos longer than the
age-group maximum are down-ranked proportionally.

## Moderation thresholds + multi-category report policy

The Kids feed applies stricter moderation thresholds than the general feeds:

- **Blur**: trusted report count ≥ **1**.
- **Hide**: trusted report count ≥ **1**.
- **Hide (trusted mutes)**: trusted mute count ≥ **1**.

Moderation runs **three separate stages** for report categories: `nudity`,
`violence`, and `self-harm`. Each stage pulls the trusted report count for its
own category, so **counts do not accumulate across categories**. This means a
report spike in one category only affects that category’s moderation stage.
Use the why-trail (below) to inspect which category triggered an action.

## Explainability (`addWhy`)

The Kids feed relies on `context.addWhy()` so future UI surfaces can explain
filtering and scoring decisions:

- **Audience filter** reasons: `not-for-kids`, `nsfw`, `invalid`, `blacklist`,
  and `content-warning` (includes the matched warning).
- **Moderation** reasons: `blur` / `autoplay-block` with the report category,
  plus `trusted-mute` / `viewer-mute` when applicable.
- **Scoring** reasons: the dominant positive scoring component (`age-appropriateness`,
  `educational-boost`, `author-trust`, `popularity`, or `freshness`) is recorded
  alongside the computed score.

These entries are returned in `metadata.why` whenever the feed engine executes.

## Feed configuration schema

The Kids feed exposes a config schema via the feed engine registry:

```json
{
  "ageGroup": "preschool",
  "educationalTags": [],
  "disallowedWarnings": ["nudity", "sexual", "graphic-violence", "self-harm", "drugs"]
}
```

Use `ageGroup` to select the default scoring profile, `educationalTags` to
override the default educational tag list for that age group, and
`disallowedWarnings` to adjust the hard content-warning exclusions.
