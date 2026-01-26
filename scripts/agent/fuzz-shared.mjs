
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPRODUCER_DIR = path.join(process.cwd(), "examples/reproducers");
const ARTIFACTS_DIR = path.join(process.cwd(), "artifacts");

// Ensure directories exist
if (!fs.existsSync(REPRODUCER_DIR)) {
  fs.mkdirSync(REPRODUCER_DIR, { recursive: true });
}
if (!fs.existsSync(ARTIFACTS_DIR)) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

export const rng = {
  bool: () => Math.random() > 0.5,
  int: (min = 0, max = 100) => Math.floor(Math.random() * (max - min + 1)) + min,
  float: (min = 0, max = 100) => Math.random() * (max - min) + min,
  oneOf: (arr) => arr[Math.floor(Math.random() * arr.length)],

  string: (maxLength = 100) => {
    const len = Math.floor(Math.random() * maxLength);
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < len; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },

  nastyString: () => {
    const candidates = [
      "",
      "null",
      "undefined",
      "NaN",
      "\x00",
      "\n",
      "\r",
      "\t",
      " ",
      "   ",
      "https://example.com",
      "wss://relay.example.com",
      "<script>alert(1)</script>",
      "' OR 1=1 --",
      "javascript:void(0)",
      "data:text/plain;base64,SGVsbG8=",
      "ðŸ˜€",
      "Ã±",
      "\uD83D\uDCA9", // Pile of poo
      "\uD800", // Lone surrogate (high)
      "\uDFFF", // Lone surrogate (low)
      "A".repeat(1000), // Long string
      "A".repeat(10000), // Very long string
      JSON.stringify({ foo: "bar" }),
      "{}",
      "[]"
    ];
    return candidates[Math.floor(Math.random() * candidates.length)];
  },

  mixedString: (maxLength = 100) => {
     if (Math.random() < 0.3) return rng.nastyString();
     return rng.string(maxLength);
  },

  array: (generator, maxLen = 10) => {
    const len = rng.int(0, maxLen);
    const result = [];
    for (let i = 0; i < len; i++) {
      result.push(generator());
    }
    return result;
  },

  object: (keyGen, valGen, maxKeys = 10) => {
    const len = rng.int(0, maxKeys);
    const result = {};
    for (let i = 0; i < len; i++) {
      result[keyGen()] = valGen();
    }
    return result;
  },

  recursiveObject: (depth = 3) => {
    if (depth <= 0) return rng.mixedString();

    const type = rng.int(0, 4);
    if (type === 0) return rng.int(-1000, 1000);
    if (type === 1) return rng.mixedString();
    if (type === 2) return rng.bool();
    if (type === 3) return null;

    if (type === 4) {
       // Array
       const len = rng.int(0, 5);
       const arr = [];
       for(let i=0; i<len; i++) arr.push(rng.recursiveObject(depth - 1));
       return arr;
    }

    // Object
    const len = rng.int(0, 5);
    const obj = {};
    for(let i=0; i<len; i++) {
        obj[rng.string(10)] = rng.recursiveObject(depth - 1);
    }
    return obj;
  }
};

export function saveReproducer(targetName, input, error) {
  const timestamp = Date.now();
  const filename = `fuzz-${targetName}-${timestamp}.json`;
  const filepath = path.join(REPRODUCER_DIR, filename);

  const content = {
    target: targetName,
    timestamp: new Date().toISOString(),
    error: {
        message: error.message,
        stack: error.stack,
        code: error.code,
        name: error.name
    },
    input
  };

  fs.writeFileSync(filepath, JSON.stringify(content, null, 2));
  console.error(`[FUZZ] Saved reproducer to ${filepath}`);
  return filepath;
}

export function saveReport(targetName, stats) {
  const filepath = path.join(ARTIFACTS_DIR, `fuzz-report-${targetName}.json`);
  fs.writeFileSync(filepath, JSON.stringify(stats, null, 2));
  console.log(`[FUZZ] Saved report to ${filepath}`);
}

export async function runFuzzer(targetName, iterations, testFn) {
  console.log(`[FUZZ] Starting fuzzer for ${targetName} with ${iterations} iterations...`);

  const stats = {
    target: targetName,
    iterations: 0,
    passed: 0,
    failed: 0,
    crashes: [], // List of { input, error, reproducerPath }
    startTime: Date.now(),
    endTime: null
  };

  for (let i = 0; i < iterations; i++) {
    stats.iterations++;
    let input = null;

    try {
      input = await testFn(i);
      stats.passed++;
    } catch (err) {
      stats.failed++;
      const reproducerPath = saveReproducer(targetName, input, err);
      stats.crashes.push({
        iteration: i,
        error: err.message,
        reproducerPath
      });
      // Optionally stop on first crash or continue
      // For now, we continue but log it.
    }

    if (i % 100 === 0 && i > 0) {
        process.stdout.write(".");
    }
  }
  process.stdout.write("\n");

  stats.endTime = Date.now();
  stats.duration = stats.endTime - stats.startTime;

  console.log(`[FUZZ] Finished. ${stats.passed} passed, ${stats.failed} failed.`);
  saveReport(targetName, stats);

  return stats;
}
