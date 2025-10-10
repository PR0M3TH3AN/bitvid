# bitvid Design System Primitives

bitvid's visual language is now powered by Tailwind utilities backed by our design tokens. This document lists the primitives available via `css/tailwind.source.css`, how they behave across states, and when to mix them with Tailwind utilities.

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

### Badges

`.badge` renders an inline pill (`bg-panel`, uppercase text). Opt into semantic variants with `data-variant="info"`, `data-variant="critical"`, or `data-variant="neutral"`. Layer on utilities for icon alignment or truncation.

### Cards

`.card` is the base surface for grid items and panels:

- Rounded corners (`rounded-lg`) and `bg-card`
- Token shadows on hover
- Focus states reuse `.focus-ring`
- Accepts `data-state="private" | "critical" | "disabled"` for special treatments

Combine with padding utilities per layout. Interactive cards should maintain `cursor-pointer` manually (see legacy shim example below) until templates adopt dedicated controller classes.

### Form Inputs

`.form-control` is the base primitive for text entry surfaces. It handles layout (`block`, `w-full`), rounded corners, subtle borders, muted placeholders, and the shared focus ring. Hovering deepens the border, focus highlights with `border-info-strong`, `:invalid` raises a critical border, and `:disabled` mutes the field while blocking pointer events.

Specialisations reuse `.form-control`:

- `.input` – Standard single-line text input.
- `.textarea` – Multi-line input with a minimum height (`min-h-[8rem]`) and `resize-y` enabled.
- `.select` – Native `<select>` element with `appearance-none`, an integrated arrow glyph, and consistent spacing (`pr-10`).

All three share hover, focus-visible, disabled, and invalid treatments. Layer on utilities (`h-12`, `text-lg`, icon padding) as needed without re-declaring tokens.

For toggles:

- `.checkbox` resets native appearance, applies the token border/background, and swaps to the info palette when checked. The checkmark is rendered via `::after`, and disabled states lower contrast while keeping the focus ring behaviour.
- `.switch` renders a pill track with a translating thumb (`::before`). Apply `[aria-checked="true"]` or `.is-on` to move the thumb and recolor the track. Motion respects `prefers-reduced-motion` while maintaining the focus ring.

### Modal Surface

- `.bv-modal` anchors fixed overlays (full-viewport flexbox centered layout).
- `.bv-modal-backdrop` applies the tokenized overlay color with blur.
- `.bv-modal__panel` hosts modal content (`bg-surface`, `shadow-modal`, focus ring).

Compose them together when mounting new modal portals. If you need a drawer or sheet, start from these primitives and adjust spacing/positioning via utilities.

### Popovers

Use `.popover` as the relative anchor for floating content. Nest `.popover__panel` for the floating surface—it’s positioned absolutely below the trigger, inherits the shared focus ring, and animates with opacity/scale tokens. Toggle `[data-state="open"]` on the panel to switch between the collapsed (`opacity-0 scale-95`) and expanded (`opacity-100 scale-100`) states.

```html
<div class="popover">
  <button class="btn" type="button">Open filters</button>
  <div class="popover__panel" role="dialog" data-state="open">
    <p class="text-sm text-muted">Fine-tune the current feed using tags and duration filters.</p>
  </div>
</div>
```

Mix utilities such as `right-0` or `translate-x-1/2` on `.popover__panel` when you need alternative alignments. The motion helpers defer to the global motion tokens so Task 5 can adjust timing globally without revisiting individual components.

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

### Grid Stack

`.grid-stack` offers gap tokens for dense layouts. Add `data-variant="cards"` for responsive card grids (`grid-cols-1` → `sm:grid-cols-2` → `xl:grid-cols-3`). Switch to `data-orientation="vertical"` for stacked flex columns that reuse the same spacing tokens.

### Layout Helpers

- `.bv-stack` creates a vertical flex stack with the default large gap (`var(--space-lg)`). Use it for page sections such as the watch-history summary blocks.
- `.bv-stack--tight` reduces the gap to `var(--space-md)` while inheriting the `.bv-stack` flex behaviour. Combine the modifier when stacking smaller card fragments or form controls inside profile templates.
- `.bv-grid-video` centralises the responsive video grid (`repeat(auto-fill, minmax(20rem, 1fr))`) with the standard gutter (`gap-xl`) and vertical padding (`py-lg`). Apply it to feed, subscriptions, and channel views instead of repeating inline grid rules.

## Legacy Compatibility Shims

During migration we keep existing selectors alive by layering `@apply` calls in `css/style.css`. Notable shims:

- `.video-card` → `.card`
- `.modal-content` → `.bv-modal__panel`
- `#profileModal .profile-switcher*` → `.card`, `.badge`, `.btn-ghost`

We continue to expose aliases such as `.profile-switcher` and nested variations (for example, `.profile-switcher__item`) so existing profile and admin controllers stay functional while downstream templates finish their migration. These shims live under the "Legacy component compatibility" section and will be removed once templates switch to the new primitives.

**Target removal:** Audit usage after the Q1 2025 UI refresh and delete remaining shims no later than April 2025. At that point the compatibility layer will be deleted once dependent feature flags confirm that no legacy selectors remain in production HTML.

### Migration Notes (Q4 2024)

- Modal templates across the app now mount `.bv-modal`, `.bv-modal-backdrop`, and `.bv-modal__panel` primitives directly. Controllers such as `ProfileModalController` and the upload modal orchestrator were updated to expect these primitives, so any new modal should follow the same structure for consistent accessibility and animation hooks.
- The compatibility shim keeps the `.profile-switcher` selector family alive temporarily so third-party embeds and cached HTML fragments continue to render while operators redeploy updated templates. Keep the aliases until the April 2025 removal window above, then delete the shim and update any last callers to the new `.card`/`.btn-ghost` structure.

## When to Mix Utilities

Use the primitives for foundation and lean on Tailwind utilities for:

- Layout (`flex`, `grid`, `gap-*`, `justify-*`)
- Sizing (`w-*`, `h-*`, `min-w-*`)
- Typography tweaks (`text-left`, `font-light`)
- State variations not yet encoded as tokens (e.g., success/neutral buttons)

Avoid re-declaring token values manually. If a new pattern repeats, promote it into a primitive or request new tokens to keep styling consistent.
