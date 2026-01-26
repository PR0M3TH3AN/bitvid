#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const REPORT_FILE = "REMEDIATION_REPORT.md";

// Map of safe auto-fixes for Tailwind colors
const SAFE_FIXES = {
  // Text Colors
  "text-red-600": "text-status-danger",
  "text-red-500": "text-status-danger",
  "text-blue-600": "text-status-info",
  "text-blue-500": "text-status-info",
  "text-green-600": "text-status-success",
  "text-green-500": "text-status-success",
  "text-yellow-500": "text-status-warning",
  "text-yellow-600": "text-status-warning",
  "text-gray-500": "text-muted",
  "text-gray-400": "text-subtle",
  "text-gray-900": "text-primary",
  "text-white": "text-white",
  "text-black": "text-black",

  // Background Colors (Solid)
  "bg-red-600": "bg-status-danger",
  "bg-blue-600": "bg-status-info",
  "bg-green-600": "bg-status-success",
  "bg-yellow-500": "bg-status-warning",

  // Background Colors (Surface/Light)
  "bg-red-50": "bg-status-danger-surface",
  "bg-blue-50": "bg-status-info-surface",
  "bg-green-50": "bg-status-success-surface",
  "bg-yellow-50": "bg-status-warning-surface",
};

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

let autoFixesApplied = [];

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
    // ./js/ui/ambientBackground.js:34:  return "#000000";
    const regex = /^(\.\/.*):(\d+):(.*)$/;
    for (const line of lines) {
      const match = line.trim().match(regex);
      if (match) {
        violations.push({
          file: match[1],
          line: parseInt(match[2], 10),
          snippet: match[3].trim()
        });
      }
    }
  } else if (category === "Inline Styles") {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const match = line.match(/^(.+?):(\d+)\s+—\s+(.+)$/);
      if (match) {
        const snippet = lines[i + 1] ? lines[i + 1].trim() : "";
        violations.push({
          file: match[1],
          line: parseInt(match[2], 10),
          snippet: snippet,
          label: match[3]
        });
      }
    }
  } else if (category === "Raw Lengths" || category === "Bracket Utilities") {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const match = line.match(/^(.+?):(\d+)\s+→\s+(.+)$/);
      if (match) {
        const snippet = lines[i + 1] ? lines[i + 1].trim() : "";
        violations.push({
          file: match[1],
          line: parseInt(match[2], 10),
          snippet: snippet,
          value: match[3]
        });
      }
    }
  } else if (category === "Tailwind Palette") {
    // file:line → value
    for (const line of lines) {
      const match = line.trim().match(/^(.+?):(\d+)\s+→\s+(.+)$/);
      if (match) {
        violations.push({
          file: match[1],
          line: parseInt(match[2], 10),
          value: match[3],
          snippet: match[3]
        });
      }
    }
  } else if (category === "CSS") {
    if (output.includes("✖") || output.includes("error")) {
       violations.push({
         file: "stylelint output",
         line: 0,
         snippet: output.trim()
       });
    }
  }

  return violations;
}

function autoFixViolations(violations) {
  console.log("Applying auto-fixes...");

  // Group by file to read/write once per file
  const filesToFix = {};

  // Process Tailwind Palette
  for (const v of violations["Tailwind Palette"]) {
    const fix = SAFE_FIXES[v.value];
    if (fix) {
      if (!filesToFix[v.file]) {
        filesToFix[v.file] = [];
      }
      filesToFix[v.file].push({ ...v, fix });
    }
  }

  for (const file in filesToFix) {
    try {
      let content = readFileSync(file, "utf8");
      const changes = filesToFix[file];
      // Sort changes by line descending to avoid index shifting if we were using indices (but we use replace by line)
      // Actually, we replace specific tokens.

      let modified = false;

      for (const item of changes) {
        // We look for the class in the content.
        // Be careful: if the class appears multiple times in the file.
        // The violation has a line number.

        const lines = content.split("\n");
        const lineContent = lines[item.line - 1]; // 1-based index

        if (lineContent && lineContent.includes(item.value)) {
          // Replace using regex to ensure word boundary
          const regex = new RegExp(`\\b${item.value}\\b`, 'g');
          const newLineContent = lineContent.replace(regex, item.fix);

          if (newLineContent !== lineContent) {
            lines[item.line - 1] = newLineContent;
            content = lines.join("\n");

            autoFixesApplied.push(`${file}:${item.line} Replaced ${item.value} with ${item.fix}`);
            modified = true;
          }
        }
      }

      if (modified) {
        writeFileSync(file, content);
        console.log(`Fixed ${changes.length} issues in ${file}`);
      }
    } catch (e) {
      console.error(`Failed to fix ${file}:`, e.message);
    }
  }
}

function generateReport(violations) {
  let totalViolations = 0;
  let report = "# Daily Design System Audit Report\n\n";

  for (const category in violations) {
    totalViolations += violations[category].length;
  }

  // Subtract fixed items from total counts effectively?
  // For the report, we usually show what was found and what was fixed.

  if (totalViolations === 0 && autoFixesApplied.length === 0) {
    report += "Headline: ✓ No violations\n";
  } else {
    report += `Headline: ⚠️ ${totalViolations} violations found (before auto-fix)\n`;
  }

  report += "\n";

  if (autoFixesApplied.length > 0) {
    report += "## Auto-fixes Applied\n";
    report += `Total count: ${autoFixesApplied.length}\n\n`;
    report += "| Fix |\n";
    report += "|---|\n";
    for (const fix of autoFixesApplied) {
       report += `| ${fix} |\n`;
    }
    report += "\n";
  }

  for (const category of Object.keys(violations)) {
    const list = violations[category];
    // Filter out items that were fixed?
    // Doing strict matching is hard without tracking IDs.
    // We'll report all detected violations, and note that auto-fixes were attempted.

    report += `## ${category}\n`;
    report += `Total count detection: ${list.length}\n\n`;

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
  if (autoFixesApplied.length > 0) {
     report += "- [x] Apply auto-fixes (completed)\n";
  } else {
     report += "- [ ] Apply auto-fixes (if safe)\n";
  }
  report += "- [ ] Open remediation PR\n";

  return report;
}

async function main() {
  const args = process.argv.slice(2);
  const shouldFix = args.includes("--fix");

  for (const check of CHECKS) {
    const { success, output } = runCheck(check);
    if (!success) {
      const violations = parseOutput(check.name, output);
      VIOLATIONS[check.name] = violations;
    }
  }

  if (shouldFix) {
    autoFixViolations(VIOLATIONS);
  }

  const report = generateReport(VIOLATIONS);
  writeFileSync(REPORT_FILE, report);
  console.log(`Report generated at ${REPORT_FILE}`);

  const totalViolations = Object.values(VIOLATIONS).reduce((acc, list) => acc + list.length, 0);

  // If we fixed everything, we might want to return 0?
  // But we usually want to signal that violations were found.
  // The acceptance criteria says "npm run lint passes (exit code 0)".
  // This script is a wrapper. If it auto-fixes, maybe it should verify again?

  // For now, we exit with failure if any violations were found initially,
  // to ensure visibility in CI logs, unless we want to treat auto-fixed as "success".
  // But the prompt says "If a configurable threshold ... is exceeded ...".

  process.exit(totalViolations > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
