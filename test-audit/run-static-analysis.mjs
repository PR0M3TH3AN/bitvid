import fs from "node:fs";
import path from "node:path";

const OUTPUT_FILE = "test-audit/suspicious-tests.json";

function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const fullPath = path.join(dir, f);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (f !== "node_modules" && f !== "artifacts" && f !== "test-audit") {
        walkDir(fullPath, callback);
      }
    } else {
      callback(fullPath);
    }
  }
}

function runAnalysis() {
  const skippedOrFocused = [];
  const timing = [];
  const consoleUsage = [];
  const zeroAssertions = [];

  const files = [];
  walkDir("js", (f) => files.push(f));
  walkDir("tests", (f) => files.push(f));

  for (const file of files) {
    if (!file.match(/\.(js|mjs|ts)$/)) continue;

    const content = fs.readFileSync(file, "utf8");
    const lines = content.split("\n");

    // Zero assertions check (heuristic) - only for test files
    if (file.match(/\.(test|spec)\.(mjs|js|ts)$/)) {
        if (content.match(/describe\(|test\(|it\(/)) {
             if (!content.match(/expect\(|assert\.|t\.is|chai\.expect|should\.|ok\(/)) {
                 zeroAssertions.push(file);
             }
        }
    }

    lines.forEach((line, index) => {
        const lineNum = index + 1;
        if (line.match(/\.(only|skip)\(/)) {
            skippedOrFocused.push(`${file}:${lineNum}:${line.trim()}`);
        }
        if (line.match(/setTimeout\(|sleep\(|await delay\(|new Promise\(r => setTimeout/)) {
            timing.push(`${file}:${lineNum}:${line.trim()}`);
        }
        if (line.match(/console\.(log|warn|error)/)) {
            consoleUsage.push(`${file}:${lineNum}:${line.trim()}`);
        }
    });
  }

  const report = {
    skippedOrFocused,
    timing,
    consoleUsage,
    zeroAssertions
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(report, null, 2));
  console.log(`Static analysis report written to ${OUTPUT_FILE}`);
}

runAnalysis();
