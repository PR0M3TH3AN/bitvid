import { createBeaconToast } from "./ui/toastService.js";
import { createTorrentTable } from "./ui/torrentTable.js";

const VERSION = "2.0";

const TRACKERS = [
  "wss://tracker.btorrent.xyz",
  "wss://tracker.openwebtorrent.com",
];

const TORRENT_OPTIONS = { announce: TRACKERS };
const TRACKER_OPTIONS = { announce: TRACKERS };

function formatBytes(num, speed = false) {
  if (typeof num !== "number" || Number.isNaN(num)) {
    return "";
  }

  if (num < 1) {
    return speed ? "" : "0 B";
  }

  const units = ["B", "kB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(num) / Math.log(1000)), units.length - 1);
  const value = (num / Math.pow(1000, exponent)).toFixed(1);
  return `${value} ${units[exponent]}${speed ? "/s" : ""}`;
}

function formatProgress(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "";
  }

  return `${(value * 100).toFixed(1)}%`;
}

function formatRatio(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "0.00";
  }

  return value.toFixed(2);
}

function torrentsMatch(a, b) {
  if (!a || !b) {
    return false;
  }

  if (a === b) {
    return true;
  }

  if (a.infoHash && b.infoHash && a.infoHash === b.infoHash) {
    return true;
  }

  if (a.magnetURI && b.magnetURI && a.magnetURI === b.magnetURI) {
    return true;
  }

  return false;
}

function prepareTorrentFiles(torrent) {
  if (!torrent || !Array.isArray(torrent.files)) {
    return;
  }

  torrent.files.forEach((file) => {
    if (typeof file.priority !== "string") {
      file.priority = "0";
    }

    if (typeof file.getBlobURL === "function") {
      file.getBlobURL((error, url) => {
        if (error || !url) {
          return;
        }
        file.url = url;
      });
    }
  });

  if (torrent.torrentFile && typeof Blob === "function" && typeof URL !== "undefined") {
    try {
      const blob = new Blob([torrent.torrentFile], {
        type: "application/x-bittorrent",
      });
      torrent.torrentFileBlobURL = URL.createObjectURL(blob);
      if (!torrent.fileName) {
        const name = torrent.name || "download";
        torrent.fileName = `${name}.torrent`;
      }
    } catch (error) {
      console.warn("[beacon] Failed to create torrent blob URL", error);
    }
  }
}

function setFilePriority(file, value) {
  if (!file) {
    return;
  }

  const priorityValue = typeof value === "string" ? value : String(value ?? "0");
  file.priority = priorityValue;

  if (priorityValue === "-1") {
    if (typeof file.deselect === "function") {
      file.deselect();
    }
    return;
  }

  const numericPriority = Number.parseInt(priorityValue, 10);
  if (!Number.isFinite(numericPriority)) {
    return;
  }

  if (typeof file.select === "function") {
    file.select(numericPriority);
  }
}

function selectNextTorrent(current, torrents) {
  if (!Array.isArray(torrents) || torrents.length === 0) {
    return null;
  }

  if (!current) {
    return torrents[0];
  }

  const existing = torrents.find((torrent) => torrentsMatch(torrent, current));
  if (existing) {
    return existing;
  }

  return torrents[0];
}

export function createBeaconApp({
  documentRef = typeof document !== "undefined" ? document : null,
  WebTorrentCtor,
} = {}) {
  if (!documentRef) {
    throw new Error("createBeaconApp requires a document reference");
  }

  const view = documentRef.defaultView || globalThis;
  const WebTorrentClass =
    typeof WebTorrentCtor === "function"
      ? WebTorrentCtor
      : typeof view?.WebTorrent === "function"
        ? view.WebTorrent
        : null;

  if (!WebTorrentClass) {
    throw new Error("createBeaconApp requires a WebTorrent constructor");
  }

  const toast = createBeaconToast(documentRef);
  const client = new WebTorrentClass({ tracker: TRACKER_OPTIONS });

  const elements = {
    form: documentRef.querySelector('[data-beacon="magnet-form"]'),
    magnetInput: documentRef.querySelector('[data-beacon="magnet-input"]'),
    seedButton: documentRef.querySelector('[data-beacon="seed-button"]'),
    seedInput: documentRef.querySelector('[data-beacon="seed-input"]'),
    tableRoot: documentRef.querySelector('[data-beacon="torrent-table"]'),
    selectedSection: documentRef.querySelector('[data-beacon="selected"]'),
    selectedName: documentRef.querySelector('[data-beacon="selected-name"]'),
    pauseButton: documentRef.querySelector('[data-beacon-action="pause"]'),
    resumeButton: documentRef.querySelector('[data-beacon-action="resume"]'),
    downloadAllButton: documentRef.querySelector('[data-beacon-action="download-all"]'),
    removeButton: documentRef.querySelector('[data-beacon-action="remove"]'),
    copyMagnetButton: documentRef.querySelector('[data-beacon-action="copy-magnet"]'),
    infoHashValue: documentRef.querySelector('[data-beacon="info-hash"]'),
    fileList: documentRef.querySelector('[data-beacon="file-list"]'),
    stats: documentRef.querySelector('[data-beacon="client-stats"]'),
    overlay: documentRef.querySelector('[data-beacon="processing-overlay"]'),
  };

  const table = elements.tableRoot
    ? createTorrentTable({
        documentRef,
        root: elements.tableRoot,
        formatters: {
          bytes: (value, speed = false) => formatBytes(value, speed),
          progress: (value) => formatProgress(value),
          ratio: (value) => formatRatio(value),
          integer: (value) => (typeof value === "number" && Number.isFinite(value) ? Math.floor(value).toString() : "0"),
          bytesPerSecond: (value) => formatBytes(value, true),
        },
        onSelect(torrent) {
          state.selectedTorrent = torrent;
          renderSelectedTorrent();
        },
      })
    : null;

  const state = {
    selectedTorrent: null,
    processing: false,
  };

  const cleanupTasks = [];
  const intervalHandles = [];

  function addCleanup(task) {
    cleanupTasks.push(task);
  }

  function setProcessing(flag) {
    state.processing = Boolean(flag);
    if (elements.overlay) {
      elements.overlay.hidden = !state.processing;
    }
  }

  function getTorrents() {
    return Array.isArray(client.torrents) ? [...client.torrents] : [];
  }

  function updateStats() {
    if (!elements.stats) {
      return;
    }

    const download = formatBytes(client.downloadSpeed, true) || "0 B/s";
    const upload = formatBytes(client.uploadSpeed, true) || "0 B/s";
    const ratio = formatRatio(client.ratio);

    elements.stats.textContent = `Client stats: ↓ ${download} · ↑ ${upload} · Ratio: ${ratio}`;
  }

  function renderFileList(torrent) {
    if (!elements.fileList) {
      return;
    }

    elements.fileList.innerHTML = "";
    if (!torrent || !Array.isArray(torrent.files) || !torrent.files.length) {
      return;
    }

    torrent.files.forEach((file, index) => {
      const row = documentRef.createElement("tr");
      row.className = "align-top";

      const nameCell = documentRef.createElement("td");
      nameCell.className = "px-3 py-2";
      if (file.done && file.url) {
        const link = documentRef.createElement("a");
        link.className = "text-info hover:text-info-strong";
        link.href = file.url;
        link.download = file.name || `file-${index + 1}`;
        link.textContent = file.name || `File ${index + 1}`;
        nameCell.appendChild(link);
      } else {
        const span = documentRef.createElement("span");
        span.textContent = file.name || `File ${index + 1}`;
        nameCell.appendChild(span);
      }
      row.appendChild(nameCell);

      const sizeCell = documentRef.createElement("td");
      sizeCell.className = "px-3 py-2 text-muted-strong";
      sizeCell.textContent = formatBytes(file.length) || "0 B";
      row.appendChild(sizeCell);

      const priorityCell = documentRef.createElement("td");
      priorityCell.className = "px-3 py-2";
      const select = documentRef.createElement("select");
      select.className = "select";
      select.name = `${file.name || `file-${index + 1}`}-priority`;
      select.setAttribute("aria-label", `Set priority for ${file.name || `file ${index + 1}`}`);

      const options = [
        { value: "1", label: "High priority" },
        { value: "0", label: "Low priority" },
        { value: "-1", label: "Don't download" },
      ];

      options.forEach((option) => {
        const optionEl = documentRef.createElement("option");
        optionEl.value = option.value;
        optionEl.textContent = option.label;
        if (option.value === file.priority) {
          optionEl.selected = true;
        }
        select.appendChild(optionEl);
      });

      select.value = file.priority ?? "0";
      select.addEventListener("change", (event) => {
        setFilePriority(file, event.target.value);
      });

      priorityCell.appendChild(select);
      row.appendChild(priorityCell);

      elements.fileList.appendChild(row);
    });
  }

  function renderSelectedTorrent() {
    if (!elements.selectedSection) {
      return;
    }

    const torrents = getTorrents();
    state.selectedTorrent = selectNextTorrent(state.selectedTorrent, torrents);

    const torrent = state.selectedTorrent;
    elements.selectedSection.hidden = !torrent;

    if (!torrent) {
      return;
    }

    if (elements.selectedName) {
      elements.selectedName.textContent = torrent.name || "Untitled torrent";
    }

    if (elements.pauseButton) {
      elements.pauseButton.hidden = torrent.paused === true;
      elements.pauseButton.disabled = torrent.paused === true;
    }

    if (elements.resumeButton) {
      elements.resumeButton.hidden = torrent.paused !== true;
      elements.resumeButton.disabled = torrent.paused !== true;
    }

    if (elements.downloadAllButton) {
      elements.downloadAllButton.disabled = !(torrent.progress >= 1);
    }

    if (elements.infoHashValue) {
      elements.infoHashValue.textContent = torrent.infoHash || "";
    }

    renderFileList(torrent);
  }

  function handleTorrentReady(torrent, { isSeed = false } = {}) {
    setProcessing(false);
    prepareTorrentFiles(torrent);

    if (!isSeed) {
      toast.info(`Received ${torrent.name || "torrent"} metadata`);
    }

    if (!state.selectedTorrent) {
      state.selectedTorrent = torrent;
    }

    renderSelectedTorrent();
    table?.render(getTorrents(), state.selectedTorrent);
  }

  function addMagnet(magnet) {
    const trimmed = typeof magnet === "string" ? magnet.trim() : "";
    if (!trimmed) {
      return;
    }

    setProcessing(true);
    client.add(trimmed, TORRENT_OPTIONS, (torrent) => {
      handleTorrentReady(torrent, { isSeed: false });
    });
  }

  function seedFiles(files) {
    if (!Array.isArray(files) || files.length === 0) {
      return;
    }

    setProcessing(true);
    client.seed(files, TORRENT_OPTIONS, (torrent) => {
      handleTorrentReady(torrent, { isSeed: true });
      toast.success(`Seeding ${torrent.files.length} file(s)`);
    });
  }

  function downloadAll(torrent) {
    if (!torrent) {
      return;
    }

    if (torrent.progress < 1) {
      toast.warn("Torrent is not finished downloading yet.");
      return;
    }

    torrent.files.forEach((file) => {
      if (typeof file.getBlob !== "function") {
        return;
      }

      file.getBlob((err, blob) => {
        if (err || !blob) {
          console.error("[beacon] Failed to get blob for file", file?.name, err);
          toast.error("Failed to prepare file for download.");
          return;
        }

        const blobUrl = URL.createObjectURL(blob);
        const anchor = documentRef.createElement("a");
        anchor.className = "beacon-hidden-download";
        anchor.setAttribute("data-beacon-hidden-download", "true");
        anchor.href = blobUrl;
        anchor.download = file.name || "download";
        documentRef.body.appendChild(anchor);
        anchor.click();
        documentRef.body.removeChild(anchor);
        URL.revokeObjectURL(blobUrl);
      });
    });
  }

  function copyMagnet(torrent) {
    if (!torrent?.magnetURI) {
      return;
    }

    const magnet = torrent.magnetURI;
    const clipboard = view?.navigator?.clipboard;

    if (clipboard && typeof clipboard.writeText === "function") {
      clipboard
        .writeText(magnet)
        .then(() => {
          toast.success("Magnet URI copied to clipboard!");
        })
        .catch((error) => {
          console.error("[beacon] Clipboard error", error);
          toast.error("Failed to copy magnet URI");
        });
      return;
    }

    try {
      const textarea = documentRef.createElement("textarea");
      textarea.value = magnet;
      textarea.className = "beacon-clipboard-offscreen";
      textarea.setAttribute("data-beacon-clipboard-state", "offscreen");
      documentRef.body.appendChild(textarea);
      textarea.select();
      documentRef.execCommand?.("copy");
      documentRef.body.removeChild(textarea);
      toast.success("Magnet URI copied (fallback)!");
    } catch (error) {
      console.error("[beacon] Clipboard fallback error", error);
      toast.error("Failed to copy magnet URI");
    }
  }

  function removeTorrent(torrent) {
    if (!torrent) {
      return;
    }

    torrent.destroy((error) => {
      if (error) {
        console.error("[beacon] Failed to destroy torrent", error);
        toast.error("Failed to remove torrent");
      }

      const torrents = getTorrents();
      state.selectedTorrent = selectNextTorrent(null, torrents);
      table?.render(torrents, state.selectedTorrent);
      renderSelectedTorrent();
    });
  }

  function mount() {
    console.log(`[beacon] Starting beacon runtime v${VERSION}`);

    if (!toast) {
      console.warn("[beacon] Toast service unavailable");
    }

    if (!WebTorrentClass.WEBRTC_SUPPORT) {
      toast?.error("Please use a browser with WebRTC support.", { sticky: true });
    }

    if (elements.form) {
      const submitHandler = (event) => {
        event.preventDefault();
        addMagnet(elements.magnetInput?.value || "");
        if (elements.magnetInput) {
          elements.magnetInput.value = "";
        }
      };
      elements.form.addEventListener("submit", submitHandler);
      addCleanup(() => elements.form.removeEventListener("submit", submitHandler));
    }

    if (elements.seedButton && elements.seedInput) {
      const seedClickHandler = () => {
        elements.seedInput.click();
      };
      const seedChangeHandler = () => {
        const files = Array.from(elements.seedInput.files || []);
        elements.seedInput.value = "";
        seedFiles(files);
      };
      elements.seedButton.addEventListener("click", seedClickHandler);
      elements.seedInput.addEventListener("change", seedChangeHandler);
      addCleanup(() => {
        elements.seedButton.removeEventListener("click", seedClickHandler);
        elements.seedInput.removeEventListener("change", seedChangeHandler);
      });
    }

    if (elements.pauseButton) {
      const handler = () => {
        if (state.selectedTorrent && typeof state.selectedTorrent.pause === "function") {
          state.selectedTorrent.pause();
          renderSelectedTorrent();
        }
      };
      elements.pauseButton.addEventListener("click", handler);
      addCleanup(() => elements.pauseButton.removeEventListener("click", handler));
    }

    if (elements.resumeButton) {
      const handler = () => {
        if (state.selectedTorrent && typeof state.selectedTorrent.resume === "function") {
          state.selectedTorrent.resume();
          renderSelectedTorrent();
        }
      };
      elements.resumeButton.addEventListener("click", handler);
      addCleanup(() => elements.resumeButton.removeEventListener("click", handler));
    }

    if (elements.downloadAllButton) {
      const handler = () => downloadAll(state.selectedTorrent);
      elements.downloadAllButton.addEventListener("click", handler);
      addCleanup(() => elements.downloadAllButton.removeEventListener("click", handler));
    }

    if (elements.removeButton) {
      const handler = () => removeTorrent(state.selectedTorrent);
      elements.removeButton.addEventListener("click", handler);
      addCleanup(() => elements.removeButton.removeEventListener("click", handler));
    }

    if (elements.copyMagnetButton) {
      const handler = () => copyMagnet(state.selectedTorrent);
      elements.copyMagnetButton.addEventListener("click", handler);
      addCleanup(() => elements.copyMagnetButton.removeEventListener("click", handler));
    }

    const errorHandler = (error) => {
      console.error("[beacon] Torrent client error", error);
      toast?.error(error?.message || String(error));
      setProcessing(false);
    };
    client.on("error", errorHandler);
    addCleanup(() => client.removeListener("error", errorHandler));

    const beforeUnloadHandler = (event) => {
      if (client.torrents && client.torrents.length > 0) {
        event.preventDefault();
        event.returnValue =
          "Transfers are in progress. Are you sure you want to leave or refresh?";
        return event.returnValue;
      }
      return undefined;
    };
    if (view && typeof view.addEventListener === "function") {
      view.addEventListener("beforeunload", beforeUnloadHandler);
      addCleanup(() => view.removeEventListener("beforeunload", beforeUnloadHandler));
    }

    table?.render(getTorrents(), state.selectedTorrent);
    renderSelectedTorrent();
    updateStats();
    setProcessing(false);

    const intervalId = view.setInterval(() => {
      table?.render(getTorrents(), state.selectedTorrent);
      renderSelectedTorrent();
      updateStats();
    }, 1000);
    intervalHandles.push(intervalId);

    const hash = view?.location?.hash;
    if (typeof hash === "string" && hash.length > 1) {
      addMagnet(hash.slice(1));
    }
  }

  function destroy() {
    intervalHandles.forEach((id) => view.clearInterval(id));
    intervalHandles.length = 0;

    cleanupTasks.forEach((task) => {
      try {
        task();
      } catch (error) {
        console.warn("[beacon] Cleanup task failed", error);
      }
    });
    cleanupTasks.length = 0;

    table?.destroy();

    try {
      client.destroy();
    } catch (error) {
      console.warn("[beacon] Failed to destroy client", error);
    }
  }

  return { mount, destroy };
}

export default createBeaconApp;
