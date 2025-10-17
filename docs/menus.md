# Menu & Popover Integration

Menus, quick actions, and contextual overlays all flow through the shared popover
engine. This guide documents how to request the overlay root, create and manage
popovers, and apply the Tailwind overlay helpers that keep menus consistent with
the design system.

## Request the overlay root

Use `ensureOverlayRoot` before mounting any floating UI so the engine has a
stable portal target. The helper resolves the right `document` instance and
appends the root container when it is missing.

```js
import ensureOverlayRoot from "../js/ui/overlay/overlayRoot.js";

const doc = trigger?.ownerDocument || document;
const overlayRoot = ensureOverlayRoot(doc);

// overlayRoot is a `<div id="uiOverlay">` tagged with `data-overlay-root`.
// Popovers, sheets, and modals render inside this element.
```

`ensureOverlayRoot` is idempotent—call it during setup for each controller or
dev surface without worrying about duplicates.

## Create a popover

`createPopover(trigger, render, options)` wires focus management, aria
attributes, collision detection, and auto updates. The render callback receives
a portal `container` inside the overlay root. Return the panel element so the
engine toggles `data-popover-state` / `data-state` values while it opens and closes.

```js
import createPopover from "../js/ui/overlay/popoverEngine.js";

function attachMenu(trigger) {
  const popover = createPopover(
    trigger,
    ({ container, close }) => {
      const panel = container.ownerDocument.createElement("div");
      panel.className = "popover__panel menu space-y-1";

      [
        { label: "Play", action: "play" },
        { label: "Save to playlist", action: "save" },
        { label: "Share", action: "share" },
      ].forEach(({ label, action }) => {
        const item = container.ownerDocument.createElement("button");
        item.type = "button";
        item.className = "menu__item justify-between";
        item.dataset.action = action;
        item.textContent = label;
        item.addEventListener("click", () => close({ restoreFocus: true }));
        panel.appendChild(item);
      });

      container.append(panel);
      return panel;
    },
    {
      document: trigger?.ownerDocument,
      placement: "bottom-end",
      restoreFocusOnClose: true,
    },
  );

  trigger.addEventListener("click", async (event) => {
    event.preventDefault();
    await popover.open();
  });
}
```

Pass `document`, `placement`, and other floating-ui options through the third
argument. The helper exposes `open()`, `close()`, `toggle()`, `isOpen()`, and
`destroy()` for lifecycle control.

### Floating UI dependency

The shared popover engine standardizes on
[`@floating-ui/dom`](https://floating-ui.com/) for positioning. The module is
vendored to `vendor/floating-ui.dom.bundle.min.js` by
`npm run build:beacon`, which bundles dependencies and copies the upstream
license alongside `nostr-tools`. Run that build whenever you bump Floating UI so
the checked-in vendor artifact stays in sync. New overlays should lean on the
engine rather than re-implementing manual gap, flip, or viewport clamp math—the
middleware layer already applies the configured gap and viewport padding via
`offset()`, `flip()`, and `shift()` helpers.

## Tailwind overlay classes

Tailwind ships token-backed overlay helpers that keep surfaces aligned with the
palette:

- `popover__panel` / `popover-panel` — rounded overlay panel with opacity and
  scale transitions. Add `menu` and `menu__item` classes for stacked button
  menus.
- `overlay-scrim` and `overlay-panel` — lightweight surfaces for inline overlays
  and frosted tooltips. Use the `data-strength` / `data-variant` modifiers to
  switch tones.
- `ds-overlay-backdrop` — full-screen backdrop helper for async states.
- `bv-modal`, `bv-modal-backdrop`, and `bv-modal__panel` — modal scaffolding
  used by upload/edit flows. Mobile breakpoints flatten the panel automatically.

Avoid ad-hoc opacity or blur utilities—let the semantic classes map to overlay
color tokens so theme swaps stay centralized in
`css/tailwind.source.css`.

## Video card actions

Video cards lean on `MoreMenuController` to attach a popover to the card's
"More" button. The controller registers the overlay root, builds the menu panel,
and opens the popover on demand.

```js
// js/ui/moreMenuController.js
const render = this.createPopoverRender(entry);
const popover = createPopover(trigger, render, {
  document: documentRef,
  placement: "bottom-end",
});

// Inside the render callback (createVideoMoreMenuPanel):
panel.className = "popover__panel menu space-y-1";
button.className = "menu__item";
```

Each menu button dispatches `video:context-action` events so cards, lists, and
player overlays can respond without duplicating menu markup.

## Modal actions

`VideoModal` follows the same pattern for its in-modal menu and zap actions. It
requests the overlay root from the modal's `ownerDocument`, builds a
`popover__panel`, and delegates action handling back to the controller.

```js
// js/ui/components/VideoModal.js
const render = ({ document: doc, close }) => {
  const panel = this.buildModalMoreMenuPanel({ document: doc, close });
  return panel;
};

const popover = createPopover(this.modalMoreBtn, render, {
  document: documentRef,
  placement: "bottom-end",
  restoreFocusOnClose: true,
});
```

Modal action buttons reuse the same `menu__item` styling and call `close()` to
collapse the overlay before dispatching the selected action.

## Manual QA surface

A lightweight QA harness lives at `views/dev/popover-demo.html`. Launch the
static dev server from the repository root:

```bash
python -m http.server 8000
# or
npx serve
```

Then open `http://localhost:8000/views/dev/popover-demo.html` to interact with a
sample video card and modal wired to the popover engine. The page ensures the
overlay root exists, demonstrates Tailwind overlay helpers, and exercises both
card and modal action menus without relying on production data.

- ✅ **Anchored alignment check:** Open the video-card “More” menu and the
  modal action menu. Each panel’s right edge should stay flush with the trigger
  button. Playwright now verifies this via `tests/e2e/popover.spec.ts`, but QA
  should still confirm the alignment while running the manual demo.
