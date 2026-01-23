import createPopover from "../overlay/popoverEngine.js";
import { DEFAULT_FILTERS, SORT_OPTIONS } from "../../search/searchFilters.js";

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

const parseDateInputValue = (value) => {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return Math.floor(parsed / 1000);
};

const formatDateInputValue = (timestampSeconds) => {
  if (!Number.isFinite(timestampSeconds)) {
    return "";
  }
  const date = new Date(timestampSeconds * 1000);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const normalizeTagValue = (value) =>
  value
    .split(/[, ]+/)
    .map((tag) => tag.trim().replace(/^#/, ""))
    .filter(Boolean);

export function attachSearchFiltersPopover(triggerElement, options = {}) {
  if (!triggerElement) {
    return null;
  }

  const doc = resolveDocument(options.document || triggerElement.ownerDocument);
  if (!doc) {
    return null;
  }

  let controlState = null;

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
    const dateChips = [];
    const dateChipValues = [
      { label: "24h", days: 1 },
      { label: "7d", days: 7 },
      { label: "30d", days: 30 },
      { label: "90d", days: 90 },
      { label: "All time", days: null },
    ];
    dateChipValues.forEach(({ label, days }) => {
      const chip = createElement(doc, "button", {
        className:
          "search-filter-chip focus-ring",
        text: label,
        attrs: { type: "button", "aria-pressed": "false" },
      });
      chip.dataset.state = "off";
      chip.addEventListener("click", () => {
        dateChips.forEach((entry) => {
          entry.button.setAttribute("aria-pressed", "false");
          entry.button.dataset.state = "off";
        });
        chip.setAttribute("aria-pressed", "true");
        chip.dataset.state = "on";
        if (days === null) {
          startInputEl.value = "";
          endInputEl.value = "";
          return;
        }
        const now = new Date();
        const start = new Date();
        start.setDate(now.getDate() - days);
        startInputEl.value = formatDateInputValue(
          Math.floor(start.getTime() / 1000),
        );
        endInputEl.value = formatDateInputValue(
          Math.floor(now.getTime() / 1000),
        );
      });
      dateChips.push({ button: chip, days });
      chipRow.appendChild(chip);
    });
    const dateInputs = createElement(doc, "div", {
      className: "grid gap-3 sm:grid-cols-2",
    });
    const { wrapper: startWrapper, inputEl: startInputEl } = buildLabeledInput(
      doc,
      {
      id: "search-filters-date-start",
      label: "Start date",
      type: "date",
      },
    );
    const { wrapper: endWrapper, inputEl: endInputEl } = buildLabeledInput(
      doc,
      {
      id: "search-filters-date-end",
      label: "End date",
      type: "date",
      },
    );
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
    const enableExperimentalSorts = options.enableExperimentalSorts === true;
    SORT_OPTIONS.forEach((sortOption) => {
      const suffix = sortOption.experimental ? " (experimental)" : "";
      const option = createElement(doc, "option", {
        text: `${sortOption.label}${suffix}`,
      });
      option.value = sortOption.value;
      if (sortOption.experimental && !enableExperimentalSorts) {
        option.disabled = true;
      }
      sortSelect.appendChild(option);
    });
    sortSection.appendChild(sortSelect);
    panel.appendChild(sortSection);

    const { wrapper: authorWrapper, inputEl: authorInput } = buildLabeledInput(
      doc,
      {
      id: "search-filters-author",
      label: "Author",
      placeholder: "npub1...",
      },
    );
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
    const tagChips = new Map();
    ["nostr", "music", "live"].forEach((tag) => {
      const chip = createElement(doc, "button", {
        className: "search-filter-chip focus-ring",
        text: `#${tag}`,
        attrs: { type: "button", "aria-pressed": "true" },
      });
      chip.dataset.state = "on";
      chip.addEventListener("click", () => toggleChip(chip));
      tagChips.set(tag, chip);
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
    const durationChecks = {};
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
      durationChecks[id] = checkbox;
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
    const nsfwToggle = toggleRow("NSFW content", "search-filters-nsfw");
    const followedToggle = toggleRow("Followed only", "search-filters-followed");
    toggleSection.append(nsfwToggle, followedToggle);
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
    const applyStateToControls = (filters = DEFAULT_FILTERS) => {
      const safeFilters = filters || DEFAULT_FILTERS;
      startInputEl.value = formatDateInputValue(safeFilters.dateRange?.after);
      endInputEl.value = formatDateInputValue(safeFilters.dateRange?.before);
      const hasDateRange =
        Number.isFinite(safeFilters.dateRange?.after) ||
        Number.isFinite(safeFilters.dateRange?.before);
      dateChips.forEach(({ button, days }) => {
        const isAllTime = days === null && !hasDateRange;
        button.setAttribute("aria-pressed", isAllTime ? "true" : "false");
        button.dataset.state = isAllTime ? "on" : "off";
      });
      authorInput.value = safeFilters.authorPubkeys?.join(", ") || "";
      tagInput.value = "";
      tagChips.forEach((chip, tag) => {
        const isActive = safeFilters.tags?.includes(tag);
        chip.setAttribute("aria-pressed", isActive ? "true" : "false");
        chip.dataset.state = isActive ? "on" : "off";
      });
      const extraTags = (safeFilters.tags || []).filter(
        (tag) => !tagChips.has(tag),
      );
      if (extraTags.length) {
        tagInput.value = extraTags.join(", ");
      }
      Object.values(durationChecks).forEach((checkbox) => {
        checkbox.checked = false;
      });
      const minSeconds = safeFilters.duration?.minSeconds ?? null;
      const maxSeconds = safeFilters.duration?.maxSeconds ?? null;
      if (minSeconds === null && maxSeconds === 300) {
        durationChecks["duration-short"].checked = true;
      } else if (minSeconds === 300 && maxSeconds === 1200) {
        durationChecks["duration-medium"].checked = true;
      } else if (minSeconds === 1200 && maxSeconds === null) {
        durationChecks["duration-long"].checked = true;
      }
      const nsfwSwitch = nsfwToggle.querySelector(".switch");
      if (nsfwSwitch) {
        const isOn = safeFilters.nsfw === "true" || safeFilters.nsfw === "only";
        nsfwSwitch.setAttribute("aria-checked", isOn ? "true" : "false");
        nsfwSwitch.classList.toggle("is-on", isOn);
      }
      const followedSwitch = followedToggle.querySelector(".switch");
      if (followedSwitch) {
        followedSwitch.setAttribute("aria-checked", "false");
        followedSwitch.classList.remove("is-on");
      }
      if (sortSelect) {
        sortSelect.value = safeFilters.sort || DEFAULT_FILTERS.sort;
      }
    };

    const buildFiltersFromControls = () => {
      const filters = {
        ...DEFAULT_FILTERS,
        dateRange: { ...DEFAULT_FILTERS.dateRange },
        duration: { ...DEFAULT_FILTERS.duration },
      };
      filters.dateRange.after = parseDateInputValue(startInputEl.value);
      filters.dateRange.before = parseDateInputValue(endInputEl.value);
      const authorValues = authorInput.value
        .split(/[, ]+/)
        .map((value) => value.trim())
        .filter(Boolean);
      filters.authorPubkeys = authorValues;
      const selectedTags = new Set();
      tagChips.forEach((chip, tag) => {
        if (chip.getAttribute("aria-pressed") === "true") {
          selectedTags.add(tag);
        }
      });
      normalizeTagValue(tagInput.value).forEach((tag) =>
        selectedTags.add(tag),
      );
      filters.tags = Array.from(selectedTags);
      const ranges = [];
      if (durationChecks["duration-short"].checked) {
        ranges.push({ min: null, max: 300 });
      }
      if (durationChecks["duration-medium"].checked) {
        ranges.push({ min: 300, max: 1200 });
      }
      if (durationChecks["duration-long"].checked) {
        ranges.push({ min: 1200, max: null });
      }
      if (ranges.length) {
        const mins = ranges
          .map((range) => range.min)
          .filter((value) => value !== null);
        const maxes = ranges
          .map((range) => range.max)
          .filter((value) => value !== null);
        filters.duration.minSeconds = mins.length ? Math.min(...mins) : null;
        filters.duration.maxSeconds = maxes.length ? Math.max(...maxes) : null;
      }
      const nsfwSwitch = nsfwToggle.querySelector(".switch");
      if (nsfwSwitch?.getAttribute("aria-checked") === "true") {
        filters.nsfw = "true";
      }
      if (sortSelect?.value) {
        filters.sort = sortSelect.value;
      }
      return filters;
    };

    resetButton.addEventListener("click", () => {
      applyStateToControls(DEFAULT_FILTERS);
      if (typeof options.onReset === "function") {
        options.onReset();
      }
    });
    applyButton.addEventListener("click", () => {
      if (typeof options.onApply === "function") {
        options.onApply(buildFiltersFromControls());
      }
      close();
    });
    footer.append(resetButton, applyButton);
    panel.appendChild(footer);

    trapFocus(panel);
    container.appendChild(panel);

    controlState = {
      applyStateToControls,
    };
    return panel;
  };

  const popover = createPopover(triggerElement, render, {
    placement: options.placement || "bottom-start",
    document: doc,
    restoreFocusOnClose: true,
  });

  triggerElement.addEventListener("click", async (event) => {
    event.preventDefault();
    if (popover.isOpen()) {
      popover.close();
      return;
    }
    popover.preload();
    if (controlState?.applyStateToControls) {
      const nextState =
        typeof options.getState === "function" ? options.getState() : null;
      controlState.applyStateToControls(nextState?.filters || DEFAULT_FILTERS);
    }
    await popover.open();
  });

  return popover;
}

export default attachSearchFiltersPopover;
