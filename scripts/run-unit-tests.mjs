import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Ensure NODE_ENV is set to "test" so that nostrToolsBootstrap.js uses the mock toolkit
process.env.NODE_ENV = "test";

const rootDir = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const testsDir = path.join(rootDir, "tests");
const testFiles = [];
const setupImport = new URL("../tests/test-helpers/setup-localstorage.mjs", import.meta.url);
const args = process.argv.slice(2);
const shardArg = args.find((arg) => arg.startsWith("--shard="));
const shardValue = shardArg ? shardArg.split("=")[1] : process.env.UNIT_TEST_SHARD;
const filters = args.filter((arg) => !arg.startsWith("--"));

const timeoutMs = process.env.UNIT_TEST_TIMEOUT_MS
  ? Number(process.env.UNIT_TEST_TIMEOUT_MS)
  : null;

if (timeoutMs !== null && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) {
  throw new Error(
    "UNIT_TEST_TIMEOUT_MS must be a positive number representing milliseconds.",
  );
}

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

function parseShard(value) {
  if (!value) {
    return null;
  }

  const match = /^(\d+)\/(\d+)$/.exec(value.trim());
  if (!match) {
    throw new Error("Shard format must be <index>/<total>, e.g. 1/3.");
  }

  const index = Number(match[1]);
  const total = Number(match[2]);

  if (!Number.isInteger(index) || !Number.isInteger(total) || total < 1) {
    throw new Error("Shard values must be positive integers.");
  }

  if (index < 1 || index > total) {
    throw new Error("Shard index must be between 1 and total (inclusive).");
  }

  return { index, total };
}

async function run() {
  await collectTests(testsDir);

  testFiles.sort((a, b) => a.localeCompare(b));

  if (testFiles.length === 0) {
    console.log("No unit tests found.");
    return;
  }

  let selectedTests = testFiles;

  if (filters.length > 0) {
    selectedTests = selectedTests.filter((file) =>
      filters.some((f) => file.includes(f)),
    );
    if (selectedTests.length === 0) {
      console.log(`No tests matched filters: ${filters.join(", ")}`);
      return;
    }
    console.log(`Filtered to ${selectedTests.length} test(s).`);
  }

  const shard = parseShard(shardValue);
  if (shard) {
    selectedTests = selectedTests.filter(
      (_, index) => index % shard.total === shard.index - 1,
    );
    console.log(
      `Using shard ${shard.index}/${shard.total} (${selectedTests.length} of ${testFiles.length} files).`,
    );
  }

  if (selectedTests.length === 0) {
    console.log("No unit tests found for this shard/filter.");
    return;
  }

  const logFile = path.join(rootDir, "artifacts", "test_unit.log");
  if (!fs.existsSync(path.dirname(logFile))) {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
  }
  const logStream = fs.createWriteStream(logFile);

  for (const testFile of selectedTests) {
    const relativePath = path.relative(rootDir, testFile);
    console.log(`\n→ Running ${relativePath}`);
    logStream.write(`\n→ Running ${relativePath}\n`);

    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ["--import", setupImport.href, testFile], {
        stdio: ["inherit", "pipe", "pipe"],
      });

      child.stdout.pipe(process.stdout, { end: false });
      child.stdout.pipe(logStream, { end: false });

      child.stderr.pipe(process.stderr, { end: false });
      child.stderr.pipe(logStream, { end: false });

      let finished = false;
      let timeoutId = null;

      const finalize = (error) => {
        if (finished) {
          return;
        }
        finished = true;

        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        if (error) {
          reject(error);
          return;
        }

        resolve();
      };

      if (timeoutMs !== null) {
        timeoutId = setTimeout(() => {
          child.kill("SIGKILL");
          finalize(
            new Error(`${relativePath} timed out after ${timeoutMs}ms and was aborted.`),
          );
        }, timeoutMs);
      }

      child.on("close", (code, signal) => {
        if (signal) {
          finalize(new Error(`${relativePath} exited with signal ${signal}`));
          return;
        }

        if (code !== 0) {
          finalize(new Error(`${relativePath} failed with exit code ${code}`));
          return;
        }

        finalize();
      });

      child.on("error", (error) => {
        finalize(error);
      });
    });
  }

  console.log("\n✔ All unit tests passed");
  // Force exit to ensure we don't hang on lingering handles/timers
  process.exit(0);
}

try {
  await run();
} catch (error) {
  console.error(`\n✖ ${error.message}`);
  process.exit(1);
}
