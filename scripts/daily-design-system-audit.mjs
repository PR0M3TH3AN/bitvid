#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { writeFileSync, readFileSync } from "node:fs";

const REPORT_FILE = "REMEDIATION_REPORT.md";
const SHOULD_FIX = process.argv.includes("--fix");

const CHECKS = [
  { name: "CSS", command: "npm", args: ["run", "lint:css"] },
  { name: "Hex Colors", command: "npm", args: ["run", "lint:hex"] },
  { name: "Inline Styles", command: "npm", args: ["run", "lint:inline-styles"] },
  { name: "Raw Lengths", command: "npm", args: ["run", "lint:tokens"] }, // check-design-tokens --check=tokens
  { name: "Bracket Utilities", command: "npm", args: ["run", "lint:tailwind-brackets"] }, // check-design-tokens --check=brackets
  { name: "Tailwind Palette", command: "npm", args: ["run", "lint:tailwind-colors"] }
];

const VIOLATIONS = {
  "CSS": [],
  "Hex Colors": [],
  "Inline Styles": [],
  "Raw Lengths": [],
  "Bracket Utilities": [],
  "Tailwind Palette": []
};

function runCheck(check) {
  console.log(`Running ${check.name}...`);
  const result = spawnSync(check.command, check.args, { encoding: "utf8" });
  return {
    success: result.status === 0,
    output: (result.stdout || "") + (result.stderr || "")
  };
}

function parseOutput(category, output) {
  const lines = output.split("\n");
  const violations = [];

  if (category === "Hex Colors") {
    // js/ui/ambientBackground.js:34:  return "#000000";
    // Also supports ./ prefix if present
    const regex = /^(.+?):(\d+):(.*)$/;
    for (const line of lines) {
      const match = line.trim().match(regex);
      if (match) {
        violations.push({
          file: match[1],
          line: match[2],
          snippet: match[3].trim()
        });
      }
    }
  } else if (category === "Inline Styles") {
    // js/ui/violation-test.js:2 — Direct .style usage
    //   document.body.style.color = "red";
    // The script prints file:line - label, then snippet on next line.
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const match = line.match(/^(.+?):(\d+)\s+—\s+(.+)$/);
      if (match) {
        const snippet = lines[i + 1] ? lines[i + 1].trim() : "";
        violations.push({
          file: match[1],
          line: match[2],
          snippet: snippet,
          label: match[3]
        });
      }
    }
  } else if (category === "Raw Lengths" || category === "Bracket Utilities") {
    // file:line → value
    //   snippet
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const match = line.match(/^(.+?):(\d+)\s+→\s+(.+)$/);
      if (match) {
        const snippet = lines[i + 1] ? lines[i + 1].trim() : "";
        violations.push({
          file: match[1],
          line: match[2],
          snippet: snippet,
          value: match[3]
        });
      }
    }
  } else if (category === "Tailwind Palette") {
    // file:line → value
    // No snippet? check-tailwind-colors.mjs prints: console.error(`${violation.file}:${violation.line} → ${violation.value}`);
    for (const line of lines) {
      const match = line.trim().match(/^(.+?):(\d+)\s+→\s+(.+)$/);
      if (match) {
        violations.push({
          file: match[1],
          line: match[2],
          value: match[3],
          snippet: match[3] // Use value as snippet for now
        });
      }
    }
  } else if (category === "CSS") {
    // stylelint output
    // css/tailwind.source.css
    //  5757:3  ✖  Expected ...
    let currentFile = "";
    for (const line of lines) {
      const trimmed = line.trim();
      // If line looks like a file path (ends with .css) and isn't an error line
      if (trimmed.endsWith(".css") && !trimmed.includes("✖")) {
        currentFile = trimmed;
      } else {
        const match = trimmed.match(/^(\d+):(\d+)\s+✖\s+(.+)$/);
        if (match && currentFile) {
          violations.push({
            file: currentFile,
            line: match[1],
            snippet: match[3]
          });
        } else if (trimmed.includes("✖")) {
          violations.push({
            file: currentFile || "unknown",
            line: 0,
            snippet: trimmed
          });
        }
      }
    }
  }

  return violations;
}

function generateReport(violations) {
  let totalViolations = 0;
  let report = "# Daily Design System Audit Report\n\n";

  for (const category in violations) {
    totalViolations += violations[category].length;
  }

  if (totalViolations === 0) {
    report += "Headline: ✓ No violations\n";
  } else {
    report += `Headline: ⚠️ ${totalViolations} violations found\n`;
  }

  report += "\n";

  for (const category of Object.keys(violations)) {
    const list = violations[category];
    report += `## ${category}\n`;
    report += `Total count: ${list.length}\n\n`;

    if (list.length > 0) {
      report += "| File | Line | Snippet |\n";
      report += "|---|---|---|\n";
      // Top 10
      const top10 = list.slice(0, 10);
      for (const v of top10) {
        let snippet = v.snippet;
        if (snippet && snippet.length > 50) snippet = snippet.substring(0, 50) + "...";
        snippet = snippet ? "`" + snippet.replace(/`/g, "") + "`" : "";
        report += `| ${v.file} | ${v.line} | ${snippet} |\n`;
      }
      if (list.length > 10) {
        report += `... and ${list.length - 10} more.\n`;
      }
    }
    report += "\n";
  }

  report += "## Next Steps\n";
  report += "- [ ] Review violations\n";
  report += "- [ ] Apply auto-fixes (if safe)\n";
  report += "- [ ] Open remediation PR\n";

  return report;
}

function applyAutoFixes(violations) {
  console.log("Attempting to apply auto-fixes...");
  let fixesApplied = 0;

  const violationsByFile = {};

  for (const category in violations) {
    for (const v of violations[category]) {
      const filePath = v.file.startsWith("./") ? v.file.slice(2) : v.file;
      if (!violationsByFile[filePath]) violationsByFile[filePath] = [];
      violationsByFile[filePath].push({ ...v, category });
    }
  }

  for (const file of Object.keys(violationsByFile)) {
    try {
      let content = readFileSync(file, "utf8");
      let originalContent = content;

      for (const v of violationsByFile[file]) {
        if (v.category === "Hex Colors") {
          content = content.replaceAll("#000000", "var(--color-black)");
          content = content.replaceAll("#ffffff", "var(--color-white)");
        }
        if (v.category === "Tailwind Palette") {
          // Simple semantic mappings
          if (v.value.includes("red-500")) {
            const newValue = v.value.replace("red-500", "status-danger");
            content = content.replaceAll(v.value, newValue);
          }
          if (v.value.includes("green-500")) {
            const newValue = v.value.replace("green-500", "status-success");
            content = content.replaceAll(v.value, newValue);
          }
          if (v.value.includes("blue-500")) {
            const newValue = v.value.replace("blue-500", "status-info");
            content = content.replaceAll(v.value, newValue);
          }
          if (v.value.includes("yellow-500")) {
            const newValue = v.value.replace("yellow-500", "status-warning");
            content = content.replaceAll(v.value, newValue);
          }
        }
      }

      if (content !== originalContent) {
        writeFileSync(file, content);
        fixesApplied++;
        console.log(`Fixed violations in ${file}`);
      }
    } catch (e) {
      console.error(`Failed to fix ${file}: ${e.message}`);
    }
  }

  if (fixesApplied === 0) {
    console.log("No auto-fixes available for current violations.");
  }
  return fixesApplied > 0;
}

async function main() {
  for (const check of CHECKS) {
    const { success, output } = runCheck(check);
    if (!success) {
      const violations = parseOutput(check.name, output);
      VIOLATIONS[check.name] = violations;
    }
  }

  const totalViolations = Object.values(VIOLATIONS).reduce((acc, list) => acc + list.length, 0);

  if (totalViolations > 0 && SHOULD_FIX) {
    applyAutoFixes(VIOLATIONS);
  }

  const report = generateReport(VIOLATIONS);
  writeFileSync(REPORT_FILE, report);
  console.log(`Report generated at ${REPORT_FILE}`);

  process.exit(totalViolations > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
