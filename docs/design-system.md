# Bitvid Design System Primitives

Bitvid's visual language is now powered by Tailwind utilities backed by our design tokens. This document lists the primitives available via `css/tailwind.source.css`, how they behave across states, and when to mix them with Tailwind utilities.

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

`.input` styles text fields and textareas. Hovering deepens the border, focus highlights with `border-info-strong` and the shared focus ring. Disabled inputs dim their background and block pointer events.

Add sizing utilities (`h-12`, `text-lg`) or adornments (e.g., `pl-10`) as required. Keep placeholder contrast by relying on the built-in `placeholder:text-muted` rule.

### Modal Surface

- `.bv-modal` anchors fixed overlays (full-viewport flexbox centered layout).
- `.bv-modal-backdrop` applies the tokenized overlay color with blur.
- `.bv-modal__panel` hosts modal content (`bg-surface`, `shadow-modal`, focus ring).

Compose them together when mounting new modal portals. If you need a drawer or sheet, start from these primitives and adjust spacing/positioning via utilities.

### Grid Stack

`.grid-stack` offers gap tokens for dense layouts. Add `data-variant="cards"` for responsive card grids (`grid-cols-1` → `sm:grid-cols-2` → `xl:grid-cols-3`). Switch to `data-orientation="vertical"` for stacked flex columns that reuse the same spacing tokens.

## Legacy Compatibility Shims

During migration we keep existing selectors alive by layering `@apply` calls in `css/style.css`. Notable shims:

- `.video-card` → `.card`
- `.modal-content` → `.bv-modal__panel`
- `#profileModal .profile-switcher*` → `.card`, `.badge`, `.btn-ghost`

These shims live under the "Legacy component compatibility" section and will be removed once templates switch to the new primitives.

**Target removal:** Audit usage after the Q1 2025 UI refresh and delete remaining shims no later than April 2025.

## When to Mix Utilities

Use the primitives for foundation and lean on Tailwind utilities for:

- Layout (`flex`, `grid`, `gap-*`, `justify-*`)
- Sizing (`w-*`, `h-*`, `min-w-*`)
- Typography tweaks (`text-left`, `font-light`)
- State variations not yet encoded as tokens (e.g., success/neutral buttons)

Avoid re-declaring token values manually. If a new pattern repeats, promote it into a primitive or request new tokens to keep styling consistent.
