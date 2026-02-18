import {
  randomInt,
  randomString,
  runFuzzer,
} from "./fuzz-utils.mjs";
import { validateEventStructure, NOTE_TYPES } from "../../js/nostrEventSchemas.js";

function generateAggressiveJSON(depth = 0) {
  if (depth > 50) return "deep"; // Stop before stack overflow unless we want to test that limit

  const choice = randomInt(0, 10);

  if (choice < 2) {
    // Nested Object
    const obj = {};
    const key = Math.random() < 0.1 ? "__proto__" : (Math.random() < 0.1 ? "constructor" : randomString(5));
    obj[key] = generateAggressiveJSON(depth + 1);
    return obj;
  }

  if (choice < 4) {
    // Nested Array
    return [generateAggressiveJSON(depth + 1)];
  }

  if (choice < 5) {
    // Huge String
    return randomString(10000);
  }

  if (choice < 6) {
    // Unicode Chaos
    return "\uD800\uDC00" + randomString(100, true) + "\uFFFF";
  }

  if (choice < 7) {
    return null;
  }

  if (choice < 8) {
    return true;
  }

  return 12345;
}

function genAggressiveEvent() {
  const types = Object.values(NOTE_TYPES);
  const type = types[randomInt(0, types.length - 1)];

  // Malformed structure
  if (Math.random() < 0.1) return [type, null];
  if (Math.random() < 0.1) return [type, []];
  if (Math.random() < 0.1) return [type, "string"];

  const event = {
    kind: randomInt(0, 50000),
    tags: [],
    content: ""
  };

  // Malformed tags
  if (Math.random() < 0.5) {
    const numTags = randomInt(0, 100);
    for(let i=0; i<numTags; i++) {
        if (Math.random() < 0.1) event.tags.push(null);
        else if (Math.random() < 0.1) event.tags.push("string");
        else event.tags.push([randomString(5), randomString(20)]);
    }
  }

  // Aggressive Content
  try {
    const aggressive = generateAggressiveJSON();
    event.content = JSON.stringify(aggressive);
  } catch (e) {
    event.content = "{}";
  }

  // Sometimes unparsable JSON
  if (Math.random() < 0.2) {
    event.content = "{ unparsable: true, " + randomString(50);
  }

  return [type, event];
}

async function main() {
  await runFuzzer(
    "validateEventStructure-Aggressive",
    validateEventStructure,
    genAggressiveEvent,
    5000 // 5000 iterations
  );
}

main().catch(console.error);
