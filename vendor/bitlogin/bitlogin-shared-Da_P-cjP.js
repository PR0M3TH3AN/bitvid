import { u as c, a as i, b as u, c as a, d as f } from "./bitlogin-shared-Cm1sH5zP.js";
import { h as b, a as l } from "./bitlogin-shared-DfKVXHi6.js";
const p = c("bitlogin:passkey-credential:v1"), g = c("bitlogin:passkey-derive:v1"), k = "bitlogin passkey login-name v1", m = "bitlogin passkey password v1";
function o(e) {
  return Uint8Array.from(e);
}
function A(e) {
  if (e.length !== 32)
    throw new Error(`Passkey PRF output must be 32 bytes, got ${e.length}.`);
  const t = b(g, e), n = `pk-${u(l(t, k, 6))}`, r = a(l(t, m, 32));
  return { loginName: n, password: r };
}
function S(e = window) {
  return typeof e.PublicKeyCredential == "function";
}
function L(e, t) {
  return {
    publicKey: {
      // The challenge protects sign-count/liveness in server-verified
      // WebAuthn; here the PRF OUTPUT is the secret and the "verification"
      // is whether the derived credential opens the capsule. Random anyway.
      challenge: o(i(32)),
      ...t ? { allowCredentials: [{ type: "public-key", id: t }] } : {},
      userVerification: "required",
      extensions: { prf: { eval: { first: p } } }
    }
  };
}
function C(e, t) {
  const n = `${e} (${u(i(2))})`;
  return {
    publicKey: {
      challenge: o(i(32)),
      rp: { name: e },
      user: {
        // Opaque handle; the account identity is DERIVED from the PRF, not
        // from this. Random so re-creates don't silently overwrite.
        id: o(i(16)),
        name: n,
        displayName: n
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        // ES256
        { type: "public-key", alg: -257 }
        // RS256
      ],
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required"
      },
      extensions: { prf: { eval: { first: p } } }
    }
  };
}
function y(e) {
  const n = e.getClientExtensionResults().prf?.results?.first;
  if (!n) return null;
  const r = n instanceof Uint8Array ? n : new Uint8Array(n);
  return r.length === 32 ? r : null;
}
const h = c("bitlogin:lock:v1"), s = (e) => {
  const t = new Uint8Array(e.byteLength);
  return t.set(e), t.buffer;
}, d = { prf: { eval: { first: s(h) } } };
function v(e) {
  return {
    publicKey: {
      challenge: s(i(32)),
      // Exactly the passkey the lock was made with, and no other.
      allowCredentials: [{ type: "public-key", id: s(f(e)) }],
      userVerification: "required",
      extensions: d
    }
  };
}
function w() {
  const e = "BitLogin lock (this device)";
  return {
    publicKey: {
      challenge: s(i(32)),
      rp: { name: "BitLogin" },
      user: { id: s(i(16)), name: e, displayName: e },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 }
      ],
      // Not offered in the browser's list of accounts: it signs nobody in.
      authenticatorSelection: { residentKey: "discouraged", userVerification: "required" },
      extensions: d
    }
  };
}
async function P(e) {
  try {
    const t = await navigator.credentials.get(v(e)), n = t ? y(t) : null;
    return n ? a(n) : null;
  } catch {
    return null;
  }
}
async function O() {
  try {
    const e = await navigator.credentials.create(w());
    if (!e) return null;
    const t = a(new Uint8Array(e.rawId)), n = y(e), r = n ? a(n) : await P(t);
    return r ? { credentialId: t, prfOutput: r } : null;
  } catch {
    return null;
  }
}
export {
  P as a,
  L as b,
  C as c,
  A as d,
  y as e,
  O as f,
  S as p
};
