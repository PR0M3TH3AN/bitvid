import {
  prepareStaticModal,
  openStaticModal,
  closeStaticModal,
} from "./staticModalAccessibility.js";
import {
  getSearchFilterState,
  setSearchFilterState,
  buildSearchHashFromState,
  resetSearchFilters,
} from "../../search/searchFilterState.js";
import { DEFAULT_FILTERS } from "../../search/searchFilters.js";
import { setHashView } from "../../hashView.js";
import { ALLOW_NSFW_CONTENT } from "../../config.js";

const MODAL_ID = "searchFilterModal";

let isInitialized = false;

// DOM Elements
let modal;
let form;
let dateStartInput;
let dateEndInput;
let sortSelect;
let authorInput;
let nsfwToggle;
let advancedToggleBtn;
let advancedPanel;
let advancedChevron;
let tagsInput;
let durationShortCheckbox;
let durationMediumCheckbox;
let durationLongCheckbox;
let dateChipsContainer;
let tagChipsContainer;
let hasChipsContainer;

function getElement(id) {
  return document.getElementById(id);
}

function init() {
  if (isInitialized) return;

  modal = getElement(MODAL_ID);
  if (!modal) return; // Modal HTML not loaded yet

  form = getElement("searchFilterForm");
  dateStartInput = getElement("searchFilterDateStart");
  dateEndInput = getElement("searchFilterDateEnd");
  sortSelect = getElement("searchFilterSort");
  authorInput = getElement("searchFilterAuthor");
  nsfwToggle = getElement("searchFilterNsfwToggle");

  advancedToggleBtn = getElement("searchFilterAdvancedToggle");
  advancedPanel = getElement("searchFilterAdvancedPanel");
  advancedChevron = advancedToggleBtn.querySelector("span:last-child"); // The chevron

  tagsInput = getElement("searchFilterTags");
  durationShortCheckbox = getElement("searchFilterDurationShort");
  durationMediumCheckbox = getElement("searchFilterDurationMedium");
  durationLongCheckbox = getElement("searchFilterDurationLong");

  dateChipsContainer = getElement("searchFilterDateChips");
  tagChipsContainer = getElement("searchFilterTagChips");
  hasChipsContainer = getElement("searchFilterHasChips");

  // Event Listeners

  // Close
  const closeBtn = getElement("closeSearchFilterModal");
  if (closeBtn) {
    closeBtn.addEventListener("click", close);
  }

  // Apply
  const applyBtn = getElement("searchFilterApplyBtn");
  if (applyBtn) {
    applyBtn.addEventListener("click", () => {
      applyFilters();
      close();
    });
  }

  // Reset
  const resetBtn = getElement("searchFilterResetBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      syncStateToControls(DEFAULT_FILTERS);
    });
  }

  // Advanced Toggle
  if (advancedToggleBtn) {
    advancedToggleBtn.addEventListener("click", () => toggleAdvanced());
  }

  // Date Chips
  if (dateChipsContainer) {
    dateChipsContainer.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;

      const days = btn.dataset.days;
      handleDateChip(days);
      updateChipVisuals(dateChipsContainer, btn);
    });
  }

  // Tag Chips
  if (tagChipsContainer) {
    tagChipsContainer.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      toggleChipState(btn);
    });
  }

  // Has Chips
  if (hasChipsContainer) {
    hasChipsContainer.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      toggleChipState(btn);
    });
  }

  // NSFW Toggle
  if (nsfwToggle) {
    if (!ALLOW_NSFW_CONTENT) {
      nsfwToggle.disabled = true;
      nsfwToggle.setAttribute("aria-disabled", "true");
      nsfwToggle.title = "NSFW content is disabled on this instance.";
      // Visual disabled state is usually handled by CSS for [disabled], but we can enforce:
      nsfwToggle.classList.add("opacity-50", "cursor-not-allowed");
    } else {
      nsfwToggle.addEventListener("click", () => {
        const isChecked = nsfwToggle.getAttribute("aria-checked") === "true";
        nsfwToggle.setAttribute("aria-checked", !isChecked);
        nsfwToggle.classList.toggle("is-on", !isChecked);
      });
    }
  }

  prepareStaticModal({ id: MODAL_ID });
  isInitialized = true;
}

function open() {
  if (!isInitialized) init();

  const currentState = getSearchFilterState();
  syncStateToControls(currentState.filters || DEFAULT_FILTERS);

  openStaticModal(modal);
}

function close() {
  closeStaticModal(modal);
}

function toggleAdvanced(forceState = null) {
  const isCurrentlyExpanded = advancedToggleBtn.getAttribute("aria-expanded") === "true";
  const newState = forceState !== null ? forceState : !isCurrentlyExpanded;

  advancedToggleBtn.setAttribute("aria-expanded", newState);

  if (newState) {
    advancedPanel.classList.remove("hidden");
    advancedChevron.classList.add("rotate-180");
    advancedChevron.classList.remove("rotate-0");
  } else {
    advancedPanel.classList.add("hidden");
    advancedChevron.classList.add("rotate-0");
    advancedChevron.classList.remove("rotate-180");
  }
}

// Helpers for Date
const parseDateInputValue = (value) => {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return Math.floor(parsed / 1000);
};

const formatDateInputValue = (timestampSeconds) => {
  if (!Number.isFinite(timestampSeconds)) return "";
  const date = new Date(timestampSeconds * 1000);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

function handleDateChip(days) {
  if (days === "all") {
    dateStartInput.value = "";
    dateEndInput.value = "";
    return;
  }

  const numDays = parseInt(days, 10);
  if (isNaN(numDays)) return;

  const now = new Date();
  const start = new Date();
  start.setDate(now.getDate() - numDays);

  dateStartInput.value = formatDateInputValue(Math.floor(start.getTime() / 1000));
  dateEndInput.value = formatDateInputValue(Math.floor(now.getTime() / 1000));
}

// Helpers for Chips
function toggleChipState(btn) {
  const isPressed = btn.getAttribute("aria-pressed") === "true";
  btn.setAttribute("aria-pressed", !isPressed);
  btn.dataset.state = !isPressed ? "on" : "off";
}

function updateChipVisuals(container, activeBtn) {
  // For exclusive selection (like date ranges typically are treated in this UI)
  const buttons = container.querySelectorAll("button");
  buttons.forEach(btn => {
    const isActive = btn === activeBtn;
    btn.setAttribute("aria-pressed", isActive);
    btn.dataset.state = isActive ? "on" : "off";
  });
}

function syncStateToControls(filters) {
  const safeFilters = filters || DEFAULT_FILTERS;

  // Date
  dateStartInput.value = formatDateInputValue(safeFilters.dateRange?.after);
  dateEndInput.value = formatDateInputValue(safeFilters.dateRange?.before);

  // Logic to highlight correct date chip if it matches
  // (Simplified: just highlight 'All Time' if no dates, otherwise clear chips)
  const hasDateRange = Number.isFinite(safeFilters.dateRange?.after) || Number.isFinite(safeFilters.dateRange?.before);
  const dateBtns = dateChipsContainer.querySelectorAll("button");
  dateBtns.forEach(btn => {
    if (btn.dataset.days === "all") {
       const isActive = !hasDateRange;
       btn.setAttribute("aria-pressed", isActive);
       btn.dataset.state = isActive ? "on" : "off";
    } else {
       // We could try to calculate if range matches 24h/7d etc, but for now just clear them if custom dates are set
       btn.setAttribute("aria-pressed", "false");
       btn.dataset.state = "off";
    }
  });

  // Sort
  sortSelect.value = safeFilters.sort || "relevance";

  // Author
  authorInput.value = safeFilters.authorPubkeys?.join(", ") || "";

  // Tags
  tagsInput.value = "";
  // We separate tags that are in chips vs typed
  const activeTags = new Set(safeFilters.tags || []);
  const tagBtns = tagChipsContainer.querySelectorAll("button");
  const chippedTags = new Set();

  tagBtns.forEach(btn => {
    const tag = btn.dataset.tag;
    chippedTags.add(tag);
    const isActive = activeTags.has(tag);
    btn.setAttribute("aria-pressed", isActive);
    btn.dataset.state = isActive ? "on" : "off";
  });

  // Remaining tags go to input
  const otherTags = (safeFilters.tags || []).filter(t => !chippedTags.has(t));
  if (otherTags.length) {
    tagsInput.value = otherTags.join(", ");
  }

  // Duration
  const minSec = safeFilters.duration?.minSeconds;
  const maxSec = safeFilters.duration?.maxSeconds;

  durationShortCheckbox.checked = false;
  durationMediumCheckbox.checked = false;
  durationLongCheckbox.checked = false;

  if (minSec === null && maxSec === 300) durationShortCheckbox.checked = true;
  if (minSec === 300 && maxSec === 1200) durationMediumCheckbox.checked = true;
  if (minSec === 1200 && maxSec === null) durationLongCheckbox.checked = true;

  // Has
  const hasBtns = hasChipsContainer.querySelectorAll("button");
  hasBtns.forEach(btn => {
    const type = btn.dataset.has;
    let isActive = false;
    if (type === "magnet") isActive = safeFilters.hasMagnet === true;
    if (type === "url") isActive = safeFilters.hasUrl === true;

    btn.setAttribute("aria-pressed", isActive);
    btn.dataset.state = isActive ? "on" : "off";
  });

  // NSFW
  if (ALLOW_NSFW_CONTENT) {
    const nsfwIsOn = safeFilters.nsfw === "true" || safeFilters.nsfw === "only";
    nsfwToggle.setAttribute("aria-checked", nsfwIsOn);
    nsfwToggle.classList.toggle("is-on", nsfwIsOn);
  } else {
    nsfwToggle.setAttribute("aria-checked", "false");
    nsfwToggle.classList.remove("is-on");
  }

  // Auto-expand Advanced if needed
  const hasAdvancedFilters =
    (safeFilters.tags && safeFilters.tags.length > 0) ||
    Number.isFinite(minSec) ||
    Number.isFinite(maxSec) ||
    safeFilters.hasMagnet === true ||
    safeFilters.hasUrl === true;
    // Note: NSFW is moved to main view in our design, so it doesn't trigger advanced

  toggleAdvanced(hasAdvancedFilters);
}

function applyFilters() {
  const filters = {
    ...DEFAULT_FILTERS,
    dateRange: { ...DEFAULT_FILTERS.dateRange },
    duration: { ...DEFAULT_FILTERS.duration },
  };

  // Date
  filters.dateRange.after = parseDateInputValue(dateStartInput.value);
  filters.dateRange.before = parseDateInputValue(dateEndInput.value);

  // Sort
  filters.sort = sortSelect.value;

  // Author
  const authors = authorInput.value.split(/[, ]+/).map(s => s.trim()).filter(Boolean);
  filters.authorPubkeys = authors;

  // Tags
  const selectedTags = new Set();
  const tagBtns = tagChipsContainer.querySelectorAll("button[aria-pressed='true']");
  tagBtns.forEach(btn => selectedTags.add(btn.dataset.tag));

  const inputTags = tagsInput.value.split(/[, ]+/).map(s => s.trim().replace(/^#/, "")).filter(Boolean);
  inputTags.forEach(t => selectedTags.add(t));

  filters.tags = Array.from(selectedTags);

  // Duration
  // (Simplified logic: taking the last checked one or union? The original popover logic allowed multiple?
  // Let's look at the original logic in SearchFiltersPopover.js:
  // It collected ranges into an array and took min of mins and max of maxes.
  // Effectively treating them as OR if multiple selected (e.g. Short OR Medium -> 0 to 1200).
  const ranges = [];
  if (durationShortCheckbox.checked) ranges.push({ min: null, max: 300 });
  if (durationMediumCheckbox.checked) ranges.push({ min: 300, max: 1200 });
  if (durationLongCheckbox.checked) ranges.push({ min: 1200, max: null });

  if (ranges.length) {
    const mins = ranges.map(r => r.min).filter(v => v !== null);
    const maxes = ranges.map(r => r.max).filter(v => v !== null);

    // If any range has min=null (Short), the overall min is null.
    // If any range has max=null (Long), the overall max is null.
    // Actually, logic:
    // Short (0-300) + Medium (300-1200) = 0-1200.
    // Short + Long = 0-300 AND 1200+. Currently filter schema supports min/max seconds as a single range.
    // It doesn't support disjoint ranges.
    // The original logic:
    // filters.duration.minSeconds = mins.length ? Math.min(...mins) : null;
    // filters.duration.maxSeconds = maxes.length ? Math.max(...maxes) : null;
    // This implies union of ranges IF they are contiguous. If disjoint (Short + Long), it creates 0 to infinity (min=0, max=null is wrong, max of maxes? Long has max=null).
    // Let's stick to original logic.
    // min: Math.min of all explicit mins. If Short is there, min is null.
    // max: Math.max of all explicit maxes. If Long is there, max is null.

    const hasNullMin = ranges.some(r => r.min === null);
    const hasNullMax = ranges.some(r => r.max === null);

    filters.duration.minSeconds = hasNullMin ? null : Math.min(...mins);
    filters.duration.maxSeconds = hasNullMax ? null : Math.max(...maxes);
  }

  // Has
  const hasBtns = hasChipsContainer.querySelectorAll("button[aria-pressed='true']");
  hasBtns.forEach(btn => {
    if (btn.dataset.has === "magnet") filters.hasMagnet = true;
    if (btn.dataset.has === "url") filters.hasUrl = true;
  });

  // NSFW
  const nsfwChecked = nsfwToggle.getAttribute("aria-checked") === "true";
  if (nsfwChecked) {
    filters.nsfw = "true";
  } else {
    filters.nsfw = "any"; // or "false"? DEFAULT is "any".
    // Wait, original popover logic:
    // if (nsfwSwitch?.getAttribute("aria-checked") === "true") { filters.nsfw = "true"; }
    // else { ... it defaults to cloneDefaultFilters which is 'any' }
    // Wait, DEFAULT_FILTERS.nsfw is 'any'.
    // If switch is off, it remains 'any' (showing sensitive content if user allows?).
    // Usually NSFW toggle means "Show me NSFW".
    // If off, it might mean "Filter out NSFW" or "Show Any".
    // Let's assume 'any' means standard behavior (hide usually unless safe mode off?).
    // Actually searchFilters.js says:
    // filters.nsfw = "any" (default).
    // So if I don't touch it, it's 'any'.
    // If I toggle it ON, it becomes 'true'.
  }

  // Update State
  const currentState = getSearchFilterState();
  const nextState = {
    text: currentState.text || "",
    filters,
  };
  setSearchFilterState(nextState);
  setHashView(buildSearchHashFromState(nextState));
}

export default {
  init,
  open,
  close
};
