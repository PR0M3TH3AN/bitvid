import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const testsDir = path.join(rootDir, "tests");
const testFiles = [];
const setupImport = new URL("../tests/test-helpers/setup-localstorage.mjs", import.meta.url);

async function collectTests(dir) {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === "visual") {
        continue;
      }

      await collectTests(fullPath);
      continue;
    }

    const isTestFile =
      entry.isFile() &&
      (entry.name.endsWith(".test.mjs") || entry.name.endsWith(".test.js"));

    if (isTestFile) {
      const content = await readFile(fullPath, "utf8");
      if (content.includes("node:test")) {
        testFiles.push(fullPath);
      }
    }
  }
}

await collectTests(testsDir);

testFiles.sort((a, b) => a.localeCompare(b));

if (testFiles.length === 0) {
  console.log("No unit tests found.");
  process.exit(0);
}

for (const testFile of testFiles) {
  const relativePath = path.relative(rootDir, testFile);
  console.log(`\n→ Running ${relativePath}`);

  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", setupImport.href, testFile], {
      stdio: "inherit",
    });

    child.on("close", (code, signal) => {
      if (signal) {
        reject(new Error(`${relativePath} exited with signal ${signal}`));
        return;
      }

      if (code !== 0) {
        reject(new Error(`${relativePath} failed with exit code ${code}`));
        return;
      }

      resolve();
    });

    child.on("error", (error) => {
      reject(error);
    });
  });
}

console.log("\n✔ All unit tests passed");
