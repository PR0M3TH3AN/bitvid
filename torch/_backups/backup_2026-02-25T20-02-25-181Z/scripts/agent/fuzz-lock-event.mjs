import { parseLockEvent } from '../../src/lib.mjs';
import fs from 'node:fs';
import path from 'node:path';

// Seeded random number generator (simple LCG)
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = process.env.SEED ? parseInt(process.env.SEED, 10) : Date.now();
const ITERATIONS = 10000;
const rand = mulberry32(SEED);

console.log(`Starting fuzz run. SEED=${SEED}, ITERATIONS=${ITERATIONS}`);

const REPRO_DIR = 'examples/reproducers/fuzz-lock-event-' + new Date().toISOString().slice(0, 10).replace(/-/g, '');
if (!fs.existsSync(REPRO_DIR)) {
  fs.mkdirSync(REPRO_DIR, { recursive: true });
}

let failures = 0;

function randomString(length) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(rand() * chars.length));
  }
  return result;
}

function randomJson() {
  const types = ['object', 'array', 'string', 'number', 'boolean', 'null'];
  const type = types[Math.floor(rand() * types.length)];

  if (type === 'object') {
    const obj = {};
    const keys = Math.floor(rand() * 5);
    for (let i = 0; i < keys; i++) {
      obj[randomString(5)] = randomJson();
    }
    return obj;
  } else if (type === 'array') {
    const arr = [];
    const len = Math.floor(rand() * 5);
    for (let i = 0; i < len; i++) {
      arr.push(randomJson());
    }
    return arr;
  } else if (type === 'string') {
    return randomString(10);
  } else if (type === 'number') {
    return rand() * 1000;
  } else if (type === 'boolean') {
    return rand() > 0.5;
  } else {
    return null;
  }
}

function generateEvent() {
  const malformed = rand() > 0.8;
  const content = malformed ? randomString(100) : JSON.stringify(randomJson());

  const tags = [];
  const numTags = Math.floor(rand() * 5);
  for (let i = 0; i < numTags; i++) {
    const tagLen = Math.floor(rand() * 3) + 1;
    const tag = [];
    for (let j = 0; j < tagLen; j++) {
      tag.push(randomString(10));
    }
    tags.push(tag);
  }

  // Sometimes add specific tags
  if (rand() > 0.5) {
    tags.push(['d', randomString(20)]);
  }
  if (rand() > 0.5) {
    tags.push(['expiration', String(Math.floor(Date.now() / 1000) + 1000)]);
  }

  return {
    id: randomString(64), // Mock ID
    pubkey: randomString(64), // Mock Pubkey
    created_at: Math.floor(Date.now() / 1000),
    tags: tags,
    content: content
  };
}

for (let i = 0; i < ITERATIONS; i++) {
  const event = generateEvent();

  try {
    parseLockEvent(event);
  } catch (err) {
    failures++;
    console.error(`Failure #${failures} at iteration ${i}: ${err.message}`);

    const reproFile = path.join(REPRO_DIR, `repro-${i}.json`);
    fs.writeFileSync(reproFile, JSON.stringify(event, null, 2));

    const reproScript = path.join(REPRO_DIR, `run-repro-${i}.mjs`);
    const scriptContent = `
import { parseLockEvent } from '../../../src/lib.mjs';
import fs from 'node:fs';

const event = JSON.parse(fs.readFileSync('repro-${i}.json', 'utf8'));
console.log('Running repro case...');
try {
  parseLockEvent(event);
  console.log('Success (no crash)');
} catch (err) {
  console.error('Crash reproduced:', err);
  process.exit(1);
}
`;
    fs.writeFileSync(reproScript, scriptContent);
  }
}

if (failures === 0) {
  console.log('Fuzzing completed successfully. No failures found.');
  // Clean up empty directory if no failures
  try {
    fs.rmdirSync(REPRO_DIR);
  } catch {
    // Ignore error if directory is not empty or missing
  }
} else {
  console.log(`Fuzzing completed with ${failures} failures.`);
  process.exit(1);
}
