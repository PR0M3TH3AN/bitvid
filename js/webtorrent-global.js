import WebTorrent from "./webtorrent.min.js";

const globalScope =
  (typeof window !== "undefined" && window) ||
  (typeof globalThis !== "undefined" && globalThis) ||
  null;

if (
  globalScope &&
  typeof globalScope.WebTorrent !== "function" &&
  typeof WebTorrent === "function"
) {
  globalScope.WebTorrent = WebTorrent;
}

export {};
