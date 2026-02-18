import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = process.cwd();
const testsDir = path.join(rootDir, "tests");
const resultsFile = path.join(rootDir, "test-audit/suspicious-tests.json");

const checks = {
  zeroAssertions: {
    regex: /(expect\(|assert\.|t\.is|chai\.expect|should\.)/,
    message: "No obvious assertions found",
    inverted: true // fails if NOT found
  },
  focusedOrSkipped: {
    regex: /\.(only|skip)\(/,
    message: "Test is focused (.only) or skipped (.skip)"
  },
  sleeps: {
    regex: /(setTimeout\(|sleep\(|await delay\(|new Promise\(r => setTimeout)/,
    message: "Uses setTimeout/sleep (brittle)"
  },
  network: {
    regex: /(fetch\(|axios\.|new WebSocket|WebSocket\()/,
    message: "Direct network usage found"
  },
  mocking: {
    regex: /(jest\.mock|sinon\.stub|proxyquire|rewire|vi\.mock|vi\.spy)/,
    message: "Heavy mocking detected"
  },
  console: {
    regex: /console\.(log|warn|error)/,
    message: "Console usage inside test"
  }
};

async function collectTests(dir, testFiles = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === "visual") continue; // Skip visual tests if needed?
      await collectTests(fullPath, testFiles);
      continue;
    }

    if (entry.isFile() && (entry.name.endsWith(".test.mjs") || entry.name.endsWith(".test.js"))) {
      testFiles.push(fullPath);
    }
  }
  return testFiles;
}

async function analyzeFile(filepath) {
  const content = await fs.readFile(filepath, "utf8");
  const issues = [];

  for (const [key, check] of Object.entries(checks)) {
    const match = check.regex.test(content);
    if (check.inverted) {
      if (!match) issues.push(check.message);
    } else {
      if (match) issues.push(check.message);
    }
  }

  return issues;
}

async function run() {
  const testFiles = await collectTests(testsDir);
  const suspiciousTests = {};

  for (const file of testFiles) {
    const issues = await analyzeFile(file);
    if (issues.length > 0) {
      const relativePath = path.relative(rootDir, file);
      suspiciousTests[relativePath] = issues;
    }
  }

  await fs.writeFile(resultsFile, JSON.stringify(suspiciousTests, null, 2));
  console.log(`Static analysis complete. Found issues in ${Object.keys(suspiciousTests).length} files.`);
}

run().catch(console.error);
