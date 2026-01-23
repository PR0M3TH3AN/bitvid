#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const REPORT_FILE = "REMEDIATION_REPORT.md";

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
    // ./js/ui/ambientBackground.js:34:  return "#000000";
    const regex = /^(\.\/.*):(\d+):(.*)$/;
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
    // Just capture raw lines for now if we can't parse easily
    // But since stylelint passed in my tests, I might not need complex parsing yet.
    // If it fails, I'll just dump the output.
    if (output.includes("✖") || output.includes("error")) {
       violations.push({
         file: "stylelint output",
         line: 0,
         snippet: output.trim() // Simplification
       });
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

async function main() {
  for (const check of CHECKS) {
    const { success, output } = runCheck(check);
    if (!success) {
      const violations = parseOutput(check.name, output);
      VIOLATIONS[check.name] = violations;
    }
  }

  const report = generateReport(VIOLATIONS);
  writeFileSync(REPORT_FILE, report);
  console.log(`Report generated at ${REPORT_FILE}`);

  const totalViolations = Object.values(VIOLATIONS).reduce((acc, list) => acc + list.length, 0);
  process.exit(totalViolations > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
