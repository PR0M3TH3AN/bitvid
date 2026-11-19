const C = "nswp-signer", T = "nswp-handoff", Z = 1, y = {
  /** The longest a note's content may be, in characters. */
  contentChars: 8e3,
  tags: 60,
  tagItems: 8,
  tagChars: 400,
  /** How long a remembered site BitLogin knows stays allowed, in seconds: thirty days from Allow, unless the user signs out of it sooner. */
  grantSec: 2592e3,
  /** The same for a site BitLogin does not know: seven days (§SW11). */
  unknownGrantSec: 604800,
  /** How long a site that is not remembered stays allowed while its page stays open, in seconds (§SW11). */
  visitSec: 43200,
  /** No more than this many signatures for one site in `perMs`. The same numbers as NSWP's own (kit 0.28.0). */
  burst: 3,
  perMs: 6e4,
  /** And no more than this many in an hour. */
  hourly: 20,
  /** Room passes are counted apart from notes (§SW16), so signing in does not use up a post: this many in `perMs`. */
  passBurst: 2,
  /** And this many in an hour. */
  passHourly: 10
}, W = [1, 7], B = [4, 13, 14, 15, 1059, 1060, 13194, 22242, 23194, 23195, 24133, 27235, 27300, 27301, 30078];
function G(t) {
  return typeof t != "number" || !Number.isInteger(t) || t < 0 || t > 65535 || B.includes(t) ? "never" : W.includes(t) ? "ordinary" : "careful";
}
const N = "nswp:world";
function c(t) {
  if (typeof t != "string" || t.length > 300) return "";
  try {
    const e = new URL(t);
    return (e.protocol === "https:" || e.protocol === "http:") && e.origin !== "null" ? e.origin : "";
  } catch {
    return "";
  }
}
function S(t) {
  if (typeof t != "string") return "";
  let e = "";
  for (const n of t.slice(0, 400).normalize("NFC")) {
    const s = n.codePointAt(0), i = s <= 31 || s >= 127 && s <= 159 || s >= 8203 && s <= 8207 || s >= 8232 && s <= 8239 || s >= 8288 && s <= 8303 || s === 65279;
    e += i ? " " : n;
  }
  return [...e.replace(/\s+/gu, " ").trim()].slice(0, 48).join("").trim();
}
function J(t, e, n) {
  const s = c(e);
  if (!s || !t || typeof t != "object") return null;
  const i = t;
  if (G(i.kind) !== "ordinary" || typeof i.content != "string" || [...i.content].length > y.contentChars || !Array.isArray(i.tags) || i.tags.length > y.tags) return null;
  const r = [];
  for (const o of i.tags) {
    if (!Array.isArray(o) || o.length === 0 || o.length > y.tagItems || !o.every((l) => typeof l == "string" && l.length <= y.tagChars)) return null;
    o[0] !== N && r.push([...o]);
  }
  return r.push([N, s]), { kind: i.kind, created_at: Math.floor(n), tags: r, content: i.content };
}
function Q(t = y, e = []) {
  let n = e.filter((s) => typeof s == "number" && Number.isFinite(s));
  return {
    times: () => [...n],
    take(s) {
      return n = n.filter((i) => s - i < 36e5), n.length >= t.hourly || n.filter((i) => s - i < t.perMs).length >= t.burst ? !1 : (n.push(s), !0);
    }
  };
}
const K = /^[0-9a-z-]{1,40}$/iu, O = /^[0-9a-f]{64}$/u, ee = (t) => ({ nswp: C, v: 1, ...t });
function te(t) {
  if (!t || typeof t != "object") return null;
  const e = t;
  if (e.nswp !== C || e.v !== 1 || typeof e.id != "string" || !K.test(e.id)) return null;
  if (e.t === "state") return { t: "state", id: e.id };
  if (e.t === "lock") return { t: "lock", id: e.id };
  if (e.t === "sign" && e.event && typeof e.event == "object") return { t: "sign", id: e.id, event: e.event };
  if (e.t === "pass" && typeof e.session == "string" && O.test(e.session)) return { t: "pass", id: e.id, session: e.session };
  if (e.t === "want") {
    const n = x(e.permissions);
    return n ? { t: "want", id: e.id, permissions: n } : null;
  }
  return (e.t === "encrypt" || e.t === "decrypt") && typeof e.peer == "string" && O.test(e.peer) && typeof e.text == "string" && e.text.length <= 2e5 ? { t: e.t, id: e.id, peer: e.peer, text: e.text, scheme: e.scheme === "nip04" ? "nip04" : "nip44" } : e.t === "read" && e.event && typeof e.event == "object" ? { t: "read", id: e.id, event: e.event } : null;
}
const ne = (t) => ({ nswp: T, v: 1, ...t });
function se(t) {
  if (!t || typeof t != "object") return null;
  const e = t;
  if (e.nswp !== T || e.v !== 1 || typeof e.nonce != "string" || !K.test(e.nonce)) return null;
  const n = (s) => typeof s == "string" && O.test(s);
  if (e.t === "hello") return { t: "hello", nonce: e.nonce };
  if (e.t === "frame" && c(e.world) && n(e.recipient)) {
    const s = e.wants === void 0 ? void 0 : x(e.wants);
    return s === null ? null : { t: "frame", nonce: e.nonce, world: c(e.world), recipient: e.recipient, ...s ? { wants: s } : {} };
  }
  if (e.t === "grant" && c(e.world) && e.sealed && typeof e.sealed == "object") {
    const s = e.sealed;
    if (!n(s.senderPublicKey) || typeof s.payload != "string" || s.payload.length > 12e3) return null;
    const i = S(e.name);
    return { t: "grant", nonce: e.nonce, world: c(e.world), sealed: { senderPublicKey: s.senderPublicKey, payload: s.payload }, ...i ? { name: i } : {} };
  }
  return e.t === "done" && typeof e.ok == "boolean" ? { t: "done", nonce: e.nonce, ok: e.ok } : null;
}
const f = { kinds: 64, prefixes: 8, origins: 8, peers: 8, prefixChars: 64 }, p = 30078, w = 27235, M = 24242, _ = 22242, j = 13, A = "bitlogin:", F = [13194, 23194, 23195, 24133, 27301], v = {
  "https://bitvid.network": { name: "Bitvid" },
  "https://beta.bitvid.network": { name: "Bitvid (beta)" },
  "https://unstable.bitvid.network": { name: "Bitvid (unstable)" },
  "https://bitunlock.network": { name: "BitUnlock" },
  "https://portal.bitblocks.network": { name: "BitPortal", reserved: [27300, 27302, 27303] },
  "https://imsatisfied.app": { name: "Satisfied" },
  "https://adzaps.net": { name: "AdZap" },
  "https://www.adzaps.net": { name: "AdZap" },
  "https://tessera.bitblocks.network": { name: "Tessera" },
  "https://bitroad.network": { name: "BitRoad" },
  "https://www.bitroad.network": { name: "BitRoad" }
}, P = [27300, 27302, 27303];
function re(t) {
  return Object.hasOwn(v, t) ? v[t].name : null;
}
const L = (t) => Object.hasOwn(v, t) ? v[t].reserved ?? [] : [];
function oe(t, e) {
  const n = L(t);
  return [...e.sign, ...e.read].every((s) => !P.includes(s) || n.includes(s));
}
const $ = [0, 3, 5, 1e4, 10002, 10050, _], H = [...$, M, ...P], z = [4, j, 1059], q = [w, M, _], m = /^[0-9a-f]{64}$/u, k = (t) => typeof t == "number" && Number.isInteger(t) && t >= 0 && t <= 65535, g = (t) => [...new Set(t)];
function x(t) {
  if (!t || typeof t != "object" || Array.isArray(t)) return null;
  const e = t, n = (a) => a === void 0 ? [] : Array.isArray(a) ? a : null, s = n(e.sign), i = n(e.appData), r = n(e.proofs), o = n(e.read), l = n(e.peers);
  if (!s || !i || !r || !o || !l || s.length > f.kinds || o.length > f.kinds || i.length > f.prefixes || r.length > f.origins || l.length > f.peers || !s.every(k) || !o.every(k) || s.some((a) => F.includes(a)) || s.length === 0 && o.length === 0 && l.length === 0) return null;
  for (const a of i)
    if (typeof a != "string" || a.length === 0 || a.length > f.prefixChars || a !== "*" && (a.startsWith(A) || A.startsWith(a)) || S(a) !== a) return null;
  if ((s.includes(p) || o.includes(p)) !== i.length > 0) return null;
  const d = [];
  for (const a of r) {
    const u = c(a);
    if (!u || u !== a || !u.startsWith("https://")) return null;
    d.push(u);
  }
  if (d.length > 0 && !s.includes(w) || !l.every((a) => typeof a == "string" && m.test(a))) return null;
  const b = S(e.name);
  return {
    ...b ? { name: b } : {},
    sign: g(s).sort((a, u) => a - u),
    appData: g(i),
    proofs: g(d),
    read: g(o).sort((a, u) => a - u),
    peers: g(l)
  };
}
const ie = {
  /** Proofs, and the application's own data: what applications sign on timers. */
  quiet: { burst: 300, perMs: 6e4, hourly: 6e3 },
  public: { burst: 60, perMs: 6e4, hourly: 1200 },
  sensitive: { burst: 30, perMs: 6e4, hourly: 300 },
  read: { burst: 600, perMs: 6e4, hourly: 12e3 }
}, h = { contentChars: 1e5, tags: 2500, tagItems: 16, tagChars: 1e3, clockSlackSec: 600 }, I = (t) => t >= 3e4 && t < 4e4;
function ae(t) {
  return $.includes(t) && t !== _ ? "sensitive" : q.includes(t) || I(t) ? "quiet" : "public";
}
const D = "bitlogin:site", R = (t, e) => t.filter((n) => n[0] === e && typeof n[1] == "string").map((n) => n[1]);
function V(t, e) {
  const n = R(e, "d")[0];
  return n === void 0 || n.startsWith(A) ? !1 : t.appData.some((s) => s === "*" || n.startsWith(s));
}
function U(t, e, n) {
  const s = R(n, "u");
  return s.length === 0 ? !1 : s.every((i) => {
    const r = c(i);
    return r !== "" && (r === e || t.proofs.includes(r));
  });
}
function le(t, e, n, s) {
  const i = c(n);
  if (!i || !e || typeof e != "object") return null;
  const r = e;
  if (!k(r.kind) || F.includes(r.kind) || !t.sign.includes(r.kind) || P.includes(r.kind) && !L(i).includes(r.kind) || typeof r.content != "string" || r.content.length > h.contentChars || !Array.isArray(r.tags) || r.tags.length > h.tags) return null;
  const o = [];
  for (const a of r.tags) {
    if (!Array.isArray(a) || a.length === 0 || a.length > h.tagItems || !a.every((u) => typeof u == "string" && u.length <= h.tagChars)) return null;
    a[0] === D || a[0] === "nswp:world" || o.push([...a]);
  }
  if (r.kind === p && !V(t, o) || r.kind === w && !U(t, i, o)) return null;
  if (r.kind === j) {
    if (o.length > 0) return null;
  } else
    o.push([D, i]);
  const l = Math.floor(s), d = typeof r.created_at == "number" && Number.isInteger(r.created_at) ? r.created_at : l, b = Math.abs(d - l) <= h.clockSlackSec ? d : l;
  return { kind: r.kind, created_at: b, tags: o, content: r.content };
}
function ue(t, e, n) {
  return typeof n == "string" && m.test(n) && (n === e || t.peers.includes(n));
}
function ce(t, e) {
  return typeof e == "string" && m.test(e) && t.peers.includes(e);
}
function de(t, e, n) {
  if (!k(n.kind) || !t.read.includes(n.kind) || typeof n.pubkey != "string" || !m.test(n.pubkey) || !Array.isArray(n.tags)) return null;
  const s = n.tags.filter((r) => Array.isArray(r) && r.every((o) => typeof o == "string"));
  if (n.kind === p && !V(t, s)) return null;
  if (n.pubkey !== e) return n.pubkey;
  const i = R(s, "p")[0];
  return i !== void 0 && m.test(i) ? i : e;
}
const X = {
  0: "change your profile",
  1: "post notes",
  3: "change who you follow",
  4: "send private messages (older kind)",
  5: "delete what you have posted",
  6: "repost notes",
  7: "post reactions",
  13: "send private messages",
  15: "send files in private messages",
  16: "repost other things",
  21: "post videos",
  22: "post short videos",
  1063: "post file details",
  1111: "post comments",
  1573: "place orders",
  1984: "report content",
  7376: "record what your Cashu wallet spent",
  9734: "ask for zaps",
  1e4: "change who you have muted",
  10002: "change which relays you use",
  10050: "change where private messages reach you",
  20001: "send read receipts",
  20002: "show when you are typing",
  22242: "sign in to relays as you",
  24242: "upload, list and delete your files at file hosts",
  27300: "give worlds a pass that says who you are",
  27302: "let a world open a terminal on a computer of yours",
  27303: "give a world access you have granted it",
  3e4: "change your lists",
  30015: "change your interests",
  34235: "post videos",
  34236: "post short videos"
}, Y = {
  4: "read your private messages (older kind)",
  13: "read your private messages",
  1059: "read your private messages",
  1573: "read orders sent to you",
  7375: "read the money in your Cashu wallet",
  7376: "read what your Cashu wallet spent",
  1e4: "read who you have muted",
  3e4: "read your private lists"
}, E = (t) => {
  try {
    return new URL(t).host;
  } catch {
    return t;
  }
};
function fe(t, e) {
  const n = [], s = [], i = [], r = (o, l) => {
    o.includes(l) || o.push(l);
  };
  t.sign.includes(w) && r(n, `prove who you are to ${[E(e), ...t.proofs.map(E)].join(", ")}`);
  for (const o of t.sign) {
    if (o === w) continue;
    if (o === p) {
      t.appData.includes("*") ? r(s, "save application data under any name, including other applications' data") : r(n, `save its own data (${t.appData.join(", ")})`);
      continue;
    }
    const l = X[o];
    if (!l) {
      I(o) ? r(n, `save its own kind of data (kind ${o})`) : i.push(o);
      continue;
    }
    r(H.includes(o) ? s : n, l);
  }
  i.length > 0 && r(n, `sign kinds BitLogin has no words for: ${i.join(", ")}`);
  for (const o of t.read) {
    if (o === p) {
      t.appData.includes("*") ? r(s, "read application data saved under any name") : r(n, "read its own saved data");
      continue;
    }
    const l = Y[o];
    l ? r(z.includes(o) || o === 7375 ? s : n, l) : r(n, I(o) ? `read its own kind of data (kind ${o})` : `read what is encrypted in kind ${o}`);
  }
  return t.peers.length > 0 && r(n, `exchange encrypted messages with ${t.peers.length === 1 ? "one service" : `${t.peers.length} services`} it names (${t.peers.map((o) => `${o.slice(0, 8)}…`).join(", ")})`), { ordinary: n, sensitive: s };
}
export {
  ie as A,
  z as M,
  Z as P,
  C as S,
  Q as a,
  y as b,
  c,
  te as d,
  J as e,
  se as f,
  fe as g,
  ne as h,
  S as i,
  G as j,
  re as k,
  ae as l,
  oe as m,
  de as n,
  ce as o,
  le as p,
  ue as q,
  x as r,
  ee as s
};
