import { loadMemoryPromptTemplates } from './summarizer.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @typedef {'keep' | 'archive' | 'delete'} LifecycleAction
 */

/**
 * @param {number[] | null | undefined} a
 * @param {number[] | null | undefined} b
 */
function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i += 1) {
    const av = Number(a[i]) || 0;
    const bv = Number(b[i]) || 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

/**
 * @param {string[]} left
 * @param {string[]} right
 */
function hasTagOverlap(left = [], right = []) {
  if (!left.length || !right.length) return false;
  const rightSet = new Set(right);
  return left.some((tag) => rightSet.has(tag));
}

/**
 * @param {import('./schema.js').MemoryRecord} memory
 * @param {{ now: number, retentionMs: number, lowImportanceThreshold: number, recentUsageMs: number }} policy
 */
function evaluateCandidate(memory, policy) {
  const ttlExpired = Number.isInteger(memory.ttl_days)
    ? memory.created_at + (memory.ttl_days * DAY_MS) <= policy.now
    : false;
  const staleByRetention = memory.last_seen < (policy.now - policy.retentionMs);
  const lowImportance = memory.importance <= policy.lowImportanceThreshold;
  const lowRecentUsage = memory.last_seen <= (policy.now - policy.recentUsageMs);

  return {
    ttlExpired,
    staleByRetention,
    lowImportance,
    lowRecentUsage,
    candidate: !memory.pinned && (ttlExpired || staleByRetention) && lowImportance && lowRecentUsage,
  };
}

/**
 * @param {import('./schema.js').MemoryRecord[]} memories
 * @param {{ getEmbedding?: (memory: import('./schema.js').MemoryRecord) => number[] | null | undefined, similarityThreshold: number, duplicateWindowMs: number }} options
 */
function groupNearDuplicates(memories, options) {
  // Sort by created_at to enable early exit in the inner loop
  const sortedMemories = [...memories].sort((a, b) => a.created_at - b.created_at);

  const groups = [];
  const consumed = new Set();

  for (let i = 0; i < sortedMemories.length; i += 1) {
    const base = sortedMemories[i];
    if (consumed.has(base.id) || base.merged_into) continue;

    const baseEmbedding = options.getEmbedding?.(base);
    const group = [base];

    for (let j = i + 1; j < sortedMemories.length; j += 1) {
      const probe = sortedMemories[j];

      // Optimization: Since sorted by created_at, if the time difference exceeds the window,
      // all subsequent items will also be outside the window.
      if (probe.created_at - base.created_at > options.duplicateWindowMs) break;

      if (consumed.has(probe.id) || probe.merged_into || probe.id === base.id) continue;

      if (!hasTagOverlap(base.tags, probe.tags)) continue;

      const similarity = cosineSimilarity(baseEmbedding, options.getEmbedding?.(probe));
      if (similarity >= options.similarityThreshold) {
        group.push(probe);
      }
    }

    if (group.length > 1) {
      group.forEach((item) => consumed.add(item.id));
      groups.push(group.sort((a, b) => b.last_seen - a.last_seen));
    }
  }

  return groups;
}

/**
 * @param {import('./schema.js').MemoryRecord[]} group
 * @param {(prompt: string) => Promise<string> | string} [generateSummary]
 * @param {string} condenseTemplate
 */
async function condenseGroup(group, generateSummary, condenseTemplate) {
  const [primary, ...rest] = group;
  const fallbackSummary = group.map((item) => item.summary || item.content).filter(Boolean).join(' ').slice(0, 280);
  const fallback = {
    summary: fallbackSummary || primary.summary,
    importance: Math.max(...group.map((item) => item.importance)),
  };

  if (typeof generateSummary !== 'function') {
    return { merged: { ...primary, summary: fallback.summary, importance: fallback.importance }, mergedIds: rest.map((item) => item.id), usedFallback: true };
  }

  const sourceBlock = group
    .map((item) => `- id=${item.id}; tags=${item.tags.join(',')}; ts=${item.created_at}; summary=${item.summary || item.content}`)
    .join('\n');
  const prompt = [
    'Condense the following near-duplicate memories into one factual summary.',
    'Return STRICT JSON: {"summary":"...","importance":0.0}',
    'Do not invent facts.',
    '',
    `Memories:\n${sourceBlock}`,
    '',
    'If your first response is malformed, repair it using this policy:',
    condenseTemplate,
  ].join('\n');

  try {
    const raw = await generateSummary(prompt);
    const parsed = JSON.parse(raw);
    const summary = typeof parsed?.summary === 'string' && parsed.summary.trim() ? parsed.summary.trim() : fallback.summary;
    const importance = Number.isFinite(Number(parsed?.importance))
      ? Math.max(0, Math.min(1, Number(parsed.importance)))
      : fallback.importance;

    return {
      merged: {
        ...primary,
        summary,
        importance,
        tags: [...new Set(group.flatMap((item) => item.tags))],
        last_seen: Math.max(...group.map((item) => item.last_seen)),
      },
      mergedIds: rest.map((item) => item.id),
      usedFallback: false,
    };
  } catch {
    return { merged: { ...primary, summary: fallback.summary, importance: fallback.importance }, mergedIds: rest.map((item) => item.id), usedFallback: true };
  }
}

/**
 * @param {import('./schema.js').MemoryRecord[]} memories
 * @param {{
 *  retentionMs: number,
 *  now?: number,
 *  lowImportanceThreshold?: number,
 *  deleteImportanceThreshold?: number,
 *  recentUsageMs?: number,
 *  duplicateWindowMs?: number,
 *  similarityThreshold?: number,
 *  getEmbedding?: (memory: import('./schema.js').MemoryRecord) => number[] | null | undefined,
 *  generateSummary?: (prompt: string) => Promise<string> | string,
 *  templateDir?: string,
 * }} options
 */
export async function createLifecyclePlan(memories, options) {
  const now = options.now ?? Date.now();
  const policy = {
    now,
    retentionMs: options.retentionMs,
    lowImportanceThreshold: options.lowImportanceThreshold ?? 0.35,
    deleteImportanceThreshold: options.deleteImportanceThreshold ?? 0.12,
    recentUsageMs: options.recentUsageMs ?? Math.max(Math.floor(options.retentionMs / 2), DAY_MS),
    duplicateWindowMs: options.duplicateWindowMs ?? (7 * DAY_MS),
    similarityThreshold: options.similarityThreshold ?? 0.93,
  };

  const candidateById = new Map(memories.map((memory) => [memory.id, evaluateCandidate(memory, policy)]));
  const groups = groupNearDuplicates(memories.filter((memory) => !memory.pinned), {
    getEmbedding: options.getEmbedding,
    similarityThreshold: policy.similarityThreshold,
    duplicateWindowMs: policy.duplicateWindowMs,
  });

  const templates = loadMemoryPromptTemplates({ templateDir: options.templateDir });
  const condensedGroups = await Promise.all(
    groups.map((group) => condenseGroup(group, options.generateSummary, templates.condense))
  );

  const mergedIntoMap = new Map();

  for (const condensed of condensedGroups) {
    for (const mergedId of condensed.mergedIds) {
      mergedIntoMap.set(mergedId, condensed.merged.id);
    }
  }

  const protectedFromDelete = new Set(mergedIntoMap.keys());
  const actions = [];
  const policyLogs = [];

  for (const memory of memories) {
    const candidate = candidateById.get(memory.id) ?? evaluateCandidate(memory, policy);

    /** @type {LifecycleAction} */
    let action = 'keep';
    let reason = 'retained: does not satisfy low-value prune gates';

    if (memory.pinned) {
      action = 'keep';
      reason = 'retained: pinned memories are never deleted';
    } else if (mergedIntoMap.has(memory.id)) {
      action = 'archive';
      reason = `archived: merged into ${mergedIntoMap.get(memory.id)} and retained as source provenance`;
    } else if (candidate.candidate) {
      const veryLowImportance = memory.importance <= policy.deleteImportanceThreshold;
      const veryOld = memory.last_seen < (now - (policy.retentionMs * 2));
      const decisiveDelete = candidate.ttlExpired && candidate.staleByRetention && veryLowImportance && veryOld;

      if (protectedFromDelete.has(memory.id)) {
        action = 'archive';
        reason = 'archived: referenced by retained merged summary';
      } else if (decisiveDelete) {
        action = 'delete';
        reason = 'deleted: expired, very low importance, and long-unseen beyond retention grace';
      } else {
        action = 'archive';
        reason = 'archived: borderline low-value candidate; archive preferred over delete';
      }
    }

    actions.push({ id: memory.id, action, merged_into: mergedIntoMap.get(memory.id) ?? null, reason });
    policyLogs.push({
      id: memory.id,
      action,
      reason,
      signals: {
        ttlExpired: candidate.ttlExpired,
        staleByRetention: candidate.staleByRetention,
        lowImportance: candidate.lowImportance,
        lowRecentUsage: candidate.lowRecentUsage,
      },
    });
  }

  return {
    actions,
    policyLogs,
    condensedGroups,
  };
}

/**
 * @param {{
 *  archiveMemory?: (id: string, reason: string) => Promise<unknown> | unknown,
 *  deleteMemory?: (id: string, reason: string) => Promise<unknown> | unknown,
 *  keepMemory?: (id: string, reason: string) => Promise<unknown> | unknown,
 *  markMerged?: (id: string, mergedInto: string) => Promise<unknown> | unknown,
 * }} repository
 * @param {Awaited<ReturnType<typeof createLifecyclePlan>>} plan
 */
export async function applyLifecycleActions(repository, plan) {
  const results = await Promise.all(plan.actions.map(async (decision) => {
    if (decision.merged_into && typeof repository.markMerged === 'function') {
      await repository.markMerged(decision.id, decision.merged_into);
    }

    if (decision.action === 'archive') {
      await repository.archiveMemory?.(decision.id, decision.reason);
    } else if (decision.action === 'delete') {
      await repository.deleteMemory?.(decision.id, decision.reason);
    } else {
      await repository.keepMemory?.(decision.id, decision.reason);
    }

    return decision;
  }));

  return {
    applied: results,
    policyLogs: plan.policyLogs,
  };
}

/**
 * @param {import('./schema.js').MemoryRecord[]} memories
 * @param {{ retentionMs: number, now?: number }} options
 * @returns {import('./schema.js').MemoryRecord[]}
 */
export function selectPrunableMemories(memories, options) {
  const now = options.now ?? Date.now();
  const cutoff = now - options.retentionMs;

  return memories.filter((memory) => !memory.pinned && memory.last_seen < cutoff);
}


/**
 * @param {{ listPruneCandidates: (options: { cutoff: number, limit?: number }) => Promise<import('./schema.js').MemoryRecord[]> }} repository
 * @param {{ retentionMs: number, now?: number, limit?: number }} options
 */
export async function listPruneCandidates(repository, options) {
  const now = options.now ?? Date.now();
  const cutoff = now - options.retentionMs;
  return repository.listPruneCandidates({ cutoff, limit: options.limit });
}
