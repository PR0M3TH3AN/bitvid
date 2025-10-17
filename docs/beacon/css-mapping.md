# Beacon vendor CSS migration

This inventory captures the selectors that mattered in `torrent/dist/beacon.vendor.css` and how they now map to design-system driven rules. The goal is to keep future tweaks aligned with shared tokens rather than re-introducing ad-hoc styles or vendor bundles.

> **Contributor note:** Beacon CSS updates must follow the [“Styling & Theming Rules (token-first)” guidance in `AGENTS.md`](../../AGENTS.md#styling--theming-rules-token-first) and the [README CSS build pipeline](../../README.md#css-build-pipeline). Run the relevant scripts before committing changes—at minimum `npm run lint:css`, `npm run build:css`, `npm run check:css`, and `npm run build:beacon` to ensure the Tailwind output and bundled assets stay in sync with token rules.

## Angular UI Grid

| Legacy selector(s) | Tailwind component mapping | Notes |
| --- | --- | --- |
| `.ui-grid`, `.ui-grid-render-container`, `.ui-grid-contents-wrapper` | `.ui-grid` block in `css/tailwind.source.css` | Uses shared border/box styling via `--grid-border-width`, preserving the translated container shell. |
| `.ui-grid-top-panel-background`, `.ui-grid-footer-panel-background`, `.ui-grid-header`, `.ui-grid-top-panel` | Same block | Backgrounds and dividers now pull from `var(--color-surface-alt)` and `var(--color-border-translucent-medium)`. |
| `.ui-grid-header-viewport`, `.ui-grid-footer-viewport`, `.ui-grid-header-canvas`, `.ui-grid-footer-canvas`, `.ui-grid-header-cell-wrapper`, `.ui-grid-footer-cell-wrapper`, `.ui-grid-header-cell-row`, `.ui-grid-footer-cell-row` | Same block | Table layout and overflow behaviour carried over verbatim. |
| `.ui-grid-header-cell`, `.ui-grid-footer-cell`, `.ui-grid-header-cell .sortable`, `.ui-grid-header-cell .ui-grid-sort-priority-number` | Same block | Header typography now keyed off `--grid-header-font-size` and `--grid-header-letter-spacing`; sortable affordances reference spacing tokens. |
| `.ui-grid-sortarrow`, `.ui-grid-sortarrow.down`, (icon font triangle) | `.ui-grid-sortarrow` + pseudo-element | Arrow is now rendered with CSS borders driven by `--grid-sort-indicator-*` tokens, eliminating the ui-grid icon font. |
| `.ui-grid-vertical-bar` + child selectors | Same block | Divider widths reuse the shared border width token. |
| `.ui-grid-viewport`, `.ui-grid-canvas` | Same block | Min heights and padding resolve through grid tokens instead of literal px. |
| `.ui-grid-row`, row parity/hover/last-child selectors, `.ui-grid-row-selected > [ui-grid-row] > .ui-grid-cell` | Same block | Alternating row fills reference surface tokens and preserve selection colours. |
| `.ui-grid-cell`, `.ui-grid-cell:last-child`, `.ui-grid-cell-contents`, `.ui-grid-cell-contents-hidden` | Same block | Cell padding now uses `--grid-cell-padding-*`; hidden content helper retained. |
| `.ui-grid-cell-focus`, `.ui-grid-focuser`, `.ui-grid-offscreen` | Same block | Focus handling switches to tokenised shadows while keeping accessibility helpers. |
| `.ui-grid-no-row-overlay`, `.ui-grid-no-row-overlay > *` | Same block | Empty-state panel adopts design-system surface/background tokens. |
| `.ui-grid-menu-button`, `.ui-grid-menu` | Same block | Menu chrome now uses shared spacing, shadows, and border tokens. |
| `.ui-grid-column-resizer`, `.ui-grid.column-resizing`, `.ui-grid.column-resizing .ui-grid-resize-overlay` | Same block | Resizer hit boxes use `--grid-resizer-width`; overlay colour references translucent border tokens. |
| `.ui-grid-row-saving .ui-grid-cell`, `.ui-grid-row-dirty .ui-grid-cell`, `.ui-grid-row-error .ui-grid-cell` | Same block | Status colours mapped to `var(--color-muted-strong)`, `var(--color-warning-strong)`, and `var(--color-critical-strong)`. |
| `.ui-grid-disable-selection` | Same block | Still prevents text selection with consistent cursor feedback. |
| `.ui-grid-animate-spin`, `@keyframes ui-grid-spin` | Same block | Animation now hooks into the global motion duration token. |

> **Omitted vendor selectors:** Column menus, tree, filter icons, and other ui-grid extension classes remain unused in the beacon routes, so the icon font `@font-face` payload was intentionally dropped.

## ng-notify

| Legacy selector(s) | Tailwind component mapping | Notes |
| --- | --- | --- |
| `.ngn`, `.ngn.ngn-visible`, `.ngn.ngn-enter-active`, `.ngn.ngn-leave-active` | `.ngn` block in `css/tailwind.source.css` | Layout, typography, and z-index now rely on `--notify-*` and `--z-notify`. Pointer-events handling mirrors vendor behaviour. |
| `.ngn-top`, `.ngn-bottom`, `.ngn-component` | Same block | Placement helpers rewritten with logical properties (`inset-block-*`). |
| `.ngn-dismiss`, `.ngn-sticky .ngn-dismiss`, `.ngn-dismiss:hover`, `.ngn-dismiss:active` | Same block | Close button sizing derives from tokens; hover/active states use `color-mix` against overlay tokens. |
| `.ngn-info`, `.ngn-error`, `.ngn-success`, `.ngn-warn`, `.ngn-grimace` | Same block | Severity palettes tie directly into existing info/warning/critical tokens. |
| `.ngn-prime.*`, `.ngn-pastel.*`, `.ngn-pitchy.*` | Same block | Theme variants blend design-system colours via `color-mix`, preserving tonal differences without hard-coded hex values. |
| `@media (max-width: 30rem)` overrides | Same block | Compact sizing switches to shared spacing and font-size tokens. |

## Font faces

The legacy bundle shipped three `@font-face` blocks for the `ui-grid` icon font. Sort indicators and menu affordances now render through CSS borders and shared tokens, so the icon font is no longer required or embedded in the Tailwind build.
