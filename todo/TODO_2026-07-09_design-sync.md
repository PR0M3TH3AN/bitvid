# TODO — Design-Sync: port bitvid's design system → Claude Design

Started 2026-07-09. Tracks the incremental port of bitvid's token + component
system into the **Claude Design** project so it becomes a shared, faithful,
versioned source-of-truth (readable by Claude when building bitvid UI and, later,
other apps in the same visual language).

## What this is (and isn't)

- **Is:** a curated, pixel-faithful reproduction of bitvid's real design system as
  a gallery of self-contained preview cards in a Claude Design project. Each card
  is rebuilt from the actual `css/tokens.css` values + `tailwind.source.css`
  component rules + component JS markup.
- **Is not:** a one-shot automated export, and not a runtime package other apps
  `import`. The project is a *reference library*; the repo stays the code source.
- Sync is **incremental — one component at a time, never a wholesale replace**
  (the DesignSync tool enforces this).

## Project + tooling

- Project: **"bitvid Design System"** — `type: PROJECT_TYPE_DESIGN_SYSTEM`
  - `projectId`: `6b3b1e2e-8d55-4b95-873a-52b6d886c186`
- Tool: `DesignSync` (claude.ai/design). One-time auth per session via `/design-login`.
- **The project itself is the durable store.** Card sources this pass were staged
  in the session scratchpad (ephemeral) — to edit a card later, `get_file` it back,
  edit, then `finalize_plan` → `write_files`. Don't rely on scratchpad persisting.

## Card conventions (follow for every new card)

- First line MUST be `<!-- @dsCard group="…" viewport="WxH" name="…" subtitle="…" -->`
  (the pane compiles the card index from these markers on its self-check).
- **Self-contained + pixel-faithful:** resolve every Tailwind `@apply` to concrete
  CSS; drive all values from the real tokens (`--space-*`, `--radius-*`, `--status-*`,
  the exact admin ring/star box-shadow, `--color-zap`, …). No approximations.
- Link the token files (`../tokens/*.css`) + `../styles.css` so `var()` resolves and
  both themes work (tokens carry `[data-theme="light"|"dark"]` scopes).
- External images are blocked in the render sandbox → gradient placeholders for
  thumbnails; reuse in-project assets (`../assets/svg/default-profile.svg`) for avatars.

## Done

### Seeded by the UI generator (pre-existing, verified accurate)
- [x] Token foundation `tokens/{colors,semantic,typography,spacing,effects,fonts}.css`
      — a faithful ~155-token curated subset of the real 670-prop `tokens.css`;
      values match production exactly (accent indigo `rgb(99 102 241)`, dark surfaces,
      `--color-zap` btc-orange, spacing/radii/type all verified). Both themes.
- [x] **Colors** group (5 cards): accent, status, surfaces-dark, surfaces-light, text.
- [x] Real bitvid assets/logos imported (`assets/`, `bitvid_logo/`).

### Pass 1 — foundation backfill + flagship components (synced 2026-07-09)
- [x] **Foundations** group (5 cards): `typography` (Inter/Fira Code + full type scale),
      `spacing` (4xs→2xl-plus ramp), `radii` (incl. sidebar/modal shells), `shadows`
      → "Elevation" (sm→modal + zap popover), `motion` (live easing curves).
- [x] **Components** group (2 cards):
      - `video-card` — default (admin creator: gold ring + corner star), Private
        (`data-state="private"`), Moderation-blurred (warning `moderation-badge`
        overlay w/ "Show anyway" / "Always show creator").
      - `nostr-profile` — compact account card (`createCompactProfileSummary` +
        `.profile-account-card`): subscription, admin-override (ring+star), blocked.

## Queued (expansion, roughly value-ordered)

- [ ] **Group A — overlays/menus:** the `⋯` more-menu / dropdown, notification toast
      (`appNotify` / NotificationController), confirm + prompt dialogs
      (`confirmDialog.js` / `promptDialog.js` / `showPasswordPrompt`).
- [ ] **Group B — badges & pills:** `moderation-badge` neutral variant, standalone
      admin star, sats/zap badge, acting-as pill, `.pill`.
- [ ] **Group C — buttons & form controls:** `.form-control`, `.btn-ghost`
      (accent/danger), primary button, focus-ring treatment.
- [ ] **Group D — modal shell** → then the big modals: upload, profile, login,
      share-nostr, embed-video.
- [ ] **Group E — larger surfaces:** sidebar/nav (`sidebar.html`), account switcher,
      video player modal, DM surfaces, search/filter modal.

## Foundational gaps to capture later

- [ ] **Red "override" accent theme** — `--color-accent-override: rgb(254 0 50)` +
      strong/pressed. bitvid ships an alternate red accent; not in the curated set.
- [ ] Blur tokens (`--blur-*`), breakpoints (`--breakpoint-*`), avatar sizes,
      component-sizing tokens — reference cards if/when a component needs them.

## Verify (user)

- [ ] Open claude.ai/design → bitvid Design System; confirm the 7 new cards render
      in both themes and the admin ring/star + zap-orange read correctly. If any
      card is missing from the index, it needs explicit `register_assets`.
