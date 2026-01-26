import './fuzz-setup.mjs';
import * as magnetUtils from '../../js/magnetUtils.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const REPRODUCER_DIR = 'examples/reproducers';
const REPORT_FILE = 'artifacts/fuzz-report-magnet.json';

const ITERATIONS = 5000;

function getRandomString(length = 100) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+{}|:"<>?~`-=[]\;\',./% ';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function getRandomMagnet() {
    const hash = getRandomString(40).replace(/[^0-9a-f]/gi, 'a');
    return `magnet:?xt=urn:btih:${hash}&dn=${getRandomString(10)}&tr=${encodeURIComponent(getRandomString(20))}`;
}

async function run() {
    console.log(`Starting fuzzing magnet utils for ${ITERATIONS} iterations...`);

    const report = {
        target: 'js/magnetUtils.js',
        timestamp: new Date().toISOString(),
        iterations: ITERATIONS,
        crashes: [],
    };

    const uniqueCrashes = new Set();

    const targets = [
        { name: 'normalizeAndAugmentMagnet', fn: magnetUtils.normalizeAndAugmentMagnet, args: 2 },
        { name: 'safeDecodeMagnet', fn: magnetUtils.safeDecodeMagnet, args: 1 },
    ];

    for (const { name, fn, args } of targets) {
        for (let i = 0; i < ITERATIONS; i++) {
            let input, options;

            if (Math.random() < 0.3) {
                input = getRandomMagnet();
            } else if (Math.random() < 0.3) {
                input = getRandomString(getRandomInt(200));
            } else {
                input = null; // or undefined, or object
                if (Math.random() < 0.5) input = {};
            }

            if (args > 1) {
                options = {
                    webSeed: Math.random() < 0.5 ? getRandomString(20) : [getRandomString(20)],
                    torrentUrl: getRandomString(20),
                    extraTrackers: [getRandomString(20)],
                    appProtocol: 'https:',
                };
                if (Math.random() < 0.1) options = null;
                if (Math.random() < 0.1) options = "string";
            }

            try {
                if (args === 1) {
                    fn(input);
                } else {
                    fn(input, options);
                }
            } catch (err) {
                const crashKey = `${name}:${err.message}`;
                if (uniqueCrashes.has(crashKey)) {
                    continue;
                }
                uniqueCrashes.add(crashKey);

                let safeInput = "Could not stringify input";
                try {
                    safeInput = JSON.stringify(args === 1 ? input : { input, options });
                } catch (e) {
                    safeInput = "[Input causes JSON.stringify to throw]";
                }

                 const crashInfo = {
                    function: name,
                    input: safeInput,
                    error: err.toString(),
                    stack: err.stack,
                };

                const hash = crypto.createHash('sha256').update(JSON.stringify(crashInfo)).digest('hex').slice(0, 8);
                const filename = `crash-magnet-${name}-${hash}.json`;
                fs.writeFileSync(path.join(REPRODUCER_DIR, filename), JSON.stringify(crashInfo, null, 2));

                report.crashes.push({
                    file: filename,
                    function: name,
                    error: err.message
                });

                console.error(`[CRASH] ${name} failed! Saved to ${filename}`);
            }
        }
    }

    if (!fs.existsSync(path.dirname(REPORT_FILE))) {
        fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
    }
    fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
    console.log(`Fuzzing complete. Report saved to ${REPORT_FILE}. Crashes: ${report.crashes.length}`);
}

function getRandomInt(max) {
  return Math.floor(Math.random() * max);
}

run();
