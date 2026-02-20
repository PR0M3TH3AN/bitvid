const fs = require('fs');

const audit = JSON.parse(fs.readFileSync('artifacts/npm-audit.json', 'utf8'));
const outdated = JSON.parse(fs.readFileSync('artifacts/npm-outdated.json', 'utf8'));

let report = `# Dependency Report - ${new Date().toISOString().split('T')[0]}\n\n`;

report += `## Vulnerabilities\n`;
const severities = { critical: [], high: [], moderate: [], low: [], info: [] };

if (audit.vulnerabilities) {
  for (const [pkg, details] of Object.entries(audit.vulnerabilities)) {
    if (severities[details.severity]) {
      severities[details.severity].push({ pkg, ...details });
    }
  }
}

for (const sev of ['critical', 'high', 'moderate', 'low', 'info']) {
  if (severities[sev].length > 0) {
    report += `### ${sev.toUpperCase()} (${severities[sev].length})\n`;
    severities[sev].forEach(v => {
      // Process 'via' array
      let viaStr = '';
      if (Array.isArray(v.via)) {
        viaStr = v.via.map(item => {
          if (typeof item === 'string') return item;
          return item.title || item.name || 'Unknown advisory';
        }).join(', ');
      } else {
        viaStr = String(v.via);
      }

      report += `- **${v.pkg}**: ${viaStr}\n`;
      if (sev === 'critical' || sev === 'high') {
         report += `  - Path: Direct dependency? ${v.isDirect ? 'Yes' : 'No'}\n`;
         if (v.fixAvailable) {
            report += `  - Fix Available: ${JSON.stringify(v.fixAvailable)}\n`;
         }
      }
    });
  }
}

if (Object.keys(audit.vulnerabilities || {}).length === 0) {
  report += `No vulnerabilities found.\n`;
}


report += `\n## Outdated Packages\n`;
const outdatedList = { major: [], minor: [], patch: [] };

for (const [pkg, details] of Object.entries(outdated)) {
  const current = details.current;
  const wanted = details.wanted;
  const latest = details.latest;

  if (!current) continue;

  const type = details.type;

  if (wanted !== current) {
      const cParts = current.split('.');
      const wParts = wanted.split('.');
      if (cParts[0] !== wParts[0]) outdatedList.major.push({ pkg, current, wanted, latest, type });
      else if (cParts[1] !== wParts[1]) outdatedList.minor.push({ pkg, current, wanted, latest, type });
      else outdatedList.patch.push({ pkg, current, wanted, latest, type });
  } else if (latest !== current) {
      outdatedList.major.push({ pkg, current, wanted, latest, type });
  }
}

report += `### Major Updates (Risky)\n`;
outdatedList.major.forEach(p => report += `- **${p.pkg}** (${p.type}): ${p.current} -> ${p.latest}\n`);

report += `\n### Minor Updates (Safe-ish)\n`;
outdatedList.minor.forEach(p => report += `- **${p.pkg}** (${p.type}): ${p.current} -> ${p.wanted} (Latest: ${p.latest})\n`);

report += `\n### Patch Updates (Safe)\n`;
outdatedList.patch.forEach(p => report += `- **${p.pkg}** (${p.type}): ${p.current} -> ${p.wanted}\n`);


report += `\n## Triage & Actions\n`;
if (severities.critical.length > 0) {
    report += `- [ ] **CRITICAL**: Investigate ${severities.critical.map(v => v.pkg).join(', ')} immediately.\n`;
}
if (severities.high.length > 0) {
    report += `- [ ] **HIGH**: Check for safe upgrades for ${severities.high.map(v => v.pkg).join(', ')}.\n`;
}

const safeUpgrades = [...outdatedList.patch, ...outdatedList.minor].filter(p => p.type !== 'devDependencies');
if (safeUpgrades.length > 0) {
    report += `- [ ] **Safe Candidates**: ${safeUpgrades.map(p => p.pkg).join(', ')}\n`;
} else {
    report += `- No safe direct dependency upgrades identified.\n`;
}

fs.writeFileSync('artifacts/deps-report.md', report);
console.log('Report generated.');
