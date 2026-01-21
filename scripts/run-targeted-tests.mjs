import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const setupImport = new URL("../tests/test-helpers/setup-localstorage.mjs", import.meta.url);
const requestedFiles = process.argv.slice(2);

if (!requestedFiles.length) {
  console.error("No test files provided. Usage: node scripts/run-targeted-tests.mjs <file...>");
  process.exit(1);
}

const testFiles = requestedFiles.map((file) =>
  path.isAbsolute(file) ? file : path.join(rootDir, file),
);

for (const testFile of testFiles) {
  try {
    await access(testFile);
  } catch (error) {
    console.error(`Test file not found: ${testFile}`);
    throw error;
  }
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

console.log("\n✔ Targeted tests passed");
