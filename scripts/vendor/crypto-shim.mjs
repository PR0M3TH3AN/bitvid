// Minimal browser shim for node's `crypto`, aliased in when bundling Bitcoin
// Connect (scripts/build-bitcoin-connect.mjs). The only place its deps reach for
// `crypto` is @getalby/lightning-tools' L402 macaroon helpers via a lazy
// `await import('crypto')` — a path bitvid's NWC connect/pay flow never calls.
// timingSafeEqual is implemented properly; the L402-only createHmac is stubbed so
// it fails loudly rather than silently misbehaving if ever reached.
export function timingSafeEqual(a, b) {
  const ua = a instanceof Uint8Array ? a : new Uint8Array(a);
  const ub = b instanceof Uint8Array ? b : new Uint8Array(b);
  if (ua.length !== ub.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < ua.length; i += 1) {
    diff |= ua[i] ^ ub[i];
  }
  return diff === 0;
}

export function createHmac() {
  throw new Error(
    "createHmac (L402 macaroons) is not available in the bitvid browser bundle",
  );
}

export default { timingSafeEqual, createHmac };
