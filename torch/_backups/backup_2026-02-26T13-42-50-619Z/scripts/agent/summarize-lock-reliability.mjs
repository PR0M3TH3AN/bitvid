#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const VALID_CADENCES = ['daily', 'weekly'];

function parseArgs(argv) {
  const options = {
    sinceDays: 14,
    logRoot: path.resolve(process.cwd(), 'task-logs'),
    outDir: path.resolve(process.cwd(), 'artifacts', 'lock-reliability'),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--since-days') {
      options.sinceDays = Number.parseInt(argv[i + 1] || '14', 10);
      i += 1;
    } else if (token === '--log-root') {
      options.logRoot = path.resolve(process.cwd(), argv[i + 1] || 'task-logs');
      i += 1;
    } else if (token === '--out-dir') {
      options.outDir = path.resolve(process.cwd(), argv[i + 1] || path.join('artifacts', 'lock-reliability'));
      i += 1;
    }
  }

  if (!Number.isFinite(options.sinceDays) || options.sinceDays < 0) {
    throw new Error(`Invalid --since-days value: ${options.sinceDays}`);
  }

  return options;
}

function parseFrontmatter(markdown) {
  const text = String(markdown || '');
  if (!text.startsWith('---\n')) return {};
  const end = text.indexOf('\n---', 4);
  if (end === -1) return {};
  const frontmatter = text.slice(4, end).split(/\r?\n/);
  const result = {};
  for (const line of frontmatter) {
    const match = line.match(/^([a-zA-Z0-9_]+):\s*(.+)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    result[key] = rawValue.replace(/^'/, '').replace(/'$/, '').replace(/''/g, "'");
  }
  return result;
}

function inc(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function collectRelayEndpoints({ frontmatter, body }) {
  const relays = new Set();
  const relayList = frontmatter.relay_list || '';
  relayList.split(',').map((v) => v.trim()).filter(Boolean).forEach((relay) => relays.add(relay));

  const allText = `${body}\n${Object.values(frontmatter).join('\n')}`;
  const urlMatches = allText.match(/wss?:\/\/[^\s'`),]+/g) || [];
  for (const url of urlMatches) {
    relays.add(url.trim());
  }

  if (!relays.size) relays.add('unknown');
  return [...relays];
}

function getBackendCategory({ frontmatter, body }) {
  if (frontmatter.backend_category) return frontmatter.backend_category;
  if (frontmatter.preflight_failure_category) return `preflight:${frontmatter.preflight_failure_category}`;

  const reasonMatch = body.match(/- reason:\s*([^\n]+)/i) || body.match(/reason:\s*([^\n]+)/i);
  const reason = reasonMatch?.[1]?.trim() || '';

  if (/lock backend/i.test(reason)) return 'lock backend error (uncategorized)';
  if (/completion publish failed/i.test(reason)) return 'completion publish failed';
  if (/preflight/i.test(reason)) return 'preflight failed (uncategorized)';
  return null;
}

function toSortedObject(counterMap) {
  return Object.fromEntries([...counterMap.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function asMarkdown(report) {
  const lines = [];
  lines.push('# Lock Reliability Summary');
  lines.push('');
  lines.push(`- Generated at: ${report.generatedAt}`);
  lines.push(`- Window: last ${report.sinceDays} day(s)`);
  lines.push(`- Logs scanned: ${report.logsScanned}`);
  lines.push(`- Runs considered: ${report.runsConsidered}`);
  lines.push('');

  lines.push('## Totals');
  lines.push('');
  lines.push(`- completed: ${report.statusCounts.completed || 0}`);
  lines.push(`- failed: ${report.statusCounts.failed || 0}`);
  lines.push('');

  const sections = [
    ['By platform', report.byPlatform],
    ['By cadence', report.byCadence],
    ['By backend error category', report.byBackendCategory],
    ['By relay endpoint', report.byRelayEndpoint],
  ];

  for (const [title, obj] of sections) {
    lines.push(`## ${title}`);
    lines.push('');
    const entries = Object.entries(obj);
    if (!entries.length) {
      lines.push('- (none)');
    } else {
      for (const [key, value] of entries) {
        lines.push(`- ${key}: ${value}`);
      }
    }
    lines.push('');
  }

  if (report.recurringBackendErrors.length) {
    lines.push('## Recurring backend errors (count >= 2)');
    lines.push('');
    for (const entry of report.recurringBackendErrors) {
      lines.push(`- ${entry.category}: ${entry.count}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

async function readLogFile(filePath, cadence, cutoffMs) {
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.mtimeMs < cutoffMs) return null;

  const basename = path.basename(filePath);
  const match = basename.match(/^.+__([^_]+?)__(completed|failed)\.md$/);
  if (!match) return null;

  const body = await fs.readFile(filePath, 'utf8');
  const frontmatter = parseFrontmatter(body);
  const status = frontmatter.status || match[2];
  const platform = frontmatter.platform || 'unknown';
  const backendCategory = status === 'failed'
    ? getBackendCategory({ frontmatter, body })
    : 'n/a';
  const relayEndpoints = collectRelayEndpoints({ frontmatter, body });

  return {
    filePath,
    cadence: frontmatter.cadence || cadence,
    status,
    platform,
    backendCategory,
    relayEndpoints,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const now = Date.now();
  const cutoffMs = now - (options.sinceDays * 24 * 60 * 60 * 1000);

  const byPlatform = new Map();
  const byCadence = new Map();
  const byBackendCategory = new Map();
  const byRelayEndpoint = new Map();
  const statusCounts = new Map();
  const records = [];
  let logsScanned = 0;

  for (const cadence of VALID_CADENCES) {
    const cadenceDir = path.join(options.logRoot, cadence);
    let entries;
    try {
      entries = await fs.readdir(cadenceDir);
    } catch {
      continue;
    }

    const promises = entries.map(async (entry) => {
      const fullPath = path.join(cadenceDir, entry);
      const record = await readLogFile(fullPath, cadence, cutoffMs);
      return record;
    });

    const results = await Promise.all(promises);
    logsScanned += entries.length;

    for (const record of results) {
      if (!record) continue;

      records.push(record);
      inc(statusCounts, record.status);
      inc(byPlatform, record.platform);
      inc(byCadence, record.cadence);
      if (record.status === 'failed' && record.backendCategory) {
        inc(byBackendCategory, record.backendCategory);
      }
      for (const relay of record.relayEndpoints) {
        inc(byRelayEndpoint, relay);
      }
    }
  }

  const recurringBackendErrors = [...byBackendCategory.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([category, count]) => ({ category, count }));

  const report = {
    generatedAt: new Date().toISOString(),
    sinceDays: options.sinceDays,
    logRoot: options.logRoot,
    logsScanned,
    runsConsidered: records.length,
    statusCounts: toSortedObject(statusCounts),
    byPlatform: toSortedObject(byPlatform),
    byCadence: toSortedObject(byCadence),
    byBackendCategory: toSortedObject(byBackendCategory),
    byRelayEndpoint: toSortedObject(byRelayEndpoint),
    recurringBackendErrors,
  };

  await fs.mkdir(options.outDir, { recursive: true });
  const markdown = asMarkdown(report);
  const markdownPath = path.join(options.outDir, 'lock-reliability-summary.md');
  const jsonPath = path.join(options.outDir, 'lock-reliability-summary.json');

  await fs.writeFile(markdownPath, markdown, 'utf8');
  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    ok: true,
    markdown: path.relative(process.cwd(), markdownPath),
    json: path.relative(process.cwd(), jsonPath),
    recurringBackendErrors,
  }));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
