/* global marked */
import { KIND_APP_DATA } from '../src/constants.mjs';
import { createElement } from './domUtils.js';

// -----------------------------------------------------------------------
// Modal Logic
// -----------------------------------------------------------------------
const docsModal = document.getElementById("docsModal");
const settingsModal = document.getElementById("settingsModal");
const openDocsBtn = document.getElementById("openDocs");
const openSettingsBtn = document.getElementById("settingsBtn");
const closeDocsBtn = document.getElementsByClassName("close-modal")[0];
const closeSettingsBtn = document.getElementById("closeSettings");
const contentDiv = document.getElementById("markdown-content");
let docsLoaded = false;

// Docs Modal
if (openDocsBtn) {
  openDocsBtn.onclick = function(e) {
      e.preventDefault();
      docsModal.classList.add("show");
      if (!docsLoaded) {
          fetchDocs();
      }
  }
}

if (closeDocsBtn) {
  closeDocsBtn.onclick = function() {
      docsModal.classList.remove("show");
  }
}

// Settings Modal
if (openSettingsBtn) {
  openSettingsBtn.onclick = function(e) {
      e.preventDefault();

      // Pre-fill values
      document.getElementById('settingHashtag').value = HASHTAG;
      document.getElementById('settingNamespace').value = DASHBOARD_CONFIG.namespace;
      document.getElementById('settingRelays').value = RELAYS.join(', ');

      settingsModal.classList.add("show");
  }
}

if (closeSettingsBtn) {
  closeSettingsBtn.onclick = function() {
      settingsModal.classList.remove("show");
  }
}

document.getElementById('cancelSettings').onclick = function() {
  settingsModal.classList.remove("show");
}

// Handle Settings Save
document.getElementById('settingsForm').onsubmit = function(e) {
  e.preventDefault();

  const newHashtag = document.getElementById('settingHashtag').value.trim();
  const newNamespace = document.getElementById('settingNamespace').value.trim();
  const newRelays = document.getElementById('settingRelays').value.split(',').map(r => r.trim()).filter(Boolean);

  if (!newHashtag) {
    alert('Hashtag is required.');
    return;
  }

  const prefs = {
    hashtag: newHashtag,
    namespace: newNamespace,
    relays: newRelays
  };

  // Save to LocalStorage
  localStorage.setItem('torch_dashboard_prefs', JSON.stringify(prefs));

  // Update URL to reflect new settings (so link is shareable)
  const url = new URL(window.location);
  url.searchParams.set('hashtag', newHashtag);
  url.searchParams.set('namespace', newNamespace);
  url.searchParams.set('relays', newRelays.join(','));
  window.history.pushState({}, '', url);

  // Reload to apply
  window.location.reload();
}

window.onclick = function(event) {
    if (event.target == docsModal) {
        docsModal.classList.remove("show");
    }
    if (event.target == settingsModal) {
        settingsModal.classList.remove("show");
    }
}

async function fetchDocs() {
    try {
        const response = await fetch('../src/docs/TORCH.md');
        if (!response.ok) {
            throw new Error('Failed to load documentation');
        }
        const text = await response.text();
        contentDiv.innerHTML = marked.parse(text);
        docsLoaded = true;
    } catch (error) {
        console.error(error);
        const p = document.createElement('p');
        p.className = 'text-danger';
        p.textContent = `Error loading documentation: ${error.message}`;
        contentDiv.replaceChildren(p);
    }
}

// -----------------------------------------------------------------------
// Configuration — matches bin/torch-lock.mjs defaults
// Optional URL params:
//   ?namespace=torch&hashtag=torch-agent-lock&relays=wss://relay.damus.io,wss://nos.lol
// -----------------------------------------------------------------------
const DASHBOARD_DEFAULTS = {
  namespace: 'torch',
  hashtag: '',
  defaultCadenceView: 'daily',
  defaultStatusView: 'active',
  relays: [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.primal.net',
  ],
};

function normalizeCadence(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'daily' || normalized === 'weekly' || normalized === 'all'
    ? normalized
    : DASHBOARD_DEFAULTS.defaultCadenceView;
}

function normalizeStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['active', 'completed', 'all'].includes(normalized)
    ? normalized
    : DASHBOARD_DEFAULTS.defaultStatusView;
}

async function loadTorchConfigFile() {
  const configCandidates = ['../torch-config.json', './torch-config.json'];

  for (const path of configCandidates) {
    try {
      const response = await fetch(path, { cache: 'no-store' });
      if (!response.ok) continue;
      return await response.json();
    } catch {
      // optional config, ignore
    }
  }

  return {};
}

function parseDashboardConfig(torchConfig = {}) {
  const params = new URLSearchParams(window.location.search);

  // 1. LocalStorage Preferences
  let localPrefs = {};
  try {
    localPrefs = JSON.parse(localStorage.getItem('torch_dashboard_prefs')) || {};
  } catch { /* ignore malformed localStorage */ }

  const dashboardConfig = torchConfig.dashboard || {};
  const lockConfig = torchConfig.nostrLock || {};

  // Hierarchy: URL Param > LocalStorage > Config File > Default

  // Namespace
  const configNamespace = dashboardConfig.namespace || lockConfig.namespace || DASHBOARD_DEFAULTS.namespace;
  const namespace = (
    params.get('namespace') ||
    localPrefs.namespace ||
    configNamespace
  ).trim() || DASHBOARD_DEFAULTS.namespace;

  // Hashtag
  const configHashtag = dashboardConfig.hashtag || DASHBOARD_DEFAULTS.hashtag;
  const hashtag = (
    params.get('hashtag') ||
    localPrefs.hashtag ||
    configHashtag ||
    `${namespace}-agent-lock`
  ).trim();

  // Relays
  const paramsRelays = params.get('relays') ? params.get('relays').split(',') : null;
  const localRelays = localPrefs.relays;
  const configRelays = dashboardConfig.relays || lockConfig.relays || DASHBOARD_DEFAULTS.relays;

  let relays = (paramsRelays || localRelays || configRelays)
    .map(r => r.trim())
    .filter(Boolean);

  if (relays.length === 0) relays = DASHBOARD_DEFAULTS.relays;

  const defaultCadenceView = normalizeCadence(dashboardConfig.defaultCadenceView);
  const defaultStatusView = normalizeStatus(dashboardConfig.defaultStatusView);

  return {
    namespace,
    hashtag,
    relays,
    defaultCadenceView,
    defaultStatusView,
  };
}

let DASHBOARD_CONFIG = parseDashboardConfig({});

let RELAYS = DASHBOARD_CONFIG.relays;
const LOCK_EVENT_KIND = KIND_APP_DATA;
let HASHTAG = DASHBOARD_CONFIG.hashtag;

function applyConfigToHelpText() {
  const byId = (id) => document.getElementById(id);
  const hashtagDisplay = `#${HASHTAG}`;

  const introHashtag = byId('introHashtag');
  if (introHashtag) introHashtag.textContent = hashtagDisplay;
}

// -----------------------------------------------------------------------
// State
// -----------------------------------------------------------------------
/** @type {Map<string, object>} dTag -> latest parsed lock */
const lockStore = new Map();
/** @type {WebSocket[]} */
const sockets = [];
let connectedCount = 0;
let refreshIntervalId = null;
let isTeardown = false;

// DOM refs
const connectionStatus = document.getElementById('connectionStatus');
const lockGrid = document.getElementById('lockGrid');
const emptyState = document.getElementById('emptyState');
const rawLog = document.getElementById('rawLog');
const eventCount = document.getElementById('eventCount');
const summaryBar = document.getElementById('summaryBar');
const cadenceFilter = document.getElementById('cadenceFilter');
const statusFilter = document.getElementById('statusFilter');
const refreshBtn = document.getElementById('refreshBtn');

// Pagination DOM refs
const paginationControls = document.getElementById('paginationControls');
const mobilePrevBtn = document.getElementById('mobilePrevBtn');
const mobileNextBtn = document.getElementById('mobileNextBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const pageStartEl = document.getElementById('pageStart');
const pageEndEl = document.getElementById('pageEnd');
const totalItemsEl = document.getElementById('totalItems');

// Pagination State
let currentPage = 1;
const itemsPerPage = 20;

// -----------------------------------------------------------------------
// Cleanup check
// -----------------------------------------------------------------------
function isAlive() {
  if (isTeardown) return false;
  // Check if our root element is still in the DOM
  const stillInDom = document.body.contains(lockGrid);
  if (!stillInDom) {
    teardown();
    return false;
  }
  return true;
}

function teardown() {
  if (isTeardown) return;
  isTeardown = true;

  if (refreshIntervalId) {
    clearInterval(refreshIntervalId);
    refreshIntervalId = null;
  }

  for (const ws of sockets) {
    try {
      ws.close();
    } catch {
      // ignore
    }
  }
  sockets.length = 0;
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------
function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function fmtTime(unixSec) {
  return new Date(unixSec * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtDuration(seconds) {
  if (seconds < 0) return 'expired';
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function parseLockEvent(event) {
  const dTag = (event.tags || []).find((t) => t[0] === 'd')?.[1] ?? '';
  const expTag = (event.tags || []).find(
    (t) => t[0] === 'expiration',
  )?.[1];
  const expiresAt = expTag ? parseInt(expTag, 10) : null;

  let content = {};
  try {
    content = JSON.parse(event.content);
  } catch {
    // non-JSON content
  }

  return {
    eventId: event.id,
    pubkey: event.pubkey,
    createdAt: event.created_at,
    expiresAt,
    dTag,
    agent: content.agent ?? dTag.split('/')[2] ?? 'unknown',
    cadence: content.cadence ?? dTag.split('/')[1] ?? 'unknown',
    status: content.status ?? 'unknown',
    date: content.date ?? dTag.split('/')[3] ?? todayStr(),
    platform: content.platform ?? 'unknown',
    model: content.model ?? null,
  };
}

function isExpired(lock) {
  return lock.expiresAt != null && lock.expiresAt <= nowUnix();
}

function shouldReplaceLock(existingLock, incomingLock) {
  if (!existingLock) return true;
  if (incomingLock.createdAt !== existingLock.createdAt) {
    return incomingLock.createdAt > existingLock.createdAt;
  }

  // Deterministic tie-break: prefer lexicographically higher event id.
  return (incomingLock.eventId || '') > (existingLock.eventId || '');
}

// -----------------------------------------------------------------------
// Platform styling
// -----------------------------------------------------------------------
const PLATFORM_COLORS = {
  jules: { bg: 'bg-info/10', text: 'text-info', label: 'Jules' },
  'claude-code': {
    bg: 'bg-warning/10',
    text: 'text-warning',
    label: 'Claude Code',
  },
  codex: {
    bg: 'bg-success/10',
    text: 'text-success',
    label: 'Codex',
  },
  goose: {
    bg: 'bg-purple/10',
    text: 'text-purple',
    label: 'Goose',
  },
  gemini: {
    bg: 'bg-accent/10',
    text: 'text-accent',
    label: 'Gemini CLI',
  },
  antigravity: {
    bg: 'bg-pink/10',
    text: 'text-pink',
    label: 'Antigravity IDE',
  },
  qwen: {
    bg: 'bg-purple/10',
    text: 'text-purple',
    label: 'Qwen Coder',
  },
  opencode: {
    bg: 'bg-teal/10',
    text: 'text-teal',
    label: 'OpenCode',
  },
  unknown: { bg: 'bg-muted/10', text: 'text-muted', label: 'Unknown' },
};

function platformStyle(platform) {
  const raw = String(platform || '').toLowerCase().trim();
  if (raw === 'claude' || raw.includes('claude')) return PLATFORM_COLORS['claude-code'];
  return PLATFORM_COLORS[raw] || PLATFORM_COLORS.unknown;
}

// -----------------------------------------------------------------------
// Rendering
// -----------------------------------------------------------------------
function getFilteredLocks() {
  const cadence = cadenceFilter.value;
  const statusMode = statusFilter.value;

  return [...lockStore.values()]
    .filter((l) => {
      if (cadence !== 'all' && l.cadence !== cadence) return false;

      if (statusMode === 'completed') {
        return l.status === 'completed';
      }

      if (statusMode === 'active') {
        // Active means not expired AND not completed
        if (isExpired(l)) return false;
        if (l.status === 'completed') return false;
        return true;
      }

      // If 'all', show everything (expired, completed, started)
      return true;
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

function renderSummary(locks) {
  const active = locks.filter((l) => !isExpired(l));
  const platforms = {};
  for (const l of active) {
    const label = platformStyle(l.platform).label;
    platforms[label] = (platforms[label] || 0) + 1;
  }

  const cards = [
    {
      label: 'Active locks',
      value: active.length,
      color: 'text-accent-strong',
    },
    {
      label: 'Total events',
      value: locks.length,
      color: 'text-text',
    },
    {
      label: 'Platforms',
      value: Object.keys(platforms).join(', ') || 'none',
      color: 'text-info',
    },
    {
      label: 'Date',
      value: todayStr(),
      color: 'text-muted',
    },
  ];

  summaryBar.replaceChildren();
  for (const c of cards) {
    const card = createElement('div', 'rounded-lg bg-surface-alt p-4');
    const label = createElement('div', 'text-xs text-muted mb-1', c.label);
    const value = createElement('div', `text-lg font-semibold ${c.color} mono`, String(c.value));
    card.appendChild(label);
    card.appendChild(value);
    summaryBar.appendChild(card);
  }
}

function createLockCard(lock, now) {
  const expired = isExpired(lock);
  const isCompleted = lock.status === 'completed';
  const ps = platformStyle(lock.platform);
  const age = now - lock.createdAt;
  const remaining = lock.expiresAt ? lock.expiresAt - now : 0;
  const ttlTotal = lock.expiresAt
    ? lock.expiresAt - lock.createdAt
    : 7200;
  const ttlPct = expired
    ? 0
    : Math.max(0, Math.min(100, (remaining / ttlTotal) * 100));

  let cardBg = 'bg-surface-alt';
  let cardBorder = expired ? 'border-border/50 opacity-60' : 'border-border';

  if (isCompleted) {
    cardBg = 'bg-success/5';
    cardBorder = 'border-success/30';
  }

  const card = createElement('div', `rounded-lg border ${cardBorder} ${cardBg} p-4 flex flex-col gap-3`);

  // Header
  const header = createElement('div', 'flex items-start justify-between');
  const left = createElement('div', 'flex items-center gap-2');
  if (!expired && !isCompleted) {
    left.appendChild(createElement('span', 'pulse-dot bg-success mt-1 shrink-0'));
  }
  const meta = createElement('div');
  meta.appendChild(createElement('div', 'font-medium text-text-strong text-sm', lock.agent));
  meta.appendChild(createElement('div', 'text-xs text-muted', `${lock.cadence} \u00B7 ${lock.date}`));
  left.appendChild(meta);
  header.appendChild(left);

  const right = createElement('div', 'flex flex-col items-end gap-1');
  const badge = createElement('span', `inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ps.bg} ${ps.text}`, ps.label);
  right.appendChild(badge);

  if (lock.model && lock.model !== 'unknown') {
    right.appendChild(createElement('span', 'text-xs text-muted mono opacity-75', lock.model));
  }
  header.appendChild(right);
  card.appendChild(header);

  // Grid
  const grid = createElement('div', 'grid grid-cols-2 gap-x-4 gap-y-1 text-xs');
  grid.appendChild(createElement('div', 'text-muted', 'Started'));
  grid.appendChild(createElement('div', 'mono text-text', fmtTime(lock.createdAt)));
  grid.appendChild(createElement('div', 'text-muted', 'Age'));
  grid.appendChild(createElement('div', 'mono text-text', fmtDuration(age)));
  grid.appendChild(createElement('div', 'text-muted', 'TTL remaining'));
  grid.appendChild(createElement('div', `mono ${expired ? 'text-danger' : 'text-text'}`, fmtDuration(remaining)));
  grid.appendChild(createElement('div', 'text-muted', 'Status'));
  grid.appendChild(createElement('div', `mono ${expired ? 'text-danger' : 'text-success'}`, expired ? 'expired' : lock.status));
  card.appendChild(grid);

  // Progress Bar
  const barContainer = createElement('div', 'w-full bg-border/30 rounded-full overflow-hidden');
  const bar = createElement('div', `ttl-bar ${expired ? 'bg-danger' : 'bg-success'}`);
  bar.style.width = `${ttlPct}%`;
  barContainer.appendChild(bar);
  card.appendChild(barContainer);

  // Footer (Event ID)
  const footer = createElement('div', 'text-xs text-muted mono truncate', lock.eventId ? lock.eventId.slice(0, 16) + '\u2026' : 'no id');
  footer.title = lock.eventId || '';
  card.appendChild(footer);

  return card;
}

let renderPending = false;
function scheduleRender() {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(() => {
    renderPending = false;
    if (isAlive() && !document.hidden) {
      renderLocks();
    }
  });
}

function renderLocks() {
  if (!isAlive()) return;

  const allLocks = getFilteredLocks();
  const now = nowUnix();

  eventCount.textContent = `${lockStore.size} events`;
  renderSummary(allLocks);

  const totalItems = allLocks.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);

  // Adjust currentPage if out of bounds
  if (currentPage > totalPages && totalPages > 0) {
    currentPage = totalPages;
  }
  if (currentPage < 1) currentPage = 1;

  if (totalItems === 0) {
    lockGrid.replaceChildren(emptyState);
    emptyState.textContent =
      lockStore.size === 0
        ? 'Waiting for lock events from relays\u2026'
        : 'No locks match the current filters.';
    paginationControls.classList.add('hidden');
    return;
  }

  // Slice for pagination
  const startIdx = (currentPage - 1) * itemsPerPage;
  const endIdx = Math.min(startIdx + itemsPerPage, totalItems);
  const pageLocks = allLocks.slice(startIdx, endIdx);

  const cards = pageLocks.map((lock) => createLockCard(lock, now));
  lockGrid.replaceChildren(...cards);

  // Update Pagination Controls
  if (totalItems > itemsPerPage) {
    paginationControls.classList.remove('hidden');

    // Update text
    pageStartEl.textContent = startIdx + 1;
    pageEndEl.textContent = endIdx;
    totalItemsEl.textContent = totalItems;

    // Update buttons state
    const isFirst = currentPage === 1;
    const isLast = currentPage === totalPages;

    prevBtn.disabled = isFirst;
    nextBtn.disabled = isLast;
    mobilePrevBtn.disabled = isFirst;
    mobileNextBtn.disabled = isLast;
  } else {
    paginationControls.classList.add('hidden');
  }
}

// -----------------------------------------------------------------------
// Raw log
// -----------------------------------------------------------------------
let rawLogInitialized = false;
function appendRawLog(event) {
  if (!isAlive()) return;

  if (!rawLogInitialized) {
    rawLog.replaceChildren();
    rawLogInitialized = true;
  }
  const ts = new Date(event.created_at * 1000).toISOString();
  const text = `[${ts}] ${JSON.stringify(event).slice(0, 300)}`;
  const line = createElement('div', 'mb-2 pb-2 border-b border-border/30', text);
  rawLog.prepend(line);

  // Keep log bounded
  while (rawLog.children.length > 200) {
    rawLog.removeChild(rawLog.lastChild);
  }
}

// -----------------------------------------------------------------------
// WebSocket relay connections
// -----------------------------------------------------------------------
function updateConnectionBadge() {
  if (!connectionStatus) return;
  const dot = connectionStatus.querySelector('.pulse-dot');
  if (connectedCount === RELAYS.length) {
    connectionStatus.className =
      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium bg-success/10 text-success';
    dot.className = 'pulse-dot bg-success';
    connectionStatus.lastChild.textContent = ` ${connectedCount}/${RELAYS.length} relays`;
  } else if (connectedCount > 0) {
    connectionStatus.className =
      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium bg-warning/10 text-warning';
    dot.className = 'pulse-dot bg-warning';
    connectionStatus.lastChild.textContent = ` ${connectedCount}/${RELAYS.length} relays`;
  } else {
    connectionStatus.className =
      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium bg-danger/10 text-danger';
    dot.className = 'pulse-dot bg-danger';
    connectionStatus.lastChild.textContent = ' Disconnected';
  }
}

function connectToRelay(url) {
  if (!isAlive()) return;

  const ws = new WebSocket(url);
  const subId = 'torch-dash-' + Math.random().toString(36).slice(2, 8);

  ws.addEventListener('open', () => {
    if (!isAlive()) return;
    connectedCount++;
    updateConnectionBadge();

    // NIP-01 REQ: subscribe to TORCH lock events
    // Request from 7 days ago to cover active locks created before midnight
    // and recent history for weekly cadence
    const since = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
    const filter = {
      kinds: [LOCK_EVENT_KIND],
      '#t': [HASHTAG],
      since: since,
    };
    ws.send(JSON.stringify(['REQ', subId, filter]));
  });

  ws.addEventListener('message', (msg) => {
    if (!isAlive()) return;

    let data;
    try {
      data = JSON.parse(msg.data);
    } catch {
      return;
    }

    // NIP-01: ["EVENT", subId, event]
    if (data[0] === 'EVENT' && data[2]) {
      const event = data[2];
      const lock = parseLockEvent(event);

      // De-duplicate by dTag: keep one lock per d-tag, preferring the
      // most recent created_at; if equal, replace deterministically by event id.
      const existing = lockStore.get(lock.dTag);
      if (shouldReplaceLock(existing, lock)) {
        lockStore.set(lock.dTag, lock);
      }

      appendRawLog(event);
      scheduleRender();
    }

    // NIP-01: ["EOSE", subId] — end of stored events
    if (data[0] === 'EOSE') {
      scheduleRender();
    }
  });

  ws.addEventListener('close', () => {
    // Clean up socket from tracking array
    const idx = sockets.indexOf(ws);
    if (idx !== -1) {
      sockets.splice(idx, 1);
    }

    if (isTeardown) return;
    if (ws.isManualClose) return;

    connectedCount = Math.max(0, connectedCount - 1);
    updateConnectionBadge();

    // Auto-reconnect after 5 seconds if still alive
    setTimeout(() => {
      if (isAlive()) {
        connectToRelay(url);
      }
    }, 5000);
  });

  ws.addEventListener('error', () => {
    // Error fires before close, so close handler will decrement
  });

  sockets.push(ws);
}

// -----------------------------------------------------------------------
// Periodic TTL refresh
// -----------------------------------------------------------------------
refreshIntervalId = setInterval(() => {
  if (isAlive() && !document.hidden) {
    renderLocks();
  }
}, 30_000);

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && isAlive()) {
    renderLocks();
  }
});

// -----------------------------------------------------------------------
// Event handlers
// -----------------------------------------------------------------------
function setPage(p) {
  currentPage = p;
  renderLocks();
}

if (cadenceFilter) cadenceFilter.addEventListener('change', () => { currentPage = 1; renderLocks(); });
if (statusFilter) statusFilter.addEventListener('change', () => { currentPage = 1; renderLocks(); });

if (prevBtn) prevBtn.addEventListener('click', () => setPage(currentPage - 1));
if (nextBtn) nextBtn.addEventListener('click', () => setPage(currentPage + 1));
if (mobilePrevBtn) mobilePrevBtn.addEventListener('click', () => setPage(currentPage - 1));
if (mobileNextBtn) mobileNextBtn.addEventListener('click', () => setPage(currentPage + 1));

if (refreshBtn) refreshBtn.addEventListener('click', () => {
  // Close existing connections and reconnect
  for (const ws of sockets) {
    try {
      ws.isManualClose = true;
      ws.close();
    } catch {
      // ignore
    }
  }
  sockets.length = 0;
  connectedCount = 0;
  lockStore.clear();
  updateConnectionBadge();
  init();
});

// -----------------------------------------------------------------------
// Init
// -----------------------------------------------------------------------
function init() {
  if (!isAlive()) return;

  applyConfigToHelpText();

  for (const url of RELAYS) {
    connectToRelay(url);
  }
}

async function bootstrap() {
  const torchConfig = await loadTorchConfigFile();
  DASHBOARD_CONFIG = parseDashboardConfig(torchConfig);
  RELAYS = DASHBOARD_CONFIG.relays;
  HASHTAG = DASHBOARD_CONFIG.hashtag;

  cadenceFilter.value = DASHBOARD_CONFIG.defaultCadenceView;
  statusFilter.value = DASHBOARD_CONFIG.defaultStatusView;

  init();
}

bootstrap();
