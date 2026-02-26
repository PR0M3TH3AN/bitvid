import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_TEMPLATE_DIR = path.resolve(__dirname, '../../prompts/memory');
const TEMPLATE_FILES = {
  summarize: 'summarize_prompt.txt',
  condense: 'condense_prompt.txt',
  score: 'score_prompt.txt',
  prune: 'prune_prompt.txt',
};

const templateCache = new Map();

function redactObviousPii(text) {
  if (typeof text !== 'string' || text.length === 0) return '';
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted:email]')
    .replace(/\b(?:\+?\d{1,2}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})\b/g, '[redacted:phone]')
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[redacted:ssn]');
}

function renderTemplate(template, replacements) {
  return Object.entries(replacements).reduce(
    (output, [key, value]) => output.replaceAll(`{{${key}}}`, String(value ?? '')),
    template
  );
}

export function loadMemoryPromptTemplates(options = {}) {
  const templateDir = options.templateDir ?? DEFAULT_TEMPLATE_DIR;
  if (templateCache.has(templateDir)) {
    return templateCache.get(templateDir);
  }

  const templates = Object.fromEntries(
    Object.entries(TEMPLATE_FILES).map(([key, fileName]) => {
      const filePath = path.join(templateDir, fileName);
      const content = readFileSync(filePath, 'utf8').trim();
      return [key, content];
    })
  );

  templateCache.set(templateDir, templates);
  return templates;
}

function parseSummaryPayload(rawResponse) {
  const parsed = JSON.parse(rawResponse);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError('Response must be a JSON object');
  }

  const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
  if (!summary) {
    throw new TypeError('Response.summary must be a non-empty string');
  }

  const rawImportance = Number(parsed.importance);
  const importance = Number.isFinite(rawImportance)
    ? Math.min(1, Math.max(0, rawImportance))
    : 0.25;

  return { summary, importance };
}

function deterministicFallback(events, maxSummaryLength) {
  const joined = events.map((event) => redactObviousPii(event.content)).join(' ').trim();
  const bounded = joined.length > maxSummaryLength ? `${joined.slice(0, maxSummaryLength - 1)}…` : joined;
  return { summary: bounded, importance: 0.25 };
}

function isLikelyFactual(summary, sourceText) {
  const sourceTokens = new Set(
    sourceText
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 3)
  );
  const summaryTokens = summary
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 3);

  if (!summaryTokens.length) return true;
  const overlap = summaryTokens.filter((token) => sourceTokens.has(token)).length;
  return overlap / summaryTokens.length >= 0.35;
}

function sanitizeResult(parsed, sourceText, maxSummaryLength, fallback) {
  const sanitizedSummary = redactObviousPii(parsed.summary);
  if (!isLikelyFactual(sanitizedSummary, sourceText)) {
    return fallback;
  }

  return {
    summary: sanitizedSummary.length > maxSummaryLength
      ? `${sanitizedSummary.slice(0, maxSummaryLength - 1)}…`
      : sanitizedSummary,
    importance: parsed.importance,
  };
}

/**
 * @param {import('./schema.js').MemoryEvent[]} events
 * @param {{
 *  maxSummaryLength?: number,
 *  generateSummary?: (prompt: string) => Promise<string> | string,
 *  templateDir?: string,
 * }} [options]
 * @returns {Promise<{ summary: string, importance: number }>}
 */
export async function summarizeEvents(events, options = {}) {
  const maxSummaryLength = options.maxSummaryLength ?? 280;
  const fallback = deterministicFallback(events, maxSummaryLength);
  if (!fallback.summary) return fallback;

  const templates = loadMemoryPromptTemplates(options);
  const sourceText = events.map((event) => redactObviousPii(event.content)).join('\n').trim();
  const generateSummary = options.generateSummary;

  if (typeof generateSummary !== 'function') {
    return fallback;
  }

  const summaryPrompt = renderTemplate(templates.summarize, {
    EVENTS: sourceText,
    MAX_SUMMARY_LENGTH: maxSummaryLength,
  });

  let firstResponse = '';
  try {
    firstResponse = await generateSummary(summaryPrompt);
    const parsed = parseSummaryPayload(firstResponse);
    return sanitizeResult(parsed, sourceText, maxSummaryLength, fallback);
  } catch (firstError) {
    try {
      const repairPrompt = renderTemplate(templates.condense, {
        RAW_RESPONSE: firstResponse,
        PARSE_ERROR: firstError instanceof Error ? firstError.message : 'unknown_parse_error',
      });
      const repairedResponse = await generateSummary(repairPrompt);
      const parsed = parseSummaryPayload(repairedResponse);
      return sanitizeResult(parsed, sourceText, maxSummaryLength, fallback);
    } catch {
      return fallback;
    }
  }
}
