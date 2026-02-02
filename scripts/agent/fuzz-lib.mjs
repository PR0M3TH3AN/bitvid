// Fuzzing library for agent scripts
import fs from "fs";
import path from "path";
import crypto from "crypto";

export class Fuzzer {
  constructor(targetName) {
    this.targetName = targetName;
    this.artifactsDir = path.join(process.cwd(), "artifacts");
    this.reproducersDir = path.join(process.cwd(), "examples", "reproducers", targetName);
    this.reportPath = path.join(this.artifactsDir, `fuzz-report-${targetName}.json`);
    this.issues = [];

    if (!fs.existsSync(this.artifactsDir)) {
      fs.mkdirSync(this.artifactsDir, { recursive: true });
    }
    if (!fs.existsSync(this.reproducersDir)) {
      fs.mkdirSync(this.reproducersDir, { recursive: true });
    }
  }

  // Random Primitives

  randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  randBool() {
    return Math.random() < 0.5;
  }

  randByte() {
    return this.randInt(0, 255);
  }

  randBytes(length) {
    return crypto.randomBytes(length);
  }

  randString(length, charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789") {
    let result = "";
    for (let i = 0; i < length; i++) {
      result += charset.charAt(this.randInt(0, charset.length - 1));
    }
    return result;
  }

  randUnicodeString(length) {
    let result = "";
    for (let i = 0; i < length; i++) {
      // Basic multilingual plane + some surrogate pairs
      if (Math.random() < 0.1) {
        // High surrogate
        result += String.fromCharCode(this.randInt(0xD800, 0xDBFF));
      } else if (Math.random() < 0.1) {
        // Low surrogate
        result += String.fromCharCode(this.randInt(0xDC00, 0xDFFF));
      } else {
        result += String.fromCharCode(this.randInt(0, 0xFFFF));
      }
    }
    return result;
  }

  randBuffer(length) {
    return this.randBytes(length);
  }

  // Structured Data

  randArray(generator, minLen = 0, maxLen = 10) {
    const len = this.randInt(minLen, maxLen);
    const arr = [];
    for (let i = 0; i < len; i++) {
      arr.push(generator());
    }
    return arr;
  }

  randObject(schema) {
    const obj = {};
    for (const [key, generator] of Object.entries(schema)) {
      if (Math.random() > 0.1) { // 10% chance to miss field
        obj[key] = generator();
      }
    }
    return obj;
  }

  randJSON() {
    const types = ["string", "number", "object", "array", "boolean", "null"];
    const type = types[this.randInt(0, types.length - 1)];

    switch (type) {
      case "string": return this.randUnicodeString(this.randInt(0, 100));
      case "number": return Math.random() * 10000;
      case "boolean": return this.randBool();
      case "null": return null;
      case "array": return this.randArray(() => this.randJSON(), 0, 3); // keep depth low
      case "object": {
        const obj = {};
        const keys = this.randInt(0, 5);
        for(let i=0; i<keys; i++) {
          obj[this.randString(5)] = this.randJSON();
        }
        return obj;
      }
    }
  }

  generateMalformedJSON() {
    const json = JSON.stringify(this.randJSON());
    // Mutate
    const mutationType = this.randInt(0, 2);
    if (mutationType === 0) {
      // Truncate
      return json.slice(0, this.randInt(0, json.length));
    } else if (mutationType === 1) {
      // Insert garbage
      const pos = this.randInt(0, json.length);
      return json.slice(0, pos) + this.randString(5) + json.slice(pos);
    } else {
      // Delete chunk
      const start = this.randInt(0, json.length);
      const end = this.randInt(start, json.length);
      return json.slice(0, start) + json.slice(end);
    }
  }

  pick(arr) {
    if (arr.length === 0) return undefined;
    return arr[this.randInt(0, arr.length - 1)];
  }

  // Execution

  async runFuzzLoop(iterations, testFn) {
    console.log(`Starting fuzzing for ${this.targetName} with ${iterations} iterations...`);

    for (let i = 0; i < iterations; i++) {
      const state = {};
      try {
        await testFn(this, state);
      } catch (err) {
        this.reportIssue(err, state.input);
      }

      if ((i + 1) % 100 === 0) {
        process.stdout.write(".");
      }
    }
    console.log("\nFuzzing complete.");
    this.writeReport();
  }

  reportIssue(error, input) {
    const hash = crypto.createHash("sha256").update(JSON.stringify(input) + error.stack).digest("hex").slice(0, 16);
    const issue = {
      hash,
      message: error.message,
      stack: error.stack,
      input: input,
      timestamp: new Date().toISOString()
    };

    // Check for duplicate
    if (this.issues.some(i => i.hash === hash)) return;

    this.issues.push(issue);
    console.error(`\n[Found Issue] ${error.message} (Hash: ${hash})`);

    // Write reproducer
    const reproPath = path.join(this.reproducersDir, `${hash}.json`);
    fs.writeFileSync(reproPath, JSON.stringify(issue, null, 2));
  }

  writeReport() {
    const report = {
      target: this.targetName,
      timestamp: new Date().toISOString(),
      issues: this.issues
    };
    fs.writeFileSync(this.reportPath, JSON.stringify(report, null, 2));
    console.log(`Report written to ${this.reportPath}`);
    if (this.issues.length > 0) {
      console.log(`Found ${this.issues.length} unique issues.`);
    } else {
      console.log("No issues found.");
    }
  }
}
