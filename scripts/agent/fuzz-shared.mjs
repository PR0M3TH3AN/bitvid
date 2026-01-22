
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPRODUCERS_DIR = path.resolve(__dirname, "../../examples/reproducers");
const ARTIFACTS_DIR = path.resolve(__dirname, "../../artifacts");

// Ensure directories exist
if (!fs.existsSync(REPRODUCERS_DIR)) {
  fs.mkdirSync(REPRODUCERS_DIR, { recursive: true });
}
if (!fs.existsSync(ARTIFACTS_DIR)) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomString(length) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+{}|:<>?~`-=[]\\;',./";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function randomHex(length) {
  const chars = "0123456789abcdef";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function randomBoolean() {
  return Math.random() < 0.5;
}

export function randomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

export function randomJSON(depth = 3, maxFields = 5) {
  if (depth <= 0) {
    const type = randomInt(0, 3);
    if (type === 0) return randomString(10);
    if (type === 1) return randomInt(-1000, 1000);
    if (type === 2) return randomBoolean();
    return null;
  }

  const type = randomInt(0, 5);
  if (type === 0) {
    // Array
    const arr = [];
    const len = randomInt(0, maxFields);
    for (let i = 0; i < len; i++) {
      arr.push(randomJSON(depth - 1, maxFields));
    }
    return arr;
  } else if (type === 1) {
    // Object
    const obj = {};
    const len = randomInt(0, maxFields);
    for (let i = 0; i < len; i++) {
      obj[randomString(5)] = randomJSON(depth - 1, maxFields);
    }
    return obj;
  } else {
    // Scalar
    return randomJSON(0);
  }
}

export function saveReproducer(target, input, error) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `crash-${target}-${timestamp}.json`;
  const filepath = path.join(REPRODUCERS_DIR, filename);

  const report = {
    target,
    timestamp: new Date().toISOString(),
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name
    },
    input
  };

  fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
  console.error(`[FUZZ] Saved reproducer to ${filepath}`);
  return filename;
}

export async function runFuzzer(name, fuzzFn, iterations = 1000) {
  console.log(`[FUZZ] Starting fuzzer for ${name} with ${iterations} iterations...`);
  const crashes = [];
  const start = Date.now();

  for (let i = 0; i < iterations; i++) {
    if (i % 100 === 0) process.stdout.write(".");
    let currentInput = null;
    try {
      const input = await fuzzFn(i);
      currentInput = input;
    } catch (error) {
      process.stdout.write("E");
      const filename = saveReproducer(name, currentInput, error);
      crashes.push({
        iteration: i,
        error: error.message,
        reproducer: filename
      });
    }
  }

  console.log("\n");
  const duration = (Date.now() - start) / 1000;
  console.log(`[FUZZ] Finished ${name} in ${duration.toFixed(2)}s. Crashes: ${crashes.length}`);

  const reportPath = path.join(ARTIFACTS_DIR, `fuzz-report-${name}.json`);
  const report = {
    target: name,
    iterations,
    duration,
    crashes
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`[FUZZ] Saved report to ${reportPath}`);
}
