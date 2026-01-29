import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Configuration
const ARTIFACTS_DIR = 'artifacts';
const REPORTS_DIR = 'ai/reports';
// Generic logs
const GENERIC_LOG_FILES = ['server.log', 'serve.log', 'python_server.log', 'npm_output.log'];

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

function findUnitTestLogs() {
    const logs = [];
    if (fs.existsSync('.')) {
        const rootFiles = fs.readdirSync('.').filter(f => f.match(/^test_unit.*\.log$/) || f === 'test_output.log');
        logs.push(...rootFiles);
    }

    if (fs.existsSync(ARTIFACTS_DIR)) {
        const artifactFiles = fs.readdirSync(ARTIFACTS_DIR)
            .filter(f => f.match(/^test_unit.*\.log$/) || f === 'test_output.log')
            .map(f => path.join(ARTIFACTS_DIR, f));
        logs.push(...artifactFiles);
    }
    return [...new Set(logs)]; // Unique paths
}

function collectUnitTests(filepath) {
    const errors = [];
    if (!fs.existsSync(filepath)) return errors;

    const content = fs.readFileSync(filepath, 'utf8');
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
                source: `unit-test:${path.basename(filepath)}`,
                title: sanitize(title),
                details: [],
                severity: 'High'
            };
            insideErrorBlock = true;
            continue;
        }

        // End of failure block detection (heuristic)
        // TAP ok line, or start of a new test section, or unexpected unindented line that looks like a header
        if (insideErrorBlock) {
             if (line.match(/^(ok \d+|# tests \d+|1\.\.\d+|TAP version)/)) {
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
        const stackMatch = fullText.match(/stack: \|-([\s\S]+?)(?:\n\s*\w+:|$)/) || fullText.match(/Error:([\s\S]+)/);
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
        // Simple heuristic for generic logs: look for "Error:" or "Exception:"
        // and capture following lines that look like stack traces (start with 'at ' or are indented)

        const isErrorStart = /Error:|Exception:|FAIL|CRITICAL/.test(line);
        const isStackLine = /^\s+at /.test(line) || /^\s+/.test(line); // Indented lines often follow errors

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
            // End of error block
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

    // Look for smoke-summary-*.json
    const files = fs.readdirSync(ARTIFACTS_DIR).filter(f => f.startsWith('smoke-summary-') && f.endsWith('.json'));

    for (const file of files) {
        try {
            const content = JSON.parse(fs.readFileSync(path.join(ARTIFACTS_DIR, file), 'utf8'));

            // Expected format: { timestamp, status, error, logs }
            if (content.status && (content.status.toLowerCase() === 'failure' || content.status.toLowerCase() === 'fail')) {
                const errorMsg = content.error || 'Unknown Smoke Test Failure';
                const sanitizedError = sanitize(errorMsg);

                // Combine relevant logs if available for context
                const logs = (content.logs || [])
                    .map(l => sanitize(l))
                    .join('\n')
                    .substring(0, 2000); // Limit size

                errors.push({
                    source: 'smoke-test',
                    title: `Smoke Test Failed: ${sanitizedError.split('\n')[0]}`,
                    details: content.logs ? content.logs.map(sanitize) : [],
                    stack: sanitizedError + (logs ? '\n\nContext Logs:\n' + logs : ''),
                    fingerprint: getFingerprint(sanitizedError),
                    severity: 'Critical',
                    owner: suggestOwner(sanitizedError) || 'QA Team'
                });
            }
        } catch (err) {
            console.warn(`Failed to parse smoke summary ${file}:`, err.message);
        }
    }
    return errors;
}

function collectFuzzReports() {
    const errors = [];
    if (!fs.existsSync(ARTIFACTS_DIR)) return errors;

    // Look for fuzz-report-*.json
    const files = fs.readdirSync(ARTIFACTS_DIR).filter(f => f.startsWith('fuzz-report-') && f.endsWith('.json'));

    for (const file of files) {
        try {
            const content = JSON.parse(fs.readFileSync(path.join(ARTIFACTS_DIR, file), 'utf8'));

            // Support both 'crashes' (fuzz-shared.mjs) and 'issues' (fuzz-lib.mjs)
            const crashes = content.crashes || content.issues || [];

            for (const crash of crashes) {
                // Crash structure might vary slightly
                // fuzz-shared: { error: { message, stack }, reproducer }
                // fuzz-lib: { message, stack, hash, input }

                let message = crash.message;
                let stack = crash.stack;

                if (!message && crash.error) {
                    message = crash.error.message;
                    stack = crash.error.stack;
                }

                if (!message) continue;

                const sanitizedMessage = sanitize(message);
                const sanitizedStack = sanitize(stack || message);

                errors.push({
                    source: `fuzz-test:${content.target || 'unknown'}`,
                    title: `Fuzz Crash: ${sanitizedMessage}`,
                    details: [sanitizedStack],
                    stack: sanitizedStack,
                    fingerprint: getFingerprint(sanitizedStack),
                    severity: 'High',
                    owner: suggestOwner(sanitizedStack)
                });
            }
        } catch (err) {
            console.warn(`Failed to parse fuzz report ${file}:`, err.message);
        }
    }
    return errors;
}

function collectLoadTests() {
    const errors = [];
    if (!fs.existsSync(ARTIFACTS_DIR)) return errors;

    const files = fs.readdirSync(ARTIFACTS_DIR).filter(f => f.startsWith('load-report-') && f.endsWith('.json'));
    // Also check load-report.json
    if (fs.existsSync(path.join(ARTIFACTS_DIR, 'load-report.json'))) {
        files.push('load-report.json');
    }

    const uniqueFiles = [...new Set(files)];

    for (const file of uniqueFiles) {
        try {
            const content = JSON.parse(fs.readFileSync(path.join(ARTIFACTS_DIR, file), 'utf8'));

            // Check for explicit errors
            if (content.metrics && content.metrics.errors > 0) {
                 const errorBreakdown = content.metrics.error_breakdown ? JSON.stringify(content.metrics.error_breakdown, null, 2) : 'No breakdown';
                 const sanitizedBreakdown = sanitize(errorBreakdown);
                 errors.push({
                    source: `load-test:${file}`,
                    title: `Load Test Errors: ${content.metrics.errors} failures`,
                    details: [sanitizedBreakdown],
                    stack: `Load Test Errors:\n${sanitizedBreakdown}`,
                    fingerprint: getFingerprint(`load-test-errors-${sanitizedBreakdown}`),
                    severity: 'High',
                    owner: 'P2P Team'
                });
            }

            // Check for bottlenecks
            if (content.bottlenecks && content.bottlenecks.length > 0) {
                for (let i = 0; i < content.bottlenecks.length; i++) {
                     const bn = content.bottlenecks[i];
                     const rem = content.remediation ? content.remediation[i] : '';
                     const sanitizedBn = sanitize(bn);
                     errors.push({
                        source: `load-test:${file}`,
                        title: `Load Test Bottleneck: ${sanitizedBn}`,
                        details: [sanitize(rem)],
                        stack: `Bottleneck: ${sanitizedBn}\nRemediation: ${sanitize(rem)}`,
                        fingerprint: getFingerprint(`load-test-bottleneck-${sanitizedBn}`),
                        severity: 'Medium',
                        owner: 'P2P Team'
                     });
                }
            }

        } catch (err) {
            console.warn(`Failed to parse load report ${file}:`, err.message);
        }
    }
    return errors;
}

function collectAgentLogs() {
    const errors = [];
    if (!fs.existsSync(ARTIFACTS_DIR)) return errors;

    // Look for any .log files in artifacts
    const files = fs.readdirSync(ARTIFACTS_DIR).filter(f => f.endsWith('.log'));

    for (const file of files) {
        // Avoid reparsing if we have specific logic
        if (file.match(/^test_unit.*\.log$/) || file === 'test_output.log') continue;
        if (GENERIC_LOG_FILES.includes(file)) continue;

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
    const enabled = process.env.ENABLE_TELEMETRY === 'true' || process.env.ENABLE_TELEMETRY === '1';
    if (!enabled) {
        console.log('Telemetry is opt-in. Set ENABLE_TELEMETRY=true to run.');
        process.exit(0);
    }

    console.log('Starting Telemetry Aggregation...');

    // 1. Collect
    const errors = [];

    // Unit Tests (TAP logs)
    const unitTestLogs = findUnitTestLogs();
    for (const logFile of unitTestLogs) {
        const unitErrors = collectUnitTests(logFile);
        if (unitErrors.length > 0) {
            console.log(`Collected ${unitErrors.length} unit test errors from ${logFile}.`);
            errors.push(...unitErrors);
        }
    }

    // Generic Logs
    for (const logFile of GENERIC_LOG_FILES) {
        // Check root
        if (fs.existsSync(logFile)) {
             const genericErrors = collectGenericLogs(logFile, logFile);
             if (genericErrors.length > 0) errors.push(...genericErrors);
        }
        // Check artifacts
        const artifactPath = path.join(ARTIFACTS_DIR, logFile);
        if (fs.existsSync(artifactPath)) {
             const genericErrors = collectGenericLogs(artifactPath, logFile);
             if (genericErrors.length > 0) errors.push(...genericErrors);
        }
    }

    // Smoke Tests
    const smokeTestErrors = collectSmokeTests();
    if (smokeTestErrors.length > 0) {
        console.log(`Collected ${smokeTestErrors.length} smoke test errors.`);
        errors.push(...smokeTestErrors);
    }

    // Load Tests
    const loadTestErrors = collectLoadTests();
    if (loadTestErrors.length > 0) {
        console.log(`Collected ${loadTestErrors.length} load test errors.`);
        errors.push(...loadTestErrors);
    }

    // Fuzz Reports
    const fuzzErrors = collectFuzzReports();
    if (fuzzErrors.length > 0) {
        console.log(`Collected ${fuzzErrors.length} fuzz reports.`);
        errors.push(...fuzzErrors);
    }

    // Agent Logs
    const agentErrors = collectAgentLogs();
    if (agentErrors.length > 0) {
        console.log(`Collected ${agentErrors.length} agent log errors.`);
        errors.push(...agentErrors);
    }

    // 2. Aggregate
    const aggregates = aggregate(errors);
    console.log(`Aggregated into ${aggregates.length} unique issues.`);

    // 3. Report
    generateJSONArtifact(aggregates);
    generateReport(aggregates);

    console.log('Telemetry Aggregation Complete.');
}

main();
