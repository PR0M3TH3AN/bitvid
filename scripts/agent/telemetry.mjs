import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');

const ARTIFACTS_DIR = path.join(ROOT_DIR, 'artifacts');
const REPORTS_DIR = path.join(ROOT_DIR, 'ai/reports');

const LOG_FILES = [
  'test_output.log',
  'npm_output.log',
  'server.log',
  'python_server.log'
];

// Privacy Sanitization Patterns
const PATTERNS = {
  ipv4: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  ipv6: /\b([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}\b/g,
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  hexKey: /\b[0-9a-fA-F]{64}\b/g,
  bech32: /\b(npub|nsec|note|nevent|nprofile|naddr)1[0-9a-z]{50,}\b/g,
  // Simplify paths to remove user names or absolute paths
  absPath: /(?:\/[a-zA-Z0-9_\-.]+)+\/bitvid\//g, // Try to find root of repo if possible
  genericPath: /(\/[a-zA-Z0-9_\-.]+){3,}/g, // Catch long paths
};

function sanitize(text) {
  if (!text) return text;
  let sanitized = text;

  sanitized = sanitized.replace(PATTERNS.ipv4, '<IPV4>');
  // sanitized = sanitized.replace(PATTERNS.ipv6, '<IPV6>'); // IPv6 regex is tricky, leaving it out for now to avoid false positives on simple text
  sanitized = sanitized.replace(PATTERNS.email, '<EMAIL>');
  sanitized = sanitized.replace(PATTERNS.hexKey, '<HEX_KEY>');
  sanitized = sanitized.replace(PATTERNS.bech32, '<BECH32>');

  // Custom path sanitization
  // Assuming the repo is mounted at /app in the sandbox, or we want to normalize it
  sanitized = sanitized.replace(/\/app\//g, '<REPO>/');

  // Try to mask home directories
  sanitized = sanitized.replace(/\/home\/[a-zA-Z0-9_\-.]+\//g, '<HOME>/');

  // Use defined patterns for other paths (e.g. if the repo is checked out elsewhere)
  sanitized = sanitized.replace(PATTERNS.absPath, '<REPO>/');

  // Generic path sanitization (careful to avoid breaking URLs too much, though strict PII policy prefers over-sanitization)
  // We only apply this if it looks like a long absolute path (starts with /)
  sanitized = sanitized.replace(PATTERNS.genericPath, (match) => {
    // Avoid sanitizing if it's already sanitized
    if (match.includes('<REPO>') || match.includes('<HOME>')) return match;
    return '/.../';
  });

  return sanitized;
}

function parseTestLogs(content) {
  const errors = [];
  const lines = content.split('\n');

  let currentError = null;
  let captureStack = false;

  for (const line of lines) {
    // Detect TAP failure
    if (line.match(/^not ok \d+/)) {
      if (currentError) {
        errors.push(currentError);
      }
      currentError = {
        message: line.trim(),
        stack: [],
        source: 'test_output'
      };
      captureStack = true;
      continue;
    }

    // Detect general Error
    if (line.includes('Error:') || line.includes('Exception:')) {
       // If we are already capturing a stack for a TAP failure, this is likely the detail
       if (currentError && captureStack) {
         currentError.message += ' | ' + line.trim();
       } else {
         if (currentError) {
           errors.push(currentError);
         }
         currentError = {
           message: line.trim(),
           stack: [line.trim()],
           source: 'unknown'
         };
         captureStack = true;
       }
       continue;
    }

    if (captureStack) {
      // Stack trace lines usually start with "    at " or are indented
      if (line.match(/^\s+at /) || (line.match(/^\s+/) && currentError)) {
        currentError.stack.push(line.trim());
      } else if (line.match(/^TAP version/) || line.match(/^→ Running/) || line.trim() === '') {
        // End of error block
        if (currentError) {
            errors.push(currentError);
            currentError = null;
            captureStack = false;
        }
      } else {
        // Continue capturing if it looks like part of the error report (e.g. TAP diagnostics)
        if (line.match(/^\s+/)) {
            currentError.stack.push(line.trim());
        } else {
             if (currentError) {
                errors.push(currentError);
                currentError = null;
                captureStack = false;
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

function processFiles() {
  const allErrors = [];

  for (const file of LOG_FILES) {
    const filePath = path.join(ROOT_DIR, file);
    if (fs.existsSync(filePath)) {
      console.log(`Processing ${file}...`);
      const content = fs.readFileSync(filePath, 'utf8');

      // We can add more specific parsers here
      if (file === 'test_output.log') {
        allErrors.push(...parseTestLogs(content));
      } else {
        // Generic parsing for other logs: just look for Error: blocks
        const lines = content.split('\n');
        let currentError = null;
        for (const line of lines) {
             if (line.includes('Error:')) {
                if (currentError) allErrors.push(currentError);
                currentError = {
                    message: line.trim(),
                    stack: [line.trim()],
                    source: file
                };
             } else if (currentError) {
                 if (line.match(/^\s+at /) || line.match(/^\s+/)) {
                     currentError.stack.push(line.trim());
                 } else {
                     allErrors.push(currentError);
                     currentError = null;
                 }
             }
        }
        if (currentError) allErrors.push(currentError);
      }
    } else {
      console.log(`Skipping ${file} (not found)`);
    }
  }

  return allErrors;
}

function aggregateErrors(errors) {
  const groups = {};

  for (const error of errors) {
    // Sanitize before grouping
    const sanitizedMsg = sanitize(error.message);
    const sanitizedStack = error.stack.map(sanitize).join('\n');

    // Create a fingerprint. We use the stack trace if available, otherwise the message.
    // Truncating stack to first few lines can help group similar errors with slightly different line numbers if code shifts,
    // but for now let's use the whole stack but maybe ignore line numbers?
    // Actually, exact stack match (sanitized) is a good start.

    // To make it more robust, let's remove line numbers from the fingerprint?
    // e.g. (file.js:123:45) -> (file.js)
    // For now, let's stick to sanitized stack as fingerprint.

    const fingerprint = sanitizedStack || sanitizedMsg;

    if (!groups[fingerprint]) {
      groups[fingerprint] = {
        message: sanitizedMsg,
        stack: sanitizedStack,
        count: 0,
        sources: new Set(),
        originalSample: error
      };
    }

    groups[fingerprint].count++;
    groups[fingerprint].sources.add(error.source);
  }

  return Object.values(groups).sort((a, b) => b.count - a.count);
}

function generateReport(aggregatedErrors) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const reportFile = path.join(REPORTS_DIR, `telemetry-${date}.md`);
  const jsonFile = path.join(ARTIFACTS_DIR, 'error-aggregates.json');

  // JSON Output
  if (!fs.existsSync(ARTIFACTS_DIR)) {
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  }

  // Convert sets to arrays for JSON
  const jsonOutput = aggregatedErrors.map(e => ({
      ...e,
      sources: Array.from(e.sources)
  }));

  fs.writeFileSync(jsonFile, JSON.stringify(jsonOutput, null, 2));
  console.log(`Wrote JSON artifact to ${jsonFile}`);

  // Markdown Output
  let md = `# Telemetry Report - ${new Date().toISOString().split('T')[0]}\n\n`;
  md += `**Total Unique Errors:** ${aggregatedErrors.length}\n\n`;
  md += `| Count | Message | Sources | Suggested Owner |\n`;
  md += `|-------|---------|---------|-----------------|\n`;

  const top10 = aggregatedErrors.slice(0, 10);

  for (const error of top10) {
    // Truncate message for table
    let shortMsg = error.message.replace(/\|/g, '\\|').substring(0, 80);
    if (error.message.length > 80) shortMsg += '...';

    const sources = Array.from(error.sources).join(', ');

    // Guess owner based on stack
    let owner = 'TBD';
    if (error.stack.includes('nostr')) owner = 'Nostr Team';
    if (error.stack.includes('torrent') || error.stack.includes('webtorrent')) owner = 'P2P Team';
    if (error.stack.includes('ui/') || error.stack.includes('components/')) owner = 'Frontend Team';
    if (error.stack.includes('test')) owner = 'QA';

    md += `| ${error.count} | \`${shortMsg}\` | ${sources} | ${owner} |\n`;
  }

  md += `\n## Details (Top 10)\n\n`;

  for (const [index, error] of top10.entries()) {
    md += `### ${index + 1}. ${error.message}\n`;
    md += `- **Count:** ${error.count}\n`;
    md += `- **Sources:** ${Array.from(error.sources).join(', ')}\n`;
    md += `- **Stack Trace:**\n`;
    md += `\`\`\`\n${error.stack}\n\`\`\`\n\n`;
  }

  if (!fs.existsSync(REPORTS_DIR)) {
      fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }
  fs.writeFileSync(reportFile, md);
  console.log(`Wrote Markdown report to ${reportFile}`);
}

// Main execution
try {
  const errors = processFiles();
  console.log(`Found ${errors.length} raw errors.`);
  const aggregated = aggregateErrors(errors);
  console.log(`Aggregated into ${aggregated.length} unique issues.`);
  generateReport(aggregated);
} catch (err) {
  console.error('Fatal error in telemetry script:', err);
  process.exit(1);
}
