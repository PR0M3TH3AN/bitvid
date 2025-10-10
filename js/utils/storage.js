// js/utils/storage.js

const URL_HEALTH_STORAGE_PREFIX = "bitvid:urlHealth:";

export function getUrlHealthStorageKey(eventId) {
  return `${URL_HEALTH_STORAGE_PREFIX}${eventId}`;
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
    console.warn(`Failed to parse stored URL health for ${eventId}:`, err);
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
    console.warn(`Failed to persist URL health for ${eventId}:`, err);
  }
}

export function removeUrlHealthFromStorage(eventId) {
  if (!eventId || typeof localStorage === "undefined") {
    return;
  }

  try {
    localStorage.removeItem(getUrlHealthStorageKey(eventId));
  } catch (err) {
    console.warn(`Failed to remove URL health for ${eventId}:`, err);
  }
}
