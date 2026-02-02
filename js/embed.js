import Application from "./app.js";
import { nostrClient } from "./nostrClientFacade.js";
import { convertEventToVideo, getDTagValueFromTags } from "./nostr/index.js";
import { sanitizeRelayList } from "./nostr/nip46Client.js";
import { resolveVideoPointer } from "./utils/videoPointer.js";
import { devLogger, userLogger } from "./utils/logger.js";
import { nostrToolsReady } from "./nostrToolsBootstrap.js";
import { THEME_ACCENT_OVERRIDES } from "../config/instance-config.js";

// Set accent color from instance config
try {
  const accent = THEME_ACCENT_OVERRIDES?.light?.accent || "#ff6b6b";
  document.documentElement.style.setProperty("--bitvid-accent", accent);
} catch (e) {
  // Fallback if config is missing or malformed
  document.documentElement.style.setProperty("--bitvid-accent", "#ff6b6b");
}

// early in embed bootstrap (insert before any heavy init)
const urlParams = new URLSearchParams(window.location.search);
const embedDebugEnabled =
  urlParams.get("embed_debug") === "1" || urlParams.get("debug") === "embed";
let diag = null;
const diagPromise = embedDebugEnabled
  ? import("./embedDiagnostics.js")
      .then((m) => {
        diag = m.initEmbedDiagnostics({ enabled: true });
        // immediately signal startup
        diag.emit("embed-start", {
          url: location.href,
          userAgent: navigator.userAgent,
        });
      })
      .catch((e) => {
        try {
          if (window.parent && window.parent !== window) {
            window.parent.postMessage(
              {
                __bitvid_debug: true,
                type: "embed-diag-failed",
                payload: { error: String(e) },
              },
              "*"
            );
          }
        } catch (e2) {
          /* no-op */
        }
      })
  : Promise.resolve();

const POINTER_PARAM = "pointer";
const PLAYBACK_PARAM = "playback";
const HEX64_REGEX = /^[0-9a-f]{64}$/i;

const statusEl = document.getElementById("embedStatus");
const videoEl = document.getElementById("embedVideo");

const toneClasses = {
  default: "text-muted",
  error: "text-danger",
  success: "text-success",
};

const setStatus = (message, tone = "default") => {
  if (!statusEl) {
    return;
  }

  const normalizedMessage = typeof message === "string" ? message.trim() : "";
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

// ModalManager will instantiate EmbedPlayerModal automatically when running in embed mode.
const app = new Application();

app.showError = (message) => {
  const normalizedMessage = typeof message === "string" ? message.trim() : "";
  if (normalizedMessage) {
    userLogger.error(normalizedMessage);
  }
  setStatus(normalizedMessage || "Playback failed. Please try again.", "error");
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
    const toolkitResult = await nostrToolsReady;
    diag?.emit("nostr-tools-ready", { ok: Boolean(toolkitResult) });
  } catch (error) {
    userLogger.warn("[embed] Failed to initialize NostrTools:", error);
    diag?.emit("nostr-tools-ready", { ok: false, error: String(error) });
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

  const result = sanitizeRelayList(combined);
  diag?.emit("relay-list", { relays: result });
  return result;
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
      diag?.emit("event-request", { type: "start", id: eventId });
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
      diag?.emit("event-request", {
        type: "done",
        id: eventId,
        found: Boolean(video),
        videoRootId: video?.videoRootId,
      });
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

    diag?.emit("event-request", {
      type: "start",
      naddr: { kind, pubkey, identifier },
    });
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
            (a, b) => (b.created_at || 0) - (a.created_at || 0)
          )[0];
        }
      } catch (error) {
        devLogger.warn("[embed] Failed to fetch naddr via pool.list:", error);
      }
    }

    const video = rawEvent ? convertEventToVideo(rawEvent) : null;
    diag?.emit("event-request", {
      type: "done",
      naddr: { kind, pubkey, identifier },
      found: Boolean(video),
      videoRootId: video?.videoRootId,
    });

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

  if (pointerInfo) {
    diag?.emit("pointer-resolved", pointerInfo);
  }

  if (app.currentVideo) {
    app.currentVideo.pointer = app.currentVideoPointer;
    app.currentVideo.pointerKey = app.currentVideoPointerKey;
  }

  // Ensure stats subscriptions are active since we don't go through playVideoByEventId
  if (app.subscribeModalViewCount) {
    app.subscribeModalViewCount(
      app.currentVideoPointer,
      app.currentVideoPointerKey
    );
  }
  if (app.reactionController && app.reactionController.subscribe) {
    app.reactionController.subscribe(
      app.currentVideoPointer,
      app.currentVideoPointerKey
    );
  }
};

const startEmbed = async () => {
  if (window.__bitvidEmbedStarted) {
    return;
  }
  window.__bitvidEmbedStarted = true;

  try {
    await diagPromise;
  } catch (error) {
    // Should be caught above, but just in case
  }

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

  if (app.videoModal && typeof app.videoModal.load === "function") {
    try {
      await app.videoModal.load();
    } catch (error) {
      devLogger.warn("[embed] Failed to early-load video modal:", error);
    }
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

    if (app.videoModal && typeof app.videoModal.setShareUrl === "function") {
      const shareUrl = app.buildShareUrlFromEventId(video.id);
      app.videoModal.setShareUrl(shareUrl);
    }
  } catch (error) {
    devLogger.warn("[embed] Playback failed:", error);
    setStatus("Playback failed. Please try again.", "error");
  }
};

startEmbed();
