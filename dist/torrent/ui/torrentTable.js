const COLUMN_DEFS = [
  {
    key: "name",
    label: "Name",
    headerClass: "w-full sm:w-1/3 text-left",
    cellClass: "font-medium text-text truncate",
  },
  {
    key: "progress",
    label: "Progress",
    headerClass: "w-24 text-right",
    cellClass: "tabular-nums text-right",
    formatter: "progress",
  },
  {
    key: "downloadSpeed",
    label: "\u2193 Speed",
    headerClass: "w-24 text-right",
    cellClass: "tabular-nums text-right",
    formatter: "bytesPerSecond",
  },
  {
    key: "uploadSpeed",
    label: "\u2191 Speed",
    headerClass: "w-24 text-right",
    cellClass: "tabular-nums text-right",
    formatter: "bytesPerSecond",
  },
  {
    key: "numPeers",
    label: "Peers",
    headerClass: "w-20 text-right",
    cellClass: "tabular-nums text-right",
    formatter: "integer",
  },
  {
    key: "ratio",
    label: "Ratio",
    headerClass: "w-20 text-right",
    cellClass: "tabular-nums text-right",
    formatter: "ratio",
  },
];

function getRowId(torrent) {
  if (!torrent) {
    return "";
  }

  return torrent.infoHash || torrent.magnetURI || torrent.name || String(Math.random());
}

function isSelectedTorrent(selected, torrent) {
  if (!selected || !torrent) {
    return false;
  }

  return (
    selected === torrent ||
    (selected.magnetURI && selected.magnetURI === torrent.magnetURI) ||
    (selected.infoHash && selected.infoHash === torrent.infoHash)
  );
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

function formatInteger(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "0";
  }

  return Math.max(0, Math.floor(value)).toString();
}

function formatBytesPerSecond(value, formatter) {
  if (typeof formatter === "function") {
    return formatter(value, true) || "";
  }

  if (typeof value !== "number" || Number.isNaN(value) || value < 1) {
    return "";
  }

  const units = ["B", "kB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1000)), units.length - 1);
  const val = (value / Math.pow(1000, exponent)).toFixed(1);
  return `${val} ${units[exponent]}/s`;
}

function resolveFormatter(column, customFormatters) {
  const name = column.formatter;
  if (typeof name === "function") {
    return name;
  }

  const userFormatter = customFormatters?.[name];
  if (typeof userFormatter === "function") {
    return userFormatter;
  }

  switch (name) {
    case "progress":
      return formatProgress;
    case "ratio":
      return formatRatio;
    case "integer":
      return formatInteger;
    case "bytesPerSecond":
      return (value) => formatBytesPerSecond(value, customFormatters?.bytes);
    default:
      return (value) => value;
  }
}

export function createTorrentTable({
  documentRef = typeof document !== "undefined" ? document : null,
  root,
  onSelect,
  formatters = {},
} = {}) {
  if (!documentRef) {
    throw new Error("createTorrentTable requires a document reference");
  }

  if (!(root instanceof documentRef.defaultView.HTMLElement)) {
    throw new Error("createTorrentTable requires a valid root element");
  }

  const doc = documentRef;
  root.innerHTML = "";

  const container = doc.createElement("div");
  container.className = "overflow-hidden rounded-xl border border-border-translucent bg-surface shadow-sm";

  const scroll = doc.createElement("div");
  scroll.className = "overflow-x-auto";
  container.appendChild(scroll);

  const table = doc.createElement("table");
  table.className = "min-w-full divide-y divide-border-translucent text-sm";
  scroll.appendChild(table);

  const thead = doc.createElement("thead");
  thead.className = "bg-surface-alt text-muted-strong";
  const headerRow = doc.createElement("tr");
  COLUMN_DEFS.forEach((column) => {
    const th = doc.createElement("th");
    th.setAttribute("scope", "col");
    th.className = "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide";
    if (column.headerClass) {
      th.className += ` ${column.headerClass}`;
    }
    th.textContent = column.label;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = doc.createElement("tbody");
  tbody.className = "divide-y divide-border-translucent";
  table.appendChild(tbody);

  const emptyBody = doc.createElement("tbody");
  const emptyRow = doc.createElement("tr");
  const emptyCell = doc.createElement("td");
  emptyCell.className = "px-4 py-8 text-center text-sm text-muted";
  emptyCell.colSpan = COLUMN_DEFS.length;
  emptyCell.textContent = "No active torrents yet. Add a magnet link to get started.";
  emptyRow.appendChild(emptyCell);
  emptyBody.appendChild(emptyRow);
  table.appendChild(emptyBody);

  root.appendChild(container);

  function render(torrents = [], selectedTorrent = null) {
    const rows = Array.isArray(torrents) ? torrents : [];
    tbody.innerHTML = "";

    if (!rows.length) {
      tbody.hidden = true;
      emptyBody.hidden = false;
      return;
    }

    tbody.hidden = false;
    emptyBody.hidden = true;

    for (const torrent of rows) {
      const row = doc.createElement("tr");
      row.className = [
        "group",
        "align-middle",
        "cursor-pointer",
        "transition",
        "hover:bg-panel-hover",
        "focus-visible:outline",
        "focus-visible:outline-2",
        "focus-visible:outline-offset-2",
        "focus-visible:outline-info",
      ].join(" ");
      row.setAttribute("role", "button");
      row.setAttribute("tabindex", "0");
      row.dataset.torrentId = getRowId(torrent);

      if (isSelectedTorrent(selectedTorrent, torrent)) {
        row.classList.add("bg-info/10", "text-text");
        row.setAttribute("aria-pressed", "true");
      } else {
        row.setAttribute("aria-pressed", "false");
      }

      row.addEventListener("click", () => {
        if (typeof onSelect === "function") {
          onSelect(torrent);
        }
      });

      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (typeof onSelect === "function") {
            onSelect(torrent);
          }
        }
      });

      COLUMN_DEFS.forEach((column) => {
        const td = doc.createElement("td");
        td.className = "px-4 py-3";
        if (column.cellClass) {
          td.className += ` ${column.cellClass}`;
        }

        const value = torrent ? torrent[column.key] : undefined;
        const formatter = resolveFormatter(column, formatters);
        const displayValue = formatter(value, torrent, column);
        const span = doc.createElement("span");
        span.textContent = displayValue == null ? "" : String(displayValue);
        td.appendChild(span);
        row.appendChild(td);
      });

      tbody.appendChild(row);
    }
  }

  function destroy() {
    root.innerHTML = "";
  }

  return { render, destroy };
}
