#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Navigate up from scripts/agent/ to root
const ROOT_DIR = path.resolve(__dirname, '../../');
const ARTIFACTS_DIR = path.join(ROOT_DIR, 'artifacts');
const REPORTS_DIR = path.join(ROOT_DIR, 'ai/reports');
const AGGREGATE_FILE = path.join(ARTIFACTS_DIR, 'error-aggregates.json');

// Ensure reports dir exists
if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

/**
 * Strips PII from text.
 * @param {string} text
 * @returns {string}
 */
function sanitize(text) {
  if (!text) return '';

  // Emails
  text = text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');

  // IPv4 - simple matching
  text = text.replace(/\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g, '[IP]');

  // Nostr Bech32 Keys (nsec, npub, etc.)
  text = text.replace(/\b(nsec|npub|nprofile|nevent|naddr|nrelay|ncryptsec)1[a-z0-9]+\b/g, '[KEY]');

  // Hex Keys (64 chars) - e.g. private keys or signatures
  text = text.replace(/\b[a-f0-9]{64}\b/g, '[HEX_KEY]');

  return text;
}

/**
 * Generates a fingerprint for the error based on stack trace.
 * @param {string} stack
 * @returns {string}
 */
function getFingerprint(stack) {
  const hash = crypto.createHash('sha256');
  hash.update(stack);
  return hash.digest('hex').substring(0, 8);
}

/**
 * Suggests an owner based on the stack trace content.
 * @param {string} stack
 * @returns {string}
 */
function suggestOwner(stack) {
  const lowerStack = stack.toLowerCase();

  if (lowerStack.includes('js/nostr') || lowerStack.includes('nip')) return 'Protocol Team';
  if (lowerStack.includes('js/ui') || lowerStack.includes('components') || lowerStack.includes('css')) return 'Frontend Team';
  if (lowerStack.includes('auth') || lowerStack.includes('crypto')) return 'Security Team';
  if (lowerStack.includes('tests') || lowerStack.includes('spec')) return 'QA Team';
  if (lowerStack.includes('storage') || lowerStack.includes('db')) return 'Storage Team';
  if (lowerStack.includes('agent') || lowerStack.includes('scripts')) return 'DevOps/Agent Team';

  return 'Unassigned';
}

/**
 * Parses log content into a list of error objects.
 * @param {string} content
 * @param {string} filename
 * @returns {Array}
 */
function parseLogFile(content, filename) {
  const errors = [];
  const lines = content.split('\n');

  let currentError = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Heuristics for error detection
    const isStackLine = /^\s+at /.test(line);
    // Detect "Error:", "Exception", or "FAIL" (test output)
    const isErrorStart = (/Error:|Exception|FAIL/.test(line)) && !isStackLine;

    if (isErrorStart) {
      if (currentError) {
        errors.push(currentError);
      }
      currentError = {
        message: line.trim(),
        stack: [line.trim()],
        file: filename
      };
    } else if (isStackLine && currentError) {
      currentError.stack.push(line.trim());
    } else if (currentError && line.trim() !== '') {
      // If we see a non-empty line:
      // If it looks like a timestamped log line "[2023...]", it's probably a new log entry, so close the error.
      if (/^\[.*?\]/.test(line)) {
        errors.push(currentError);
        currentError = null;
        // If this line itself is an error start, we'll catch it in the next iteration
        // effectively, but since we are iterating line by line, we need to handle it.
        // Actually, if this line IS an error start, the `isErrorStart` check would have caught it if we structure the loop right.
        // But `isErrorStart` was checked at the top.
        // So if we are "in an error" and see a timestamp, we close the error.
        // But wait, what if the timestamp line IS the error line?
        // e.g. [2023...] ERROR: something
        // In that case `isErrorStart` would be true (if it contains Error:).
        // So this block handles lines that are NOT `isErrorStart` but ARE part of the previous error.
        // If it's a timestamp line and NOT an error start, it's just a regular log, so close the previous error.
      } else {
        // Just text, assume it's part of the error message/stack unless we already had stack frames and this stopped being one.
        const hasStackFrames = currentError.stack.some(l => l.startsWith('at '));
        if (hasStackFrames && !isStackLine) {
           // We had stack frames, and now we don't. Probably end of error.
           errors.push(currentError);
           currentError = null;
        } else {
           // Append to message/stack
           currentError.stack.push(line.trim());
           if (!hasStackFrames) {
               currentError.message += ' ' + line.trim();
           }
        }
      }
    }
  }

  if (currentError) {
    errors.push(currentError);
  }

  return errors;
}

function main() {
  if (!fs.existsSync(ARTIFACTS_DIR)) {
    console.log(`Artifacts directory not found at ${ARTIFACTS_DIR}`);
    return;
  }

  const aggregates = {};
  const files = fs.readdirSync(ARTIFACTS_DIR);

  console.log(`Scanning ${files.length} files in ${ARTIFACTS_DIR}...`);

  for (const file of files) {
    if (file.endsWith('.json') && file !== 'error-aggregates.json') {
         // TODO: Handle JSON logs if schema is known. For now, skipping or treating as text if needed.
         // If it's the load report, we might want to skip or parse differently.
         continue;
    }
    if (file === 'error-aggregates.json') continue;

    // Skip directories
    const filePath = path.join(ARTIFACTS_DIR, file);
    if (fs.statSync(filePath).isDirectory()) continue;

    console.log(`Processing ${file}...`);
    const content = fs.readFileSync(filePath, 'utf8');
    const errors = parseLogFile(content, file);

    for (const err of errors) {
      const sanitizedStack = sanitize(err.stack.join('\n'));
      const sanitizedMsg = sanitize(err.message);
      const fingerprint = getFingerprint(sanitizedStack);

      if (!aggregates[fingerprint]) {
        aggregates[fingerprint] = {
          fingerprint,
          message: sanitizedMsg,
          stack: sanitizedStack,
          count: 0,
          sources: new Set(),
          owner: suggestOwner(sanitizedStack)
        };
      }

      aggregates[fingerprint].count++;
      aggregates[fingerprint].sources.add(file);
    }
  }

  // Convert Set to Array for JSON
  const resultList = Object.values(aggregates).map(a => ({
      ...a,
      sources: Array.from(a.sources)
  })).sort((a, b) => b.count - a.count);

  console.log(`Found ${resultList.length} unique errors.`);

  // Save JSON
  fs.writeFileSync(AGGREGATE_FILE, JSON.stringify(resultList, null, 2));
  console.log(`Saved aggregate data to ${AGGREGATE_FILE}`);

  // Generate Markdown
  const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const reportPath = path.join(REPORTS_DIR, `telemetry-${dateStr}.md`);

  let mdContent = `# Telemetry Report ${dateStr}\n\n`;
  mdContent += `**Total Unique Errors:** ${resultList.length}\n`;
  mdContent += `**Total Occurrences:** ${resultList.reduce((sum, i) => sum + i.count, 0)}\n\n`;

  mdContent += `## Top Errors\n\n`;

  resultList.slice(0, 10).forEach((err, idx) => {
      mdContent += `### ${idx + 1}. ${err.message.substring(0, 100)}${err.message.length > 100 ? '...' : ''}\n\n`;
      mdContent += `- **Count:** ${err.count}\n`;
      mdContent += `- **Suggested Owner:** ${err.owner}\n`;
      mdContent += `- **Fingerprint:** \`${err.fingerprint}\`\n`;
      mdContent += `- **Sources:** ${err.sources.join(', ')}\n`;
      mdContent += `\n\`\`\`text\n${err.stack}\n\`\`\`\n\n`;
  });

  fs.writeFileSync(reportPath, mdContent);
  console.log(`Report generated at ${reportPath}`);
}

main();
