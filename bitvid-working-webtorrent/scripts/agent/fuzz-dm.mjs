import './fuzz-setup.mjs';
import * as dm from '../../js/dmDecryptor.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const REPRODUCER_DIR = 'examples/reproducers';
const REPORT_FILE = 'artifacts/fuzz-report-dm.json';

const ITERATIONS = 5000;

// Verify export
if (typeof dm.decryptDM !== 'function') {
    console.error("Error: decryptDM is not exported from js/dmDecryptor.js");
    process.exit(1);
}

// Random generators
function getRandomInt(max) {
  return Math.floor(Math.random() * max);
}

function getRandomString(length = 100) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function getRandomHex(length = 64) {
    const chars = '0123456789abcdef';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function getRandomTags() {
    const numTags = getRandomInt(5);
    const tags = [];
    for(let i=0; i<numTags; i++) {
        const tagLen = getRandomInt(4) + 1;
        const tag = [];
        tag.push(Math.random() > 0.5 ? 'p' : (Math.random() > 0.5 ? 'encrypted' : getRandomString(5)));
        for(let j=1; j<tagLen; j++) {
            tag.push(Math.random() > 0.8 ? getRandomHex(64) : getRandomString(20));
        }
        tags.push(tag);
    }
    // inject malformed tags
    if (Math.random() < 0.1) tags.push("not-an-array");
    if (Math.random() < 0.1) tags.push([]);
    return tags;
}

async function run() {
    console.log(`Starting fuzzing DM decryptor for ${ITERATIONS} iterations...`);

    const report = {
        target: 'js/dmDecryptor.js',
        timestamp: new Date().toISOString(),
        iterations: ITERATIONS,
        crashes: [],
    };

    const uniqueCrashes = new Set();

    for (let i = 0; i < ITERATIONS; i++) {
        const event = {
            kind: Math.random() > 0.5 ? 4 : 1059,
            pubkey: getRandomHex(64),
            created_at: Math.floor(Date.now() / 1000),
            tags: getRandomTags(),
            content: getRandomString(50),
        };

        // Malform event
        if (Math.random() < 0.1) event.kind = "string";
        if (Math.random() < 0.1) event.tags = null;
        if (Math.random() < 0.1) event.content = null;

        const context = {
            actorPubkey: getRandomHex(64),
            decryptors: [
                {
                    scheme: 'nip44',
                    decrypt: async (pk, ciphertext) => {
                        if (Math.random() < 0.1) throw new Error("Decrypt failed");
                        if (Math.random() < 0.1) return null;
                        return "decrypted-content";
                    },
                    priority: 1
                },
                {
                    scheme: 'nip04',
                    decrypt: async () => "legacy-decrypted",
                    priority: 0
                }
            ]
        };

        // Malform context
        if (Math.random() < 0.1) context.decryptors = null;
        if (Math.random() < 0.1) context.decryptors = [null, {}];

        try {
            await dm.decryptDM(event, context);
        } catch (err) {
            const crashKey = `decryptDM:${err.message}`;
            if (uniqueCrashes.has(crashKey)) {
                continue;
            }
            uniqueCrashes.add(crashKey);

            let safeInput = "Could not stringify input";
            try {
                safeInput = JSON.stringify({ event, context: { ...context, decryptors: 'mocked' } });
            } catch (e) {
                safeInput = "[Input causes JSON.stringify to throw]";
            }

             const crashInfo = {
                function: 'decryptDM',
                input: safeInput,
                error: err.toString(),
                stack: err.stack,
            };

            const hash = crypto.createHash('sha256').update(JSON.stringify(crashInfo)).digest('hex').slice(0, 8);
            const filename = `crash-dm-${hash}.json`;
            fs.writeFileSync(path.join(REPRODUCER_DIR, filename), JSON.stringify(crashInfo, null, 2));

            report.crashes.push({
                file: filename,
                function: 'decryptDM',
                error: err.message
            });

            console.error(`[CRASH] decryptDM failed! Saved to ${filename}`);
        }
    }

    if (!fs.existsSync(path.dirname(REPORT_FILE))) {
        fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
    }
    fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
    console.log(`Fuzzing complete. Report saved to ${REPORT_FILE}. Crashes: ${report.crashes.length}`);
}

run();
