import { userLogger } from "../utils/logger.js";
const state = {
  pubkey: null,
  currentUserNpub: null,
  currentVideo: null,
  modals: Object.create(null),
  videosMap: null,
  videoSubscription: null,
};

const globalSubscribers = new Set();
const keySubscribers = new Map();
const modalSubscribers = new Map();

function createSnapshot() {
  return {
    pubkey: state.pubkey,
    currentUserNpub: state.currentUserNpub,
    currentVideo: state.currentVideo,
    modals: { ...state.modals },
    videosMap: state.videosMap,
    videoSubscription: state.videoSubscription,
  };
}

function notifyKey(key, value, previousValue) {
  const subscribers = keySubscribers.get(key);
  if (subscribers) {
    for (const callback of subscribers) {
      try {
        callback(value, previousValue, createSnapshot());
      } catch (error) {
        userLogger.warn(`[appState] subscriber for key "${key}" threw:`, error);
      }
    }
  }

  if (globalSubscribers.size) {
    const snapshot = createSnapshot();
    for (const callback of globalSubscribers) {
      try {
        callback(snapshot, { key, value, previousValue });
      } catch (error) {
        userLogger.warn("[appState] global subscriber threw:", error);
      }
    }
  }
}

function subscribeToKey(key, callback) {
  if (typeof callback !== "function") {
    return () => {};
  }

  if (!keySubscribers.has(key)) {
    keySubscribers.set(key, new Set());
  }
  const subscribers = keySubscribers.get(key);
  subscribers.add(callback);

  return () => {
    subscribers.delete(callback);
    if (subscribers.size === 0) {
      keySubscribers.delete(key);
    }
  };
}

export function subscribeToAppState(callback) {
  if (typeof callback !== "function") {
    return () => {};
  }

  globalSubscribers.add(callback);
  return () => {
    globalSubscribers.delete(callback);
  };
}

export function subscribeToAppStateKey(key, callback) {
  return subscribeToKey(key, callback);
}

function updateKey(key, value) {
  const previousValue = state[key];
  if (previousValue === value) {
    return value;
  }

  state[key] = value;
  notifyKey(key, value, previousValue);
  return value;
}

export function getAppState() {
  return createSnapshot();
}

export function getPubkey() {
  return state.pubkey;
}

export function setPubkey(value) {
  return updateKey("pubkey", typeof value === "string" ? value : value ?? null);
}

export function getCurrentUserNpub() {
  return state.currentUserNpub;
}

export function setCurrentUserNpub(value) {
  return updateKey(
    "currentUserNpub",
    typeof value === "string" && value ? value : value ?? null
  );
}

export function getCurrentVideo() {
  return state.currentVideo;
}

export function setCurrentVideo(value) {
  return updateKey("currentVideo", value ?? null);
}

export function getVideosMap() {
  return state.videosMap;
}

export function setVideosMap(value) {
  if (value instanceof Map) {
    return updateKey("videosMap", value);
  }
<<<<<<< HEAD
  return updateKey("videosMap", null);
=======
  return updateKey("videosMap", value ?? null);
>>>>>>> origin/main
}

export function getVideoSubscription() {
  return state.videoSubscription;
}

export function setVideoSubscription(value) {
  return updateKey("videoSubscription", value ?? null);
}

export function getModalState(name) {
  if (typeof name !== "string" || !name) {
    return false;
  }
  return Boolean(state.modals[name]);
}

function notifyModal(name, value, previousValue) {
  const subscribers = modalSubscribers.get(name);
  if (!subscribers || subscribers.size === 0) {
    return;
  }

  for (const callback of subscribers) {
    try {
      callback(value, previousValue, createSnapshot());
    } catch (error) {
      userLogger.warn(`[appState] modal subscriber for "${name}" threw:`, error);
    }
  }
}

export function setModalState(name, isOpen) {
  if (typeof name !== "string" || !name) {
    return false;
  }

  const normalized = Boolean(isOpen);
  const previous = Boolean(state.modals[name]);
  if (previous === normalized) {
    return normalized;
  }

  const previousModals = { ...state.modals };
  state.modals[name] = normalized;
  notifyModal(name, normalized, previous);
  notifyKey("modals", { ...state.modals }, previousModals);
  return normalized;
}

export function subscribeToModalState(name, callback) {
  if (typeof name !== "string" || !name || typeof callback !== "function") {
    return () => {};
  }

  if (!modalSubscribers.has(name)) {
    modalSubscribers.set(name, new Set());
  }
  const subscribers = modalSubscribers.get(name);
  subscribers.add(callback);

  return () => {
    subscribers.delete(callback);
    if (subscribers.size === 0) {
      modalSubscribers.delete(name);
    }
  };
}

export function resetAppState() {
  const previous = createSnapshot();
  state.pubkey = null;
  state.currentUserNpub = null;
  state.currentVideo = null;
  state.modals = Object.create(null);
  state.videosMap = null;
  state.videoSubscription = null;
  notifyKey("pubkey", state.pubkey, previous.pubkey);
  notifyKey("currentUserNpub", state.currentUserNpub, previous.currentUserNpub);
  notifyKey("currentVideo", state.currentVideo, previous.currentVideo);
  notifyKey("modals", { ...state.modals }, previous.modals);
  notifyKey("videosMap", state.videosMap, previous.videosMap);
  notifyKey(
    "videoSubscription",
    state.videoSubscription,
    previous.videoSubscription
  );
}
