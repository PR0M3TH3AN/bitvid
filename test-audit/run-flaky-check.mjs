import { spawn } from "node:child_process";
import fs from "node:fs";

const ITERATIONS = 3;
const MATRIX_FILE = "test-audit/flakiness-matrix.json";

// Parse command line arguments or use default
const args = process.argv.slice(2);
const command = args.length > 0 ? args[0] : "npm";
const commandArgs = args.length > 1 ? args.slice(1) : ["run", "test:unit"];

console.log(`Running flakiness check: ${command} ${commandArgs.join(" ")} (${ITERATIONS}x)`);

function runTest(iteration) {
  return new Promise((resolve) => {
    const child = spawn(command, commandArgs, { stdio: "pipe" });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => { stdout += data.toString(); });
    child.stderr.on("data", (data) => { stderr += data.toString(); });

    child.on("close", (code) => {
      // Check for TAP failures or other failure indicators
      const hasTapFailure = stdout.includes("not ok") || stdout.includes("FAIL");
      const passed = code === 0 && !hasTapFailure;
      resolve({ passed, code, stdout, stderr });
    });

    child.on("error", (err) => {
        resolve({ passed: false, code: -1, stdout: "", stderr: err.message });
    });
  });
}

async function main() {
  const results = [];

  for (let i = 0; i < ITERATIONS; i++) {
    console.log(`Iteration ${i + 1}/${ITERATIONS}...`);
    const startTime = Date.now();
    const result = await runTest(i);
    const duration = Date.now() - startTime;

    const entry = {
      iteration: i + 1,
      passed: result.passed,
      code: result.code,
      duration,
      failure: result.passed ? null : "Suite failed"
    };
    results.push(entry);

    if (!result.passed) {
      console.log(`  Failed (code ${result.code}).`);
    } else {
      console.log(`  Passed (${duration}ms).`);
    }

    // Save incrementally
    fs.writeFileSync(MATRIX_FILE, JSON.stringify(results, null, 2));
  }

  console.log(`Flakiness matrix written to ${MATRIX_FILE}`);
}

main();
