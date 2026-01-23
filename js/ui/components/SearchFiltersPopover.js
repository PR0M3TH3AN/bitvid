import createPopover from "../overlay/popoverEngine.js";

const FOCUSABLE_SELECTOR =
  "a[href], button:not([disabled]), input:not([disabled]):not([type=\"hidden\"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex=\"-1\"])";

function resolveDocument(documentRef) {
  if (documentRef && documentRef.nodeType === 9) {
    return documentRef;
  }
  if (typeof document !== "undefined" && document?.nodeType === 9) {
    return document;
  }
  return null;
}

function createElement(doc, tagName, { className, text, attrs } = {}) {
  const el = doc.createElement(tagName);
  if (className) {
    el.className = className;
  }
  if (text) {
    el.textContent = text;
  }
  if (attrs) {
    Object.entries(attrs).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") {
        return;
      }
      el.setAttribute(key, value);
    });
  }
  return el;
}

function collectFocusable(panel) {
  if (!panel) {
    return [];
  }
  return Array.from(panel.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true",
  );
}

function trapFocus(panel) {
  if (!panel) {
    return () => {};
  }

  const handler = (event) => {
    if (event.key !== "Tab") {
      return;
    }
    const focusable = collectFocusable(panel);
    if (!focusable.length) {
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = panel.ownerDocument.activeElement;
    const isShift = event.shiftKey;

    if (isShift) {
      if (active === first || !panel.contains(active)) {
        event.preventDefault();
        last.focus();
      }
      return;
    }

    if (active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  panel.addEventListener("keydown", handler);
  return () => panel.removeEventListener("keydown", handler);
}

function toggleChip(button) {
  if (!button) {
    return;
  }
  const isPressed = button.getAttribute("aria-pressed") === "true";
  const nextState = isPressed ? "false" : "true";
  button.setAttribute("aria-pressed", nextState);
  button.dataset.state = nextState === "true" ? "on" : "off";
}

function toggleSwitch(button) {
  if (!button) {
    return;
  }
  const isChecked = button.getAttribute("aria-checked") === "true";
  const nextState = isChecked ? "false" : "true";
  button.setAttribute("aria-checked", nextState);
  button.classList.toggle("is-on", nextState === "true");
}

function buildLabeledInput(doc, { id, label, type = "text", placeholder } = {}) {
  const wrapper = createElement(doc, "div", {
    className: "bv-stack bv-stack--tight",
  });
  const labelEl = createElement(doc, "label", {
    className: "text-xs font-semibold uppercase tracking-wide text-muted",
    text: label,
    attrs: { for: id },
  });
  const inputEl = createElement(doc, "input", {
    className: "input w-full",
    attrs: { id, type, placeholder },
  });
  wrapper.append(labelEl, inputEl);
  return { wrapper, inputEl };
}

export function attachSearchFiltersPopover(triggerElement, options = {}) {
  if (!triggerElement) {
    return null;
  }

  const doc = resolveDocument(options.document || triggerElement.ownerDocument);
  if (!doc) {
    return null;
  }

  const render = ({ container, close }) => {
    const panel = createElement(doc, "div", {
      className:
        "popover-panel w-80 max-w-full space-y-5 md:w-96",
      attrs: { "aria-label": "Search filters" },
    });
    panel.dataset.popoverVariant = "filters";

    const header = createElement(doc, "div", {
      className: "flex items-start justify-between gap-3",
    });
    const heading = createElement(doc, "div", {
      className: "bv-stack bv-stack--tight",
    });
    heading.append(
      createElement(doc, "p", {
        className: "text-xs font-semibold uppercase tracking-wide text-muted",
        text: "Refine results",
      }),
      createElement(doc, "h3", {
        className: "text-base font-semibold text-text-strong",
        text: "Search filters",
      }),
    );
    const closeButton = createElement(doc, "button", {
      className: "btn-ghost h-9 w-9 shrink-0",
      text: "✕",
      attrs: { type: "button", "aria-label": "Close filters" },
    });
    closeButton.addEventListener("click", () => close());
    header.append(heading, closeButton);
    panel.appendChild(header);

    const dateSection = createElement(doc, "div", {
      className: "bv-stack bv-stack--tight",
    });
    dateSection.appendChild(
      createElement(doc, "p", {
        className: "text-xs font-semibold uppercase tracking-wide text-muted",
        text: "Date range",
      }),
    );
    const chipRow = createElement(doc, "div", {
      className: "flex flex-wrap gap-2",
    });
    ["24h", "7d", "30d", "90d", "All time"].forEach((label) => {
      const chip = createElement(doc, "button", {
        className:
          "search-filter-chip focus-ring",
        text: label,
        attrs: { type: "button", "aria-pressed": "false" },
      });
      chip.dataset.state = "off";
      chip.addEventListener("click", () => toggleChip(chip));
      chipRow.appendChild(chip);
    });
    const dateInputs = createElement(doc, "div", {
      className: "grid gap-3 sm:grid-cols-2",
    });
    const { wrapper: startWrapper } = buildLabeledInput(doc, {
      id: "search-filters-date-start",
      label: "Start date",
      type: "date",
    });
    const { wrapper: endWrapper } = buildLabeledInput(doc, {
      id: "search-filters-date-end",
      label: "End date",
      type: "date",
    });
    dateInputs.append(startWrapper, endWrapper);
    dateSection.append(chipRow, dateInputs);
    panel.appendChild(dateSection);

    const sortSection = createElement(doc, "div", {
      className: "bv-stack bv-stack--tight",
    });
    sortSection.appendChild(
      createElement(doc, "p", {
        className: "text-xs font-semibold uppercase tracking-wide text-muted",
        text: "Sort",
      }),
    );
    const sortSelect = createElement(doc, "select", {
      className: "select w-full",
      attrs: { "aria-label": "Sort results" },
    });
    [
      { label: "Most recent", value: "recent" },
      { label: "Most viewed", value: "views" },
      { label: "Trending", value: "trending" },
      { label: "Longest", value: "longest" },
    ].forEach(({ label, value }) => {
      const option = createElement(doc, "option", { text: label });
      option.value = value;
      sortSelect.appendChild(option);
    });
    sortSection.appendChild(sortSelect);
    panel.appendChild(sortSection);

    const { wrapper: authorWrapper } = buildLabeledInput(doc, {
      id: "search-filters-author",
      label: "Author",
      placeholder: "npub1...",
    });
    panel.appendChild(authorWrapper);

    const tagSection = createElement(doc, "div", {
      className: "bv-stack bv-stack--tight",
    });
    tagSection.appendChild(
      createElement(doc, "p", {
        className: "text-xs font-semibold uppercase tracking-wide text-muted",
        text: "Tags",
      }),
    );
    const tagInput = createElement(doc, "input", {
      className: "input w-full",
      attrs: { type: "text", placeholder: "Add tag or keyword" },
    });
    const tagList = createElement(doc, "div", {
      className: "flex flex-wrap gap-2",
    });
    ["nostr", "music", "live"].forEach((tag) => {
      const chip = createElement(doc, "button", {
        className: "search-filter-chip focus-ring",
        text: `#${tag}`,
        attrs: { type: "button", "aria-pressed": "true" },
      });
      chip.dataset.state = "on";
      chip.addEventListener("click", () => toggleChip(chip));
      tagList.appendChild(chip);
    });
    tagSection.append(tagInput, tagList);
    panel.appendChild(tagSection);

    const durationSection = createElement(doc, "div", {
      className: "bv-stack bv-stack--tight",
    });
    durationSection.appendChild(
      createElement(doc, "p", {
        className: "text-xs font-semibold uppercase tracking-wide text-muted",
        text: "Duration",
      }),
    );
    const durationGrid = createElement(doc, "div", {
      className: "grid gap-2",
    });
    [
      { id: "duration-short", label: "Short (under 5 min)" },
      { id: "duration-medium", label: "Medium (5-20 min)" },
      { id: "duration-long", label: "Long (20+ min)" },
      { id: "duration-live", label: "Live sessions" },
    ].forEach(({ id, label }) => {
      const row = createElement(doc, "label", {
        className: "flex items-center gap-3 text-sm text-text",
        attrs: { for: id },
      });
      const checkbox = createElement(doc, "input", {
        className: "checkbox",
        attrs: { id, type: "checkbox" },
      });
      row.append(checkbox, createElement(doc, "span", { text: label }));
      durationGrid.appendChild(row);
    });
    durationSection.appendChild(durationGrid);
    panel.appendChild(durationSection);

    const toggleSection = createElement(doc, "div", {
      className: "grid gap-3",
    });
    const toggleRow = (label, id) => {
      const row = createElement(doc, "div", {
        className: "flex items-center justify-between gap-3",
      });
      const text = createElement(doc, "div", {
        className: "bv-stack bv-stack--tight",
      });
      text.append(
        createElement(doc, "p", {
          className: "text-sm font-medium text-text",
          text: label,
        }),
        createElement(doc, "p", {
          className: "text-xs text-muted",
          text: `Toggle ${label.toLowerCase()}`,
        }),
      );
      const toggle = createElement(doc, "button", {
        className: "switch",
        attrs: { type: "button", role: "switch", "aria-checked": "false", id },
      });
      toggle.addEventListener("click", () => toggleSwitch(toggle));
      row.append(text, toggle);
      return row;
    };
    toggleSection.append(
      toggleRow("NSFW content", "search-filters-nsfw"),
      toggleRow("Followed only", "search-filters-followed"),
    );
    panel.appendChild(toggleSection);

    const footer = createElement(doc, "div", {
      className: "flex items-center justify-between gap-3 border-t border-border/60 pt-4",
    });
    const resetButton = createElement(doc, "button", {
      className: "btn-ghost text-sm",
      text: "Reset",
      attrs: { type: "button" },
    });
    const applyButton = createElement(doc, "button", {
      className: "btn text-sm",
      text: "Apply filters",
      attrs: { type: "button" },
    });
    resetButton.addEventListener("click", () => {
      const chips = panel.querySelectorAll(".search-filter-chip");
      chips.forEach((chip) => {
        chip.setAttribute("aria-pressed", "false");
        chip.dataset.state = "off";
      });
      panel.querySelectorAll("input").forEach((input) => {
        if (input.type === "checkbox") {
          input.checked = false;
        } else {
          input.value = "";
        }
      });
      panel.querySelectorAll("select").forEach((select) => {
        select.selectedIndex = 0;
      });
      panel.querySelectorAll(".switch").forEach((toggle) => {
        toggle.setAttribute("aria-checked", "false");
        toggle.classList.remove("is-on");
      });
      if (typeof options.onReset === "function") {
        options.onReset();
      }
    });
    applyButton.addEventListener("click", () => {
      if (typeof options.onApply === "function") {
        options.onApply();
      }
      close();
    });
    footer.append(resetButton, applyButton);
    panel.appendChild(footer);

    trapFocus(panel);
    container.appendChild(panel);
    return panel;
  };

  const popover = createPopover(triggerElement, render, {
    placement: options.placement || "bottom-start",
    document: doc,
    restoreFocusOnClose: true,
  });

  triggerElement.addEventListener("click", async (event) => {
    event.preventDefault();
    await popover.toggle();
  });

  return popover;
}

export default attachSearchFiltersPopover;
