const STREAM_HEALTH_TEMPLATE = `
  <div
    class="stream-health-pill inline-flex items-center gap-2 px-2 py-1 rounded"
    data-stream-health-pill="true"
  >
    <span class="sr-only">WebTorrent availability:</span>
    <span class="stream-health-label uppercase tracking-wide text-[0.65rem] text-gray-400">
      P2P
    </span>
    <span
      class="stream-health text-lg"
      aria-live="polite"
      aria-label="Checking stream availability"
      title="Checking stream availability"
    >
      🟦
    </span>
  </div>
`;

function wrapPlaybackHealthRow(innerHtml) {
  return `
    <div class="playback-health-row mt-3 flex flex-wrap items-center gap-2">
      ${innerHtml}
    </div>
  `.trim();
}

export function getStreamHealthBadgeMarkup() {
  return STREAM_HEALTH_TEMPLATE.trim();
}

export function getPlaybackHealthRowMarkup({ includeUrlBadge = false } = {}) {
  const pieces = [];
  if (includeUrlBadge) {
    pieces.push(`
      <div
        class="url-health-badge text-xs font-semibold px-2 py-1 rounded inline-flex items-center gap-1 bg-gray-800 text-gray-300 transition-colors duration-200"
        data-url-health-state="checking"
        aria-live="polite"
        role="status"
      >
        Checking hosted URL…
      </div>
    `.trim());
  }
  pieces.push(getStreamHealthBadgeMarkup());
  return wrapPlaybackHealthRow(pieces.join("\n"));
}
