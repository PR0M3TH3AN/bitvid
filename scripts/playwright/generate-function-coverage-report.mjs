import fs from "node:fs/promises";
import path from "node:path";

const ROOT_DIR = process.cwd();
const RAW_DIR = path.join(ROOT_DIR, "artifacts", "playwright-coverage", "raw");
const OUTPUT_DIR = path.join(ROOT_DIR, "artifacts", "playwright-coverage");
const SOURCE_DIRS = ["js", "torrent"];
const SOURCE_EXTENSIONS = new Set([".js"]);
const METHOD_KEYWORD_BLOCKLIST = new Set([
  "if",
  "for",
  "while",
  "switch",
  "catch",
  "return",
  "else",
  "do",
  "try",
  "class",
  "function",
  "import",
  "export",
  "new",
]);

function normalizeSlashes(value) {
  return value.split(path.sep).join("/");
}

function toRelativeIfInRepo(absPath) {
  const rel = path.relative(ROOT_DIR, absPath);
  if (rel.startsWith("..")) return null;
  return normalizeSlashes(rel);
}

async function walkFiles(startDir) {
  const entries = await fs.readdir(startDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(startDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(fullPath)));
      continue;
    }
    files.push(fullPath);
  }
  return files;
}

function maskStringsAndComments(source) {
  const out = source.split("");
  let i = 0;
  let state = "code";
  while (i < out.length) {
    const ch = out[i];
    const next = out[i + 1];

    if (state === "line-comment") {
      if (ch === "\n") {
        state = "code";
      } else {
        out[i] = " ";
      }
      i += 1;
      continue;
    }
    if (state === "block-comment") {
      if (ch === "*" && next === "/") {
        out[i] = " ";
        out[i + 1] = " ";
        i += 2;
        state = "code";
      } else {
        out[i] = ch === "\n" ? "\n" : " ";
        i += 1;
      }
      continue;
    }
    if (state === "single-quote") {
      if (ch === "\\" && i + 1 < out.length) {
        out[i] = " ";
        out[i + 1] = " ";
        i += 2;
        continue;
      }
      out[i] = ch === "\n" ? "\n" : " ";
      if (ch === "'") state = "code";
      i += 1;
      continue;
    }
    if (state === "double-quote") {
      if (ch === "\\" && i + 1 < out.length) {
        out[i] = " ";
        out[i + 1] = " ";
        i += 2;
        continue;
      }
      out[i] = ch === "\n" ? "\n" : " ";
      if (ch === "\"") state = "code";
      i += 1;
      continue;
    }
    if (state === "template") {
      if (ch === "\\" && i + 1 < out.length) {
        out[i] = " ";
        out[i + 1] = " ";
        i += 2;
        continue;
      }
      if (ch === "`") {
        out[i] = " ";
        i += 1;
        state = "code";
        continue;
      }
      if (ch === "$" && next === "{") {
        out[i] = " ";
        out[i + 1] = " ";
        i += 2;
        let depth = 1;
        while (i < out.length && depth > 0) {
          const c = out[i];
          if (c === "{") depth += 1;
          else if (c === "}") depth -= 1;
          if (depth > 0) out[i] = c === "\n" ? "\n" : " ";
          i += 1;
        }
        continue;
      }
      out[i] = ch === "\n" ? "\n" : " ";
      i += 1;
      continue;
    }

    if (ch === "/" && next === "/") {
      out[i] = " ";
      out[i + 1] = " ";
      i += 2;
      state = "line-comment";
      continue;
    }
    if (ch === "/" && next === "*") {
      out[i] = " ";
      out[i + 1] = " ";
      i += 2;
      state = "block-comment";
      continue;
    }
    if (ch === "'") {
      out[i] = " ";
      state = "single-quote";
      i += 1;
      continue;
    }
    if (ch === "\"") {
      out[i] = " ";
      state = "double-quote";
      i += 1;
      continue;
    }
    if (ch === "`") {
      out[i] = " ";
      state = "template";
      i += 1;
      continue;
    }
    i += 1;
  }
  return out.join("");
}

function estimateStaticFunctionCount(source) {
  const masked = maskStringsAndComments(source);
  const seenPositions = new Set();

  const functionPattern = /\bfunction\b\s*[A-Za-z0-9_$]*\s*\(/g;
  for (const match of masked.matchAll(functionPattern)) {
    seenPositions.add(match.index);
  }

  const arrowPattern = /(?:^|[=(:,\[])\s*(?:async\s*)?(?:\([^()]*\)|[A-Za-z_$][\w$]*)\s*=>/gm;
  for (const match of masked.matchAll(arrowPattern)) {
    seenPositions.add(match.index);
  }

  const methodPattern = /(?:^|\n)\s*(?:async\s+)?(?:get\s+|set\s+)?([A-Za-z_$][\w$]*)\s*\([^()\n{};]*\)\s*\{/gm;
  for (const match of masked.matchAll(methodPattern)) {
    const methodName = match[1];
    if (METHOD_KEYWORD_BLOCKLIST.has(methodName)) continue;
    seenPositions.add(match.index);
  }

  return seenPositions.size;
}

function isLikelyRootCoverageFunction(fn, sourceLength) {
  if (!fn || !Array.isArray(fn.ranges) || fn.ranges.length === 0) return false;
  const startOffset = Math.min(...fn.ranges.map((range) => range.startOffset));
  const endOffset = Math.max(...fn.ranges.map((range) => range.endOffset));
  const rootSpan = startOffset === 0 && endOffset >= sourceLength - 1;
  const name = fn.functionName || "";
  const anonymous = name === "" || name === "(anonymous)";
  return rootSpan && anonymous;
}

function normalizeCoverageUrlToFile(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const pathname = decodeURIComponent(parsed.pathname || "");
    const rel = pathname.replace(/^\/+/, "");
    if (!rel) return null;
    return normalizeSlashes(rel);
  } catch {
    if (url.startsWith("/")) return normalizeSlashes(url.replace(/^\/+/, ""));
    return null;
  }
}

function normalizeMessage(text) {
  return String(text)
    .replace(/\b\d+\b/g, "<n>")
    .replace(/\b0x[a-f0-9]+\b/gi, "0x<hex>")
    .replace(/https?:\/\/\S+/g, "<url>")
    .trim();
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  let rawFiles = [];
  try {
    rawFiles = (await walkFiles(RAW_DIR)).filter((file) => file.endsWith(".json"));
  } catch {
    rawFiles = [];
  }

  if (rawFiles.length === 0) {
    const message = `No raw Playwright coverage artifacts found at ${normalizeSlashes(path.relative(ROOT_DIR, RAW_DIR))}. Run with PLAYWRIGHT_COVERAGE=1 first.`;
    console.error(message);
    process.exit(1);
  }

  const perFileObserved = new Map();
  const allConsoleLogs = [];
  const allPageErrors = [];

  for (const rawPath of rawFiles) {
    const raw = JSON.parse(await fs.readFile(rawPath, "utf8"));
    const rawRelPath = toRelativeIfInRepo(rawPath) ?? rawPath;

    if (Array.isArray(raw.logs)) {
      for (const log of raw.logs) {
        allConsoleLogs.push({
          test: raw.titlePath || [raw.title || rawRelPath],
          project: raw.project || "unknown",
          type: log.type || "log",
          text: log.text || "",
          location: log.location || null,
        });
      }
    }

    if (Array.isArray(raw.pageErrors)) {
      for (const pageError of raw.pageErrors) {
        allPageErrors.push({
          test: raw.titlePath || [raw.title || rawRelPath],
          project: raw.project || "unknown",
          message: pageError.message || String(pageError),
          stack: pageError.stack || "",
        });
      }
    }

    if (!Array.isArray(raw.coverage)) continue;

    for (const entry of raw.coverage) {
      const relFile = normalizeCoverageUrlToFile(entry.url);
      if (!relFile) continue;
      const ext = path.extname(relFile);
      if (!SOURCE_EXTENSIONS.has(ext)) continue;
      if (!SOURCE_DIRS.some((prefix) => relFile.startsWith(`${prefix}/`))) continue;

      const absFile = path.join(ROOT_DIR, relFile);
      try {
        await fs.access(absFile);
      } catch {
        continue;
      }

      const existing = perFileObserved.get(relFile) || {
        functionMap: new Map(),
      };

      for (const fn of entry.functions || []) {
        if (isLikelyRootCoverageFunction(fn, entry.text?.length ?? 0)) continue;
        const startOffset = Math.min(...fn.ranges.map((range) => range.startOffset));
        const endOffset = Math.max(...fn.ranges.map((range) => range.endOffset));
        const key = `${startOffset}:${endOffset}:${fn.functionName || ""}`;
        const covered = fn.ranges.some((range) => range.count > 0);
        const previous = existing.functionMap.get(key) || false;
        existing.functionMap.set(key, previous || covered);
      }

      perFileObserved.set(relFile, existing);
    }
  }

  const sourceFiles = [];
  for (const sourceDir of SOURCE_DIRS) {
    const absDir = path.join(ROOT_DIR, sourceDir);
    let files = [];
    try {
      files = await walkFiles(absDir);
    } catch {
      files = [];
    }
    for (const absPath of files) {
      const ext = path.extname(absPath);
      if (!SOURCE_EXTENSIONS.has(ext)) continue;
      const rel = toRelativeIfInRepo(absPath);
      if (!rel) continue;
      sourceFiles.push(rel);
    }
  }

  sourceFiles.sort();

  const fileSummaries = [];
  let overallCoveredFunctions = 0;
  let overallEstimatedFunctions = 0;
  let loadedFileCount = 0;

  for (const relFile of sourceFiles) {
    const absPath = path.join(ROOT_DIR, relFile);
    const source = await fs.readFile(absPath, "utf8");
    const estimatedFunctions = estimateStaticFunctionCount(source);
    const observed = perFileObserved.get(relFile);
    const observedTotal = observed ? observed.functionMap.size : 0;
    const observedCovered = observed
      ? Array.from(observed.functionMap.values()).filter(Boolean).length
      : 0;
    const effectiveTotal = Math.max(estimatedFunctions, observedTotal);
    const effectiveCovered = Math.min(observedCovered, effectiveTotal);
    const pct = effectiveTotal > 0 ? (effectiveCovered / effectiveTotal) * 100 : 100;

    if (observed) loadedFileCount += 1;
    overallEstimatedFunctions += effectiveTotal;
    overallCoveredFunctions += effectiveCovered;

    fileSummaries.push({
      file: relFile,
      loadedByPlaywright: Boolean(observed),
      estimatedFunctions,
      observedFunctions: observedTotal,
      coveredFunctions: effectiveCovered,
      functionCoveragePct: Number(pct.toFixed(2)),
    });
  }

  fileSummaries.sort((a, b) => a.functionCoveragePct - b.functionCoveragePct);

  const overallCoveragePct =
    overallEstimatedFunctions > 0
      ? Number(((overallCoveredFunctions / overallEstimatedFunctions) * 100).toFixed(2))
      : 0;

  const consoleErrorLike = allConsoleLogs.filter((entry) =>
    ["error", "warning", "assert"].includes(String(entry.type).toLowerCase()),
  );

  const groupedIssues = new Map();
  for (const entry of consoleErrorLike) {
    const key = `console:${entry.type}:${normalizeMessage(entry.text)}`;
    const existing = groupedIssues.get(key) || {
      kind: "console",
      level: entry.type,
      message: normalizeMessage(entry.text),
      count: 0,
      samples: [],
    };
    existing.count += 1;
    if (existing.samples.length < 5) {
      existing.samples.push({
        test: entry.test.join(" > "),
        rawMessage: entry.text,
      });
    }
    groupedIssues.set(key, existing);
  }

  for (const entry of allPageErrors) {
    const key = `pageerror:${normalizeMessage(entry.message)}`;
    const existing = groupedIssues.get(key) || {
      kind: "pageerror",
      level: "error",
      message: normalizeMessage(entry.message),
      count: 0,
      samples: [],
    };
    existing.count += 1;
    if (existing.samples.length < 5) {
      existing.samples.push({
        test: entry.test.join(" > "),
        rawMessage: entry.message,
      });
    }
    groupedIssues.set(key, existing);
  }

  const topIssues = Array.from(groupedIssues.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 50);

  const summary = {
    generatedAt: new Date().toISOString(),
    scope: {
      sourceDirs: SOURCE_DIRS,
      extensionFilter: Array.from(SOURCE_EXTENSIONS),
    },
    coverage: {
      totalSourceFiles: sourceFiles.length,
      loadedSourceFiles: loadedFileCount,
      estimatedFunctionCount: overallEstimatedFunctions,
      coveredFunctionCount: overallCoveredFunctions,
      functionCoveragePct: overallCoveragePct,
    },
    testArtifacts: {
      rawArtifactCount: rawFiles.length,
      consoleLogCount: allConsoleLogs.length,
      consoleErrorLikeCount: consoleErrorLike.length,
      pageErrorCount: allPageErrors.length,
    },
    topIssues,
    files: fileSummaries,
  };

  const lowCoverageFiles = fileSummaries
    .filter((item) => item.estimatedFunctions >= 5)
    .slice(0, 25);

  const summaryMd = [
    "# Playwright Function Coverage Summary",
    "",
    `Generated: ${summary.generatedAt}`,
    "",
    `Overall function coverage: **${overallCoveragePct}%**`,
    "",
    `Covered functions: ${overallCoveredFunctions}/${overallEstimatedFunctions}`,
    "",
    `Source files loaded during Playwright run: ${loadedFileCount}/${sourceFiles.length}`,
    "",
    "## Console/Page Error Signals",
    "",
    `Console logs captured: ${allConsoleLogs.length}`,
    "",
    `Console error-like entries: ${consoleErrorLike.length}`,
    "",
    `Page errors: ${allPageErrors.length}`,
    "",
    "## Highest-Risk Coverage Gaps",
    "",
    "| File | Coverage % | Covered/Total | Loaded |",
    "| --- | ---: | ---: | :---: |",
    ...lowCoverageFiles.map(
      (item) =>
        `| ${item.file} | ${item.functionCoveragePct}% | ${item.coveredFunctions}/${item.estimatedFunctions} | ${item.loadedByPlaywright ? "yes" : "no"} |`,
    ),
    "",
  ].join("\n");

  const issueLogLines = [
    `Generated: ${summary.generatedAt}`,
    `Console logs: ${allConsoleLogs.length}`,
    `Console error-like: ${consoleErrorLike.length}`,
    `Page errors: ${allPageErrors.length}`,
    "",
    ...topIssues.map((issue, index) => {
      const samples = issue.samples
        .map((sample) => `  - ${sample.test}: ${sample.rawMessage}`)
        .join("\n");
      return `${index + 1}. [${issue.kind}/${issue.level}] x${issue.count}\n   ${issue.message}\n${samples}`;
    }),
  ].join("\n");

  await fs.writeFile(
    path.join(OUTPUT_DIR, "function-coverage-summary.json"),
    JSON.stringify(summary, null, 2),
    "utf8",
  );
  await fs.writeFile(path.join(OUTPUT_DIR, "function-coverage-summary.md"), summaryMd, "utf8");
  await fs.writeFile(path.join(OUTPUT_DIR, "console-issues.log"), issueLogLines, "utf8");
  await fs.writeFile(
    path.join(OUTPUT_DIR, "console-log-summary.json"),
    JSON.stringify(
      {
        generatedAt: summary.generatedAt,
        consoleLogs: allConsoleLogs,
        pageErrors: allPageErrors,
        topIssues,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`Playwright function coverage: ${overallCoveragePct}% (${overallCoveredFunctions}/${overallEstimatedFunctions})`);
  console.log(`Loaded source files: ${loadedFileCount}/${sourceFiles.length}`);
  console.log(`Console/page issues: ${topIssues.length} grouped signals`);
  console.log(`Summary JSON: artifacts/playwright-coverage/function-coverage-summary.json`);
  console.log(`Summary MD: artifacts/playwright-coverage/function-coverage-summary.md`);
  console.log(`Issue log: artifacts/playwright-coverage/console-issues.log`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
