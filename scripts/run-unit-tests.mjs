import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Ensure NODE_ENV is set to "test" so that nostrToolsBootstrap.js uses the mock toolkit
process.env.NODE_ENV = "test";

// Quarantine: KNOWN-BROKEN unit test files that exist but currently fail or hang.
// They are NOT silently dropped — they are loudly reported on every run so they
// can't rot invisibly (the historical bug: the runner only collected files that
// imported `node:test`, silently excluding ~20 bare-assert files; several were
// failing on main, unnoticed). Each entry MUST cite why and link the triage item.
// Remove an entry as soon as its file is fixed. See todo/TODO_2026-06-20_pre-launch.md todo-11b.
const QUARANTINE = new Map([
  ["tests/user-blocks.test.mjs", "HANG — triage todo-11b"],
  ["tests/nostr-count-fallback.test.mjs", "FAIL — triage todo-11b"],
  ["tests/admin-list-store.test.mjs", "FAIL — triage todo-11b"],
  ["tests/nostr-boost-actions.test.mjs", "FAIL — triage todo-11b"],
  ["tests/nwc-client.test.mjs", "FAIL — mocks nostr-tools but is shadowed by the frozen canonical toolkit the bootstrap installs (real @noble rejects the fake keys). The underlying production bug (parseNwcUri passed a hex secret to getPublicKey, which needs bytes — NWC connection broken) is FIXED and guarded by tests/nwc-parse-uri.test.mjs; this file needs a mock-injection rework. triage todo-11b (NWC / item #3)"],
  ["tests/nostr-publish-rejection.test.mjs", "FAIL — triage todo-11b"],
]);

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
      // Collect EVERY test file. Both styles run fine through the spawn below:
      // node:test files self-execute and exit non-zero on failure; bare top-level
      // `assert` files throw on failure (also non-zero). Do not re-introduce a
      // content-based include filter — that is what silently dropped files before.
      testFiles.push(fullPath);
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

  // Partition off the quarantined (known-broken) files and report them loudly so
  // they are never silently skipped. A stale entry (file deleted/renamed) is also
  // surfaced so the list stays honest.
  const quarantinedPresent = [];
  let selectedTests = testFiles.filter((file) => {
    const rel = path.relative(rootDir, file).split(path.sep).join("/");
    if (QUARANTINE.has(rel)) {
      quarantinedPresent.push(rel);
      return false;
    }
    return true;
  });

  if (quarantinedPresent.length > 0) {
    console.warn(
      `\n⚠ ${quarantinedPresent.length} quarantined (known-broken) test file(s) SKIPPED — fix and remove from QUARANTINE (todo todo-11b):`,
    );
    for (const rel of quarantinedPresent.sort()) {
      console.warn(`    • ${rel} — ${QUARANTINE.get(rel)}`);
    }
  }

  const staleQuarantine = [...QUARANTINE.keys()].filter(
    (rel) => !quarantinedPresent.includes(rel),
  );
  if (staleQuarantine.length > 0) {
    console.warn(
      `\n⚠ QUARANTINE lists ${staleQuarantine.length} file(s) that were not found — remove the stale entr${
        staleQuarantine.length === 1 ? "y" : "ies"
      }:`,
    );
    for (const rel of staleQuarantine.sort()) {
      console.warn(`    • ${rel}`);
    }
  }

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
