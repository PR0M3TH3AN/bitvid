import { decryptDM } from '../../js/dmDecryptor.js';
import {
  fuzzBoolean,
  fuzzInt,
  fuzzString,
  fuzzHexString,
  fuzzJSON,
  pickOne,
  fuzzSurrogatePairString,
  saveFuzzReport,
  saveReproducer
} from './fuzz-utils.mjs';
import fs from 'fs';
import path from 'path';

const ITERATIONS = 1000;
const FINDINGS = [];

function saveReproducerDM(id, input, error) {
    const reproDir = path.join('examples', 'reproducers', `fuzz-dmDecryptor-${id}`);
    if (!fs.existsSync(reproDir)) {
      fs.mkdirSync(reproDir, { recursive: true });
    }

    const readmeContent = `# Fuzz Reproducer: dmDecryptor - ${id}

## Error
\`\`\`
${error.stack || error.message}
\`\`\`
`;

    fs.writeFileSync(path.join(reproDir, 'README.md'), readmeContent);

    // Serialize input parts
    const event = input.event;
    const context = input.context;

    // We can't easily capture the 'shouldFail' state unless we stored it on the object,
    // but we can infer or just log it. For now, let's just save the structure.

    const serializedContext = {
        actorPubkey: context?.actorPubkey,
        decryptorConfigs: context?.decryptors && Array.isArray(context.decryptors) ? context.decryptors.map(d => ({
            scheme: d.scheme,
            supportsGiftWrap: d.supportsGiftWrap,
        })) : context?.decryptors
    };

    fs.writeFileSync(path.join(reproDir, 'input-event.json'), JSON.stringify(event, null, 2));
    fs.writeFileSync(path.join(reproDir, 'input-context-config.json'), JSON.stringify(serializedContext, null, 2));

    const scriptContent = `
import { decryptDM } from '../../../../js/dmDecryptor.js';
import fs from 'fs';
import path from 'path';

const event = JSON.parse(fs.readFileSync('input-event.json', 'utf8'));
const contextConfig = JSON.parse(fs.readFileSync('input-context-config.json', 'utf8'));

// Reconstruct decryptors
const decryptors = Array.isArray(contextConfig.decryptorConfigs)
    ? contextConfig.decryptorConfigs.map(config => ({
        scheme: config.scheme,
        supportsGiftWrap: config.supportsGiftWrap,
        decrypt: async (pubkey, ciphertext) => {
            console.log('Mock decrypt called for:', pubkey);
            return "mock-decrypted-content";
        }
    }))
    : contextConfig.decryptorConfigs;

const context = {
    actorPubkey: contextConfig.actorPubkey,
    decryptors
};

console.log('Running reproduction...');
try {
    await decryptDM(event, context);
    console.log('Execution finished without crash.');
} catch (error) {
    console.error('Crash reproduced:', error);
}
`;
    fs.writeFileSync(path.join(reproDir, 'repro.mjs'), scriptContent);
    console.log(`Reproducer saved to ${reproDir}`);
}

function logError(target, input, error) {
  const id = Date.now().toString() + Math.floor(Math.random() * 1000);
  console.error(`[FAIL] ${target} crashed! ID: ${id}`);
  FINDINGS.push({
    id,
    target,
    error: error.message,
    stack: error.stack,
    input
  });
  saveReproducerDM(id, input, error);
}

function mockDecryptor(shouldFail = false) {
  return {
    scheme: pickOne(['nip04', 'nip44', 'nip44_v2', fuzzString()]),
    decrypt: async (pubkey, ciphertext) => {
      if (shouldFail) {
        throw new Error('Mock Decryption Failed');
      }
      // Return a valid stringified JSON event sometimes, or random garbage
      if (fuzzBoolean()) {
        return JSON.stringify({
            content: fuzzString(20),
            pubkey: fuzzHexString(),
            created_at: Math.floor(Date.now() / 1000),
            tags: []
        });
      }
      return fuzzString(50);
    },
    supportsGiftWrap: fuzzBoolean()
  };
}

function generateRandomEvent() {
  const kind = pickOne([4, 1059, fuzzInt(0, 20000)]);
  const content = fuzzBoolean() ? fuzzString(100) : fuzzJSON(2);

  return {
    kind,
    pubkey: fuzzHexString(),
    created_at: Math.floor(Date.now() / 1000),
    tags: fuzzBoolean() ? [] : [['p', fuzzHexString()], ['encrypted', 'nip44']],
    content: typeof content === 'string' ? content : JSON.stringify(content)
  };
}

function generateRandomContext() {
  const decryptors = [];
  const count = fuzzInt(0, 3);
  for (let i = 0; i < count; i++) {
    decryptors.push(mockDecryptor(fuzzBoolean())); // some will fail
  }

  return {
    actorPubkey: fuzzHexString(),
    decryptors
  };
}

async function fuzzDecryptor() {
  console.log('Starting fuzzing for dmDecryptor.js...');

  for (let i = 0; i < ITERATIONS; i++) {
    const event = generateRandomEvent();
    const context = generateRandomContext();

    // Also test null/undefined/garbage inputs
    const inputEvent = pickOne([event, null, undefined, "garbage", {}]);
    const inputContext = pickOne([context, null, undefined, {}, { decryptors: "garbage" }]);

    try {
      await decryptDM(inputEvent, inputContext);
    } catch (error) {
      logError('decryptDM', { event: inputEvent, context: inputContext }, error);
    }
  }

  saveFuzzReport('dmDecryptor', FINDINGS);
  console.log(`Fuzzing complete. Found ${FINDINGS.length} crashes.`);
    if (FINDINGS.length > 0) {
        process.exit(1);
    }
}

fuzzDecryptor().catch(err => {
  console.error('Fuzzing script failed:', err);
  process.exit(1);
});
