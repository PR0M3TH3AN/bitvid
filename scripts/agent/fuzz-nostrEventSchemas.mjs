
import fs from 'node:fs';
import path from 'node:path';
import {
  buildVideoPostEvent,
  buildVideoMirrorEvent,
  buildRepostEvent,
  buildShareEvent,
  buildRelayListEvent,
  buildDmRelayListEvent,
  buildProfileMetadataEvent,
  buildMuteListEvent,
  buildDeletionEvent,
  buildLegacyDirectMessageEvent,
  buildDmAttachmentEvent,
  buildDmReadReceiptEvent,
  buildDmTypingIndicatorEvent,
  buildViewEvent,
  buildZapRequestEvent,
  buildReactionEvent,
  buildCommentEvent,
  buildWatchHistoryEvent,
  buildSubscriptionListEvent,
  buildBlockListEvent,
  buildHashtagPreferenceEvent,
  sanitizeAdditionalTags,
} from '../../js/nostrEventSchemas.js';

// Setup artifacts and reproducers
const ARTIFACTS_DIR = 'artifacts';
const REPRODUCERS_DIR = 'examples/reproducers';
const REPORT_FILE = path.join(ARTIFACTS_DIR, 'fuzz-report-nostrEventSchemas.json');

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
  '💩', // Emoji
  'Hello 🌍', // Text with emoji
  'Zalgo text: Hͥ̽ͣ̃ͤ́eͧ̈́lͥlͦo', // Zalgo
  '\uD800', // Lone surrogate
  '\uDFFF',
  '\uD83D\uDCA9', // Valid surrogate pair (Pile of Poo)
  '\u0000', // Null byte
  '\uFFFF',
  '\uFFFD', // Replacement character
  Array(1000).fill('a').join(''), // Long string
  { toString: () => { throw new Error('Explosion!'); } }, // Object that throws on toString
  { toJSON: () => { throw new Error('JSON Explosion!'); } }, // Object that throws on toJSON
  Object.create(null), // Null prototype object
  [],
  {},
  [null],
  [undefined],
  [''],
  { a: 1 },
];

// Add a recursive object
const recursiveObj = {};
recursiveObj.self = recursiveObj;
BIG_NAUGHTY_LIST.push(recursiveObj);

const report = {
  target: 'nostrEventSchemas',
  timestamp: new Date().toISOString(),
  failures: [],
};

function logFailure(funcName, args, error) {
  const hash = Math.random().toString(36).substring(2, 10);
  const reproDir = path.join(REPRODUCERS_DIR, `issue-${Date.now()}-${hash}`);
  fs.mkdirSync(reproDir, { recursive: true });

  const reproScript = `
import { ${funcName} } from '../../../js/nostrEventSchemas.js';

const args = ${JSON.stringify(args, (key, value) => {
    if (value === undefined) return '__UNDEFINED__';
    if (Number.isNaN(value)) return '__NAN__';
    if (value === Infinity) return '__INFINITY__';
    if (value === -Infinity) return '__NEG_INFINITY__';
    if (typeof value === 'object' && value !== null) {
        // Handle circular references for JSON stringify
        const seen = new WeakSet();
        const circularReplacer = (k, v) => {
             if (typeof v === 'object' && v !== null) {
                 if (seen.has(v)) {
                     return '[Circular]';
                 }
                 seen.add(v);
             }
             return v;
        };
         // Simple circular check handling for top level if needed, but here we just try-catch or simplify
         try {
             return value;
         } catch(e) {
             return '[Unserializable]';
         }
    }
    return value;
}, 2).replace(/"__UNDEFINED__"/g, 'undefined').replace(/"__NAN__"/g, 'NaN').replace(/"__INFINITY__"/g, 'Infinity').replace(/"__NEG_INFINITY__"/g, '-Infinity')};

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

function fuzzFunction(func, funcName) {
  console.log(`Fuzzing ${funcName}...`);

  // Test 1: Single argument fuzzing
  for (const input of BIG_NAUGHTY_LIST) {
    try {
      func(input);
    } catch (error) {
      logFailure(funcName, [input], error);
    }
  }

  // Test 2: Object property fuzzing (since most accept a params object)
  const baseParams = {};
  for (const input of BIG_NAUGHTY_LIST) {
     // Try to inject the naughty value into common keys
     const keys = ['pubkey', 'created_at', 'content', 'tags', 'additionalTags', 'metadata', 'relays'];
     for (const key of keys) {
         try {
             func({ ...baseParams, [key]: input });
         } catch (error) {
             logFailure(funcName, [{ [key]: input }], error);
         }
     }
  }
}

const targets = {
  buildVideoPostEvent,
  buildVideoMirrorEvent,
  buildRepostEvent,
  buildShareEvent,
  buildRelayListEvent,
  buildDmRelayListEvent,
  buildProfileMetadataEvent,
  buildMuteListEvent,
  buildDeletionEvent,
  buildLegacyDirectMessageEvent,
  buildDmAttachmentEvent,
  buildDmReadReceiptEvent,
  buildDmTypingIndicatorEvent,
  buildViewEvent,
  buildZapRequestEvent,
  buildReactionEvent,
  buildCommentEvent,
  buildWatchHistoryEvent,
  buildSubscriptionListEvent,
  buildBlockListEvent,
  buildHashtagPreferenceEvent,
  sanitizeAdditionalTags,
};

for (const [name, func] of Object.entries(targets)) {
  fuzzFunction(func, name);
}

fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
console.log(`Fuzzing complete. Report saved to ${REPORT_FILE}`);
