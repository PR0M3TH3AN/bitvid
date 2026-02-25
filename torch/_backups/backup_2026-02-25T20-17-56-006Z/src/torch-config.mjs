import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_RELAYS,
  DEFAULT_TTL,
  DEFAULT_NAMESPACE,
  DEFAULT_QUERY_TIMEOUT_MS,
  DEFAULT_PUBLISH_TIMEOUT_MS,
  DEFAULT_MIN_SUCCESSFUL_PUBLISHES,
  DEFAULT_MIN_ACTIVE_RELAY_POOL,
} from './constants.mjs';

const DEFAULT_CONFIG_PATH = 'torch-config.json';

let cachedConfig = null;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 120_000;

function parsePositiveInteger(value) {
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
}

function parseStringList(value) {
  if (!Array.isArray(value)) return null;
  const parsed = value.map((item) => String(item).trim()).filter(Boolean);
  return parsed.length > 0 ? parsed : null;
}

function assertValidRelayUrl(relay, sourceLabel) {
  let parsed;
  try {
    parsed = new URL(relay);
  } catch {
    throw new Error(`Invalid relay URL in ${sourceLabel}: "${relay}" (must be an absolute ws:// or wss:// URL)`);
  }
  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    throw new Error(`Invalid relay URL in ${sourceLabel}: "${relay}" (protocol must be ws:// or wss://)`);
  }
}

function assertTimeoutInRange(value, sourceLabel) {
  if (!Number.isInteger(value) || value < MIN_TIMEOUT_MS || value > MAX_TIMEOUT_MS) {
    throw new Error(
      `Invalid ${sourceLabel}: ${value} (must be an integer between ${MIN_TIMEOUT_MS} and ${MAX_TIMEOUT_MS} ms)`,
    );
  }
}

function assertPositiveCount(value, sourceLabel) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid ${sourceLabel}: ${value} (must be a positive integer)`);
  }
}

function normalizeCadence(value, fallback) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'daily' || normalized === 'weekly' || normalized === 'all' ? normalized : fallback;
}

function normalizeStatus(value, fallback) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'active' || normalized === 'all' ? normalized : fallback;
}


export function getTorchConfigPath() {
  const explicitPath = (process.env.TORCH_CONFIG_PATH || '').trim();
  if (explicitPath) return path.resolve(process.cwd(), explicitPath);

  const localPath = path.resolve(process.cwd(), DEFAULT_CONFIG_PATH);
  if (fs.existsSync(localPath)) return localPath;

  const parentPath = path.resolve(process.cwd(), '..', DEFAULT_CONFIG_PATH);
  if (fs.existsSync(parentPath)) return parentPath;

  return localPath;
}

export function parseTorchConfig(raw, configPath = null) {
  const nostrLock = raw.nostrLock || {};
  const dashboard = raw.dashboard || {};
  const scheduler = raw.scheduler || {};
  const firstPromptByCadence = scheduler.firstPromptByCadence || {};
  const paused = scheduler.paused || {};

  return {
    configPath,
    raw,
    nostrLock: {
      namespace: typeof nostrLock.namespace === 'string' ? nostrLock.namespace.trim() : null,
      relays: parseStringList(nostrLock.relays),
      relayFallbacks: parseStringList(nostrLock.relayFallbacks),
      ttlSeconds: Number.isFinite(nostrLock.ttlSeconds) && nostrLock.ttlSeconds > 0
        ? Math.floor(nostrLock.ttlSeconds)
        : null,
      queryTimeoutMs: parsePositiveInteger(nostrLock.queryTimeoutMs),
      publishTimeoutMs: parsePositiveInteger(nostrLock.publishTimeoutMs),
      minSuccessfulRelayPublishes: parsePositiveInteger(nostrLock.minSuccessfulRelayPublishes),
      minActiveRelayPool: parsePositiveInteger(nostrLock.minActiveRelayPool),
      dailyRoster: parseStringList(nostrLock.dailyRoster),
      weeklyRoster: parseStringList(nostrLock.weeklyRoster),
    },
    dashboard: {
      defaultCadenceView: normalizeCadence(dashboard.defaultCadenceView, 'daily'),
      defaultStatusView: normalizeStatus(dashboard.defaultStatusView, 'active'),
      relays: parseStringList(dashboard.relays),
      namespace: typeof dashboard.namespace === 'string' ? dashboard.namespace.trim() : null,
      hashtag: typeof dashboard.hashtag === 'string' ? dashboard.hashtag.trim() : null,
      auth: typeof dashboard.auth === 'string' ? dashboard.auth.trim() : null,
    },
    scheduler: {
      firstPromptByCadence: {
        daily: typeof firstPromptByCadence.daily === 'string' ? firstPromptByCadence.daily.trim() : null,
        weekly: typeof firstPromptByCadence.weekly === 'string' ? firstPromptByCadence.weekly.trim() : null,
      },
      paused: {
        daily: parseStringList(paused.daily) || [],
        weekly: parseStringList(paused.weekly) || [],
      },
    },
  };
}

/** @internal */
export function _resetTorchConfigCache() {
  cachedConfig = null;
}

export async function loadTorchConfig(fileSystem = fs) {
  if (cachedConfig) return cachedConfig;

  const configPath = getTorchConfigPath();
  let raw = {};

  try {
    const content = await fileSystem.promises.readFile(configPath, 'utf8');
    raw = JSON.parse(content);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw new Error(`Failed to parse ${configPath}: ${err.message}`, { cause: err });
    }
    // If file missing (ENOENT), we use empty object defaults
  }

  cachedConfig = parseTorchConfig(raw, configPath);
  validateLockBackendConfig(cachedConfig);
  return cachedConfig;
}

function validateLockBackendConfig(config) {
  const relays = config.nostrLock.relays || [];
  const relayFallbacks = config.nostrLock.relayFallbacks || [];

  for (const relay of relays) {
    assertValidRelayUrl(relay, 'nostrLock.relays');
  }
  for (const relay of relayFallbacks) {
    assertValidRelayUrl(relay, 'nostrLock.relayFallbacks');
  }

  if (config.nostrLock.queryTimeoutMs !== null) {
    assertTimeoutInRange(config.nostrLock.queryTimeoutMs, 'nostrLock.queryTimeoutMs');
  }
  if (config.nostrLock.publishTimeoutMs !== null) {
    assertTimeoutInRange(config.nostrLock.publishTimeoutMs, 'nostrLock.publishTimeoutMs');
  }
  if (config.nostrLock.minSuccessfulRelayPublishes !== null) {
    assertPositiveCount(config.nostrLock.minSuccessfulRelayPublishes, 'nostrLock.minSuccessfulRelayPublishes');
  }
  if (config.nostrLock.minActiveRelayPool !== null) {
    assertPositiveCount(config.nostrLock.minActiveRelayPool, 'nostrLock.minActiveRelayPool');
  }
}

function parseEnvRelayList(envValue, envName) {
  const relays = envValue.split(',').map((r) => r.trim()).filter(Boolean);
  for (const relay of relays) {
    assertValidRelayUrl(relay, envName);
  }
  return relays;
}

function parseEnvInteger(envValue, envName) {
  const parsed = parseInt(envValue, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid ${envName}: "${envValue}" (must be an integer)`);
  }
  return parsed;
}

function resolveIntegerConfig(envKey, configValue, defaultValue, validator, configLabel) {
  const envValue = process.env[envKey];
  if (envValue) {
    const parsed = parseEnvInteger(envValue, envKey);
    validator(parsed, envKey);
    return parsed;
  }
  const value = configValue || defaultValue;
  validator(value, `effective ${configLabel}`);
  return value;
}

export async function getRelays() {
  const config = await loadTorchConfig();
  const envRelays = process.env.NOSTR_LOCK_RELAYS;
  if (envRelays) {
    return parseEnvRelayList(envRelays, 'NOSTR_LOCK_RELAYS');
  }
  if (config.nostrLock.relays?.length) {
    return config.nostrLock.relays;
  }
  for (const relay of DEFAULT_RELAYS) {
    assertValidRelayUrl(relay, 'DEFAULT_RELAYS');
  }
  return DEFAULT_RELAYS;
}

export async function getRelayFallbacks() {
  const config = await loadTorchConfig();
  const envRelays = process.env.NOSTR_LOCK_RELAY_FALLBACKS;
  if (envRelays) {
    return parseEnvRelayList(envRelays, 'NOSTR_LOCK_RELAY_FALLBACKS');
  }
  return config.nostrLock.relayFallbacks || [];
}

export async function getNamespace() {
  const config = await loadTorchConfig();
  const namespace = (process.env.NOSTR_LOCK_NAMESPACE || config.nostrLock.namespace || DEFAULT_NAMESPACE).trim();
  return namespace || DEFAULT_NAMESPACE;
}

export async function getTtl() {
  const config = await loadTorchConfig();
  const envTtl = process.env.NOSTR_LOCK_TTL;
  if (envTtl) {
    const parsed = parseInt(envTtl, 10);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  if (config.nostrLock.ttlSeconds) {
    return config.nostrLock.ttlSeconds;
  }
  return DEFAULT_TTL;
}

export async function getQueryTimeoutMs() {
  const config = await loadTorchConfig();
  return resolveIntegerConfig(
    'NOSTR_LOCK_QUERY_TIMEOUT_MS',
    config.nostrLock.queryTimeoutMs,
    DEFAULT_QUERY_TIMEOUT_MS,
    assertTimeoutInRange,
    'query timeout',
  );
}

export async function getPublishTimeoutMs() {
  const config = await loadTorchConfig();
  return resolveIntegerConfig(
    'NOSTR_LOCK_PUBLISH_TIMEOUT_MS',
    config.nostrLock.publishTimeoutMs,
    DEFAULT_PUBLISH_TIMEOUT_MS,
    assertTimeoutInRange,
    'publish timeout',
  );
}

export async function getMinSuccessfulRelayPublishes() {
  const config = await loadTorchConfig();
  return resolveIntegerConfig(
    'NOSTR_LOCK_MIN_SUCCESSFUL_PUBLISHES',
    config.nostrLock.minSuccessfulRelayPublishes,
    DEFAULT_MIN_SUCCESSFUL_PUBLISHES,
    assertPositiveCount,
    'min successful relay publishes',
  );
}

export async function getMinActiveRelayPool() {
  const config = await loadTorchConfig();
  return resolveIntegerConfig(
    'NOSTR_LOCK_MIN_ACTIVE_RELAY_POOL',
    config.nostrLock.minActiveRelayPool,
    DEFAULT_MIN_ACTIVE_RELAY_POOL,
    assertPositiveCount,
    'min active relay pool',
  );
}

export async function getHashtag() {
  const config = await loadTorchConfig();
  const envValue = process.env.NOSTR_LOCK_HASHTAG;
  if (envValue) {
    return envValue.trim();
  }
  if (config.dashboard.hashtag) {
    return config.dashboard.hashtag;
  }
  const namespace = await getNamespace();
  return `${namespace}-agent-lock`;
}

export async function getDashboardAuth() {
  const config = await loadTorchConfig();
  const envValue = process.env.TORCH_DASHBOARD_AUTH;
  if (envValue) {
    return envValue.trim();
  }
  return config.dashboard.auth;
}
