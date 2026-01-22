import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Configuration
const ARTIFACTS_DIR = 'artifacts';
const REPORTS_DIR = 'ai/reports';
// We will dynamically discover log files in main(), but these are explicit targets if found.
const EXPLICIT_LOG_FILES = ['python_server.log', 'server.log', 'npm_output.log'];

// Regex patterns for PII sanitization
const PII_PATTERNS = [
    { name: 'EMAIL', regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[EMAIL]' },
    { name: 'IPV4', regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, replacement: '[IP]' },
    { name: 'IPV6', regex: /\b([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}\b/g, replacement: '[IPV6]' },
    // Hex keys (64 chars) - common in Nostr (private/public keys, event IDs, signatures)
    { name: 'HEX_KEY', regex: /\b[a-fA-F0-9]{64}\b/g, replacement: '[HEX_KEY]' },
    // Nostr Bech32 keys (nsec, npub, nprofile, etc.)
    { name: 'BECH32', regex: /\b(npub|nsec|note|nevent|nprofile|naddr|nrelay|ncryptsec)1[a-z0-9]{50,}\b/g, replacement: '[BECH32_KEY]' },
    // Generic path sanitization to hide user names
    { name: 'HOME_PATH', regex: /\/home\/[a-zA-Z0-9_\-.]+\//g, replacement: '$HOME/' },
    { name: 'REPO_PATH', regex: /\/app\//g, replacement: '$REPO/' } // Assuming sandbox mount point or common container path
];

function sanitize(text) {
    if (!text) return text;
    let sanitized = text;
    for (const pattern of PII_PATTERNS) {
        sanitized = sanitized.replace(pattern.regex, pattern.replacement);
    }
    return sanitized;
}

function getFingerprint(stack) {
    if (!stack) return 'unknown';
    const hash = crypto.createHash('sha256');
    hash.update(stack);
    return hash.digest('hex').substring(0, 8);
}

function suggestOwner(stack) {
    if (!stack) return 'Unassigned';
    const lowerStack = stack.toLowerCase();

    if (lowerStack.includes('js/nostr') || lowerStack.includes('nip')) return 'Protocol Team';
    if (lowerStack.includes('js/ui') || lowerStack.includes('components') || lowerStack.includes('css')) return 'Frontend Team';
    if (lowerStack.includes('auth') || lowerStack.includes('crypto')) return 'Security Team';
    if (lowerStack.includes('tests') || lowerStack.includes('spec') || lowerStack.includes('playwright')) return 'QA Team';
    if (lowerStack.includes('storage') || lowerStack.includes('db') || lowerStack.includes('cache')) return 'Storage Team';
    if (lowerStack.includes('agent') || lowerStack.includes('scripts')) return 'DevOps/Agent Team';
    if (lowerStack.includes('webtorrent') || lowerStack.includes('torrent')) return 'P2P Team';

    return 'Unassigned';
}

// -----------------------------------------------------------------------------
// Collectors
// -----------------------------------------------------------------------------

function collectUnitTests(logFile) {
    const errors = [];
    if (!fs.existsSync(logFile)) return errors;

    console.log(`Parsing unit test log: ${logFile}`);
    const content = fs.readFileSync(logFile, 'utf8');
    const lines = content.split('\n');
    let currentError = null;
    let insideErrorBlock = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Start of a TAP failure
        if (line.match(/^not ok \d+ - /)) {
            if (currentError) {
                errors.push(currentError);
            }
            const title = line.replace(/^not ok \d+ - /, '').trim();
            currentError = {
                source: `unit-test:${path.basename(logFile)}`,
                title: sanitize(title),
                details: [],
                severity: 'High'
            };
            insideErrorBlock = true;
            continue;
        }

        // Detect generic JS errors in output that aren't strictly TAP failures but cause crashes
        if (line.match(/^Error:/) || line.match(/^TypeError:/) || line.match(/^ReferenceError:/)) {
             // If we are already inside a TAP failure block, this is likely detail
             if (insideErrorBlock && currentError) {
                 currentError.details.push(sanitize(line));
             } else {
                 // Independent error (crash?)
                 if (currentError) {
                     errors.push(currentError);
                 }
                 currentError = {
                    source: `unit-test-crash:${path.basename(logFile)}`,
                    title: sanitize(line.trim()),
                    details: [sanitize(line.trim())],
                    severity: 'Critical'
                 };
                 insideErrorBlock = true; // Treat as error block
             }
             continue;
        }

        // End of failure block detection (heuristic)
        if (insideErrorBlock) {
             // TAP ok line, or start of a new test section (Running tests/...), or TAP version
             if (line.match(/^(ok \d+|# tests \d+|1\.\.\d+|TAP version|→ Running )/)) {
                 insideErrorBlock = false;
                 errors.push(currentError);
                 currentError = null;
             } else {
                 // Capture detail lines
                 currentError.details.push(sanitize(line));
             }
        }
    }

    if (currentError) {
        errors.push(currentError);
    }

    // Post-process for stack/fingerprint
    errors.forEach(e => {
        const fullText = e.details.join('\n');
        // Try to extract stack trace
        const stackMatch = fullText.match(/stack: \|-([\s\S]+?)(?:\n\s*\w+:|$)/) || fullText.match(/(?:Error|Exception):([\s\S]+)/);
        if (stackMatch) {
            e.stack = stackMatch[1].trim();
        } else {
            e.stack = fullText.trim() || e.title;
        }
        e.fingerprint = getFingerprint(e.stack);
        e.owner = suggestOwner(e.stack);
    });

    return errors;
}

function collectGenericLogs(filepath, sourceName) {
    const errors = [];
    if (!fs.existsSync(filepath)) return errors;

    const content = fs.readFileSync(filepath, 'utf8');
    const lines = content.split('\n');
    let currentError = null;

    for (const line of lines) {
        const isErrorStart = /Error:|Exception:|FAIL|CRITICAL/.test(line);
        // Indented lines or lines starting with 'at ' often follow errors
        const isStackLine = /^\s+at /.test(line) || /^\s+/.test(line);

        if (isErrorStart) {
            if (currentError) {
                errors.push(currentError);
            }
            currentError = {
                source: sourceName,
                title: sanitize(line.trim()),
                details: [sanitize(line.trim())],
                severity: 'High'
            };
        } else if (currentError && isStackLine) {
            currentError.details.push(sanitize(line.trim()));
        } else if (currentError) {
            // End of error block if we hit a non-indented line
            errors.push(currentError);
            currentError = null;
        }
    }

    if (currentError) {
        errors.push(currentError);
    }

    // Post-process
    errors.forEach(e => {
        e.stack = e.details.join('\n');
        e.fingerprint = getFingerprint(e.stack);
        e.owner = suggestOwner(e.stack);
    });

    return errors;
}

function collectSmokeTests() {
    const errors = [];
    if (!fs.existsSync(ARTIFACTS_DIR)) return errors;

    const files = fs.readdirSync(ARTIFACTS_DIR).filter(f => f.startsWith('smoke-report-') && f.endsWith('.json'));

    for (const file of files) {
        try {
            const content = JSON.parse(fs.readFileSync(path.join(ARTIFACTS_DIR, file), 'utf8'));
            if (content.stats && content.stats.failures > 0) {
                const failedSteps = content.stats.details.filter(d => !d.success);
                for (const step of failedSteps) {
                    const sanitizedError = sanitize(step.error);
                    errors.push({
                        source: 'smoke-test',
                        title: sanitize(`Smoke Test Failed: ${step.name}`),
                        details: [sanitizedError],
                        stack: sanitizedError,
                        fingerprint: getFingerprint(sanitizedError + step.name),
                        severity: 'Critical',
                        owner: suggestOwner(sanitizedError) || 'QA Team'
                    });
                }
            }
        } catch (err) {
            console.warn(`Failed to parse smoke report ${file}:`, err.message);
        }
    }
    return errors;
}

function collectAgentLogs() {
    const errors = [];
    if (!fs.existsSync(ARTIFACTS_DIR)) return errors;

    // Look for any .log files in artifacts that aren't the main ones we already checked (if any)
    const files = fs.readdirSync(ARTIFACTS_DIR).filter(f => f.endsWith('.log'));

    for (const file of files) {
        errors.push(...collectGenericLogs(path.join(ARTIFACTS_DIR, file), `agent-log:${file}`));
    }
    return errors;
}

// -----------------------------------------------------------------------------
// Aggregation
// -----------------------------------------------------------------------------

function aggregate(errors) {
    const grouped = {};

    for (const err of errors) {
        const key = err.fingerprint;
        if (!grouped[key]) {
            grouped[key] = {
                fingerprint: key,
                title: err.title,
                count: 0,
                sources: new Set(),
                severity: err.severity,
                stack: err.stack,
                owner: err.owner
            };
        }
        grouped[key].count++;
        grouped[key].sources.add(err.source);
        // Escalating severity if we see critical
        if (err.severity === 'Critical') grouped[key].severity = 'Critical';
    }

    return Object.values(grouped).sort((a, b) => {
        // Sort by Severity (Critical > High > Medium) then Count (Desc)
        const severityScore = { 'Critical': 3, 'High': 2, 'Medium': 1 };
        const scoreA = severityScore[a.severity] || 0;
        const scoreB = severityScore[b.severity] || 0;

        if (scoreA !== scoreB) return scoreB - scoreA;
        return b.count - a.count;
    });
}

// -----------------------------------------------------------------------------
// Reporting
// -----------------------------------------------------------------------------

function generateReport(aggregates) {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `telemetry-${dateStr}.md`;
    const filepath = path.join(REPORTS_DIR, filename);

    if (!fs.existsSync(REPORTS_DIR)) {
        fs.mkdirSync(REPORTS_DIR, { recursive: true });
    }

    let md = `# Telemetry Report - ${new Date().toISOString().slice(0,10)}\n\n`;
    md += `**Total Unique Issues:** ${aggregates.length}\n`;
    md += `**Generated:** ${new Date().toISOString()}\n\n`;

    md += `## Top 10 Priority Issues\n\n`;
    md += `| Priority | Count | Issue | Owner | Sources |\n`;
    md += `| :--- | :---: | :--- | :--- | :--- |\n`;

    const top10 = aggregates.slice(0, 10);

    for (const item of top10) {
        // Truncate title
        const titleShort = item.title.length > 60 ? item.title.substring(0, 57) + '...' : item.title;
        // Escape pipes for Markdown table
        const titleSafe = titleShort.replace(/\|/g, '\\|');
        md += `| **${item.severity}** | ${item.count} | ${titleSafe} | ${item.owner} | ${Array.from(item.sources).join(', ')} |\n`;
    }

    md += `\n## Detailed Breakdown\n\n`;

    for (const item of top10) {
        md += `### [${item.severity}] ${item.title}\n`;
        md += `- **Occurrences:** ${item.count}\n`;
        md += `- **Sources:** ${Array.from(item.sources).join(', ')}\n`;
        md += `- **Suggested Owner:** ${item.owner}\n`;
        md += `- **Fingerprint:** \`${item.fingerprint}\`\n`;
        md += `\n**Stack Trace / Details:**\n`;
        md += "```\n";
        md += item.stack || "No stack trace available";
        md += "\n```\n\n";
    }

    // Privacy note
    md += `\n---\n*Privacy Notice: PII (IPs, emails, keys) has been sanitized from this report.*\n`;

    fs.writeFileSync(filepath, md);
    console.log(`Report generated: ${filepath}`);
    return filepath;
}

function generateJSONArtifact(aggregates) {
    if (!fs.existsSync(ARTIFACTS_DIR)) {
        fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
    }
    const filepath = path.join(ARTIFACTS_DIR, 'error-aggregates.json');
    // Convert Set to Array for JSON
    const data = aggregates.map(a => ({
        ...a,
        sources: Array.from(a.sources)
    }));
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    console.log(`Artifact generated: ${filepath}`);
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function main() {
    console.log('Starting Telemetry Aggregation...');

    // 1. Collect
    const errors = [];

    // Unit Tests - Dynamically find test_unit*.log
    const files = fs.readdirSync('.');
    const testLogs = files.filter(f => f.startsWith('test_unit') && f.endsWith('.log'));

    for (const logFile of testLogs) {
        const unitTestErrors = collectUnitTests(logFile);
        console.log(`Collected ${unitTestErrors.length} unit test errors from ${logFile}.`);
        errors.push(...unitTestErrors);
    }

    // Explicit generic logs
    for (const logFile of EXPLICIT_LOG_FILES) {
        const genericErrors = collectGenericLogs(logFile, logFile);
        console.log(`Collected ${genericErrors.length} errors from ${logFile}.`);
        errors.push(...genericErrors);
    }

    // Smoke Tests
    const smokeTestErrors = collectSmokeTests();
    console.log(`Collected ${smokeTestErrors.length} smoke test errors.`);
    errors.push(...smokeTestErrors);

    // Agent Logs
    const agentErrors = collectAgentLogs();
    console.log(`Collected ${agentErrors.length} agent log errors.`);
    errors.push(...agentErrors);

    // 2. Aggregate
    const aggregates = aggregate(errors);
    console.log(`Aggregated into ${aggregates.length} unique issues.`);

    // 3. Report
    generateJSONArtifact(aggregates);
    generateReport(aggregates);

    console.log('Telemetry Aggregation Complete.');
}

main();
