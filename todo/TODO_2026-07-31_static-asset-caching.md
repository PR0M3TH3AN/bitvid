# Static asset caching on Vercel — 2026-07-31

Carried over from the BitUnlock/BitLogin deployment work. Findings below were
verified against the live site on 2026-07-31, not assumed.

## What is actually happening

`vercel.json` declares exactly three header rules — `/sw.min.js`, `/`, and
`/(.*\.html)`. Nothing covers `/css/*`, `/js/*`, `/vendor/*`, or `/assets/*`,
so those fall through to Vercel's default. Measured live:

| Asset                        | Cache-Control                              |
| ---------------------------- | ------------------------------------------ |
| `css/tailwind.generated.css` | `public, max-age=0, must-revalidate`       |
| `js/app.js`                  | `public, max-age=0, must-revalidate`       |
| `index.html`                 | `no-cache, must-revalidate`                |

Every CSS and JS file revalidates on **every** page load. The 304s are cheap
but they are still round-trips, and they are on the critical render path.

## The trap: do NOT just add `immutable`

The obvious fix — port the old `immutable` + 1-year rules across — would be a
**regression**, not an improvement. Asset URLs in `index.html` are not
content-hashed:

```html
<link href="css/tailwind.generated.css" />
<script src="js/index.js"></script>
```

A long `max-age` with `immutable` on an unhashed filename tells every browser
to keep that exact file for a year and never revalidate. The next deploy
changes the file's contents but not its URL, so returning users are pinned to
stale CSS/JS with no way to bust it short of a hard reload — and `immutable`
specifically instructs the browser to skip revalidation even on reload in some
engines. `scripts/hash-dist.mjs` exists but writes a hash *manifest* for
deploy verification; it does not rename assets or rewrite references.

## Two ways forward

- [ ] **Option A (correct, more work): content-hash the asset filenames.**
      Emit `css/tailwind.<hash>.css` / `js/index.<hash>.js` from the build and
      rewrite references in the emitted HTML. Only then add
      `public, max-age=31536000, immutable` for `/css/*`, `/js/*`, `/assets/*`.
      This is the only combination where `immutable` is safe, because the URL
      changes whenever the bytes do.
- [ ] **Option B (safe now, smaller win): a bounded max-age, no `immutable`.**
      e.g. `public, max-age=600, stale-while-revalidate=86400` for `/css/*` and
      `/js/*`. Repeat views inside the window skip the round-trip entirely,
      a deploy is picked up within ten minutes, and nothing can pin a user to a
      stale bundle. Choose this if hashing is not happening soon.

Decide A vs B before touching `vercel.json`; they are not stackable.

## Also worth doing

- [ ] Cover `/vendor/*` in whichever option is chosen — those files
      (`marked.min.js`, `highlight.min.js`) are third-party and genuinely
      change rarely, so they benefit most.
- [ ] Confirm `/sw.min.js` keeps a short/no-cache policy under any change. A
      cached service worker is the one asset that can persist a bad deploy
      past a user's next visit.
- [ ] Re-measure with `curl -sI` after deploying. Vercel's dashboard settings
      can override `vercel.json`, so the header on the wire is the only
      source of truth.

## Corrected note

An earlier hand-off claimed bitvid had "~10 pre-existing test failures". That
is **not true** as of 2026-07-31 — `npm run test:unit` (13/13),
`npm run test:dm:unit` (2/2 and 4/4), and `npm run test:smoke` all pass on
`unstable`. Do not spend time chasing failures that are not there.
