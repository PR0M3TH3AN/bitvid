
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '../../');
const DAILY_DIR = path.join(ROOT_DIR, 'src/prompts/daily');
const WEEKLY_DIR = path.join(ROOT_DIR, 'src/prompts/weekly');
const REPORT_DIR = path.join(ROOT_DIR, 'reports/prompt-safety');

if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

const SAFETY_KEYWORDS = [
  'FAILURE MODES',
  'EXIT CRITERIA',
  'SKIP',
  'NO-OP',
  'STOP IF',
  'DO NOTHING',
  'NO ACTION'
];

const FORCEFUL_KEYWORDS = [
  'MUST',
  'ALWAYS',
  'FORCE',
  'REQUIRED'
];

function analyzeFile(filepath) {
  const content = fs.readFileSync(filepath, 'utf8');
  const upperContent = content.toUpperCase();
  const filename = path.basename(filepath);

  const hasSafetySection = SAFETY_KEYWORDS.some(k => upperContent.includes(k));

  // Simple heuristic for forceful language without mitigation
  // This is a naive check and might have false positives
  let forcefulCount = 0;
  FORCEFUL_KEYWORDS.forEach(k => {
    const regex = new RegExp(`\\b${k}\\b`, 'g');
    const matches = (upperContent.match(regex) || []).length;
    forcefulCount += matches;
  });

  return {
    filename,
    hasSafetySection,
    forcefulCount,
    status: hasSafetySection ? 'SAFE' : 'NEEDS_REVIEW'
  };
}

function runAudit() {
  const files = [
    ...fs.readdirSync(DAILY_DIR).map(f => path.join(DAILY_DIR, f)),
    ...fs.readdirSync(WEEKLY_DIR).map(f => path.join(WEEKLY_DIR, f))
  ].filter(f => f.endsWith('.md'));

  const results = files.map(analyzeFile);

  const safeCount = results.filter(r => r.status === 'SAFE').length;
  const needsReviewCount = results.filter(r => r.status === 'NEEDS_REVIEW').length;
  const totalCount = results.length;

  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
  const reportFile = path.join(REPORT_DIR, `audit-${timestamp}.md`);

  let reportContent = `# Prompt Safety Audit Report - ${timestamp}\n\n`;
  reportContent += `**Total Prompts:** ${totalCount}\n`;
  reportContent += `**Safe:** ${safeCount}\n`;
  reportContent += `**Needs Review:** ${needsReviewCount}\n\n`;

  reportContent += `## Findings\n\n`;
  reportContent += `| Filename | Status | Has Safety Section | Forceful Keywords (Approx) |\n`;
  reportContent += `|---|---|---|---|\n`;

  results.forEach(r => {
    reportContent += `| ${r.filename} | ${r.status} | ${r.hasSafetySection ? 'Yes' : 'No'} | ${r.forcefulCount} |\n`;
  });

  reportContent += `\n## Recommendations\n`;
  reportContent += `- Review prompts marked 'NEEDS_REVIEW'.\n`;
  reportContent += `- Ensure all prompts have a 'FAILURE MODES' or 'EXIT CRITERIA' section.\n`;

  fs.writeFileSync(reportFile, reportContent);
  console.log(`Report written to ${reportFile}`);

  // Memory Update
  let memoryContent = `Goal: Audit prompt safety.\n`;
  memoryContent += `Result: Audited ${totalCount} prompts. ${safeCount} safe, ${needsReviewCount} need review.\n`;
  if (needsReviewCount > 0) {
      memoryContent += `Flagged prompts: ${results.filter(r => r.status === 'NEEDS_REVIEW').map(r => r.filename).join(', ')}\n`;
  }

  fs.writeFileSync(path.join(ROOT_DIR, 'memory-update.md'), memoryContent);
  console.log('Memory update written to memory-update.md');
}

runAudit();
