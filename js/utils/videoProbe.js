// Auto-capture a video's dimensions + duration by loading just its metadata into
// a hidden <video> element. Used at upload time so bitvid can persist width/height
// (orientation → 34236 short selection + a future "shorts" feed) and duration.
//
// Element creation is injectable so the resolution logic is unit-testable without
// a DOM or a real media file. Always resolves (never rejects): null on failure.

export function probeVideoMetadata(src, { createVideoEl, timeoutMs = 8000 } = {}) {
  return new Promise((resolve) => {
    const source = typeof src === "string" ? src.trim() : "";
    if (!source) {
      resolve(null);
      return;
    }

    let el = null;
    try {
      el =
        typeof createVideoEl === "function"
          ? createVideoEl()
          : typeof document !== "undefined" && document.createElement
            ? document.createElement("video")
            : null;
    } catch (error) {
      el = null;
    }
    if (!el || typeof el.addEventListener !== "function") {
      resolve(null);
      return;
    }

    let settled = false;
    const cleanup = () => {
      try {
        el.removeAttribute?.("src");
        el.load?.();
      } catch (error) {
        // ignore
      }
    };
    const finish = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      cleanup();
      resolve(result);
    };

    const timer = setTimeout(() => finish(null), timeoutMs);

    try {
      el.preload = "metadata";
      el.muted = true;
    } catch (error) {
      // ignore (fakes may not allow these)
    }

    el.addEventListener("loadedmetadata", () => {
      const width = Number(el.videoWidth);
      const height = Number(el.videoHeight);
      const durationRaw = Number(el.duration);
      finish({
        width: Number.isFinite(width) && width > 0 ? Math.floor(width) : 0,
        height: Number.isFinite(height) && height > 0 ? Math.floor(height) : 0,
        duration: Number.isFinite(durationRaw) && durationRaw > 0 ? durationRaw : 0,
      });
    });
    el.addEventListener("error", () => finish(null));

    try {
      el.src = source;
    } catch (error) {
      finish(null);
    }
  });
}

export default probeVideoMetadata;
