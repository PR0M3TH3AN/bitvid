
import { normalizeHexPubkey } from '../js/utils/nostrHelpers.js';

// Mock window.NostrTools
global.window = {
  NostrTools: {
    nip19: {
      decode: (str) => {
        if (str.startsWith('npub1')) return { type: 'npub', data: 'hexpubkey' };
        if (str.startsWith('nprofile1')) return { type: 'nprofile', data: { pubkey: 'hexpubkey' } };
        throw new Error('Invalid');
      },
      npubEncode: (hex) => 'npub1' + hex
    }
  }
};

console.log('Testing normalizeHexPubkey with various inputs...');

const hex = '0000000000000000000000000000000000000000000000000000000000000001';
const npub = 'npub1test';
const nprofile = 'nprofile1test';

const resHex = normalizeHexPubkey(hex);
console.log(`Hex input: ${resHex === hex ? 'PASS' : 'FAIL'} (${resHex})`);

const resNpub = normalizeHexPubkey(npub);
console.log(`Npub input: ${resNpub === 'hexpubkey' ? 'PASS' : 'FAIL'} (${resNpub})`);

const resNprofile = normalizeHexPubkey(nprofile);
console.log(`Nprofile input: ${resNprofile === 'hexpubkey' ? 'PASS' : 'FAIL'} (${resNprofile})`);

if (resNprofile !== 'hexpubkey') {
    console.log('Confirmed: nprofile is NOT handled by normalizeHexPubkey.');
}
