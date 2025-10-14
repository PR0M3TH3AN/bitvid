import { applyDynamicStyles, removeDynamicStyles } from "../../js/ui/styleSystem.js";

const FALLBACK_CLASSES = {
  hiddenDownload: "torrent-download-anchor",
  clipboard: "torrent-clipboard-textarea",
  toast: "torrent-toast-motion",
};

export function applyBeaconDynamicStyles(element, styleObject = {}, slotKey) {
  if (!element) {
    return null;
  }

  const slot = slotKey ? String(slotKey) : undefined;

  if (slot && FALLBACK_CLASSES[slot]) {
    element.classList.add(FALLBACK_CLASSES[slot]);
  }

  return applyDynamicStyles(element, styleObject, slot ? { slot } : {});
}

export function removeBeaconDynamicStyles(element, slotKey) {
  if (!element) {
    return;
  }

  const slot = slotKey ? String(slotKey) : undefined;

  if (slot && FALLBACK_CLASSES[slot]) {
    element.classList.remove(FALLBACK_CLASSES[slot]);
  }

  removeDynamicStyles(element, slot ? { slot } : {});
}

export const beaconDynamicFallbackClasses = { ...FALLBACK_CLASSES };
