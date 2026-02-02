
import { normalizeAndAugmentMagnet } from '../../../js/magnetUtils.js';

const args = [
  "magnet:?xt=urn:btih:0000000000000000000000000000000000000000",
  null
];

console.log('Running reproduction for normalizeAndAugmentMagnet...');
try {
  normalizeAndAugmentMagnet(...args);
  console.log('No crash reproduced.');
} catch (error) {
  console.log('Crash reproduced:');
  console.error(error);
}
