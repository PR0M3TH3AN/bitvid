
import fs from 'node:fs';
import path from 'node:path';
import { normalizeAndAugmentMagnet, safeDecodeMagnet } from '../../js/magnetUtils.js';

// Setup artifacts and reproducers
const ARTIFACTS_DIR = 'artifacts';
const REPRODUCERS_DIR = 'examples/reproducers';
const REPORT_FILE = path.join(ARTIFACTS_DIR, 'fuzz-report-magnetUtils.json');

if (!fs.existsSync(ARTIFACTS_DIR)) fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
if (!fs.existsSync(REPRODUCERS_DIR)) fs.mkdirSync(REPRODUCERS_DIR, { recursive: true });

const BIG_NAUGHTY_LIST = [
  undefined,
  null,
  0,
  1,
  -1,
  NaN,
  Infinity,
  -Infinity,
  true,
  false,
  '',
  ' ',
  '\n',
  '\t',
  '\r',
  '\0',
  'a',
  '0',
  '[]',
  '{}',
  'null',
  'undefined',
  'NaN',
  'Infinity',
  '<>',
  '\'',
  '"',
  '`',
  '\\',
  '/',
  '.',
  ',',
  ':',
  ';',
  '!',
  '?',
  '@',
  '#',
  '$',
  '%',
  '^',
  '&',
  '*',
  '(',
  ')',
  '-',
  '_',
  '+',
  '=',
  '[',
  ']',
  '{',
  '}',
  '|',
  '~',
  'magnet:?',
  'magnet:?xt=urn:btih:',
  'magnet:?xt=urn:btih:123',
  'magnet:?xt=urn:btih:0000000000000000000000000000000000000000',
  'magnet:?tr=udp://tracker.opentrackr.org:1337/announce',
  '%',
  '%25',
  '%%',
  'http://example.com',
  'wss://tracker.example.com',
  '\uD800',
  '\uDFFF',
  '\u0000',
  '\uFFFF',
  '\uFFFD',
  Array(1000).fill('a').join(''),
  Object.create(null),
  [],
  {},
  [null],
  [undefined],
  [''],
  { a: 1 },
];

const recursiveObj = {};
recursiveObj.self = recursiveObj;
BIG_NAUGHTY_LIST.push(recursiveObj);

const report = {
  target: 'magnetUtils',
  timestamp: new Date().toISOString(),
  failures: [],
};

function logFailure(funcName, args, error) {
  const hash = Math.random().toString(36).substring(2, 10);
  const reproDir = path.join(REPRODUCERS_DIR, `issue-${Date.now()}-${hash}`);
  fs.mkdirSync(reproDir, { recursive: true });

   const serialize = (obj) => {
    try {
        return JSON.stringify(obj, (key, value) => {
            if (value === undefined) return '__UNDEFINED__';
            if (Number.isNaN(value)) return '__NAN__';
            if (value === Infinity) return '__INFINITY__';
            return value;
        }, 2).replace(/"__UNDEFINED__"/g, 'undefined').replace(/"__NAN__"/g, 'NaN').replace(/"__INFINITY__"/g, 'Infinity');
    } catch (e) {
        return '{}';
    }
  };

  const reproScript = `
import { ${funcName} } from '../../../js/magnetUtils.js';

const args = ${serialize(args)};

console.log('Running reproduction for ${funcName}...');
try {
  ${funcName}(...args);
  console.log('No crash reproduced.');
} catch (error) {
  console.log('Crash reproduced:');
  console.error(error);
}
`;

  fs.writeFileSync(path.join(reproDir, 'repro.mjs'), reproScript);
  fs.writeFileSync(path.join(reproDir, 'README.md'), `To run:\n\n\`\`\`bash\nnode --import ../../../tests/test-helpers/setup-localstorage.mjs repro.mjs\n\`\`\`\n\nError: ${error.message}\nStack: ${error.stack}`);

  report.failures.push({
    function: funcName,
    args: args.map(a => {
        try {
            return JSON.stringify(a);
        } catch {
            return '[Circular/Unserializable]';
        }
    }),
    error: {
      message: error.message,
      stack: error.stack,
    },
    reproDir,
  });
  console.error(`FAILURE in ${funcName}: ${error.message}`);
}

function fuzzNormalize() {
    console.log(`Fuzzing normalizeAndAugmentMagnet...`);

    // Test 1: Fuzz rawValue
    for (const input of BIG_NAUGHTY_LIST) {
        try {
            normalizeAndAugmentMagnet(input);
        } catch (error) {
            logFailure('normalizeAndAugmentMagnet', [input], error);
        }
    }

    // Test 2: Fuzz options
    const validMagnet = 'magnet:?xt=urn:btih:0000000000000000000000000000000000000000';
    for (const input of BIG_NAUGHTY_LIST) {
        try {
            normalizeAndAugmentMagnet(validMagnet, input);
        } catch (error) {
            logFailure('normalizeAndAugmentMagnet', [validMagnet, input], error);
        }
    }

    // Test 3: Fuzz specific option fields
    const optionKeys = ['webSeed', 'torrentUrl', 'xs', 'extraTrackers', 'appProtocol'];
    for (const key of optionKeys) {
        for (const input of BIG_NAUGHTY_LIST) {
             try {
                normalizeAndAugmentMagnet(validMagnet, { [key]: input });
            } catch (error) {
                logFailure('normalizeAndAugmentMagnet', [validMagnet, { [key]: input }], error);
            }
        }
    }
}

function fuzzSafeDecode() {
    console.log(`Fuzzing safeDecodeMagnet...`);
    for (const input of BIG_NAUGHTY_LIST) {
        try {
            safeDecodeMagnet(input);
        } catch (error) {
            logFailure('safeDecodeMagnet', [input], error);
        }
    }
}

fuzzNormalize();
fuzzSafeDecode();

fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
console.log(`Fuzzing complete. Report saved to ${REPORT_FILE}`);
