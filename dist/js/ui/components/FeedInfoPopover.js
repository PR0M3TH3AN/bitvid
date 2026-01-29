import createPopover from "../overlay/popoverEngine.js";

/**
 * Attaches an informational popover to a trigger element.
 *
 * @param {HTMLElement} triggerElement - The element that triggers the popover.
 * @param {string} text - The text content to display in the popover.
 * @param {object} [options] - Optional configuration.
 * @param {string} [options.placement="bottom-start"] - Popover placement.
 * @returns {object|null} - The popover instance or null if failed.
 */
export function attachFeedInfoPopover(triggerElement, text, options = {}) {
  if (!triggerElement || typeof text !== "string") {
    return null;
  }

  const render = ({ document: doc, close }) => {
    const panel = doc.createElement("div");
    panel.className = "popover-panel p-4 max-w-xs text-sm text-text-strong bg-surface-elevated border border-surface-line rounded-lg shadow-lg z-50";
    panel.textContent = text;
    // Ensure the panel can receive focus if needed, but primarily it's informational.
    // Making it a "tooltip" or "dialog" role might be appropriate depending on interaction.
    // Since it's a click-toggle info box, standard popover behavior is fine.

    // Add a simple close behavior if clicked outside (handled by popoverEngine),
    // but maybe we want to close if clicked inside too?
    // Usually info popovers stay open until clicked away.

    return panel;
  };

  const popover = createPopover(triggerElement, render, {
    placement: options.placement || "bottom-start",
    ...options,
  });

  triggerElement.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    popover.toggle();
  });

  return popover;
}
