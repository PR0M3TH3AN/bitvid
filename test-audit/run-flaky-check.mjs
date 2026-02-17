import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const RUNS = 3;
const RESULTS_FILE = "test-audit/flakiness-matrix.json";

async function runTests(runIndex) {
  console.log(`Starting Run ${runIndex + 1}/${RUNS}...`);
  return new Promise((resolve) => {
    const child = spawn("npm", ["run", "test:unit"], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: true
    });

    let output = "";
    child.stdout.on("data", (d) => output += d.toString());
    child.stderr.on("data", (d) => output += d.toString());

    child.on("close", (code) => {
      resolve({ code, output });
    });
  });
}

function parseFailedFiles(output) {
  const failedFiles = [];
  const lines = output.split("\n");
  for (const line of lines) {
    // Look for "failed with exit code" or similar from run-unit-tests.mjs
    // The script logs: "Error: <relativePath> failed with exit code <code>"
    // or "Error: <relativePath> timed out..."
    const match = line.match(/Error: (.+) (failed with exit code|timed out)/);
    if (match) {
      failedFiles.push(match[1]);
    }
  }
  return failedFiles;
}

async function main() {
  const matrix = {
    runs: [],
    flakyFiles: []
  };

  const fileStatus = {}; // { filename: { pass: 0, fail: 0 } }

  for (let i = 0; i < RUNS; i++) {
    const { code, output } = await runTests(i);
    const failedFiles = parseFailedFiles(output);
    const passed = code === 0;

    matrix.runs.push({
      run: i + 1,
      passed,
      failedFiles
    });

    // We assume all files ran if the suite finished, or at least the ones that didn't fail passed.
    // But since run-unit-tests.mjs aborts on first failure?
    // Wait, let's check run-unit-tests.mjs logic.
    // It loops through `selectedTests` and awaits each spawn.
    // If a test fails, `finalize` is called with error.
    // `child.on("close", ...)` calls finalize.
    // The `run()` function in `run-unit-tests.mjs`:
    // `try { await run(); } catch ...`
    // Inside `run()`, it loops. If `spawn` promise rejects, the loop breaks?
    // `await new Promise(...)`. If reject is called, `run()` throws and exits?
    // Yes: `try { await run() } catch (e) { ... process.exit(1) }`.
    // So if one file fails, the whole suite stops.
    // This makes flakiness detection harder because subsequent files aren't run.
    // However, if the suite passes, all files passed.
    // If it fails, one file failed.

    // We can just track which file failed if any.
    if (failedFiles.length > 0) {
      for (const file of failedFiles) {
         if (!fileStatus[file]) fileStatus[file] = { failures: 0 };
         fileStatus[file].failures++;
      }
    }
  }

  // Identify flaky files: files that failed in some runs but not all?
  // Or just list files that failed at all.
  // If a file fails every time, it's broken, not flaky (unless we fixed it and it broke again).
  // If it fails sometimes, it's flaky.
  // Since we stop on first failure, we can't know if subsequent files would have failed.

  // We'll just record the matrix.

  await fs.writeFile(RESULTS_FILE, JSON.stringify(matrix, null, 2));
  console.log(`Flakiness check complete. Saved to ${RESULTS_FILE}`);
}

main().catch(console.error);
