
import fs from 'node:fs';
import path from 'node:path';
import { decryptDM } from '../../js/dmDecryptor.js';

// Setup artifacts and reproducers
const ARTIFACTS_DIR = 'artifacts';
const REPRODUCERS_DIR = 'examples/reproducers';
const REPORT_FILE = path.join(ARTIFACTS_DIR, 'fuzz-report-dmDecryptor.json');

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
  '💩',
  'Hello 🌍',
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
  target: 'dmDecryptor',
  timestamp: new Date().toISOString(),
  failures: [],
};

function logFailure(funcName, args, error) {
  const hash = Math.random().toString(36).substring(2, 10);
  const reproDir = path.join(REPRODUCERS_DIR, `issue-${Date.now()}-${hash}`);
  fs.mkdirSync(reproDir, { recursive: true });

  // Simplified serialization for repro script
  const serialize = (obj) => {
    try {
        return JSON.stringify(obj, (key, value) => {
            if (value === undefined) return '__UNDEFINED__';
            if (Number.isNaN(value)) return '__NAN__';
            if (value === Infinity) return '__INFINITY__';
            if (typeof value === 'function') return value.toString();
            return value;
        }, 2).replace(/"__UNDEFINED__"/g, 'undefined').replace(/"__NAN__"/g, 'NaN').replace(/"__INFINITY__"/g, 'Infinity');
    } catch (e) {
        return '{}'; // Fallback
    }
  };

  const reproScript = `
import { ${funcName} } from '../../../js/dmDecryptor.js';

const args = ${serialize(args)};

// Rehydrate functions if any
args.forEach(arg => {
    if (arg && arg.decryptors) {
        arg.decryptors.forEach(d => {
             // This is a rough approximation, real repro might need manual adjustment if functions were complex
             // But for fuzzing we usually pass simple mock functions
             d.decrypt = async () => "decrypted";
        });
    }
});

console.log('Running reproduction for ${funcName}...');
try {
  await ${funcName}(...args);
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

async function fuzzDecryptDM() {
  console.log(`Fuzzing decryptDM...`);

  const mockDecryptor = {
      scheme: 'nip44',
      decrypt: async (pubkey, ciphertext) => {
          if (ciphertext === 'FAIL') throw new Error('Decryption failed intentionally');
          if (ciphertext === 'JUNK') return 'NOT JSON';
          if (ciphertext === 'EMPTY') return '';
          return JSON.stringify({ content: 'secret message', kind: 1, created_at: 12345 });
      }
  };

  const naughtyDecryptors = [
      null,
      undefined,
      {},
      { decrypt: null },
      { decrypt: 'not a function' },
      { decrypt: async () => { throw new Error('Boom'); } },
      { decrypt: async () => 123 }, // returns non-string
  ];

  // Test 1: Fuzz event argument
  for (const input of BIG_NAUGHTY_LIST) {
      try {
          await decryptDM(input, { decryptors: [mockDecryptor] });
      } catch (error) {
          logFailure('decryptDM', [input, { decryptors: ['[MockDecryptor]'] }], error);
      }
  }

  // Test 2: Fuzz context argument
  const validEvent = { kind: 4, content: 'ciphertext', pubkey: '00'.repeat(32), tags: [] };
  for (const input of BIG_NAUGHTY_LIST) {
      try {
          await decryptDM(validEvent, input);
      } catch (error) {
          logFailure('decryptDM', [validEvent, input], error);
      }
  }

  // Test 3: Fuzz decryptors list
  for (const input of BIG_NAUGHTY_LIST) {
       try {
          await decryptDM(validEvent, { decryptors: input });
      } catch (error) {
          logFailure('decryptDM', [validEvent, { decryptors: input }], error);
      }
  }

  // Test 4: Naughty decryptors
  for (const badDecryptor of naughtyDecryptors) {
       try {
          await decryptDM(validEvent, { decryptors: [badDecryptor] });
      } catch (error) {
          logFailure('decryptDM', [validEvent, { decryptors: [badDecryptor] }], error);
      }
  }

  // Test 5: Gift Wrap specific fuzzing (kind 1059)
  const giftWrapEvent = { kind: 1059, content: 'ciphertext', pubkey: '00'.repeat(32), tags: [] };
  try {
      await decryptDM(giftWrapEvent, { decryptors: [mockDecryptor] });
  } catch (error) {
       logFailure('decryptDM', [giftWrapEvent, { decryptors: ['[MockDecryptor]'] }], error);
  }
}

await fuzzDecryptDM();

fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
console.log(`Fuzzing complete. Report saved to ${REPORT_FILE}`);
