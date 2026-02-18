import fs from 'node:fs';
import path from 'node:path';

const DATE = new Date().toISOString().split('T')[0];
const HITS_FILE = path.join('perf', `hits-${DATE}.json`);
const REPORT_FILE = path.join('perf', `daily-perf-report-${DATE}.md`);

if (!fs.existsSync(HITS_FILE)) {
  console.error(`Hits file not found: ${HITS_FILE}`);
  process.exit(1);
}

const hits = JSON.parse(fs.readFileSync(HITS_FILE, 'utf8'));

// Summarize by pattern
const patternCounts = {};
hits.forEach(hit => {
  patternCounts[hit.pattern] = (patternCounts[hit.pattern] || 0) + 1;
});

// Summarize by file
const fileCounts = {};
hits.forEach(hit => {
  fileCounts[hit.file] = (fileCounts[hit.file] || 0) + 1;
});

// Sort files by hit count
const sortedFiles = Object.entries(fileCounts)
  .sort(([, a], [, b]) => b - a)
  .slice(0, 10);

// Detect potential issues
const p0Candidates = hits.filter(hit =>
  (hit.pattern === 'Promise Concurrency' && hit.content.includes('.map(')) ||
  (hit.pattern === 'Nostr/Relay/Auth' && hit.content.includes('pool.list'))
).slice(0, 10);

let report = `# Daily Performance Report - ${DATE}\n\n`;

report += `## Summary\n`;
report += `Total Hits: ${hits.length}\n\n`;
report += `### Hits by Pattern\n`;
Object.entries(patternCounts).forEach(([pattern, count]) => {
  report += `- ${pattern}: ${count}\n`;
});

report += `\n## Top Files by Activity\n`;
sortedFiles.forEach(([file, count]) => {
  report += `- ${file}: ${count} hits\n`;
});

report += `\n## Potential P0/P1 Candidates (Sample)\n`;
report += `These locations involve concurrency or heavy relay operations:\n\n`;
p0Candidates.forEach(hit => {
  report += `- **${hit.file}:${hit.line}** (${hit.pattern}): \`${hit.content}\`\n`;
});

report += `\n## Actions Taken\n`;
report += `- Ran search patterns and generated inventory.\n`;
report += `- No automatic fixes applied in this run.\n`;

fs.writeFileSync(REPORT_FILE, report);
console.log(`Report generated at ${REPORT_FILE}`);
