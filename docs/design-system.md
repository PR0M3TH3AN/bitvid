# bitvid Design System Primitives

bitvid's visual language is now powered by Tailwind utilities backed by our design tokens. This document lists the primitives available via `css/tailwind.source.css`, how they behave across states, and when to mix them with Tailwind utilities.

All templates and embeds must load `css/tailwind.generated.css`; that compiled bundle is the only stylesheet shipped with the app. Remove any lingering references to legacy `tailwind.min.css` assets when porting surfaces into the design system.

## Feature Flag Rollout

The new design system ships behind the `FEATURE_DESIGN_SYSTEM` runtime flag defined in `js/constants.js`. Deployments can temporarily disable the flag (`false`) if they need to fall back to the legacy primitives during an incident.

- **Default state:** `FEATURE_DESIGN_SYSTEM` is `true`, so templates render with `data-ds="new"` on root containers.
- **Runtime toggle:** Set `window.__BITVID_RUNTIME_FLAGS__.FEATURE_DESIGN_SYSTEM = false` (or call `setFeatureDesignSystemEnabled(false)`) to temporarily fall back to the legacy primitives. The entrypoint automatically updates every `[data-ds]` container to `data-ds="new"` and notifies controllers.
- **DOM contract:** Templates and partials must include `data-ds` on their root elements. Controllers should rely on the `designSystem` context (see `js/designSystem.js`) before attaching classes or behaviors that only exist in the new system.

## Theming

### `[data-theme]` contract

The default experience renders the production dark palette. Pages and embeds can opt into alternates by setting the `data-theme` attribute on the `<html>` (or any ancestor that wraps the component). `data-theme="light"` promotes the light tokens defined in `css/tokens.css`, swapping surface, panel, border, muted, and overlay colors while keeping semantic accents consistent. Omit the attribute or set it back to `default` to inherit the dark baseline. Reserve additional theme keys (for example, `data-theme="contrast"`) for upcoming accessibility palettes—the same hook will activate them once their tokens land. When scoping components inside legacy templates, prefer wrapping the smallest possible container so downstream shims continue to function.

### Token overrides & experiments

Tokens are sourced from `css/tokens.css` and consumed as CSS custom properties. To try temporary overrides—such as custom backgrounds for a partner landing page—stack a higher-specificity selector and reassign the variable without hard-coding literal colors:

```css
.landing[data-theme="light"] {
  --color-bg-page: var(--color-bg-surface);
  --shadow-card: 0 10px 40px rgba(12, 14, 23, 0.25);
}
```

Limit overrides to variables defined in `css/tokens.css` and document any long-lived changes in this file so the design tokens remain the source of truth. Feature-flagged experiments should wrap overrides in a `data-flag-<name>` selector or toggle them via controller logic so the defaults remain stable when the flag is off.

### Blog layout tokens

The blog embed now consumes dedicated typography and spacing tokens alongside Tailwind utilities. `css/tokens.css` exposes the following helpers:

- `--blog-font-size-root`, `--blog-font-size-display`, `--blog-font-size-title`, `--blog-font-size-body`, `--blog-font-size-meta`, and `--blog-font-size-h1-mobile` scale copy across the blog shell, hero headings, and metadata.
- `--blog-line-height-body` and `--blog-line-height-tight` set the rhythm for long-form text and compact headers.
- `--blog-layout-fluid-width` and `--blog-layout-max-width` define the responsive container width; pair them with Tailwind utilities (`mx-auto`, `md:w-[var(--blog-layout-fluid-width)]`, `md:max-w-[var(--blog-layout-max-width)]`) when mounting the blog root.
- `--blog-space-compact`, `--blog-space-snug`, `--blog-space-heading-stack`, `--blog-space-heading-gap`, `--blog-space-inline-lg`, `--blog-space-media-stack-start`, `--blog-space-media-stack-end`, and `--blog-space-stack-xxl` standardise the bespoke gaps used throughout article summaries, media blocks, and footer treatments.
- `--blog-avatar-size` and `--blog-avatar-size-compact` size topic avatars responsively.

Templates should reference these tokens (directly or via Tailwind arbitrary values) instead of hard-coded measurements so the embed stays in sync with future blog refreshes.

### Blog carousel markup

The short-notes carousel ships as a semantic wrapper around the `blog-carousel` primitive defined in `css/tailwind.source.css`. The runtime no longer injects inline styles or Splide classes—layout is driven entirely by data attributes that map onto tokenised CSS rules.

**Structure**

```html
<section class="short-notes blog-carousel" data-carousel data-per-page="3" data-index="0">
  <div class="blog-carousel__viewport" data-carousel-viewport>
    <ul class="blog-carousel__track" data-carousel-track>
      <li class="blog-carousel__slide" data-carousel-slide data-index="0" data-active="true">
        ...
      </li>
      <!-- additional slides -->
    </ul>
    <button type="button" data-carousel-prev data-carousel-control="prev">‹</button>
    <button type="button" data-carousel-next data-carousel-control="next">›</button>
  </div>
  <div class="blog-carousel__progress blog-progress" data-carousel-progress>
    <progress class="progress progress--blog" data-progress-meter aria-label="Carousel progress"></progress>
  </div>
</section>
```

**State contract**

- `data-per-page` controls how many columns render inside the viewport. CSS exposes variants for 1–4 slides per page; the custom property `--blog-carousel-per-page` updates automatically.
- `data-index` represents the active *page* (zero-indexed). The track translates by `100%` for each page, so the attribute should advance in whole-number increments rather than slide indices.
- Slides expose `data-index`, `data-active`, `data-inert`, and `data-state`. The carousel controller toggles `data-state="active"`, `"idle"`, and `"leaving"` to drive scale/opacity transitions without touching inline styles.
- The root `section` advertises `data-state="active" | "idle"` plus `data-transition="auto" | "instant"` when short-circuiting animations (for example, during first render or programmatic jumps).
- Progress wrappers set `data-state="idle" | "active" | "paused" | "complete"` while the inner `<progress>` leverages the shared `progress` primitive (`data-progress-meter`, `data-variant="blog"`) so theme tokens continue to drive track/fill colours.

Controllers should rely on these data hooks when orchestrating autoplay, pausing on pointer/visibility changes, or syncing the segmented progress indicator. Avoid reintroducing inline `style` mutations—tests enforce the contract via the inline-style guard.

### Layout & spacing extensions

The core spacing scale gained intermediate stops for tighter micro-layouts and larger hero treatments. `css/tokens.css` now exports `--space-4xs`, `--space-3xs`, `--space-xs-snug`, `--space-md-plus`, `--space-xl-compact`, `--space-xl-plus`, and `--space-2xl-plus`; Tailwind surfaces matching utilities such as `p-4xs`, `p-3xs`, `px-xs-snug`, `py-md-plus`, `gap-xl-compact`, `px-xl-plus`, and `gap-2xl-plus`. Pair them with the new layout primitives—`--menu-min-width` (`min-w-menu`), `--modal-max-width` (`max-w-modal`), `--layout-player-max-width` (`max-w-player`), and `--layout-docs-max-width` (`max-w-docs`)—to anchor consistent breakpoints across popovers, modals, and documentation shells without reintroducing raw `rem`/`px` literals. Blog-specific chrome reuses the same additions: the theme toggle knob now references `--radius-toggle-thumb`, and focus affordances draw from `--outline-thick-width` instead of hard-coded pixel outlines.

### Previewing themes

The design-system kitchen sink (`docs/kitchen-sink.html`) exposes a theme switcher that mirrors the production toggle contract. Use the "Theme" select menu in the header to flip between `default`, `light`, and any preview keys (for example, `contrast`). This control updates `document.documentElement.dataset.theme` at runtime, letting you verify hover/focus/disabled states without redeploying. When authoring new palettes, add them to `css/tokens.css`, confirm the kitchen-sink toggle picks them up, and record before/after screenshots for review so the CI snapshots have clear context.

## Focus Handling

All interactive primitives mix in the shared `.focus-ring` helper. It removes default outlines and applies a branded ring using `focus-visible` only. When building bespoke components, add `.focus-ring` to your root interactive element or replicate its rules:

```html
<button class="focus-ring inline-flex items-center gap-2 ...">Label</button>
```

The helper includes:

- `focus-visible:ring-2` with `ring-info` and `ring-opacity-70`
- `focus-visible:ring-offset-2` with an offset on `bg-surface`
- `focus-visible:transition-shadow` using the tokenized `duration-fast` easing curve

Never hide focus styles without providing an accessible alternative.

## Motion Guardrails

### Motion inventory

The `rg "transition"` audit surfaces the components that animate by default. Keep this list in sync when new motion primitives land:

- **Buttons:** `.btn` and `.btn-ghost` transition their backgrounds, borders, and shadows using the shared token durations. 【F:css/tailwind.source.css†L18-L55】
- **Cards and watch history:** `.card`, `.watch-history-card`, and their nested controls use hover/focus transitions plus optional entry animations via `data-motion="enter"`. 【F:css/tailwind.source.css†L238-L804】
- **Popovers:** `.popover__panel` fades and scales between `[data-state]` values. 【F:css/tailwind.source.css†L119-L141】
- **Modals:** `.bv-modal__panel`, `.video-modal__panel`, and `.player-modal__content` animate in concert with the modal nav/header layout helpers. 【F:docs/kitchen-sink.html†L335-L391】【F:css/tailwind.source.css†L385-L640】
- **Feedback & loading:** `.progress-bar-fill`, `.status-spinner--inline`, and `.status-banner .status-spinner` communicate state changes with width transitions or spin animations. 【F:css/tailwind.source.css†L907-L948】
- **Sidebar controls:** `.sidebar-nav-link`, `.sidebar-dropup-trigger`, `.sidebar-collapse-toggle`, and related chevrons/toggles translate, fade, and resize during rail expansion. 【F:css/tailwind.source.css†L1164-L1598】

### Shadow inventory

- `--color-shadow-intense` fuels the zap popover glow. Use `shadow-popover-intense` for matched geometry or `shadow-intense`/`drop-shadow-intense` when you only need the color component. 【F:css/tokens.css†L93-L101】【F:tailwind.config.cjs†L28-L32】【F:tailwind.config.cjs†L147-L157】

### Reduced-motion policy

- A consolidated `@media (prefers-reduced-motion: reduce)` block now zeroes out transition and animation durations globally, removes motion-only transforms, and leaves opacity state changes in place so surfaces still show and hide instantly. 【F:css/tailwind.source.css†L1766-L1981】
- Motion tokens also collapse to `0s` inside Tailwind's component layer so the primitives (`.btn`, `.card`, `.popover__panel`, watch-history tiles) inherit the same behaviour without per-selector overrides. 【F:css/tailwind.source.css†L229-L270】
- Spinners fall back to static indicators when reduced motion is requested, while focus rings remain intact because the underlying styles are unaffected—only the timing curves are reset. 【F:css/tailwind.source.css†L1778-L1981】
- When adding a new animated component, register its selector in this block (or reuse the tokenised durations) so reduced-motion users never see unintended transitions. Document the addition here alongside the inventory.

## Component Primitives

### Buttons

| Class | Description |
| --- | --- |
| `.btn` | Primary action button (`bg-primary`, white text). Hover lifts to `bg-info-strong`, focus pushes to `bg-info-pressed`, disabled reduces opacity. |
| `.btn-ghost` | Framed secondary action. Transparent by default with subtle border, fills with `bg-panel-hover` on hover/focus. |

Both buttons:

- Use `.focus-ring` internally
- Include pointer-blocking and opacity changes on `:disabled`
- Are uppercase with wide tracking to match our existing CTA styling

Mix in Tailwind utilities for icon spacing (`gap-3`), sizing (`px-lg`, `py-sm`), or layout (`w-full`). Avoid overriding colors unless introducing a new semantic variant.

#### Variants & Toggle States

- Apply `data-variant="critical"` to `.btn-ghost` when rendering destructive affordances (for example, "Remove variant" pills inside repeater rows). The primitive swaps the border and text colors to the critical palette and deepens the fill on hover/focus.
- Toggle groups can rely on `[aria-pressed="true"]` or `data-state="active"` without extra utilities. When a `.btn-ghost` reports an active state it automatically promotes to the filled primary style.

```html
<div class="inline-flex items-center rounded-full bg-panel/80 p-1" role="group">
  <button class="btn-ghost flex-1" type="button" aria-pressed="true">Custom</button>
  <button class="btn-ghost flex-1" type="button" aria-pressed="false">Cloudflare</button>
</div>
```

### Badges

`.badge` renders an inline pill (`bg-panel`, uppercase text). Opt into semantic variants with `data-variant="info"`, `data-variant="critical"`, or `data-variant="neutral"`. Layer on utilities for icon alignment or truncation.

### Cards

`.card` is the base surface for grid items and panels:

- Rounded corners (`rounded-lg`) and `bg-card`
- Token shadows on hover
- Focus states reuse `.focus-ring`
- Accepts `data-state="private" | "critical" | "disabled"` for special treatments

Combine with padding utilities per layout. Interactive cards should maintain `cursor-pointer` manually (see legacy shim example below) until templates adopt dedicated controller classes.

> **2025-10-11 update:** The legacy `.video-card*` shim selectors were removed. Video grids should now render plain `.card` elements and opt into semantic variants via `data-state`, `data-alert`, and `data-motion` attributes. Runtime code no longer maps the deprecated classes, so older selectors will not receive token updates.

### Form Inputs

`.form-control` is the base primitive for text entry surfaces. It handles layout (`block`, `w-full`), rounded corners, subtle borders, muted placeholders, and the shared focus ring. Hovering deepens the border, focus highlights with `border-info-strong`, `:invalid` raises a critical border, and `:disabled` mutes the field while blocking pointer events.

Specialisations reuse `.form-control`:

- `.input` – Standard single-line text input.
- `.textarea` – Multi-line input with a minimum height (`min-h-[var(--form-textarea-min-height)]`) and `resize-y` enabled.
- `.select` – Native `<select>` element with `appearance-none`, an integrated arrow glyph, and consistent spacing (`pr-10`).

All three share hover, focus-visible, disabled, and invalid treatments. Layer on utilities (`h-12`, `text-lg`, icon padding) as needed without re-declaring tokens.

Arrow and checkbox adornments now lean entirely on tokens: `--form-select-icon-offset`, `--form-select-icon-gap`, `--form-select-icon-hit-area`, and `--form-select-icon-size` position the native select chevron, while `--form-checkbox-checkmark-offset` keeps the checkmark aligned at any scale. Textareas pull their baseline from `--form-textarea-min-height`, and thin scrollbars reuse the shared `--scrollbar-thin-width` so embedded panels feel consistent across browsers.

```html
<form class="bv-stack bv-stack--tight" aria-labelledby="zapAmountLabel">
  <label
    id="zapAmountLabel"
    class="text-xs font-semibold uppercase tracking-wide text-muted-strong"
  >
    Zap amount (sats)
  </label>
  <input
    id="zapAmountInput"
    type="number"
    min="1"
    step="1"
    class="input"
    placeholder="Enter sats"
  />
  <button class="btn" type="submit">Send</button>
</form>
```

For toggles:

- `.checkbox` resets native appearance, applies the token border/background, and swaps to the info palette when checked. The checkmark is rendered via `::after`, and disabled states lower contrast while keeping the focus ring behaviour.
- `.switch` renders a pill track with a translating thumb (`::before`). Apply `[aria-checked="true"]` or `.is-on` to move the thumb and recolor the track. Motion respects `prefers-reduced-motion` while maintaining the focus ring.

### Modal Surface

- `.bv-modal` anchors fixed overlays (full-viewport flexbox centered layout).
- `.bv-modal-backdrop` applies the tokenized overlay color with blur.
- `.bv-modal__panel` hosts modal content (`bg-surface`, `shadow-modal`, focus ring).

Sizing now comes from dedicated tokens: `max-w-modal` and `rounded-modal-xl` map to `--modal-max-width` and `--radius-modal-xl`, while icon controls reuse `--icon-size-lg`, `--icon-size-md`, and `--icon-button-ring-width` for consistent hit targets. Progress indicators pick up `--modal-progress-height`, and the player modal inherits `max-w-player` so hero metadata never exceeds `--layout-player-max-width`.

Compose them together when mounting new modal portals. If you need a drawer or sheet, start from these primitives and adjust spacing/positioning via utilities.

#### Modal Actions

Action rows in login, disclaimer, and upload flows now pair `.btn-ghost` and `.btn` directly. Layer layout utilities such as `w-full` or `gap-3` without re-adding custom focus rings.

```html
<footer class="modal-footer flex gap-3">
  <button class="btn-ghost flex-1" type="button">Cancel</button>
  <button class="btn flex-1" type="submit">Publish</button>
</footer>
```

Static modal partials (login, application, feedback, etc.) should call the helpers exported from `js/ui/components/staticModalAccessibility.js`—`prepareStaticModal`, `openStaticModal`, and `closeStaticModal`—to attach focus trapping, Escape/backdrop dismissal, and the shared `data-open`/`html.modal-open` toggles without duplicating controller logic.

### Headers

`.ds-header` replaces the legacy `header { … }` reset. Apply it to page chrome that should inherit the shared rhythm: flex alignment (`items-center`, `justify-start`) and tokenized vertical padding (`py-md`). Layer layout utilities per surface—for example, `justify-between` on the kitchen-sink demo or `mb-8` on the app shell.

Pair `.ds-header__logo` with `<img>` or inline logo wrappers to standardize sizing (`h-24`, `w-auto`, `max-w-none`) without reintroducing element selectors. Compose additional utilities (`h-16`, responsive overrides) when a view needs alternate scale.

### Popovers

Use `.popover` as the relative anchor for floating content. Nest `.popover__panel` for the floating surface—it’s positioned with the shared helper, inherits the shared focus ring, and animates with opacity/scale tokens. Toggle `[data-state="open"]` on the panel to switch between the collapsed (`opacity-0 scale-95`) and expanded (`opacity-100 scale-100`) states.

```html
<div class="popover">
  <button class="btn" type="button">Open filters</button>
  <div class="popover__panel" role="dialog" data-state="open">
    <p class="text-sm text-muted">Fine-tune the current feed using tags and duration filters.</p>
  </div>
</div>
```

Use the shared positioning helper (`js/ui/utils/positionFloatingPanel.js`) instead of manual utility offsets. It calculates placement, flips when the surface collides with the viewport, and clamps to an optional padding gutter—all while listening for scroll/resize events and using `ResizeObserver` when available. Call it with the trigger and panel elements, then invoke `positioner.update()` once the panel is visible:

```js
import positionFloatingPanel from "../utils/positionFloatingPanel.js";

const positioner = positionFloatingPanel(triggerEl, panelEl, {
  placement: "bottom", // top | bottom | left | right
  alignment: "end",    // start | center | end (RTL aware)
  offset: 8,
  viewportPadding: 16,
});

panelEl.hidden = false;
panelEl.dataset.state = "open";
positioner.update();
```

The helper tags the trigger and surface with floating metadata so CSS tokens can express transform-origins and fallback coordina
tes without bespoke inline styles. Panels receive `data-floating-panel="true"` plus placement, alignment, strategy, and directio
n hooks (`data-floating-placement`, `data-floating-alignment`, `data-floating-strategy`, `data-floating-dir`). The script updates
CSS custom properties `--floating-fallback-top`/`--floating-fallback-left` on each measurement so `css/tailwind.source.css` can
control layout purely through tokens. Browsers that support CSS anchor positioning flip `data-floating-mode` to `anchor`, but th
e same fallback properties keep older engines aligned. 【F:js/ui/utils/positionFloatingPanel.js†L238-L251】【F:css/tailwind.sourc
e.css†L163-L236】

Recommended container pattern:

- Wrap the trigger and panel in `.popover` so the markup stays discoverable and inherits spacing tokens.
- Leave the wrapper’s overflow visible; the helper defaults to `position: fixed`, so floating surfaces escape scroll containers without getting clipped. Opt into `{ strategy: "absolute" }` if you intentionally want the panel constrained.
- When tearing down a component, call `positioner.destroy()` to drop scroll/resize listeners.

The motion helpers defer to the global motion tokens so Task 5 can adjust timing globally without revisiting individual components. Animations respect `prefers-reduced-motion` by collapsing to opacity-only transitions.

### Sidebar shell & controls

The navigation rail pulls its rhythm from dedicated sidebar tokens in `css/tokens.css`. The shell, panels, and footer reuse shared spacing primitives (`--space-sidebar-shell-inline`, `--space-sidebar-shell-block-start`, `--space-sidebar-shell-block-end`, `--space-sidebar-panel-gap`, `--space-sidebar-panel-padding-block`, `--space-sidebar-panel-padding-inline`, `--space-sidebar-footer-gap`) alongside component-specific radii and shadows (`--radius-sidebar-shell`, `--radius-sidebar-panel`, `--radius-sidebar-nav`, `--shadow-sidebar-shell`, `--shadow-sidebar-accent`, `--shadow-sidebar-trigger`, `--shadow-sidebar-dropup`, `--shadow-sidebar-panel`, `--shadow-sidebar-focus-ring`). These values also size fallback classes like `.sidebar-nav-link`, `.sidebar-dropup-trigger`, and `.sidebar-dropup-panel` so legacy templates stay legible. 【F:css/tokens.css†L94-L138】【F:css/tailwind.source.css†L1829-L2182】

Tailwind now exposes matching utilities for layouts that opt into the design system directly: use `px-sidebar-shell-inline`, `pt-sidebar-shell-block-start`, `pb-sidebar-shell-block-end`, `gap-sidebar-panel-gap`, and `rounded-sidebar-shell`/`rounded-sidebar-nav` for structure, then `shadow-sidebar-shell`, `shadow-sidebar-accent`, or `shadow-sidebar-dropup` to match the bespoke glow states. Combine them with existing color utilities to compose new sidebar sections without reintroducing raw measurements. 【F:tailwind.config.cjs†L115-L155】

Iconography and motion helpers rely on fresh tokens as well: `--icon-size-sm`, `--icon-size-md`, and `--icon-size-lg` standardise glyph sizing across nav links, collapse toggles, and dropup triggers, while `--space-sidebar-nav-translate` powers the translate offsets used when collapsing the rail. Thin overlays inherit `--scrollbar-thin-width` so modal and sidebar scroll containers feel identical.

### Menus

`.menu` normalises list-based command menus with consistent padding. Pair it with `.menu__heading` for optional section labels, `.menu__separator` for dividers, and `.menu__item` for actionable rows. Each item supports hover, active (`data-state="active"`), and critical (`data-variant="critical"`) palettes plus disabled fallbacks through either `disabled` or `aria-disabled="true"`.

```html
<div class="popover">
  <button class="btn-ghost" type="button">Command palette</button>
  <div class="popover__panel" role="menu" data-state="open">
    <div class="menu" role="none">
      <p class="menu__heading" role="presentation">Navigation</p>
      <button class="menu__item" role="menuitem">Search videos</button>
      <button class="menu__item" role="menuitem" data-state="active">Go live dashboard</button>
      <div class="menu__separator" role="separator"></div>
      <button class="menu__item" role="menuitem" data-variant="critical">Delete current draft</button>
      <button class="menu__item" role="menuitem" disabled>Switch profile (pro only)</button>
    </div>
  </div>
</div>
```

The helpers rely on layout utilities (`flex`, `gap-*`) so you can safely inject icons, shortcuts, or nested badges without restyling the base tokens.

### Zap Popover

Compose `.popover` with a zap-specific panel variant when you need to surface the tipping form inline. Toggle `data-state="open"` on the `.popover__panel` and remove its `hidden` attribute when the dialog is visible. The `data-variant="zap"` hook reuses the frosted-glass styling defined in `css/tailwind.source.css`.

```html
<div class="popover">
  <button class="btn-ghost h-10 w-10 rounded-full p-0" type="button" aria-haspopup="dialog" aria-expanded="false">
    <img src="assets/svg/lightning-bolt.svg" alt="Zap" class="h-5 w-5" />
  </button>
  <div
    class="popover__panel card w-72 max-w-[calc(100vw-2rem)] space-y-4"
    role="dialog"
    aria-hidden="true"
    data-variant="zap"
    data-state="closed"
    hidden
  >
    <div class="flex items-center justify-between gap-4">
      <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">Send a zap</h3>
      <button class="btn-ghost h-8 w-8 rounded-full p-0" type="button" aria-label="Close zap dialog">✕</button>
    </div>
    <form class="space-y-4">
      <label class="block text-xs font-semibold uppercase tracking-wide text-muted" for="zapAmountExample">
        Zap amount (sats)
      </label>
      <input id="zapAmountExample" class="input" type="number" min="1" step="1" inputmode="numeric" />
      <button class="btn w-full" type="submit">Send</button>
    </form>
  </div>
</div>
```

### Grid Stack

`.grid-stack` offers gap tokens for dense layouts. Add `data-variant="cards"` for responsive card grids (`grid-cols-1` → `sm:grid-cols-2` → `xl:grid-cols-3`). Switch to `data-orientation="vertical"` for stacked flex columns that reuse the same spacing tokens.

### Layout Helpers

- `.bv-stack` creates a vertical flex stack with the default large gap (`var(--space-lg)`). Use it for page sections such as the watch-history summary blocks.
- `.bv-stack--tight` reduces the gap to `var(--space-md)` while inheriting the `.bv-stack` flex behaviour. Combine the modifier when stacking smaller card fragments or form controls inside profile templates.
- `.bv-grid-video` centralises the responsive video grid (`repeat(auto-fill, minmax(20rem, 1fr))`) with the standard gutter (`gap-xl`) and vertical padding (`py-lg`). Apply it to feed, subscriptions, and channel views instead of repeating inline grid rules.

## Legacy Compatibility Shims

During migration we keep existing selectors alive by layering `@apply` calls in `css/tailwind.source.css`. Notable shims:

- `#profileModal .profile-switcher*` → `.card`, `.badge`, `.btn-ghost`

> **2025-10-11:** The `.video-card` shim family was removed. Templates must emit `.card` elements with the appropriate `data-state` and `data-alert` attributes instead of relying on the legacy class names.

We continue to expose aliases such as `.profile-switcher` and nested variations (for example, `.profile-switcher__item`) so existing profile and admin controllers stay functional while downstream templates finish their migration. These shims live under the "Legacy component compatibility" section and will be removed once templates switch to the new primitives.

> **Update (Q1 2025):** The modal shim that mapped `.modal-container`/`.modal-content` to the new primitives has been removed. All modal templates must mount `.bv-modal`, `.bv-modal-backdrop`, and `.bv-modal__panel` directly.

**Shim removal checklist (Task DS-742):**

- [ ] Confirm no production templates emit `.profile-switcher*` selectors (owners: @ui-templates, @design-systems).
- [ ] Verify the torrent beacon renders `.card`, `.btn`, `.btn-ghost`, and `.input` primitives with no fallback selectors (owner: @torrent-beacon).
- [ ] Verify `FEATURE_DESIGN_SYSTEM` remains `true` in staging and run kitchen-sink visual snapshots to ensure no regressions.
- [ ] Delete residual `@apply` rules under "Legacy component compatibility" in `css/tailwind.source.css`.
- [ ] Announce the removal in release notes and update downstream embed documentation.

**Owners:** Design Systems Guild (@design-systems) with support from the Templates crew (@ui-templates) and the torrent beacon maintainers (@torrent-beacon).

**Target removal release:** 2025.04 mainline (aligns with the shim removal milestone tracked in DS-742). Audit usage after the Q1 2025 UI refresh and delete remaining shims no later than the April 2025 deployment window. At that point the compatibility layer will be removed once dependent feature flags confirm that no legacy selectors remain in production HTML.

### Selector migration table

| Legacy selector | Replacement primitive(s) | Beacon / app notes | Feature-flag strategy |
| --- | --- | --- | --- |
| `.video-card`, `.video-card__meta`, `.video-card--loading` | `.card` with `data-state` + utility classes | Removed in web app; ensure beacon dashboards render `.card` with skeleton states instead of `.video-card--loading`. | Ship markup updates behind `FEATURE_DESIGN_SYSTEM`, defaulting to legacy HTML until verified.
| `.profile-switcher`, `.profile-switcher__item` | `.card` rows + `.btn-ghost` toggles | Keep shim until profile modal Reactors deploy; beacon does not consume this selector. | Enable flag per environment after QA verifies profile modals in the kitchen sink.
| `.button`, `.button-danger` (Skeleton) | `.btn`, `.btn-ghost[data-variant="critical"]` | Critical for torrent beacon—replace the Angular templates before removing Skeleton CDN. | Roll out under `FEATURE_DESIGN_SYSTEM` in beacon build; leave fallback until beacon release 2025.03 ships.
| `.u-full-width`, `.input-text` | `.input`, `.select`, `.form-control` | Applies to upload forms and beacon filter controls; also update tests that target legacy classes. | Toggle per route: controllers read `designSystem.isEnabled()` before rendering new markup.
| `.modal-container`, `.modal-content` | `.bv-modal`, `.bv-modal-backdrop`, `.bv-modal__panel` | Already removed in core app; verify beacon modals use the primitives before deleting helper styles. | No flag required—templates should ship the primitives outright while flag protects unrelated surfaces.

### Migration Notes (Q4 2024)

- Modal templates across the app now mount `.bv-modal`, `.bv-modal-backdrop`, and `.bv-modal__panel` primitives directly. Controllers such as `ProfileModalController` and the upload modal orchestrator were updated to expect these primitives, so any new modal should follow the same structure for consistent accessibility and animation hooks.
- The compatibility shim keeps the `.profile-switcher` selector family alive temporarily so third-party embeds and cached HTML fragments continue to render while operators redeploy updated templates. Keep the aliases until the April 2025 removal window above, then delete the shim and update any last callers to the new `.card`/`.btn-ghost` structure.

## Beacon client migration

The torrent beacon now shares the Tailwind bundle used across bitvid. The standalone `torrent/beacon.html` drops Skeleton/FoA CDNs in favour of `css/tailwind.generated.css`, adopts the `.card`, `.btn`, `.btn-ghost`, and `.input` primitives, and relies on `.bv-stack` for spacing inside Angular partials. Inline SVG icons replace FontAwesome so controls stay lightweight while inheriting tokenised focus and hover states.

Angular templates under `torrent/views/` should follow the refreshed structure:

- Wrap primary sections in `.card` and layer Tailwind utilities for layout (`grid`, `gap-xl`, `overflow-auto`).
- Use `.input`, `.select`, `.btn`, and `.btn-ghost` (with `data-variant="critical"` for destructive actions) instead of legacy `.u-full-width`, `.button`, or `.button-danger` classes.
- Prefer token-backed utilities for spacing and typography (`px-6`, `py-6`, `text-muted`) over ad-hoc CSS.
- Reuse the fixed overlay spinner pattern (`fixed inset-0 z-[60] flex items-center justify-center bg-overlay-muted/70 backdrop-blur-md` plus an `animate-spin text-info-strong` SVG) for async states so overlays stay consistent with the new palette.

When adding new torrent affordances, mirror the existing markup: inline 24×24 SVG strokes at 2px, `.focus-ring` on interactive anchors, and `.bv-stack` for vertical rhythm. This keeps the beacon aligned with the design system without reintroducing the deprecated Skeleton grid.

## When to Mix Utilities

Use the primitives for foundation and lean on Tailwind utilities for:

- Layout (`flex`, `grid`, `gap-*`, `justify-*`)
- Sizing (`w-*`, `h-*`, `min-w-*`)
- Typography tweaks (`text-left`, `font-light`)
- State variations not yet encoded as tokens (e.g., success/neutral buttons)

Avoid re-declaring token values manually. If a new pattern repeats, promote it into a primitive or request new tokens to keep styling consistent.

## Visual snapshot review workflow

Continuous integration captures Playwright-powered screenshots of `docs/kitchen-sink.html` (`tests/visual/kitchen-sink.spec.ts`) on every pull request. When a snapshot job fails:

1. Read the diff produced by Playwright (attached as an artifact) and compare it with your local preview. The harness highlights per-pixel changes so reviewers can distinguish deliberate theme updates from regressions.
2. Reproduce locally with `npm run test:visual -- --update-snapshots` to refresh the expected images after verifying the change in the kitchen sink. Always run the command with the same feature flag configuration used in CI (`FEATURE_DESIGN_SYSTEM=true`).
3. Document the intent in the PR description (include before/after screenshots or reference the kitchen-sink toggle state) so reviewers and QA know the snapshot change is expected.

The design system doc is the single source of truth for reviewing these failures—if a diff contradicts the guidance above, treat it as a regression, request updates, and block the merge until the visual snapshot stabilises.
