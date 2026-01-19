
import { decryptDM } from '../../js/dmDecryptor.js';
import { getRandomFuzzInput, randomHex, randomString } from './fuzz-utils.mjs';
import fs from 'fs';
import path from 'path';

const REPRODUCERS_DIR = 'examples/reproducers/dmDecryptor';
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

// Deterministic Mock decryptor factory based on input seed
const createMockDecryptor = (seedValue) => {
    return {
        scheme: 'nip44_v2',
        decrypt: async (pubkey, ciphertext, options) => {
            // Use seed to determine behavior deterministically
            // seedValue comes from input.
            const mode = (typeof seedValue === 'number' ? seedValue : 0) % 10;

            if (mode > 6) {
                // Success
                return JSON.stringify({ content: 'decrypted', pubkey: randomHex(), created_at: Date.now()/1000 });
            } else if (mode > 3) {
                // Garbage JSON
                return "{ bad json";
            } else if (mode > 1) {
                 // Not JSON
                 return "Just a string";
            } else {
                throw new Error('Decrypt failed');
            }
        }
    };
};

const throwingDecryptor = {
    scheme: 'nip44',
    decrypt: async () => { throw new Error("Hard fail"); }
}

const wrapper = async (input) => {
    // input is fuzzy junk.
    // We construct a call to decryptDM(event, context)

    // Deterministic randomness from input if object
    let seed = 0;
    if (input && typeof input === 'object') {
        seed = Object.keys(input).length;
    } else if (typeof input === 'string') {
        seed = input.length;
    } else if (typeof input === 'number') {
        seed = Math.floor(input);
    }

    let event = input;

    // Deterministically force supported kinds based on seed
    if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
        const kinds = [4, 1059, input.kind];
        event = {
            ...input,
            kind: kinds[seed % kinds.length],
            content: input.content || 'ciphertext',
            pubkey: input.pubkey || randomHex(),
            tags: input.tags || [['p', randomHex()]],
            created_at: input.created_at || Date.now()/1000
        };
    }

    const mockDec = createMockDecryptor(seed);

    let context = {
        actorPubkey: randomHex(),
        decryptors: [mockDec, throwingDecryptor]
    };

    // Deterministically fuzz context
    if ((seed % 10) > 8) {
        context = input.context || getRandomFuzzInput();
    }

    await decryptDM(event, context);
};

runFuzz('decryptDM', wrapper, getRandomFuzzInput);

// Write summary
fs.writeFileSync('artifacts/fuzz-report-dmDecryptor.json', JSON.stringify(failures, null, 2));
if (failures.length > 0) {
    console.log(`\nFuzzing finished with ${failures.length} failures.`);
    process.exit(1);
} else {
    console.log("\nFuzzing finished with 0 failures.");
    process.exit(0);
}
