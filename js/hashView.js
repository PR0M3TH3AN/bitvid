// js/hashView.js

const HASH_VIEW_REGEX = /^#view=([^&]+)/;

export function getHashViewName() {
  const hash = typeof window !== "undefined" ? window.location.hash || "" : "";
  const match = hash.match(HASH_VIEW_REGEX);
  const viewName = match?.[1];

  if (typeof viewName !== "string") {
    return "";
  }

  return viewName.trim();
}

export function setHashView(viewName, options = {}) {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.delete("modal");
  if (!options?.preserveVideoParam) {
    url.searchParams.delete("v");
  }
  const newUrl = url.pathname + url.search + `#view=${viewName}`;
  window.history.replaceState({}, "", newUrl);

  if (typeof HashChangeEvent === "function") {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    window.dispatchEvent(new Event("hashchange"));
  }
}
