// Lightweight guided-tour engine (docs/onboarding-plan.md). No dependencies:
// a dimmed backdrop with a spotlight CUTOUT over the current step's anchor
// (one huge box-shadow scrim + an accent glow ring pulsing via theme tokens),
// plus an anchored popover with Back / Next / Skip. Positioning is done by
// setting CSS custom properties (the codebase's sanctioned pattern — no inline
// styles), all visuals live in an injected stylesheet using design tokens.
//
// Steps: { id, target?, title, body, placement?, onEnter?, actions? }
//   - target: CSS selector to spotlight; omitted → centered welcome-style card.
//   - onEnter: optional hook (e.g. open a pane) before measuring.
//   - actions: extra buttons [{ label, onClick, variant? }] on the final card.
// Steps whose target is missing from the DOM are skipped automatically, so the
// same tour works across responsive layouts.

const STYLE_ID = "bv-tour-styles";
const TOUR_Z = 9990; // above modals (modal-always-on-top), below nothing we own

const TOUR_CSS = `
.bv-tour-root { position: fixed; inset: 0; z-index: ${TOUR_Z}; }
.bv-tour-scrim {
  position: fixed;
  left: var(--bv-tour-x, 50vw);
  top: var(--bv-tour-y, 50vh);
  width: var(--bv-tour-w, 0px);
  height: var(--bv-tour-h, 0px);
  border-radius: 0.75rem;
  pointer-events: none;
  box-shadow: 0 0 0 200vmax var(--surface-overlay-darker);
  transition: left 0.28s ease, top 0.28s ease, width 0.28s ease, height 0.28s ease;
}
.bv-tour-scrim::after {
  content: "";
  position: absolute;
  inset: -0.25rem;
  border-radius: 1rem;
  border: 2px solid var(--color-accent);
  animation: bv-tour-glow 1.8s ease-in-out infinite;
  pointer-events: none;
}
.bv-tour-scrim[data-centered="true"] { box-shadow: 0 0 0 200vmax var(--surface-overlay-darker); }
.bv-tour-scrim[data-centered="true"]::after { display: none; }
@keyframes bv-tour-glow {
  0%, 100% { box-shadow: 0 0 0.5rem 0.125rem var(--color-accent); opacity: 0.85; }
  50% { box-shadow: 0 0 1.5rem 0.375rem var(--color-accent-strong); opacity: 1; }
}
.bv-tour-popover {
  position: fixed;
  left: var(--bv-tour-px, 50vw);
  top: var(--bv-tour-py, 50vh);
  transform: translate(var(--bv-tour-tx, -50%), var(--bv-tour-ty, -50%));
  width: min(21rem, calc(100vw - 2rem));
  background: var(--color-surface, var(--surface-overlay));
  color: var(--color-text, inherit);
  border: 1px solid var(--color-border, currentColor);
  border-radius: 0.75rem;
  box-shadow: var(--shadow-lg, var(--overlay-panel-shadow)), 0 0 1.25rem 0 var(--color-accent);
  padding: 1rem;
  transition: left 0.28s ease, top 0.28s ease;
}
.bv-tour-popover h3 { font-size: 1rem; font-weight: 700; margin: 0 0 0.375rem; }
.bv-tour-popover p { font-size: 0.875rem; margin: 0 0 0.75rem; opacity: 0.9; }
.bv-tour-dots { display: flex; gap: 0.375rem; margin-bottom: 0.75rem; }
.bv-tour-dots span {
  width: 0.5rem; height: 0.5rem; border-radius: 9999px;
  background: var(--color-border, currentColor); opacity: 0.5;
}
.bv-tour-dots span[data-active="true"] {
  background: var(--color-accent); opacity: 1;
  box-shadow: 0 0 0.5rem 0 var(--color-accent);
}
.bv-tour-buttons { display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: flex-end; }
.bv-tour-buttons .bv-tour-skip { margin-right: auto; }
`;

function ensureStyles(doc) {
  if (doc.getElementById(STYLE_ID)) {
    return;
  }
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = TOUR_CSS;
  doc.head?.appendChild(style);
}

export function createTour({
  steps = [],
  document: doc = typeof document !== "undefined" ? document : null,
  onFinish,
  onSkip,
} = {}) {
  if (!doc || !Array.isArray(steps) || !steps.length) {
    return null;
  }

  ensureStyles(doc);

  const state = {
    index: -1,
    active: false,
    root: null,
    scrim: null,
    popover: null,
  };

  const availableSteps = () =>
    steps.filter(
      (step) => !step.target || Boolean(doc.querySelector(step.target)),
    );

  const setVar = (el, name, value) => {
    try {
      el.style.setProperty(name, value);
    } catch (error) {
      // non-fatal
    }
  };

  function measure(step) {
    const target = step.target ? doc.querySelector(step.target) : null;
    if (!target) {
      // Centered card: zero-size cutout in the middle (pure dim).
      setVar(state.scrim, "--bv-tour-x", "50vw");
      setVar(state.scrim, "--bv-tour-y", "50vh");
      setVar(state.scrim, "--bv-tour-w", "0px");
      setVar(state.scrim, "--bv-tour-h", "0px");
      state.scrim.dataset.centered = "true";
      setVar(state.popover, "--bv-tour-px", "50vw");
      setVar(state.popover, "--bv-tour-py", "50vh");
      setVar(state.popover, "--bv-tour-tx", "-50%");
      setVar(state.popover, "--bv-tour-ty", "-50%");
      return;
    }

    try {
      target.scrollIntoView({ block: "nearest", inline: "nearest" });
    } catch (error) {
      // older engines
    }
    const rect = target.getBoundingClientRect();
    const pad = 6;
    state.scrim.dataset.centered = "false";
    setVar(state.scrim, "--bv-tour-x", `${rect.left - pad}px`);
    setVar(state.scrim, "--bv-tour-y", `${rect.top - pad}px`);
    setVar(state.scrim, "--bv-tour-w", `${rect.width + pad * 2}px`);
    setVar(state.scrim, "--bv-tour-h", `${rect.height + pad * 2}px`);

    // Popover: below the target unless there is more room above.
    const viewportH = doc.defaultView?.innerHeight || 800;
    const below = rect.bottom + pad * 2;
    const placeAbove =
      step.placement === "top" ||
      (step.placement !== "bottom" && below > viewportH - 220 && rect.top > 240);
    const centerX = Math.min(
      Math.max(rect.left + rect.width / 2, 180),
      (doc.defaultView?.innerWidth || 1200) - 180,
    );
    setVar(state.popover, "--bv-tour-px", `${centerX}px`);
    setVar(state.popover, "--bv-tour-tx", "-50%");
    if (placeAbove) {
      setVar(state.popover, "--bv-tour-py", `${rect.top - pad * 2}px`);
      setVar(state.popover, "--bv-tour-ty", "-100%");
    } else {
      setVar(state.popover, "--bv-tour-py", `${below + pad}px`);
      setVar(state.popover, "--bv-tour-ty", "0%");
    }
  }

  function renderStep() {
    const list = availableSteps();
    const step = list[state.index];
    if (!step) {
      finish("completed");
      return;
    }

    if (typeof step.onEnter === "function") {
      try {
        step.onEnter();
      } catch (error) {
        // step hooks are best-effort
      }
    }

    const pop = state.popover;
    pop.textContent = "";

    const title = doc.createElement("h3");
    title.textContent = step.title || "";
    pop.appendChild(title);

    const body = doc.createElement("p");
    body.textContent = step.body || "";
    pop.appendChild(body);

    const dots = doc.createElement("div");
    dots.className = "bv-tour-dots";
    list.forEach((_, i) => {
      const dot = doc.createElement("span");
      if (i === state.index) {
        dot.dataset.active = "true";
      }
      dots.appendChild(dot);
    });
    pop.appendChild(dots);

    const buttons = doc.createElement("div");
    buttons.className = "bv-tour-buttons";

    const skip = doc.createElement("button");
    skip.type = "button";
    skip.className = "btn-ghost focus-ring bv-tour-skip";
    skip.textContent = "Skip tour";
    skip.addEventListener("click", () => finish("skipped"));
    buttons.appendChild(skip);

    if (state.index > 0) {
      const back = doc.createElement("button");
      back.type = "button";
      back.className = "btn-ghost focus-ring";
      back.textContent = "Back";
      back.addEventListener("click", () => go(state.index - 1));
      buttons.appendChild(back);
    }

    (step.actions || []).forEach((action) => {
      const btn = doc.createElement("button");
      btn.type = "button";
      btn.className = action.variant === "ghost" ? "btn-ghost focus-ring" : "btn focus-ring";
      btn.textContent = action.label;
      btn.addEventListener("click", () => {
        try {
          action.onClick?.();
        } catch (error) {
          // best-effort
        }
        finish("completed");
      });
      buttons.appendChild(btn);
    });

    const isLast = state.index === list.length - 1;
    const next = doc.createElement("button");
    next.type = "button";
    next.className = "btn focus-ring";
    next.textContent = isLast ? "Done" : "Next";
    next.addEventListener("click", () =>
      isLast ? finish("completed") : go(state.index + 1),
    );
    buttons.appendChild(next);

    pop.appendChild(buttons);
    measure(step);
    next.focus?.();
  }

  function go(index) {
    state.index = index;
    renderStep();
  }

  const onKeydown = (event) => {
    if (!state.active) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      finish("skipped");
    } else if (event.key === "ArrowRight") {
      const last = availableSteps().length - 1;
      state.index >= last ? finish("completed") : go(state.index + 1);
    } else if (event.key === "ArrowLeft" && state.index > 0) {
      go(state.index - 1);
    }
  };

  const onReposition = () => {
    if (!state.active) {
      return;
    }
    const step = availableSteps()[state.index];
    if (step) {
      measure(step);
    }
  };

  function finish(status) {
    if (!state.active) {
      return;
    }
    state.active = false;
    doc.removeEventListener("keydown", onKeydown, true);
    doc.defaultView?.removeEventListener?.("resize", onReposition);
    doc.defaultView?.removeEventListener?.("scroll", onReposition, true);
    state.root?.remove();
    state.root = null;
    if (status === "skipped") {
      onSkip?.();
    } else {
      onFinish?.();
    }
  }

  function start() {
    if (state.active || !availableSteps().length) {
      return false;
    }
    state.active = true;

    const root = doc.createElement("div");
    root.className = "bv-tour-root";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "bitvid tour");

    const scrim = doc.createElement("div");
    scrim.className = "bv-tour-scrim";
    root.appendChild(scrim);

    const popover = doc.createElement("div");
    popover.className = "bv-tour-popover";
    root.appendChild(popover);

    doc.body.appendChild(root);
    state.root = root;
    state.scrim = scrim;
    state.popover = popover;

    doc.addEventListener("keydown", onKeydown, true);
    doc.defaultView?.addEventListener?.("resize", onReposition);
    doc.defaultView?.addEventListener?.("scroll", onReposition, true);

    go(0);
    return true;
  }

  return {
    start,
    stop: () => finish("skipped"),
    isActive: () => state.active,
  };
}

export default createTour;
