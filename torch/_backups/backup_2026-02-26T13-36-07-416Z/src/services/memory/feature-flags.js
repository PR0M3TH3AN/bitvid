const FALSEY = new Set(['0', 'false', 'off', 'no', 'disabled']);
const TRUTHY = new Set(['1', 'true', 'on', 'yes', 'enabled', 'all']);

function normalize(value) {
  return String(value ?? '').trim();
}

function parseAgentToggle(value) {
  const raw = normalize(value);
  if (!raw) return { kind: 'unset' };

  const lower = raw.toLowerCase();
  if (FALSEY.has(lower)) return { kind: 'off' };
  if (TRUTHY.has(lower)) return { kind: 'all' };

  const allowList = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return allowList.length > 0 ? { kind: 'allow-list', allowList } : { kind: 'off' };
}

function isToggleEnabledForAgent(value, agentId, fallbackWhenUnset) {
  const parsed = parseAgentToggle(value);
  if (parsed.kind === 'unset') return fallbackWhenUnset;
  if (parsed.kind === 'off') return false;
  if (parsed.kind === 'all') return true;
  if (!agentId) return false;
  return parsed.allowList.includes(String(agentId));
}

export function isMemoryEnabled(env = process.env) {
  return isToggleEnabledForAgent(env.TORCH_MEMORY_ENABLED, undefined, true);
}

export function isMemoryIngestEnabled(agentId, env = process.env) {
  if (!isMemoryEnabled(env)) return false;
  return isToggleEnabledForAgent(env.TORCH_MEMORY_INGEST_ENABLED, agentId, true);
}

export function isMemoryRetrievalEnabled(agentId, env = process.env) {
  if (!isMemoryEnabled(env)) return false;
  return isToggleEnabledForAgent(env.TORCH_MEMORY_RETRIEVAL_ENABLED, agentId, false);
}

export function getMemoryPruneMode(env = process.env) {
  if (!isMemoryEnabled(env)) return 'off';

  const raw = normalize(env.TORCH_MEMORY_PRUNE_ENABLED);
  if (!raw) return 'active';

  const lower = raw.toLowerCase();
  if (FALSEY.has(lower)) return 'off';
  if (['dry-run', 'dryrun', 'report', 'audit'].includes(lower)) return 'dry-run';
  return 'active';
}

export function isMemoryPruneEnabled(env = process.env) {
  return getMemoryPruneMode(env) === 'active';
}
