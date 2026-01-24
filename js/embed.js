import Application from "./app.js";
import { nostrClient } from "./nostrClientFacade.js";
import { convertEventToVideo, getDTagValueFromTags } from "./nostr/index.js";
import { resolveVideoPointer } from "./utils/videoPointer.js";
import { devLogger, userLogger } from "./utils/logger.js";
import { nostrToolsReady } from "./nostrToolsBootstrap.js";

const POINTER_PARAM = "pointer";
const PLAYBACK_PARAM = "playback";
const HEX64_REGEX = /^[0-9a-f]{64}$/i;

const statusEl = document.getElementById("embedStatus");
const videoEl = document.getElementById("embedVideo");
const rootEl = document.getElementById("embedRoot");

const toneClasses = {
  default: "text-muted",
  error: "text-danger",
  success: "text-success",
};

const setStatus = (message, tone = "default") => {
  if (!statusEl) {
    return;
  }

  const normalizedMessage =
    typeof message === "string" ? message.trim() : "";
  statusEl.textContent = normalizedMessage;

  Object.values(toneClasses).forEach((className) => {
    if (className) {
      statusEl.classList.remove(className);
    }
  });

  const toneClass = toneClasses[tone] || toneClasses.default;
  if (toneClass) {
    statusEl.classList.add(toneClass);
  }
};

class EmbedVideoModal {
  constructor({ root, video, status } = {}) {
    this.root = root || null;
    this.video = video || null;
    this.status = status || null;
    this.eventTarget = new EventTarget();
  }

  addEventListener(...args) {
    this.eventTarget.addEventListener(...args);
  }

  removeEventListener(...args) {
    this.eventTarget.removeEventListener(...args);
  }

  dispatchEvent(event) {
    return this.eventTarget.dispatchEvent(event);
  }

  getRoot() {
    return this.root;
  }

  getVideoElement() {
    return this.video;
  }

  setVideoElement(videoElement) {
    if (videoElement instanceof HTMLVideoElement) {
      this.video = videoElement;
    }
    return this.video;
  }

  resetStats() {
    // No-op for embed view
  }

  updateStatus(message) {
    setStatus(message, "default");
  }

  applyLoadingPoster() {
    setStatus("Preparing playback…", "default");
  }

  forceRemovePoster() {
    return false;
  }

  clearPosterCleanup() {}

  setTorrentStatsVisibility(isVisible) {
    if (!this.root) {
      return;
    }
    this.root.dataset.torrentStats = isVisible ? "true" : "false";
  }

  open() {
    return this.root;
  }

  close() {}

  async load() {
    if (!this.video || !(this.video instanceof HTMLVideoElement)) {
      throw new Error("Embed video element is missing.");
    }
    return this.root;
  }
}

const embedModal = new EmbedVideoModal({
  root: rootEl,
  video: videoEl,
  status: statusEl,
});

const app = new Application({
  ui: {
    videoModal: embedModal,
  },
});

app.showError = (message) => {
  const normalizedMessage =
    typeof message === "string" ? message.trim() : "";
  if (normalizedMessage) {
    userLogger.error(normalizedMessage);
  }
  setStatus(
    normalizedMessage || "Playback failed. Please try again.",
    "error",
  );
};

app.showStatus = (message) => {
  setStatus(message, "default");
};

app.showSuccess = (message) => {
  setStatus(message, "success");
};

const resolvePlaybackPreference = (value) => {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "url" || normalized === "torrent") {
    return normalized;
  }
  return null;
};

const ensureNostrReady = async () => {
  try {
    await nostrToolsReady;
  } catch (error) {
    userLogger.warn("[embed] Failed to initialize NostrTools:", error);
  }

  try {
    await nostrClient.ensurePool();
  } catch (error) {
    devLogger.warn("[embed] Failed to ensure Nostr pool:", error);
  }

  nostrClient.init().catch((error) => {
    devLogger.warn("[embed] nostrClient.init failed:", error);
  });
};

const decodePointer = (pointer) => {
  const trimmed = typeof pointer === "string" ? pointer.trim() : "";
  if (!trimmed) {
    return null;
  }

  if (/^(naddr|nevent)/i.test(trimmed)) {
    const decoder = window?.NostrTools?.nip19?.decode;
    if (typeof decoder === "function") {
      try {
        return decoder(trimmed);
      } catch (error) {
        userLogger.warn("[embed] Failed to decode pointer:", error);
      }
    }
  }

  if (trimmed.includes(":")) {
    return {
      type: "naddr",
      data: {
        relay: null,
        relays: [],
        identifier: trimmed.split(":").slice(2).join(":"),
        pubkey: trimmed.split(":")[1] || "",
        kind: Number.parseInt(trimmed.split(":")[0], 10),
      },
    };
  }

  if (HEX64_REGEX.test(trimmed)) {
    return {
      type: "nevent",
      data: {
        id: trimmed,
        relays: [],
      },
    };
  }

  return null;
};

const buildRelayList = (relays) => {
  const combined = [
    ...(Array.isArray(relays) ? relays : []),
    ...(Array.isArray(nostrClient.relays) ? nostrClient.relays : []),
  ];

  return Array.from(
    new Set(
      combined
        .map((relay) => (typeof relay === "string" ? relay.trim() : ""))
        .filter(Boolean),
    ),
  );
};

const resolveEventFromPointer = async (pointer) => {
  const decoded = decodePointer(pointer);
  if (!decoded) {
    return { video: null, pointerHint: null };
  }

  if (decoded.type === "nevent") {
    const eventId = decoded.data?.id || "";
    const relays = decoded.data?.relays || [];
    let video = null;

    if (eventId) {
      if (relays.length) {
        try {
          const raw = await nostrClient.fetchRawEventById(eventId, {
            relays: buildRelayList(relays),
          });
          if (raw) {
            video = convertEventToVideo(raw);
          }
        } catch (error) {
          devLogger.warn("[embed] Failed to fetch nevent via relays:", error);
        }
      }

      if (!video) {
        video = await nostrClient.getEventById(eventId);
      }
    }

    return {
      video,
      pointerHint: {
        relay: Array.isArray(relays) && relays.length ? relays[0] : null,
        eventId,
      },
    };
  }

  if (decoded.type === "naddr") {
    const data = decoded.data || {};
    const kind = Number.isFinite(data.kind) ? data.kind : null;
    const pubkey = typeof data.pubkey === "string" ? data.pubkey.trim() : "";
    const identifier =
      typeof data.identifier === "string" ? data.identifier.trim() : "";
    const relays = Array.isArray(data.relays) ? data.relays : [];

    if (!kind || !pubkey || !identifier) {
      return { video: null, pointerHint: null };
    }

    await nostrClient.ensurePool();
    const pool = nostrClient.pool;
    const relayList = buildRelayList(relays);
    const filter = {
      kinds: [kind],
      authors: [pubkey],
      "#d": [identifier],
    };

    let rawEvent = null;
    if (pool?.get && relayList.length) {
      try {
        rawEvent = await pool.get(relayList, filter);
      } catch (error) {
        devLogger.warn("[embed] Failed to fetch naddr via pool.get:", error);
      }
    }

    if (!rawEvent && pool?.list && relayList.length) {
      try {
        const events = await pool.list(relayList, [filter]);
        if (Array.isArray(events) && events.length) {
          const flattened = events.flat().filter(Boolean);
          rawEvent = flattened.sort(
            (a, b) => (b.created_at || 0) - (a.created_at || 0),
          )[0];
        }
      } catch (error) {
        devLogger.warn("[embed] Failed to fetch naddr via pool.list:", error);
      }
    }

    const video = rawEvent ? convertEventToVideo(rawEvent) : null;

    return {
      video,
      pointerHint: {
        relay: relayList.length ? relayList[0] : null,
        dTag: identifier,
        kind,
        pubkey,
      },
    };
  }

  return { video: null, pointerHint: null };
};

const setPointerState = ({ video, hint } = {}) => {
  if (!video) {
    return;
  }

  const dTag = getDTagValueFromTags(video.tags) || hint?.dTag || "";
  const pointerInfo = resolveVideoPointer({
    kind: video.kind,
    pubkey: video.pubkey,
    videoRootId: video.videoRootId,
    dTag,
    fallbackEventId: video.id || hint?.eventId,
    relay: hint?.relay || video.relay,
  });

  app.currentVideoPointer = pointerInfo?.pointer || null;
  app.currentVideoPointerKey = pointerInfo?.key || null;

  if (app.currentVideo) {
    app.currentVideo.pointer = app.currentVideoPointer;
    app.currentVideo.pointerKey = app.currentVideoPointerKey;
  }
};

const startEmbed = async () => {
  if (window.__bitvidEmbedStarted) {
    return;
  }
  window.__bitvidEmbedStarted = true;

  if (!(videoEl instanceof HTMLVideoElement)) {
    setStatus("Embed video element is missing.", "error");
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const pointer = params.get(POINTER_PARAM) || "";
  const playback = resolvePlaybackPreference(params.get(PLAYBACK_PARAM));

  if (!pointer) {
    setStatus("Missing video pointer.", "error");
    return;
  }

  setStatus("Resolving video…", "default");

  try {
    app.authService?.hydrateFromStorage?.();
  } catch (error) {
    devLogger.warn("[embed] Failed to hydrate auth state:", error);
  }

  await ensureNostrReady();

  let resolved = null;
  try {
    resolved = await resolveEventFromPointer(pointer);
  } catch (error) {
    devLogger.warn("[embed] Failed to resolve pointer:", error);
  }

  const video = resolved?.video || null;
  if (!video) {
    setStatus("Unable to resolve the requested video.", "error");
    return;
  }

  app.currentVideo = video;
  setPointerState({ video, hint: resolved?.pointerHint || null });

  const url = typeof video.url === "string" ? video.url.trim() : "";
  const magnet = typeof video.magnet === "string" ? video.magnet.trim() : "";

  if (!url && !magnet) {
    setStatus("No playback sources found for this video.", "error");
    return;
  }

  if (typeof video.title === "string" && video.title.trim()) {
    document.title = `${video.title.trim()} | bitvid embed`;
  }

  try {
    await app.playVideoWithFallback({
      url,
      magnet,
      forcedSource: playback || undefined,
      trigger: videoEl,
    });
  } catch (error) {
    devLogger.warn("[embed] Playback failed:", error);
    setStatus("Playback failed. Please try again.", "error");
  }
};

startEmbed();
