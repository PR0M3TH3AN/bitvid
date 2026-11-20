import { u as c, a as s, b as u, h as f, c as l, d as a, e as b } from "./bitlogin-shared-Cj9s0_W_.js";
const p = c("bitlogin:passkey-credential:v1"), g = c("bitlogin:passkey-derive:v1"), k = "bitlogin passkey login-name v1", h = "bitlogin passkey password v1";
function o(e) {
  return Uint8Array.from(e);
}
function K(e) {
  if (e.length !== 32)
    throw new Error(`Passkey PRF output must be 32 bytes, got ${e.length}.`);
  const t = f(g, e), n = `pk-${u(l(t, k, 6))}`, r = a(l(t, h, 32));
  return { loginName: n, password: r };
}
function A(e = window) {
  return typeof e.PublicKeyCredential == "function";
}
function S(e, t) {
  return {
    publicKey: {
      // The challenge protects sign-count/liveness in server-verified
      // WebAuthn; here the PRF OUTPUT is the secret and the "verification"
      // is whether the derived credential opens the capsule. Random anyway.
      challenge: o(s(32)),
      ...t ? { allowCredentials: [{ type: "public-key", id: t }] } : {},
      userVerification: "required",
      extensions: { prf: { eval: { first: p } } }
    }
  };
}
function L(e, t) {
  const n = `${e} (${u(s(2))})`;
  return {
    publicKey: {
      challenge: o(s(32)),
      rp: { name: e },
      user: {
        // Opaque handle; the account identity is DERIVED from the PRF, not
        // from this. Random so re-creates don't silently overwrite.
        id: o(s(16)),
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
const m = c("bitlogin:lock:v1"), i = (e) => {
  const t = new Uint8Array(e.byteLength);
  return t.set(e), t.buffer;
}, d = { prf: { eval: { first: i(m) } } };
function v(e) {
  return {
    publicKey: {
      challenge: i(s(32)),
      // Exactly the passkey the lock was made with, and no other.
      allowCredentials: [{ type: "public-key", id: i(b(e)) }],
      userVerification: "required",
      extensions: d
    }
  };
}
function w() {
  const e = "BitLogin lock (this device)";
  return {
    publicKey: {
      challenge: i(s(32)),
      rp: { name: "BitLogin" },
      user: { id: i(s(16)), name: e, displayName: e },
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
async function C() {
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
  S as b,
  L as c,
  K as d,
  y as e,
  C as f,
  A as p
};
