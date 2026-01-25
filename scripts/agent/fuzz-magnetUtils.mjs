import { normalizeAndAugmentMagnet } from '../../js/magnetUtils.js';
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

const ITERATIONS = 1000;
const FINDINGS = [];

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
  saveReproducer(target, id, input, error);
}

function generateRandomMagnet() {
  const scheme = 'magnet:?';
  const xt = `xt=urn:btih:${fuzzHexString(40)}`;
  const dn = `dn=${fuzzString(10)}`;
  const tr = `tr=${encodeURIComponent('wss://' + fuzzString(10) + '.com')}`;

  // Mix valid parts with garbage
  const parts = [xt, dn, tr];
  if (fuzzBoolean()) parts.push(`ws=${encodeURIComponent('https://' + fuzzString(10) + '.com')}`);
  if (fuzzBoolean()) parts.push(fuzzString(5) + '=' + fuzzString(5));

  // Shuffle
  parts.sort(() => Math.random() - 0.5);

  return scheme + parts.join('&');
}

function generateRandomOptions() {
  return {
    webSeed: fuzzBoolean() ? [fuzzString()] : fuzzString(),
    torrentUrl: fuzzBoolean() ? fuzzString() : undefined,
    xs: fuzzBoolean() ? fuzzString() : undefined,
    extraTrackers: fuzzBoolean() ? [fuzzString()] : [],
    appProtocol: pickOne(['http:', 'https:', fuzzString(), undefined]),
    logger: fuzzBoolean() ? () => {} : undefined
  };
}

function fuzzMagnetUtils() {
  console.log('Starting fuzzing for magnetUtils.js...');

  for (let i = 0; i < ITERATIONS; i++) {
    // Inputs: valid magnet, partial, garbage, huge string, percent encoded mess
    const rawValue = pickOne([
      generateRandomMagnet(),
      fuzzString(100),
      `magnet:?xt=${fuzzString(10)}`, // invalid xt
      fuzzSurrogatePairString(50),
      null,
      undefined,
      {},
      123
    ]);

    const options = fuzzBoolean() ? generateRandomOptions() : undefined;

    try {
      normalizeAndAugmentMagnet(rawValue, options);
    } catch (error) {
      logError('normalizeAndAugmentMagnet', { rawValue, options }, error);
    }
  }

  saveFuzzReport('magnetUtils', FINDINGS);
  console.log(`Fuzzing complete. Found ${FINDINGS.length} crashes.`);
    if (FINDINGS.length > 0) {
        process.exit(1);
    }
}

fuzzMagnetUtils();
