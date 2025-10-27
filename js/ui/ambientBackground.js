// js/ui/ambientBackground.js

import { devLogger as defaultLogger } from "../utils/logger.js";

const DEFAULT_THROTTLE_MS = 66;

function getGlobalFromCanvas(canvas) {
  const doc = canvas?.ownerDocument || (typeof document !== "undefined" ? document : null);
  const win = doc?.defaultView || (typeof window !== "undefined" ? window : null);
  return { doc, win };
}

function getFallbackFillColor(canvas) {
  const { doc, win } = getGlobalFromCanvas(canvas);
  const candidates = ["--color-overlay-strong", "--color-overlay", "--color-surface", "--color-bg"];
  let styles = null;
  if (doc && typeof doc.documentElement !== "undefined") {
    const root = doc.documentElement;
    if (win && typeof win.getComputedStyle === "function") {
      styles = win.getComputedStyle(root);
    }
  }

  for (const token of candidates) {
    if (!styles) {
      break;
    }
    const value = styles.getPropertyValue(token);
    if (value && value.trim()) {
      return value.trim();
    }
  }

  return "#000000";
}

function resizeCanvas(canvas, video) {
  if (!canvas) {
    return { width: 0, height: 0 };
  }
  const { doc, win } = getGlobalFromCanvas(canvas);
  const host = canvas.parentElement || canvas;
  const rect = host?.getBoundingClientRect?.();
  if (!rect || rect.width <= 0 || rect.height <= 0) {
    return { width: canvas.width || 0, height: canvas.height || 0 };
  }

  const dpr = (win && win.devicePixelRatio) || 1;
  const targetWidth = Math.max(1, Math.round(rect.width * dpr));
  const targetHeight = Math.max(1, Math.round(rect.height * dpr));

  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }

  if (video) {
    const readyState = Number.isFinite(video.readyState) ? video.readyState : 0;
    if (readyState >= 1 && video.videoWidth && video.videoHeight) {
      return { width: canvas.width, height: canvas.height };
    }
  }

  return { width: canvas.width, height: canvas.height };
}

function drawCover(ctx, video, canvasWidth, canvasHeight) {
  if (!ctx || !video || !canvasWidth || !canvasHeight) {
    return;
  }
  const videoWidth = video.videoWidth;
  const videoHeight = video.videoHeight;
  if (!videoWidth || !videoHeight) {
    return;
  }

  const videoRatio = videoWidth / videoHeight;
  const canvasRatio = canvasWidth / canvasHeight;

  let sx = 0;
  let sy = 0;
  let sw = videoWidth;
  let sh = videoHeight;

  if (videoRatio > canvasRatio) {
    sh = videoHeight;
    sw = Math.round(videoHeight * canvasRatio);
    sx = Math.max(0, Math.round((videoWidth - sw) / 2));
    sy = 0;
  } else {
    sw = videoWidth;
    sh = Math.round(videoWidth / canvasRatio);
    sx = 0;
    sy = Math.max(0, Math.round((videoHeight - sh) / 2));
  }

  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvasWidth, canvasHeight);
}

export function attachAmbientBackground(videoElement, canvasElement, options = {}) {
  if (!videoElement || !canvasElement) {
    return () => {};
  }

  const normalizedOptions =
    options && typeof options === "object" ? options : {};
  const logger = normalizedOptions.logger || defaultLogger;

  let ctx = null;
  try {
    ctx = canvasElement.getContext("2d", { alpha: false });
  } catch (error) {
    if (logger && typeof logger.warn === "function") {
      logger.warn("[ambientBackground] Canvas context unavailable:", error);
    }
    return () => {};
  }
  if (!ctx) {
    if (logger && typeof logger.warn === "function") {
      logger.warn("[ambientBackground] Canvas context unavailable.");
    }
    return () => {};
  }

  const { doc, win } = getGlobalFromCanvas(canvasElement);
  const throttleMs = Number.isFinite(normalizedOptions.throttleMs)
    ? Math.max(0, normalizedOptions.throttleMs)
    : DEFAULT_THROTTLE_MS;

  const requestFrame = win?.requestAnimationFrame?.bind(win) || ((cb) => setTimeout(() => cb(Date.now()), throttleMs));
  const cancelFrame = win?.cancelAnimationFrame?.bind(win) || ((id) => clearTimeout(id));

  let rafId = 0;
  let running = false;
  let destroyed = false;
  let lastTime = 0;
  let tainted = false;
  let resizeBound = false;

  const clearCanvas = () => {
    if (!canvasElement) {
      return;
    }
    const fillColor = getFallbackFillColor(canvasElement);
    ctx.fillStyle = fillColor;
    ctx.fillRect(0, 0, canvasElement.width || 0, canvasElement.height || 0);
  };

  const stop = () => {
    running = false;
    if (rafId) {
      cancelFrame(rafId);
      rafId = 0;
    }
    if (resizeBound && win) {
      win.removeEventListener("resize", handleResize);
      resizeBound = false;
    }
  };

  const schedule = () => {
    if (!running || destroyed) {
      return;
    }
    rafId = requestFrame(step);
  };

  const step = (timestamp = (win?.performance?.now?.() ?? Date.now())) => {
    if (!running || destroyed) {
      return;
    }
    if (timestamp - lastTime < throttleMs) {
      schedule();
      return;
    }
    lastTime = timestamp;

    try {
      const { width, height } = resizeCanvas(canvasElement, videoElement);
      if (!width || !height) {
        schedule();
        return;
      }
      drawCover(ctx, videoElement, width, height);
    } catch (error) {
      tainted = true;
      stop();
      clearCanvas();
      return;
    }

    schedule();
  };

  const start = () => {
    if (destroyed || tainted || running) {
      return;
    }
    if (doc?.hidden) {
      running = false;
      return;
    }
    running = true;
    lastTime = 0;
    resizeCanvas(canvasElement, videoElement);
    if (win && !resizeBound) {
      win.addEventListener("resize", handleResize);
      resizeBound = true;
    }
    step();
  };

  const handleResize = () => {
    if (destroyed) {
      return;
    }
    resizeCanvas(canvasElement, videoElement);
  };

  const handleVisibility = () => {
    if (!doc) {
      return;
    }
    if (doc.hidden) {
      stop();
      return;
    }
    resizeCanvas(canvasElement, videoElement);
    if (!running && !videoElement.paused && !videoElement.ended) {
      start();
    }
  };

  const handlePlay = () => {
    if (destroyed || tainted) {
      return;
    }
    start();
  };

  const handlePause = () => {
    if (destroyed) {
      return;
    }
    stop();
  };

  const handleEnded = () => {
    if (destroyed) {
      return;
    }
    stop();
  };

  const handleLoadedMetadata = () => {
    if (destroyed || tainted) {
      return;
    }
    resizeCanvas(canvasElement, videoElement);
    if (!videoElement.paused && !videoElement.ended) {
      start();
    }
  };

  videoElement.addEventListener("play", handlePlay);
  videoElement.addEventListener("pause", handlePause);
  videoElement.addEventListener("ended", handleEnded);
  videoElement.addEventListener("emptied", handlePause);
  videoElement.addEventListener("loadedmetadata", handleLoadedMetadata);

  if (doc) {
    doc.addEventListener("visibilitychange", handleVisibility);
  }

  resizeCanvas(canvasElement, videoElement);
  if (!videoElement.paused && !videoElement.ended) {
    start();
  }

  return ({ clear = true } = {}) => {
    if (destroyed) {
      return;
    }
    destroyed = true;
    stop();
    videoElement.removeEventListener("play", handlePlay);
    videoElement.removeEventListener("pause", handlePause);
    videoElement.removeEventListener("ended", handleEnded);
    videoElement.removeEventListener("emptied", handlePause);
    videoElement.removeEventListener("loadedmetadata", handleLoadedMetadata);
    if (doc) {
      doc.removeEventListener("visibilitychange", handleVisibility);
    }
    if (clear) {
      clearCanvas();
    }
  };
}
