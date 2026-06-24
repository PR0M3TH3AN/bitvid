// js/viewCountChart.js
//
// Public "Popularity" view: a views-over-time chart for a video, opened from the
// ⋯ menu. View data is public (kind-30079 events), so any viewer can see it.
// The chart buckets view events by the same dedupe window the counter uses (one
// view per viewer per day), and updates live as more view events stream in.

import {
  listVideoViewEventsWithDefaultClient,
  subscribeVideoViewEventsWithDefaultClient,
} from "./nostrViewEventsFacade.js";
import { resolveVideoPointer } from "./utils/videoPointer.js";
import { formatViewCount } from "./viewCounter.js";
import { devLogger } from "./utils/logger.js";

export const VIEW_CHART_WINDOW_SECONDS = 86400; // 1 day, matches the counter dedupe window
const SVG_NS = "http://www.w3.org/2000/svg";

// ---- Pure data ---------------------------------------------------------------

// Bucket raw view events into a cumulative time series. Dedupes by
// (viewer pubkey, day bucket) so it reflects the same "one view per viewer per
// window" semantics the counter displays. Returns ordered buckets + the total.
export function buildViewCountTimeSeries(
  events,
  { windowSeconds = VIEW_CHART_WINDOW_SECONDS } = {},
) {
  const w = Math.max(1, Number(windowSeconds) || VIEW_CHART_WINDOW_SECONDS);
  const seen = new Set();
  const perBucket = new Map();
  for (const event of Array.isArray(events) ? events : []) {
    const createdAt = Number(event?.created_at);
    const pubkey = typeof event?.pubkey === "string" ? event.pubkey : "";
    if (!Number.isFinite(createdAt) || createdAt <= 0 || !pubkey) {
      continue;
    }
    const bucket = Math.floor(createdAt / w);
    const key = `${pubkey}:${bucket}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    perBucket.set(bucket, (perBucket.get(bucket) || 0) + 1);
  }
  const buckets = Array.from(perBucket.keys()).sort((a, b) => a - b);
  const series = [];
  let cumulative = 0;
  for (const bucket of buckets) {
    const count = perBucket.get(bucket) || 0;
    cumulative += count;
    series.push({ bucketStart: bucket * w, count, cumulative });
  }
  return { series, total: cumulative };
}

function formatDay(seconds) {
  try {
    return new Date(seconds * 1000).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch (error) {
    return "";
  }
}

// ---- SVG chart ---------------------------------------------------------------

// Cumulative views-over-time as a token-colored SVG area+line chart. Uses
// currentColor (set via a text-* utility on the container) so it honors theme
// tokens — no raw colors.
export function buildViewCountChartSvg(doc, series, { width = 320, height = 120 } = {}) {
  const pad = { top: 8, right: 8, bottom: 18, left: 8 };
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("role", "img");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.classList.add("text-accent");

  const points = Array.isArray(series) ? series : [];
  if (points.length === 0) {
    svg.setAttribute("aria-label", "No views yet");
    return svg;
  }

  const innerW = Math.max(1, width - pad.left - pad.right);
  const innerH = Math.max(1, height - pad.top - pad.bottom);
  const maxY = points[points.length - 1].cumulative || 1;
  const minX = points[0].bucketStart;
  const maxX = points[points.length - 1].bucketStart;
  const spanX = maxX - minX || 1;

  const x = (bucketStart) => pad.left + ((bucketStart - minX) / spanX) * innerW;
  const y = (cumulative) => pad.top + (1 - cumulative / maxY) * innerH;

  // A single bucket can't draw a line — draw a flat baseline to its value.
  const coords =
    points.length === 1
      ? [
          [pad.left, y(points[0].cumulative)],
          [pad.left + innerW, y(points[0].cumulative)],
        ]
      : points.map((p) => [x(p.bucketStart), y(p.cumulative)]);

  const linePoints = coords.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  const baseY = pad.top + innerH;
  const areaPoints =
    `${coords[0][0].toFixed(1)},${baseY.toFixed(1)} ` +
    linePoints +
    ` ${coords[coords.length - 1][0].toFixed(1)},${baseY.toFixed(1)}`;

  const area = doc.createElementNS(SVG_NS, "polygon");
  area.setAttribute("points", areaPoints);
  area.setAttribute("fill", "currentColor");
  area.setAttribute("fill-opacity", "0.15");
  area.setAttribute("stroke", "none");
  svg.appendChild(area);

  const line = doc.createElementNS(SVG_NS, "polyline");
  line.setAttribute("points", linePoints);
  line.setAttribute("fill", "none");
  line.setAttribute("stroke", "currentColor");
  line.setAttribute("stroke-width", "2");
  line.setAttribute("stroke-linejoin", "round");
  line.setAttribute("stroke-linecap", "round");
  svg.appendChild(line);

  svg.setAttribute(
    "aria-label",
    `${maxY} total views from ${formatDay(minX)} to ${formatDay(maxX)}`,
  );
  return svg;
}

// ---- Modal -------------------------------------------------------------------

function pointerForVideo(video) {
  if (!video || typeof video !== "object") {
    return null;
  }
  const tags = Array.isArray(video.tags) ? video.tags : [];
  const dTag = tags.find((t) => Array.isArray(t) && t[0] === "d");
  const dValue = dTag && typeof dTag[1] === "string" ? dTag[1] : "";
  return resolveVideoPointer({
    kind: video.kind,
    pubkey: video.pubkey,
    videoRootId: video.videoRootId,
    dTag: dValue,
    fallbackEventId: video.id,
    relay: video.relay,
  });
}

function el(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (typeof text === "string") node.textContent = text;
  return node;
}

// At most one popularity modal open at a time.
let activePopularityModal = null;

// Opens the popularity modal for a video. Dependencies are injectable for tests.
export function openPopularityModal({
  document: doc = typeof document !== "undefined" ? document : null,
  video,
  listViewEvents = listVideoViewEventsWithDefaultClient,
  subscribeViewEvents = subscribeVideoViewEventsWithDefaultClient,
  mount = null,
} = {}) {
  if (!doc) return null;
  const pointerInfo = pointerForVideo(video);
  if (!pointerInfo?.pointer) {
    return null;
  }
  const pointer = pointerInfo.pointer;

  // Close any already-open popularity modal (proper cleanup of its subscription
  // + listeners) so re-triggering — or two menu paths firing for one click —
  // can't stack duplicates.
  if (activePopularityModal) {
    try {
      activePopularityModal.close();
    } catch (error) {
      // ignore
    }
    activePopularityModal = null;
  }

  const root = mount || doc.getElementById("uiOverlay") || doc.body;
  const backdrop = el(doc, "div", "ds-overlay-backdrop popularity-modal__backdrop");
  const dialog = el(doc, "div", "popularity-modal card p-md");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", "Video popularity");

  const header = el(doc, "div", "flex items-center justify-between gap-3 mb-2");
  header.appendChild(el(doc, "h2", "text-lg font-semibold text-text", "Popularity"));
  const closeBtn = el(doc, "button", "icon-button", "");
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.textContent = "✕";
  header.appendChild(closeBtn);
  dialog.appendChild(header);

  const totalLine = el(doc, "p", "text-sm text-muted mb-3", "Loading views…");
  dialog.appendChild(totalLine);

  const chartHost = el(doc, "div", "popularity-modal__chart");
  dialog.appendChild(chartHost);

  const note = el(
    doc,
    "p",
    "text-2xs text-muted mt-2",
    "Public view data · updates as more views load.",
  );
  dialog.appendChild(note);

  backdrop.appendChild(dialog);
  root.appendChild(backdrop);

  // ---- data + render ----
  const eventsById = new Map();
  let closed = false;
  let unsubscribe = null;
  let rerenderTimer = null;

  const addEvent = (event) => {
    const id = typeof event?.id === "string" ? event.id : "";
    if (!id || eventsById.has(id)) return false;
    eventsById.set(id, event);
    return true;
  };

  const render = () => {
    if (closed) return;
    const { series, total } = buildViewCountTimeSeries([...eventsById.values()]);
    totalLine.textContent =
      total > 0
        ? `${formatViewCount(total)} ${total === 1 ? "view" : "views"}`
        : "No views recorded yet.";
    chartHost.textContent = "";
    chartHost.appendChild(buildViewCountChartSvg(doc, series));
  };

  const scheduleRender = () => {
    if (rerenderTimer) return;
    rerenderTimer = setTimeout(() => {
      rerenderTimer = null;
      render();
    }, 250);
  };

  const close = () => {
    if (closed) return;
    closed = true;
    if (rerenderTimer) {
      clearTimeout(rerenderTimer);
      rerenderTimer = null;
    }
    if (typeof unsubscribe === "function") {
      try {
        unsubscribe();
      } catch (error) {
        // best effort
      }
    }
    doc.removeEventListener("keydown", onKeydown, true);
    backdrop.remove();
    if (activePopularityModal === handle) {
      activePopularityModal = null;
    }
  };

  function onKeydown(event) {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
    }
  }

  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) close();
  });
  doc.addEventListener("keydown", onKeydown, true);

  // Initial fetch + live subscription.
  Promise.resolve()
    .then(() => listViewEvents(pointer, {}))
    .then((events) => {
      if (closed) return;
      (Array.isArray(events) ? events : []).forEach(addEvent);
      render();
    })
    .catch((error) => {
      devLogger.warn("[popularity] Failed to load view events:", error);
      if (!closed) {
        totalLine.textContent = "Couldn’t load view data.";
      }
    });

  try {
    unsubscribe = subscribeViewEvents(pointer, {
      onEvent: (event) => {
        if (closed) return;
        if (addEvent(event)) {
          scheduleRender();
        }
      },
    });
  } catch (error) {
    devLogger.warn("[popularity] Failed to subscribe to view events:", error);
  }

  const handle = { close };
  activePopularityModal = handle;
  return handle;
}
