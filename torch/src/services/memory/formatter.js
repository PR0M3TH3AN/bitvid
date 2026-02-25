import { isMemoryRetrievalEnabled } from './feature-flags.js';
export { isMemoryRetrievalEnabled } from './feature-flags.js';
const DEFAULT_TOKEN_BUDGET = 1000;
const DEFAULT_MAX_SUMMARY_CHARS = 240;
const DEFAULT_MAX_CONTEXT_CHARS = 320;
const MEMORY_CONTEXT_HEADER = '[CONTEXT — Relevant memories]';

function clampString(value, maxChars) {
  if (typeof value !== 'string') return '';
  if (!Number.isFinite(maxChars) || maxChars <= 0) return '';
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 1))}…`;
}

/**
 * Fast heuristic (approx 4 chars/token) suitable for guardrail budgeting.
 * @param {string} text
 */
export function estimateTokenCount(text) {
  const normalized = String(text ?? '');
  if (normalized.length === 0) return 0;
  return Math.ceil(normalized.length / 4);
}

/**
 * @param {import('./schema.js').MemoryRecord} memory
 * @param {{ maxSummaryChars?: number, maxContextChars?: number }} [options]
 */
export function formatMemoryBlock(memory, options = {}) {
  const summary = clampString(memory.summary ?? '', options.maxSummaryChars ?? DEFAULT_MAX_SUMMARY_CHARS);
  const shortContext = clampString(memory.content ?? '', options.maxContextChars ?? DEFAULT_MAX_CONTEXT_CHARS);
  const timestamp = new Date(memory.created_at).toISOString();
  const tags = Array.isArray(memory.tags) ? memory.tags.join(',') : '';

  return {
    id: memory.id,
    timestamp,
    importance: Number(memory.importance ?? 0).toFixed(2),
    summary,
    short_context: shortContext,
    tags,
  };
}


function fitBlockToBudget(memory, options, maxTokens) {
  let maxSummaryChars = options.maxSummaryChars ?? DEFAULT_MAX_SUMMARY_CHARS;
  let maxContextChars = options.maxContextChars ?? DEFAULT_MAX_CONTEXT_CHARS;

  while (maxSummaryChars >= 8 && maxContextChars >= 8) {
    const block = formatMemoryBlock(memory, { maxSummaryChars, maxContextChars });
    const line = blockToLine(block);
    if (estimateTokenCount(line) <= maxTokens) {
      return { block, line };
    }

    if (maxContextChars >= maxSummaryChars) {
      maxContextChars = Math.max(8, Math.floor(maxContextChars * 0.7));
    } else {
      maxSummaryChars = Math.max(8, Math.floor(maxSummaryChars * 0.7));
    }

    if (maxSummaryChars === 8 && maxContextChars === 8) break;
  }

  const block = formatMemoryBlock(memory, { maxSummaryChars: 8, maxContextChars: 8 });
  return { block, line: blockToLine(block) };
}
function blockToLine(block) {
  return `[${block.id}, ${block.timestamp}, ${block.importance}, ${block.summary}, ${block.short_context}, ${block.tags}]`;
}

/**
 * @param {import('./schema.js').MemoryRecord[]} memories
 * @param {{ k?: number, tokenBudget?: number, maxSummaryChars?: number, maxContextChars?: number }} [options]
 */
export function formatMemoriesForPrompt(memories, options = {}) {
  const k = Number.isFinite(options.k) && options.k > 0 ? Math.floor(options.k) : memories.length;
  const tokenBudget = Number.isFinite(options.tokenBudget) && options.tokenBudget > 0
    ? Math.floor(options.tokenBudget)
    : DEFAULT_TOKEN_BUDGET;

  const blocks = [];
  let usedTokens = 0;

  for (const memory of memories.slice(0, k)) {
    const remainingTokens = tokenBudget - usedTokens;
    if (remainingTokens <= 0) break;

    const fitted = fitBlockToBudget(memory, options, remainingTokens);
    const block = fitted.block;
    const line = fitted.line;
    const lineTokens = estimateTokenCount(line);

    if (usedTokens + lineTokens > tokenBudget) {
      break;
    }

    blocks.push(block);
    usedTokens += lineTokens;
  }

  return {
    blocks,
    text: blocks.map(blockToLine).join('\n'),
    usedTokens,
    truncated: blocks.length < Math.min(k, memories.length),
  };
}

function toContextString(agentContext) {
  if (typeof agentContext === 'string') {
    return agentContext.trim();
  }

  if (agentContext == null) {
    return '';
  }

  if (Array.isArray(agentContext)) {
    return agentContext.map((value) => String(value)).join('\n').trim();
  }

  if (typeof agentContext === 'object') {
    try {
      return JSON.stringify(agentContext);
    } catch {
      return String(agentContext).trim();
    }
  }

  return String(agentContext).trim();
}

/**
 * Builds a final prompt with retrieved memory context inserted ahead of the base prompt.
 *
 * @param {{
 *  basePrompt: string,
 *  userRequest: string,
 *  agentContext?: unknown,
 *  agent_id: string,
 *  memoryService: { getRelevantMemories: (params: { agent_id: string, query: string, k?: number }) => Promise<import('./schema.js').MemoryRecord[]> | import('./schema.js').MemoryRecord[] },
 *  retrievalK?: number,
 *  tokenBudget?: number,
 *  env?: Record<string, string | undefined>
 * }} params
 */
export async function renderPromptWithMemoryContext(params) {
  const {
    basePrompt,
    userRequest,
    agentContext,
    agent_id,
    memoryService,
    retrievalK = 5,
    tokenBudget = 320,
    env = process.env,
  } = params;

  if (!isMemoryRetrievalEnabled(agent_id, env)) {
    return String(basePrompt ?? '');
  }

  const requestText = String(userRequest ?? '').trim();
  const contextText = toContextString(agentContext);
  const query = [requestText, contextText].filter(Boolean).join('\n\n');

  if (!query || !memoryService?.getRelevantMemories) {
    return String(basePrompt ?? '');
  }

  const memories = await memoryService.getRelevantMemories({
    agent_id,
    query,
    k: retrievalK,
  });

  if (memoryService?.updateMemoryUsage) {
    const now = Date.now();
    await Promise.all((memories ?? []).map((memory) => memoryService.updateMemoryUsage(memory.id, now)));
  }

  const rendered = formatMemoriesForPrompt(memories ?? [], {
    k: retrievalK,
    tokenBudget,
  });

  if (!rendered.text) {
    return String(basePrompt ?? '');
  }

  return `${MEMORY_CONTEXT_HEADER}\n${rendered.text}\n\n${String(basePrompt ?? '')}`;
}
