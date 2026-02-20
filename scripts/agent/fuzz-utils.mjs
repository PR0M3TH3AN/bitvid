import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ARTIFACTS_DIR = path.resolve(__dirname, "../../artifacts");
const REPRODUCERS_DIR = path.resolve(__dirname, "../../examples/reproducers");

if (!fs.existsSync(ARTIFACTS_DIR)) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

if (!fs.existsSync(REPRODUCERS_DIR)) {
  fs.mkdirSync(REPRODUCERS_DIR, { recursive: true });
}

export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomBoolean() {
  return Math.random() < 0.5;
}

export function randomString(length = 10, includeUnicode = false) {
  let result = "";
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const unicodeChars = "😀😎🌍🚀中文测试ñçüéåß∂ƒ©˙∆˚¬…æΩ≈ç√∫˜µ≤≥÷";
  const controlChars = "\x00\x01\x02\n\r\t\b\f\v";

  // Use Array.from to correctly handle surrogate pairs
  const pool = Array.from(
    characters +
      (includeUnicode ? unicodeChars : "") +
      (includeUnicode ? controlChars : "")
  );

  for (let i = 0; i < length; i++) {
    result += pool[Math.floor(Math.random() * pool.length)];
  }
  return result;
}

export function randomHex(length = 64) {
  let result = "";
  const characters = "0123456789abcdef";
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

export function randomArray(generator, minLength = 0, maxLength = 10) {
  const length = randomInt(minLength, maxLength);
  const result = [];
  for (let i = 0; i < length; i++) {
    result.push(generator());
  }
  return result;
}

export function randomValue(depth = 0, maxDepth = 3) {
  if (depth > maxDepth) {
    return randomString(5);
  }
  const type = randomInt(0, 5);
  switch (type) {
    case 0:
      return randomInt(-1000, 1000);
    case 1:
      return randomString(randomInt(0, 100), true);
    case 2:
      return randomBoolean();
    case 3:
      return null;
    case 4:
      return undefined;
    case 5:
      return randomObject(depth + 1, maxDepth);
    default:
      return null;
  }
}

export function randomObject(depth = 0, maxDepth = 3) {
  if (depth > maxDepth) {
    return {};
  }
  const numKeys = randomInt(0, 5);
  const obj = {};
  for (let i = 0; i < numKeys; i++) {
    const key = randomString(5);
    obj[key] = randomValue(depth + 1, maxDepth);
  }
  return obj;
}

export async function runFuzzer(targetName, fn, generator, defaultIterations = 1000) {
  const envIterations = process.env.FUZZ_ITERATIONS ? parseInt(process.env.FUZZ_ITERATIONS, 10) : NaN;
  const iterations = !isNaN(envIterations) ? envIterations : defaultIterations;

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD
  const reportPath = path.join(ARTIFACTS_DIR, `fuzz-report-${targetName}-${today}.json`);
  const failures = [];

  console.log(`Starting fuzzer for ${targetName} with ${iterations} iterations...`);

  for (let i = 0; i < iterations; i++) {
    const inputs = generator();
    try {
      const result = await fn(...inputs);
      // Optional: Check if result is valid if we have a way to know
    } catch (error) {
      console.error(`Crash in ${targetName} at iteration ${i}:`, error.message);
      const failure = {
        iteration: i,
        inputs,
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name
        },
      };
      failures.push(failure);

      // Save reproducer
      const reproDir = path.join(
        REPRODUCERS_DIR,
        `fuzz-${targetName}-${today}`
      );
      if (!fs.existsSync(reproDir)) {
          fs.mkdirSync(reproDir, { recursive: true });
      }

      const reproducerPath = path.join(reproDir, `case-${i}.json`);
      fs.writeFileSync(reproducerPath, JSON.stringify(inputs, null, 2));
    }
  }

  // Always write the report, even if empty (as per requirement: "an empty array [] ... indicates zero failures")
  fs.writeFileSync(reportPath, JSON.stringify(failures, null, 2));
  console.log(`Fuzzer finished. Found ${failures.length} failures. Report saved to ${reportPath}`);
  return failures;
}
