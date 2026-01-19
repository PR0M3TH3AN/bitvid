
import {
    buildVideoPostEvent,
    buildVideoMirrorEvent,
    buildRepostEvent,
    buildRelayListEvent,
    buildViewEvent,
    buildReactionEvent,
    buildCommentEvent,
    buildWatchHistoryEvent,
    buildSubscriptionListEvent,
    buildBlockListEvent,
    buildHashtagPreferenceEvent,
    buildAdminListEvent,
    sanitizeAdditionalTags,
    getNostrEventSchema,
    setNostrEventSchemaOverrides,
    NOTE_TYPES
} from '../../js/nostrEventSchemas.js';
import { getRandomFuzzInput, randomString, randomHex } from './fuzz-utils.mjs';
import fs from 'fs';
import path from 'path';

const REPRODUCERS_DIR = 'examples/reproducers/nostrEventSchemas';
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

// Wrap functions that take multiple arguments or objects
const wrappers = {
    buildVideoPostEvent: (input) => {
        if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
             buildVideoPostEvent({
                 pubkey: input.pubkey || getRandomFuzzInput(),
                 created_at: input.created_at || getRandomFuzzInput(),
                 dTagValue: input.dTagValue || getRandomFuzzInput(),
                 content: input.content || getRandomFuzzInput(),
                 additionalTags: input.additionalTags || getRandomFuzzInput()
             });
        } else {
            buildVideoPostEvent(input);
        }
    },
    buildVideoMirrorEvent: (input) => {
        if (typeof input === 'object' && input !== null) {
            buildVideoMirrorEvent({
                pubkey: input.pubkey || getRandomFuzzInput(),
                created_at: input.created_at || getRandomFuzzInput(),
                tags: input.tags || getRandomFuzzInput(),
                content: input.content || getRandomFuzzInput()
            });
        } else {
            buildVideoMirrorEvent(input);
        }
    },
    buildRepostEvent: (input) => {
        if (typeof input === 'object' && input !== null) {
             buildRepostEvent({
                 ...input,
                 pubkey: input.pubkey || getRandomFuzzInput(),
                 created_at: input.created_at || getRandomFuzzInput()
             });
        } else {
             buildRepostEvent(input);
        }
    },
    buildRelayListEvent: (input) => {
        if (typeof input === 'object' && input !== null) {
            buildRelayListEvent({
                pubkey: input.pubkey || getRandomFuzzInput(),
                created_at: input.created_at || getRandomFuzzInput(),
                relays: input.relays || getRandomFuzzInput(),
                additionalTags: input.additionalTags || getRandomFuzzInput()
            });
        } else {
            buildRelayListEvent(input);
        }
    },
    buildViewEvent: (input) => {
        if (typeof input === 'object' && input !== null) {
            buildViewEvent({
                 ...input,
                 pubkey: input.pubkey || getRandomFuzzInput(),
                 created_at: input.created_at || getRandomFuzzInput()
            });
        } else {
            buildViewEvent(input);
        }
    },
    buildReactionEvent: (input) => {
        if (typeof input === 'object' && input !== null) {
            buildReactionEvent({
                 ...input,
                 pubkey: input.pubkey || getRandomFuzzInput(),
                 created_at: input.created_at || getRandomFuzzInput()
            });
        } else {
            buildReactionEvent(input);
        }
    },
    buildCommentEvent: (input) => {
        if (typeof input === 'object' && input !== null) {
            buildCommentEvent({
                 ...input,
                 pubkey: input.pubkey || getRandomFuzzInput(),
                 created_at: input.created_at || getRandomFuzzInput()
            });
        } else {
            buildCommentEvent(input);
        }
    },
    buildWatchHistoryEvent: (input) => {
        if (typeof input === 'object' && input !== null) {
            buildWatchHistoryEvent({
                 ...input,
                 pubkey: input.pubkey || getRandomFuzzInput(),
                 created_at: input.created_at || getRandomFuzzInput()
            });
        } else {
            buildWatchHistoryEvent(input);
        }
    },
    buildSubscriptionListEvent: (input) => {
        if (typeof input === 'object' && input !== null) {
            buildSubscriptionListEvent({
                 ...input,
                 pubkey: input.pubkey || getRandomFuzzInput(),
                 created_at: input.created_at || getRandomFuzzInput()
            });
        } else {
            buildSubscriptionListEvent(input);
        }
    },
    buildBlockListEvent: (input) => {
        if (typeof input === 'object' && input !== null) {
            buildBlockListEvent({
                 ...input,
                 pubkey: input.pubkey || getRandomFuzzInput(),
                 created_at: input.created_at || getRandomFuzzInput()
            });
        } else {
            buildBlockListEvent(input);
        }
    },
    buildHashtagPreferenceEvent: (input) => {
        if (typeof input === 'object' && input !== null) {
            buildHashtagPreferenceEvent({
                 ...input,
                 pubkey: input.pubkey || getRandomFuzzInput(),
                 created_at: input.created_at || getRandomFuzzInput()
            });
        } else {
            buildHashtagPreferenceEvent(input);
        }
    },
    buildAdminListEvent: (input) => {
        // expects listKey and params
        const key = getRandomFuzzInput();
        if (typeof input === 'object' && input !== null) {
            buildAdminListEvent(key, {
                 ...input,
                 pubkey: input.pubkey || getRandomFuzzInput(),
                 created_at: input.created_at || getRandomFuzzInput()
            });
        } else {
            buildAdminListEvent(key, input);
        }
    },
    sanitizeAdditionalTags: (input) => {
        sanitizeAdditionalTags(input);
    },
    getNostrEventSchema: (input) => {
        getNostrEventSchema(input);
    },
    setNostrEventSchemaOverrides: (input) => {
        try {
            setNostrEventSchemaOverrides(input);
            // Deterministically pick a type based on input properties if possible
            const types = Object.values(NOTE_TYPES);
            let index = 0;
            if (typeof input === 'object' && input !== null) {
                index = Object.keys(input).length % types.length;
            } else if (typeof input === 'string') {
                index = input.length % types.length;
            }
            const type = types[index];
            getNostrEventSchema(type);
        } finally {
            // Clean up global state to avoid pollution
            setNostrEventSchemaOverrides({});
        }
    }
};

// Main execution
Object.entries(wrappers).forEach(([name, fn]) => {
    runFuzz(name, fn, getRandomFuzzInput);
});

// Write summary
fs.writeFileSync('artifacts/fuzz-report-nostrEventSchemas.json', JSON.stringify(failures, null, 2));
if (failures.length > 0) {
    console.log(`\nFuzzing finished with ${failures.length} failures.`);
    process.exit(1);
} else {
    console.log("\nFuzzing finished with 0 failures.");
    process.exit(0);
}
