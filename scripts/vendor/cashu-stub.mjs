// Stub for the optional @cashu/cashu-ts peer dep, aliased in when bundling
// blossom-client-sdk (scripts/build-blossom-sdk.mjs). The SDK only reaches for it
// on the BUD-07 cashu-payment branch (a lazy `await import()` triggered by an HTTP
// 402). bitvid targets free Blossom servers, so this never runs; the stubs throw
// loudly if a payment-gated server is ever hit rather than silently misbehaving.
function unsupported() {
  throw new Error(
    "Cashu payments (BUD-07) are not supported in the bitvid Blossom bundle",
  );
}

export const getEncodedToken = unsupported;
export const decodePaymentRequest = unsupported;
export const getDecodedToken = unsupported;

export default {};
