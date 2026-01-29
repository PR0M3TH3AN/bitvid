import { userLogger } from "./logger.js";
// js/utils/storage.js

const URL_HEALTH_STORAGE_PREFIX = "bitvid:urlHealth:";
const TORRENT_PROBE_STORAGE_PREFIX = "bitvid:torrentProbe:";

function getUrlHealthStorageKey(eventId) {
  return `${URL_HEALTH_STORAGE_PREFIX}${eventId}`;
}

function getTorrentProbeStorageKey(infoHash) {
  return `${TORRENT_PROBE_STORAGE_PREFIX}${infoHash}`;
}

export function readUrlHealthFromStorage(eventId) {
  if (!eventId || typeof localStorage === "undefined") {
    return null;
  }

  try {
    const raw = localStorage.getItem(getUrlHealthStorageKey(eventId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch (err) {
    userLogger.warn(`Failed to parse stored URL health for ${eventId}:`, err);
  }

  removeUrlHealthFromStorage(eventId);
  return null;
}

export function writeUrlHealthToStorage(eventId, entry) {
  if (!eventId || typeof localStorage === "undefined") {
    return;
  }

  try {
    localStorage.setItem(
      getUrlHealthStorageKey(eventId),
      JSON.stringify(entry)
    );
  } catch (err) {
    userLogger.warn(`Failed to persist URL health for ${eventId}:`, err);
  }
}

export function removeUrlHealthFromStorage(eventId) {
  if (!eventId || typeof localStorage === "undefined") {
    return;
  }

  try {
    localStorage.removeItem(getUrlHealthStorageKey(eventId));
  } catch (err) {
    userLogger.warn(`Failed to remove URL health for ${eventId}:`, err);
  }
}

export function readTorrentProbeFromStorage(infoHash) {
  if (!infoHash || typeof localStorage === "undefined") {
    return null;
  }

  try {
    const raw = localStorage.getItem(getTorrentProbeStorageKey(infoHash));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch (err) {
    userLogger.warn(
      `Failed to parse stored torrent probe for ${infoHash}:`,
      err
    );
  }

  removeTorrentProbeFromStorage(infoHash);
  return null;
}

export function writeTorrentProbeToStorage(infoHash, entry) {
  if (!infoHash || typeof localStorage === "undefined") {
    return;
  }

  try {
    localStorage.setItem(
      getTorrentProbeStorageKey(infoHash),
      JSON.stringify(entry)
    );
  } catch (err) {
    userLogger.warn(`Failed to persist torrent probe for ${infoHash}:`, err);
  }
}

export function removeTorrentProbeFromStorage(infoHash) {
  if (!infoHash || typeof localStorage === "undefined") {
    return;
  }

  try {
    localStorage.removeItem(getTorrentProbeStorageKey(infoHash));
  } catch (err) {
    userLogger.warn(`Failed to remove torrent probe for ${infoHash}:`, err);
  }
}
