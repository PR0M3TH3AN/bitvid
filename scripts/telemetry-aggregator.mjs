import fs from 'node:fs';
import path from 'node:path';

// Configuration
const ARTIFACTS_DIR = 'artifacts';
const REPORTS_DIR = 'ai/reports';
const TEST_LOG = 'test_output.log';

// Regex patterns for PII sanitization
const PII_PATTERNS = [
    { name: 'IP', regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, replacement: '[IP]' },
    { name: 'EMAIL', regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[EMAIL]' },
    // Hex keys (64 chars) - common in Nostr (private/public keys, event IDs, signatures)
    // We want to mask potential keys but maybe keep event IDs if we are sure they are IDs?
    // For safety, we mask all 64-char hex strings that look like keys/signatures.
    // However, stack traces might contain IDs that are useful for debugging.
    // The prompt says "Strip IPs, keys, emails... Keep only stack traces and counts."
    // It's better to be safe than sorry with keys.
    // We will mask 64-char hex strings.
    { name: 'HEX_KEY', regex: /\b[a-fA-F0-9]{64}\b/g, replacement: '[HEX_KEY]' },
    // Nostr Bech32 keys (nsec, npub, nprofile, etc.)
    { name: 'NSEC', regex: /\bnsec1[a-z0-9]{50,}\b/g, replacement: '[NSEC_KEY]' },
    { name: 'NPUB', regex: /\bnpub1[a-z0-9]{50,}\b/g, replacement: '[NPUB_KEY]' },
];

function sanitize(text) {
    if (!text) return text;
    let sanitized = text;
    for (const pattern of PII_PATTERNS) {
        sanitized = sanitized.replace(pattern.regex, pattern.replacement);
    }
    return sanitized;
}

// -----------------------------------------------------------------------------
// Collectors
// -----------------------------------------------------------------------------

function collectUnitTests() {
    const errors = [];
    if (!fs.existsSync(TEST_LOG)) {
        console.warn(`Unit test log not found at ${TEST_LOG}`);
        return errors;
    }

    const content = fs.readFileSync(TEST_LOG, 'utf8');
    const lines = content.split('\n');
    let currentError = null;
    let insideErrorBlock = false;

    // TAP Parsing Logic (simplified)
    // We look for "not ok <number> - <title>"
    // Then capture indentation blocks as details/stack

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Start of a failure
        if (line.match(/^not ok \d+ - /)) {
            if (currentError) {
                errors.push(currentError);
            }
            const title = line.replace(/^not ok \d+ - /, '').trim();
            currentError = {
                source: 'unit-test',
                title: sanitize(title),
                details: [],
                severity: 'High'
            };
            insideErrorBlock = true;
            continue;
        }

        // End of failure block (next test or summary)
        if (line.match(/^(ok \d+|# tests \d+|1\.\.\d+)/) || (insideErrorBlock && !line.startsWith('  '))) {
             if (currentError && insideErrorBlock) {
                 // The indentation check is a bit flaky with TAP,
                 // usually YAML blocks are indented.
                 // But "ok" or "#" definitely ends it.

                 // If line doesn't start with space and it's not a TAP directive,
                 // it might be console output which we might want to capture?
                 // For now, let's assume TAP structure:
                 // not ok 1 - test
                 //   ---
                 //   error: ...
                 //   ...
                 //   ...
             }
        }

        if (currentError && insideErrorBlock) {
            // Check if we exited the indented block
            if (line.trim() !== '' && !line.startsWith('  ') && !line.startsWith('\t')) {
                insideErrorBlock = false;
                errors.push(currentError);
                currentError = null;
            } else {
                 currentError.details.push(sanitize(line));
            }
        }
    }

    if (currentError) {
        errors.push(currentError);
    }

    // Post-process to extract stack trace for fingerprinting
    errors.forEach(e => {
        const fullText = e.details.join('\n');
        // Simple fingerprint: file path + error message
        // Try to extract "stack: |-" block
        const stackMatch = fullText.match(/stack: \|-([\s\S]+?)(?:\n\s*\w+:|$)/);
        if (stackMatch) {
            e.stack = stackMatch[1].trim();
        } else {
            // Fallback to title
            e.stack = e.title;
        }

        // Fingerprint: remove line numbers from stack
        // Also prepend title to ensure different tests with similar stacks (common in runners) are distinct
        e.fingerprint = e.title + '::' + e.stack.replace(/:\d+:\d+/g, ':x:x').replace(/\d+/g, 'N');
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
                    errors.push({
                        source: 'smoke-test',
                        title: sanitize(`Smoke Test Failed: ${step.name}`),
                        details: [sanitize(step.error)],
                        stack: sanitize(step.error),
                        fingerprint: sanitize(step.name), // Group by step name
                        severity: 'Critical'
                    });
                }
            }
        } catch (err) {
            console.warn(`Failed to parse smoke report ${file}:`, err);
        }
    }
    return errors;
}

// -----------------------------------------------------------------------------
// Aggregation
// -----------------------------------------------------------------------------

function aggregate(errors) {
    const grouped = {};

    for (const err of errors) {
        const key = err.fingerprint || err.title;
        if (!grouped[key]) {
            grouped[key] = {
                fingerprint: key,
                title: err.title,
                count: 0,
                sources: new Set(),
                severity: err.severity,
                exampleStack: err.stack
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
    md += `| Priority | Count | Issue | Sources |\n`;
    md += `| :--- | :---: | :--- | :--- |\n`;

    const top10 = aggregates.slice(0, 10);

    for (const item of top10) {
        const titleShort = item.title.length > 80 ? item.title.substring(0, 77) + '...' : item.title;
        md += `| **${item.severity}** | ${item.count} | ${titleShort} | ${Array.from(item.sources).join(', ')} |\n`;
    }

    md += `\n## Detailed Breakdown\n\n`;

    for (const item of top10) {
        md += `### [${item.severity}] ${item.title}\n`;
        md += `- **Occurrences:** ${item.count}\n`;
        md += `- **Sources:** ${Array.from(item.sources).join(', ')}\n`;
        md += `- **Suggested Owner:** TBD (Automated Triage)\n`;
        md += `\n**Stack Trace / Details:**\n`;
        md += "```\n";
        md += item.exampleStack || "No stack trace available";
        md += "\n```\n\n";
    }

    // Privacy note
    md += `\n---\n*Privacy Notice: PII (IPs, emails, keys) has been sanitized from this report.*\n`;

    fs.writeFileSync(filepath, md);
    console.log(`Report generated: ${filepath}`);
    return filepath;
}

function generateJSONArtifact(aggregates) {
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
    const unitTestErrors = collectUnitTests();
    const smokeTestErrors = collectSmokeTests();
    console.log(`Collected ${unitTestErrors.length} unit test errors.`);
    console.log(`Collected ${smokeTestErrors.length} smoke test errors.`);

    const allErrors = [...unitTestErrors, ...smokeTestErrors];

    // 2. Aggregate
    const aggregates = aggregate(allErrors);
    console.log(`Aggregated into ${aggregates.length} unique issues.`);

    // 3. Report
    generateJSONArtifact(aggregates);
    generateReport(aggregates);

    console.log('Telemetry Aggregation Complete.');
}

main();
