
import { normalizeAndAugmentMagnet } from '../../js/magnetUtils.js';
import { getRandomFuzzInput } from './fuzz-utils.mjs';
import fs from 'fs';
import path from 'path';

const REPRODUCERS_DIR = 'examples/reproducers/magnetUtils';
fs.mkdirSync(REPRODUCERS_DIR, { recursive: true });

const failures = [];

function recordFailure(target, input, error) {
    const id = Date.now() + Math.random().toString(36).substring(7);
    const filename = path.join(REPRODUCERS_DIR, `${target}-${id}.json`);

    // Handle circular input for logging
    let safeInput = input;
    try {
        JSON.stringify(input);
    } catch {
        safeInput = "[Circular or non-serializable input]";
    }

    const report = {
        target,
        input: safeInput,
        error: {
            message: error.message,
            stack: error.stack
        }
    };

    fs.writeFileSync(filename, JSON.stringify(report, null, 2));
    failures.push(report);
    console.error(`[FAIL] ${target}: ${error.message} (Report saved to ${filename})`);
}

function runFuzz(name, fn, inputGenerator, iterations = 1000) {
    console.log(`Fuzzing ${name} for ${iterations} iterations...`);
    for (let i = 0; i < iterations; i++) {
        const input = inputGenerator();
        try {
            fn(input);
        } catch (error) {
            recordFailure(name, input, error);
        }
    }
}

const wrapper = (input) => {
    // input is fuzzy junk.
    // normalizeAndAugmentMagnet(rawValue, options)

    let rawValue = input;
    let options = {};

    if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
        rawValue = input.rawValue || getRandomFuzzInput();
        options = input.options || {
            webSeed: getRandomFuzzInput(),
            torrentUrl: getRandomFuzzInput(),
            xs: getRandomFuzzInput(),
            extraTrackers: getRandomFuzzInput()
        };
    }

    normalizeAndAugmentMagnet(rawValue, options);
};

runFuzz('normalizeAndAugmentMagnet', wrapper, getRandomFuzzInput);

// Write summary
fs.writeFileSync('artifacts/fuzz-report-magnetUtils.json', JSON.stringify(failures, null, 2));
if (failures.length > 0) {
    console.log(`\nFuzzing finished with ${failures.length} failures.`);
    process.exit(1);
} else {
    console.log("\nFuzzing finished with 0 failures.");
    process.exit(0);
}
