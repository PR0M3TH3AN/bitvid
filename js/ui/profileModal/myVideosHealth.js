// Pure health classification for the "My Videos" management tab.
//
// Given a parsed video note (and optionally a URL probe result), decide the
// maintenance status shown to the user. Deliberately no network/IO here so it
// stays deterministic and testable; the controller performs the actual HEAD
// probe and passes the result in. Phase 2 (bucket reconciliation) layers
// storage-side statuses on top of this note-side classification.

export const VIDEO_HEALTH_STATUS = Object.freeze({
  DELETED: "deleted",
  NO_SOURCE: "no-source",
  DEAD_URL: "dead-url",
  OK: "ok",
});

function trimStr(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Does `url` live under the user's storage public base URL? Only hosted URLs are
 * ones we can meaningfully probe / reconcile against the bucket; third-party
 * links are out of our control (and CORS-opaque), so they must never be flagged
 * red just because we can't verify them.
 */
export function isUrlUnderBase(url, publicBaseUrl) {
  const u = trimStr(url);
  const base = trimStr(publicBaseUrl).replace(/\/+$/, "");
  if (!u || !base) {
    return false;
  }
  return u === base || u.startsWith(`${base}/`);
}

/**
 * Classify the maintenance health of one of the user's own videos.
 *
 * @param {object} video parsed video note ({ url, magnet, deleted, ... })
 * @param {object} [opts]
 * @param {string} [opts.publicBaseUrl] the user's storage public base URL
 * @param {{ ok: boolean }|null} [opts.urlProbe] result of a HEAD probe on
 *   `video.url`, if one was performed (null = not probed / unverifiable)
 * @returns {{ status: string, severity: "error"|"warning"|"info"|"ok",
 *   label: string, hosted: boolean }}
 */
export function classifyVideoHealth(video, { publicBaseUrl = "", urlProbe = null } = {}) {
  const v = video && typeof video === "object" ? video : {};
  const url = trimStr(v.url);
  const magnet = trimStr(v.magnet);
  const hosted = isUrlUnderBase(url, publicBaseUrl);

  // A deleted (tombstoned) note is intentional, not a problem to fix here — it's
  // a candidate for storage cleanup (Phase 2). Checked first because soft-delete
  // scrubs url/magnet, which would otherwise read as "no source".
  if (v.deleted === true) {
    return { status: VIDEO_HEALTH_STATUS.DELETED, severity: "info", label: "Deleted on Nostr", hosted };
  }

  if (!url && !magnet) {
    return { status: VIDEO_HEALTH_STATUS.NO_SOURCE, severity: "error", label: "No playable source", hosted };
  }

  // A dead URL is only a hard signal when it's a hosted URL we could actually
  // probe. External links that fail (or can't be probed) stay "ok" so we don't
  // cry wolf on CORS-opaque third-party hosts.
  if (hosted && url && urlProbe && urlProbe.ok === false) {
    return { status: VIDEO_HEALTH_STATUS.DEAD_URL, severity: "warning", label: "Hosted file unreachable", hosted };
  }

  return { status: VIDEO_HEALTH_STATUS.OK, severity: "ok", label: "OK", hosted };
}
