import { C as Lt, D as pe, E as ge, h as we, u as dt, a as me, A as Gt, M as be, B as Ae, c as Ee, p as ve, y as _e, b as Se, N as Ne, v as Mt, O as Yt } from "./bitlogin-shared-Cj9s0_W_.js";
/*! noble-ciphers - MIT License (c) 2023 Paul Miller (paulmillr.com) */
function Ie(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in e && e.BYTES_PER_ELEMENT === 1;
}
function Kt(e) {
  if (typeof e != "boolean")
    throw new TypeError(`boolean expected, not ${e}`);
}
function yt(e) {
  if (typeof e != "number")
    throw new TypeError("number expected, got " + typeof e);
  if (!Number.isSafeInteger(e) || e < 0)
    throw new RangeError("positive integer expected, got " + e);
}
function C(e, t, r = "") {
  const n = Ie(e), s = e?.length, o = t !== void 0;
  if (!n || o && s !== t) {
    const i = r && `"${r}" `, c = o ? ` of length ${t}` : "", l = n ? `length=${s}` : `type=${typeof e}`, d = i + "expected Uint8Array" + c + ", got " + l;
    throw n ? new RangeError(d) : new TypeError(d);
  }
  return e;
}
function K(e) {
  return new Uint32Array(e.buffer, e.byteOffset, Math.floor(e.byteLength / 4));
}
function jt(...e) {
  for (let t = 0; t < e.length; t++)
    e[t].fill(0);
}
const H = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68, Oe = (e) => e << 24 & 4278190080 | e << 8 & 16711680 | e >>> 8 & 65280 | e >>> 24 & 255, ke = (e) => {
  for (let t = 0; t < e.length; t++)
    e[t] = Oe(e[t]);
  return e;
}, U = H ? (e) => e : ke;
function xe(e, t) {
  return !e.byteLength || !t.byteLength ? !1 : e.buffer === t.buffer && // best we can do, may fail with an obscure Proxy
  e.byteOffset < t.byteOffset + t.byteLength && // a starts before b end
  t.byteOffset < e.byteOffset + e.byteLength;
}
function Ln(e, t) {
  if (xe(e, t) && e.byteOffset < t.byteOffset)
    throw new Error("complex overlap of input and output is not supported");
}
function Le(e, t) {
  if (t == null || typeof t != "object")
    throw new Error("options must be defined");
  return Object.assign(e, t);
}
const Mn = /* @__NO_SIDE_EFFECTS__ */ (e, t) => {
  function r(n, ...s) {
    if (C(n, void 0, "key"), e.nonceLength !== void 0) {
      const a = s[0];
      C(a, e.varSizeNonce ? void 0 : e.nonceLength, "nonce");
    }
    const o = e.tagLength;
    o && s[1] !== void 0 && C(s[1], void 0, "AAD");
    const i = t(n, ...s), c = (a, u) => {
      if (u !== void 0) {
        if (a !== 2)
          throw new Error("cipher output not supported");
        C(u, void 0, "output");
      }
    };
    let l = !1;
    return {
      encrypt(a, u) {
        if (l)
          throw new Error("cannot encrypt() twice with same key + nonce");
        return l = !0, C(a), c(i.encrypt.length, u), i.encrypt(a, u);
      },
      decrypt(a, u) {
        if (C(a), o && a.length < o)
          throw new Error('"ciphertext" expected length bigger than tagLength=' + o);
        return c(i.decrypt.length, u), i.decrypt(a, u);
      }
    };
  }
  return Object.assign(r, e), r;
};
function Me(e, t, r = !0) {
  if (t === void 0)
    return new Uint8Array(e);
  if (C(t, void 0, "output"), t.length !== e)
    throw new Error('"output" expected Uint8Array of length ' + e + ", got: " + t.length);
  if (r && !it(t))
    throw new Error("invalid output, must be aligned");
  return t;
}
function it(e) {
  return e.byteOffset % 4 === 0;
}
function Ut(e) {
  return Uint8Array.from(C(e));
}
const Jt = (e) => Uint8Array.from(e.split(""), (t) => t.charCodeAt(0)), De = U(K(Jt("expand 16-byte k"))), Pe = U(K(Jt("expand 32-byte k")));
function f(e, t) {
  return e << t | e >>> 32 - t;
}
const J = 64, Re = 16, pt = 2 ** 32 - 1, Bt = /* @__PURE__ */ Uint32Array.of();
function Ce(e, t, r, n, s, o, i, c) {
  const l = s.length, d = new Uint8Array(J), a = K(d), u = H && it(s) && it(o), F = u ? K(s) : Bt, T = u ? K(o) : Bt;
  if (!H) {
    for (let p = 0; p < l; i++) {
      if (e(t, r, n, a, i, c), U(a), i >= pt)
        throw new Error("arx: counter overflow");
      const g = Math.min(J, l - p);
      for (let y = 0, h; y < g; y++)
        h = p + y, o[h] = s[h] ^ d[y];
      p += g;
    }
    return;
  }
  for (let p = 0; p < l; i++) {
    if (e(t, r, n, a, i, c), i >= pt)
      throw new Error("arx: counter overflow");
    const g = Math.min(J, l - p);
    if (u && g === J) {
      const y = p / 4;
      if (p % 4 !== 0)
        throw new Error("arx: invalid block position");
      for (let h = 0, $; h < Re; h++)
        $ = y + h, T[$] = F[$] ^ a[h];
      p += J;
      continue;
    }
    for (let y = 0, h; y < g; y++)
      h = p + y, o[h] = s[h] ^ d[y];
    p += g;
  }
}
function Te(e, t) {
  const { allowShortKeys: r, extendNonceFn: n, counterLength: s, counterRight: o, rounds: i } = Le({ allowShortKeys: !1, counterLength: 8, counterRight: !1, rounds: 20 }, t);
  if (typeof e != "function")
    throw new Error("core must be a function");
  return yt(s), yt(i), Kt(o), Kt(r), (c, l, d, a, u = 0) => {
    C(c, void 0, "key"), C(l, void 0, "nonce"), C(d, void 0, "data");
    const F = d.length;
    if (a = Me(F, a, !1), yt(u), u < 0 || u >= pt)
      throw new Error("arx: counter overflow");
    const T = [];
    let p = c.length, g, y;
    if (p === 32)
      T.push(g = Ut(c)), y = Pe;
    else if (p === 16 && r)
      g = new Uint8Array(32), g.set(c), g.set(c, 16), y = De, T.push(g);
    else
      throw C(c, 32, "arx key"), new Error("invalid key size");
    (!H || !it(l)) && T.push(l = Ut(l));
    let h = K(g);
    if (n) {
      if (l.length !== 24)
        throw new Error("arx: extended nonce must be 24 bytes");
      const j = l.subarray(0, 16);
      if (H)
        n(y, h, K(j), h);
      else {
        const Y = U(Uint32Array.from(y));
        n(Y, h, K(j), h), jt(Y), U(h);
      }
      l = l.subarray(16);
    } else H || U(h);
    const $ = 16 - s;
    if ($ !== l.length)
      throw new Error(`arx: nonce must be ${$} or 16 bytes`);
    if ($ !== 12) {
      const j = new Uint8Array(12);
      j.set(l, o ? 0 : 12 - l.length), l = j, T.push(l);
    }
    const st = U(K(l));
    try {
      return Ce(e, y, h, st, d, a, u, i), a;
    } finally {
      jt(...T);
    }
  };
}
function $e(e, t, r, n, s, o = 20) {
  let i = e[0], c = e[1], l = e[2], d = e[3], a = t[0], u = t[1], F = t[2], T = t[3], p = t[4], g = t[5], y = t[6], h = t[7], $ = s, st = r[0], j = r[1], Y = r[2], b = i, A = c, E = l, v = d, _ = a, S = u, N = F, I = T, O = p, k = g, x = y, L = h, M = $, D = st, P = j, R = Y;
  for (let $t = 0; $t < o; $t += 2)
    b = b + _ | 0, M = f(M ^ b, 16), O = O + M | 0, _ = f(_ ^ O, 12), b = b + _ | 0, M = f(M ^ b, 8), O = O + M | 0, _ = f(_ ^ O, 7), A = A + S | 0, D = f(D ^ A, 16), k = k + D | 0, S = f(S ^ k, 12), A = A + S | 0, D = f(D ^ A, 8), k = k + D | 0, S = f(S ^ k, 7), E = E + N | 0, P = f(P ^ E, 16), x = x + P | 0, N = f(N ^ x, 12), E = E + N | 0, P = f(P ^ E, 8), x = x + P | 0, N = f(N ^ x, 7), v = v + I | 0, R = f(R ^ v, 16), L = L + R | 0, I = f(I ^ L, 12), v = v + I | 0, R = f(R ^ v, 8), L = L + R | 0, I = f(I ^ L, 7), b = b + S | 0, R = f(R ^ b, 16), x = x + R | 0, S = f(S ^ x, 12), b = b + S | 0, R = f(R ^ b, 8), x = x + R | 0, S = f(S ^ x, 7), A = A + N | 0, M = f(M ^ A, 16), L = L + M | 0, N = f(N ^ L, 12), A = A + N | 0, M = f(M ^ A, 8), L = L + M | 0, N = f(N ^ L, 7), E = E + I | 0, D = f(D ^ E, 16), O = O + D | 0, I = f(I ^ O, 12), E = E + I | 0, D = f(D ^ E, 8), O = O + D | 0, I = f(I ^ O, 7), v = v + _ | 0, P = f(P ^ v, 16), k = k + P | 0, _ = f(_ ^ k, 12), v = v + _ | 0, P = f(P ^ v, 8), k = k + P | 0, _ = f(_ ^ k, 7);
  let w = 0;
  n[w++] = i + b | 0, n[w++] = c + A | 0, n[w++] = l + E | 0, n[w++] = d + v | 0, n[w++] = a + _ | 0, n[w++] = u + S | 0, n[w++] = F + N | 0, n[w++] = T + I | 0, n[w++] = p + O | 0, n[w++] = g + k | 0, n[w++] = y + x | 0, n[w++] = h + L | 0, n[w++] = $ + M | 0, n[w++] = st + D | 0, n[w++] = j + P | 0, n[w++] = Y + R | 0;
}
const qt = /* @__PURE__ */ Te($e, {
  counterRight: !1,
  counterLength: 4,
  allowShortKeys: !1
}), Zt = 2, gt = 1, Qt = 65536, Ke = 4294967295, je = 132, Ue = 99, wt = 1024 * 1024;
function Dn(e, t) {
  const r = Lt(new Uint8Array([2]), pe(t)), s = ge.getSharedSecret(e, r, !0).slice(1, 33);
  return we(dt("nip44-v2"), s);
}
function te(e, t) {
  if (e.length !== 32)
    throw new Error("NIP-44 conversation key must be exactly 32 bytes.");
  if (t.length !== 32)
    throw new Error("NIP-44 nonce must be exactly 32 bytes.");
  const r = Ee(e, t, 76);
  return {
    chachaKey: r.slice(0, 32),
    chachaNonce: r.slice(32, 44),
    hmacKey: r.slice(44, 76)
  };
}
function Dt(e) {
  if (e <= 32)
    return 32;
  const t = 2 ** Math.floor(Math.log2(e - 1) + 1), r = t <= 256 ? 32 : t / 8;
  return r * (Math.floor((e - 1) / r) + 1);
}
const ee = 39 + Dt(wt) + 32, Be = Math.ceil(ee / 3) * 4;
function Fe(e) {
  if (e < Qt) {
    const r = new Uint8Array(2);
    return new DataView(r.buffer).setUint16(0, e, !1), r;
  }
  const t = new Uint8Array(6);
  return new DataView(t.buffer).setUint32(2, e, !1), t;
}
function We(e) {
  const t = e.length;
  if (t < gt || t > wt)
    throw new Error(`NIP-44 plaintext length must be between ${gt} and ${wt} bytes on this platform.`);
  const r = Fe(t), n = Dt(t), s = new Uint8Array(r.length + n);
  return s.set(r, 0), s.set(e, r.length), s;
}
function ze(e) {
  const t = new DataView(e.buffer, e.byteOffset, e.byteLength), r = t.getUint16(0, !1);
  let n, s;
  if (r === 0) {
    if (n = t.getUint32(2, !1), s = 6, n < Qt)
      throw new Error("NIP-44 payload has inconsistent padding.");
  } else
    n = r, s = 2;
  if (n < gt || n > Ke || e.length !== s + Dt(n))
    throw new Error("NIP-44 payload has inconsistent padding.");
  return e.slice(s, s + n);
}
function ne(e, t, r) {
  return ve(_e, e, Lt(t, r));
}
function Ve(e, t) {
  return Xe(e, t, me(32));
}
function Xe(e, t, r) {
  if (r.length !== 32)
    throw new Error("NIP-44 nonce must be exactly 32 bytes.");
  const { chachaKey: n, chachaNonce: s, hmacKey: o } = te(e, r), i = We(dt(t)), c = qt(n, s, i), l = ne(o, r, c);
  return Gt.encode(Lt(new Uint8Array([Zt]), r, c, l));
}
function He(e, t) {
  if (t.startsWith("#"))
    throw new Error("Unsupported NIP-44 non-base64 encoding.");
  if (t.length < je || t.length > Be)
    throw new Error("NIP-44 payload size is outside this platform's supported range.");
  const r = Gt.decode(t);
  if (r.length < Ue || r.length > ee)
    throw new Error("NIP-44 decoded payload size is outside this platform's supported range.");
  if (r[0] !== Zt)
    throw new Error(`Unsupported NIP-44 version: ${r[0]}`);
  const n = r.slice(1, 33);
  if (n.length !== 32)
    throw new Error("NIP-44 nonce must be exactly 32 bytes.");
  const s = r.slice(r.length - 32), o = r.slice(33, r.length - 32), { chachaKey: i, chachaNonce: c, hmacKey: l } = te(e, n), d = ne(l, n, o);
  if (!be(s, d))
    throw new Error("NIP-44 MAC verification failed: payload is corrupted, tampered, or uses the wrong key.");
  const a = qt(i, c, o);
  return Ae(ze(a));
}
const re = 37304, mt = {
  /** The most a save may hold, in bytes of UTF-8. It has to fit in one note that any relay will take. */
  dataBytes: 32768,
  /** No more saves than this for one world in `perMs`, and in an hour. Counted apart from notes and passes. */
  burst: 6,
  perMs: 6e4,
  hourly: 60,
  /** A save handed over to be opened is not read past this many characters of content. */
  contentChars: 7e4
}, Ge = /^[a-z0-9][a-z0-9-]{0,31}$/u, Ye = /^[0-9a-f]{64}$/u, Je = "Something a world keeps for its visitor. Only they can read it.";
function B(e) {
  return typeof e == "string" && Ge.test(e) ? e : "";
}
function Pt(e) {
  return typeof e == "string" && e.length <= mt.dataBytes && dt(e).length <= mt.dataBytes;
}
function se(e, t, r) {
  const n = m(t), s = B(r);
  return !n || !s ? "" : Se(Ne(e, dt(`nswp-save
${n}
${s}`)));
}
function Pn(e) {
  const t = m(e.world), r = B(e.slot), n = se(e.conversationKey, t, r);
  if (!n || !Pt(e.data)) return null;
  const s = JSON.stringify({ v: 1, world: t, slot: r, data: e.data });
  return {
    kind: re,
    created_at: Math.floor(e.nowSeconds),
    tags: [
      ["d", n],
      ["alt", Je]
    ],
    content: Ve(e.conversationKey, s)
  };
}
function Rn(e, t) {
  const r = m(t.world);
  if (!r || !e || typeof e != "object" || !Ye.test(t.pubkey)) return null;
  const n = e;
  if (n.kind !== re || n.pubkey !== t.pubkey || typeof n.content != "string" || n.content.length > mt.contentChars || !Array.isArray(n.tags)) return null;
  let s;
  try {
    s = JSON.parse(He(t.conversationKey, n.content));
  } catch {
    return null;
  }
  if (!s || typeof s != "object" || s.v !== 1 || s.world !== r) return null;
  const o = B(s.slot);
  if (!o || !Pt(s.data)) return null;
  const i = n.tags.find((c) => Array.isArray(c) && c[0] === "d");
  return !i || i[1] !== se(t.conversationKey, r, o) ? null : { slot: o, data: s.data, at: typeof n.created_at == "number" && Number.isInteger(n.created_at) ? n.created_at : 0 };
}
const bt = 3, Cn = { burst: 6, perMs: 6e4, hourly: 60 }, ot = {
  /** A list handed over to be changed is not read past this many tags, or this much content. */
  tags: 2e4,
  contentChars: 1e5,
  tagItems: 16,
  tagChars: 1e3
}, qe = ["follows", "messages"];
function Z(e) {
  return Array.isArray(e) ? qe.filter((t) => e.includes(t)) : [];
}
const Ze = ["nswp:world", "bitlogin:site"], Qe = /^[0-9a-f]{64}$/u;
function Ft(e, t) {
  if (e && (e.kind !== bt || !Array.isArray(e.tags)) || !e && !t.fromNothing) return null;
  const r = typeof t.add == "string" ? t.add.toLowerCase() : "", n = typeof t.remove == "string" ? t.remove.toLowerCase() : "";
  if (r === "" == (n === "")) return null;
  const s = r || n;
  if (!Qe.test(s) || r && (e?.pubkey ?? t.pubkey) === r) return null;
  const o = e ? e.tags.filter((a) => Array.isArray(a) && a.every((u) => typeof u == "string") && !Ze.includes(a[0] ?? "")) : [], i = (a) => a[0] === "p" && typeof a[1] == "string" && a[1].toLowerCase() === s, c = o.some(i);
  if (r ? c : !c) return null;
  const l = r ? [...o.map((a) => [...a]), ["p", r]] : o.filter((a) => !i(a)).map((a) => [...a]), d = Math.max(Math.floor(t.nowSeconds), e ? e.created_at + 1 : 0);
  return { kind: bt, created_at: d, tags: l, content: typeof e?.content == "string" ? e.content : "" };
}
function tn(e, t) {
  if (!e || typeof e != "object") return null;
  const r = e;
  if (r.kind !== bt || r.pubkey !== t || !Array.isArray(r.tags) || r.tags.length > ot.tags || typeof r.content != "string" || r.content.length > ot.contentChars) return null;
  for (const n of r.tags)
    if (!Array.isArray(n) || n.length > ot.tagItems || !n.every((s) => typeof s == "string" && s.length <= ot.tagChars)) return null;
  return Mt(e) ? e : null;
}
function Tn(e) {
  const t = { add: e.add, remove: e.remove, nowSeconds: e.nowSeconds, pubkey: e.pubkey };
  if (e.list === null || e.list === void 0) return e.seen ? null : Ft(null, { ...t, fromNothing: !0 });
  const r = tn(e.list, e.pubkey);
  return !r || e.seen && r.created_at < e.seen ? null : Ft(r, t);
}
function $n(e, t) {
  return e === null ? t.answered > 0 && t.newestAt === 0 : e.created_at >= t.newestAt;
}
const At = 14, oe = 13, en = 1059, nn = 10050, at = {
  /** The most characters in one message. */
  chars: 2e3,
  /** No more than this many relays are put in a list of where messages reach someone. */
  relays: 4,
  /** A wrap handed over to be opened is not read past this many characters of content. */
  wrapChars: 6e4
}, Kn = { burst: 10, perMs: 6e4, hourly: 200 }, jn = { burst: 600, perMs: 6e4, hourly: 12e3 }, Un = { burst: 3, perMs: 6e4, hourly: 12 }, ct = /^[0-9a-f]{64}$/u, rn = [
  [0, 9],
  [11, 31],
  [127, 159],
  [8203, 8204],
  [8206, 8207],
  [8232, 8239],
  [8288, 8303],
  [65279, 65279],
  [65529, 65531]
];
function lt(e) {
  if (typeof e != "string") return "";
  let t = "";
  for (const r of e.slice(0, at.chars * 8).normalize("NFC")) {
    const n = r.codePointAt(0);
    t += rn.some(([s, o]) => n >= s && n <= o) ? " " : r;
  }
  return t = t.replace(/[^\S\n]+/gu, " ").replace(/ ?\n ?/gu, `
`).replace(/\n{3,}/gu, `

`).trim(), [...t].slice(0, at.chars).join("").trim();
}
function sn(e) {
  const t = lt(e.text);
  if (!ct.test(e.from) || typeof e.to != "string" || !ct.test(e.to) || e.from === e.to || !t) return null;
  const r = { kind: At, pubkey: e.from, created_at: Math.floor(e.nowSeconds), tags: [["p", e.to]], content: t };
  return { ...r, id: Yt(r) };
}
function Bn(e, t) {
  const r = e.getPublicKey(), n = sn({ from: r, to: t.to, text: t.text, nowSeconds: t.nowSeconds });
  if (!n) return null;
  const s = JSON.stringify(n), o = (i) => e.signEvent({ kind: oe, created_at: Math.floor(t.nowSeconds), tags: [], content: e.nip44Encrypt(i, s) });
  return { message: n, seals: [o(n.tags[0][1]), o(r)] };
}
function on(e) {
  let t;
  try {
    t = JSON.parse(e);
  } catch {
    return null;
  }
  return !Mt(t) || t.kind !== oe || t.tags.length !== 0 ? null : t;
}
function an(e, t, r) {
  let n;
  try {
    n = JSON.parse(e);
  } catch {
    return null;
  }
  if (!n || typeof n != "object" || n.kind !== At || n.pubkey !== t || typeof n.pubkey != "string" || !ct.test(n.pubkey) || typeof n.content != "string" || typeof n.created_at != "number" || !Number.isInteger(n.created_at) || !Array.isArray(n.tags) || !n.tags.every((c) => Array.isArray(c) && c.every((l) => typeof l == "string"))) return null;
  const s = [...new Set(n.tags.filter((c) => c[0] === "p" && typeof c[1] == "string" && ct.test(c[1])).map((c) => c[1]))], o = lt(n.content);
  return s.length === 0 || !o || n.pubkey !== r && !s.includes(r) ? null : { id: Yt({ kind: At, pubkey: n.pubkey, created_at: n.created_at, tags: n.tags, content: n.content }), from: n.pubkey, to: s, text: o, at: n.created_at };
}
function Fn(e, t) {
  const r = e.getPublicKey();
  if (!t || typeof t != "object") return null;
  const n = t;
  if (n.kind !== en || typeof n.content != "string" || n.content.length > at.wrapChars || !Array.isArray(n.tags) || n.tags.length > 20 || !Mt(t) || !t.tags.some((s) => s[0] === "p" && s[1] === r)) return null;
  try {
    const s = on(e.nip44Decrypt(t.pubkey, t.content));
    return s ? an(e.nip44Decrypt(s.pubkey, s.content), s.pubkey, r) : null;
  } catch {
    return null;
  }
}
function cn(e) {
  if (typeof e != "string" || e.length > 200) return "";
  try {
    const t = new URL(e.trim()), r = t.hostname;
    return t.protocol !== "wss:" || t.username || t.password || !r.includes(".") || r.startsWith("[") || /^[0-9.]+$/u.test(r) || /\.(local|localhost|internal|lan|home)$/iu.test(r) ? "" : (t.hash = "", t.href.replace(/\/$/u, ""));
  } catch {
    return "";
  }
}
function Wn(e, t) {
  if (!Array.isArray(e) || e.length > 8) return null;
  const r = [...new Set(e.map(cn).filter(Boolean))].slice(0, at.relays);
  return r.length === 0 ? null : { kind: nn, created_at: Math.floor(t), tags: r.map((n) => ["relay", n]), content: "" };
}
const ln = 37306, Wt = 37300, Et = {
  /** No more scores than this for one world in `perMs`, and in an hour. Counted apart from notes. */
  burst: 6,
  perMs: 6e4,
  hourly: 60,
  /** The most a score may be. */
  most: 9007199254740991,
  /** The longest a board's title may be, in characters. */
  title: 60
}, un = /^[a-z0-9][a-z0-9-]{0,31}$/u, fn = /^(\d+):([0-9a-f]{64}):(.*)$/su;
function X(e) {
  if (typeof e != "string" || e.length > 200) return "";
  const t = fn.exec(e);
  return t && Number(t[1]) === Wt && t[3] !== "" ? `${Wt}:${t[2]}:${t[3]}` : "";
}
function vt(e) {
  return typeof e == "string" && un.test(e) ? e : "";
}
function _t(e) {
  const t = typeof e == "string" && /^\d{1,16}$/u.test(e) ? Number(e) : e;
  return typeof t == "number" && Number.isSafeInteger(t) && t >= 0 && t <= Et.most ? t : null;
}
function St(e) {
  if (typeof e != "string") return "";
  let t = "";
  for (const r of e.slice(0, Et.title * 8).normalize("NFC")) {
    const n = r.codePointAt(0), s = n <= 31 || n >= 127 && n <= 159 || n >= 8203 && n <= 8207 || n >= 8232 && n <= 8239 || n >= 8288 && n <= 8303 || n === 65279;
    t += s ? " " : r;
  }
  return [...t.replace(/\s+/gu, " ").trim()].slice(0, Et.title).join("").trim();
}
function dn(e, t) {
  if (e !== "time") return String(t).replace(/\B(?=(\d{3})+(?!\d))/gu, ",");
  const r = Math.round(t / 100), n = Math.floor(r / 600), s = r % 600 / 10;
  return n ? `${n} min ${s.toFixed(1)} s` : `${s.toFixed(1)} s`;
}
function zn(e) {
  const t = m(e.origin), r = X(e.world), n = vt(e.board), s = _t(e.score);
  if (!t || !r || !n || s === null) return null;
  const o = St(e.title), i = e.format === "time" ? "time" : "number";
  return {
    kind: ln,
    created_at: Math.floor(e.nowSeconds),
    tags: [
      ["d", `${r}/${n}`],
      ["a", r],
      ["board", n, ...o ? [o] : []],
      ["score", String(s), ...i === "time" ? ["time"] : []],
      ["alt", `A score in a world: ${o ? `${o}: ` : ""}${dn(i, s)}`],
      [ut, t]
    ],
    content: ""
  };
}
const hn = 37307, zt = {
  /** No more than this many for one world in `perMs`, and in an hour. Counted apart from notes and scores. */
  burst: 6,
  perMs: 6e4,
  hourly: 60,
  /** The longest a title may be, in characters. */
  title: 60
}, yn = /^[a-z0-9][a-z0-9-]{0,31}$/u;
function Nt(e) {
  return typeof e == "string" && yn.test(e) ? e : "";
}
function It(e) {
  if (typeof e != "string") return "";
  let t = "";
  for (const r of e.slice(0, zt.title * 8).normalize("NFC")) {
    const n = r.codePointAt(0), s = n <= 31 || n >= 127 && n <= 159 || n >= 8203 && n <= 8207 || n >= 8232 && n <= 8239 || n >= 8288 && n <= 8303 || n === 65279;
    t += s ? " " : r;
  }
  return [...t.replace(/\s+/gu, " ").trim()].slice(0, zt.title).join("").trim();
}
function Vn(e) {
  const t = m(e.origin), r = X(e.world), n = Nt(e.id), s = It(e.title);
  return !t || !r || !n || !s ? null : {
    kind: hn,
    created_at: Math.floor(e.nowSeconds),
    tags: [
      ["d", `${r}/${n}`],
      ["a", r],
      ["achievement", n],
      ["title", s],
      ["alt", `An achievement in a world: ${s}`],
      [ut, t]
    ],
    content: ""
  };
}
const ie = "nswp-signer", ae = "nswp-handoff", ht = 1, Q = {
  /** The longest a note's content may be, in characters. */
  contentChars: 8e3,
  tags: 60,
  tagItems: 8,
  tagChars: 400,
  /** How long a remembered site BitLogin knows stays allowed, in seconds: thirty days from Allow, unless the user signs out of it sooner. */
  grantSec: 720 * 3600,
  /** The same for a site BitLogin does not know: seven days (§SW11). */
  unknownGrantSec: 168 * 3600,
  /** How long a site that is not remembered stays allowed while its page stays open, in seconds (§SW11). */
  visitSec: 12 * 3600,
  /** No more than this many signatures for one site in `perMs`. The same numbers as NSWP's own (kit 0.28.0). */
  burst: 3,
  perMs: 6e4,
  /** And no more than this many in an hour. */
  hourly: 20,
  /** Room passes are counted apart from notes (§SW16), so signing in does not use up a post: this many in `perMs`. */
  passBurst: 2,
  /** And this many in an hour. */
  passHourly: 10
}, pn = [1, 7], gn = [4, 13, 14, 15, 1059, 1060, 13194, 22242, 23194, 23195, 24133, 27235, 27300, 27301, 30078];
function wn(e) {
  return typeof e != "number" || !Number.isInteger(e) || e < 0 || e > 65535 || gn.includes(e) ? "never" : pn.includes(e) ? "ordinary" : "careful";
}
const ut = "nswp:world";
function m(e) {
  if (typeof e != "string" || e.length > 300) return "";
  try {
    const t = new URL(e);
    return (t.protocol === "https:" || t.protocol === "http:") && t.origin !== "null" ? t.origin : "";
  } catch {
    return "";
  }
}
function Ot(e) {
  if (typeof e != "string") return "";
  let t = "";
  for (const r of e.slice(0, 400).normalize("NFC")) {
    const n = r.codePointAt(0), s = n <= 31 || n >= 127 && n <= 159 || n >= 8203 && n <= 8207 || n >= 8232 && n <= 8239 || n >= 8288 && n <= 8303 || n === 65279;
    t += s ? " " : r;
  }
  return [...t.replace(/\s+/gu, " ").trim()].slice(0, 48).join("").trim();
}
function Xn(e, t, r) {
  const n = m(t);
  if (!n || !e || typeof e != "object") return null;
  const s = e;
  if (wn(s.kind) !== "ordinary" || typeof s.content != "string" || [...s.content].length > Q.contentChars || !Array.isArray(s.tags) || s.tags.length > Q.tags) return null;
  const o = [];
  for (const i of s.tags) {
    if (!Array.isArray(i) || i.length === 0 || i.length > Q.tagItems || !i.every((c) => typeof c == "string" && c.length <= Q.tagChars)) return null;
    i[0] !== ut && o.push([...i]);
  }
  return o.push([ut, n]), { kind: s.kind, created_at: Math.floor(r), tags: o, content: s.content };
}
function Hn(e = Q, t = []) {
  let r = t.filter((n) => typeof n == "number" && Number.isFinite(n));
  return {
    times: () => [...r],
    take(n) {
      return r = r.filter((s) => n - s < 36e5), r.length >= e.hourly || r.filter((s) => n - s < e.perMs).length >= e.burst ? !1 : (r.push(n), !0);
    }
  };
}
const ce = /^[0-9a-z-]{1,40}$/iu, V = /^[0-9a-f]{64}$/u, Gn = (e) => ({ nswp: ie, v: ht, ...e });
function Yn(e) {
  if (!e || typeof e != "object") return null;
  const t = e;
  if (t.nswp !== ie || t.v !== ht || typeof t.id != "string" || !ce.test(t.id)) return null;
  if (t.t === "state") return { t: "state", id: t.id };
  if (t.t === "lock") return { t: "lock", id: t.id };
  if (t.t === "sign" && t.event && typeof t.event == "object") return { t: "sign", id: t.id, event: t.event };
  if (t.t === "pass" && typeof t.session == "string" && V.test(t.session)) return { t: "pass", id: t.id, session: t.session };
  if (t.t === "save" && B(t.slot) && Pt(t.data)) return { t: "save", id: t.id, slot: B(t.slot), data: t.data };
  if (t.t === "find" && B(t.slot)) return { t: "find", id: t.id, slot: B(t.slot) };
  if (t.t === "open" && t.event && typeof t.event == "object") return { t: "open", id: t.id, event: t.event };
  if (t.t === "want" && t.permissions === void 0 && Array.isArray(t.more)) return { t: "wantMore", id: t.id, more: Z(t.more) };
  if (t.t === "follow" && (t.list === null || t.list && typeof t.list == "object")) {
    const r = typeof t.add == "string" && V.test(t.add), n = typeof t.remove == "string" && V.test(t.remove);
    return r === n ? null : { t: "follow", id: t.id, list: t.list, ...r ? { add: t.add } : { remove: t.remove } };
  }
  if (t.t === "score" && X(t.world) && vt(t.board) && _t(t.score) !== null) return { t: "score", id: t.id, world: X(t.world), board: vt(t.board), score: _t(t.score), ...St(t.title) ? { title: St(t.title) } : {}, ...t.format === "time" ? { format: "time" } : {} };
  if (t.t === "achieve" && X(t.world) && Nt(t.achievement) && It(t.title))
    return { t: "achieve", id: t.id, world: X(t.world), achievement: Nt(t.achievement), title: It(t.title) };
  if (t.t === "seal" && typeof t.to == "string" && V.test(t.to) && lt(t.text)) return { t: "seal", id: t.id, to: t.to, text: lt(t.text) };
  if (t.t === "unwrap" && t.event && typeof t.event == "object") return { t: "unwrap", id: t.id, event: t.event };
  if (t.t === "reach" && Array.isArray(t.relays) && t.relays.length <= 8 && t.relays.every((r) => typeof r == "string" && r.length <= 200)) return { t: "reach", id: t.id, relays: t.relays };
  if (t.t === "want") {
    const r = he(t.permissions);
    return r ? { t: "want", id: t.id, permissions: r } : null;
  }
  return (t.t === "encrypt" || t.t === "decrypt") && typeof t.peer == "string" && V.test(t.peer) && typeof t.text == "string" && t.text.length <= 2e5 ? { t: t.t, id: t.id, peer: t.peer, text: t.text, scheme: t.scheme === "nip04" ? "nip04" : "nip44" } : t.t === "read" && t.event && typeof t.event == "object" ? { t: "read", id: t.id, event: t.event } : null;
}
const Jn = (e) => ({ nswp: ae, v: ht, ...e });
function qn(e) {
  if (!e || typeof e != "object") return null;
  const t = e;
  if (t.nswp !== ae || t.v !== ht || typeof t.nonce != "string" || !ce.test(t.nonce)) return null;
  const r = (n) => typeof n == "string" && V.test(n);
  if (t.t === "hello") return { t: "hello", nonce: t.nonce };
  if (t.t === "frame" && m(t.world) && r(t.recipient)) {
    const n = t.wants === void 0 ? void 0 : he(t.wants);
    return n === null ? null : { t: "frame", nonce: t.nonce, world: m(t.world), recipient: t.recipient, ...n ? { wants: n } : {}, ...t.turnedDown === !0 ? { turnedDown: !0 } : {}, ...!n && Z(t.more).length ? { more: Z(t.more) } : {}, ...!n && Z(t.has).length ? { has: Z(t.has) } : {} };
  }
  if (t.t === "grant" && m(t.world) && t.sealed && typeof t.sealed == "object") {
    const n = t.sealed;
    if (!r(n.senderPublicKey) || typeof n.payload != "string" || n.payload.length > 12e3) return null;
    const s = Ot(t.name);
    return { t: "grant", nonce: t.nonce, world: m(t.world), sealed: { senderPublicKey: n.senderPublicKey, payload: n.payload }, ...s ? { name: s } : {} };
  }
  return t.t === "done" && typeof t.ok == "boolean" ? { t: "done", nonce: t.nonce, ok: t.ok } : null;
}
const W = { kinds: 64, prefixes: 8, origins: 8, peers: 8, prefixChars: 64 }, G = 30078, tt = 27235, le = 24242, Rt = 22242, ue = 13, mn = 37304, kt = "bitlogin:", fe = [13194, 23194, 23195, 24133, 27301, 37304], et = {
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
}, rt = [27300, 27302, 27303], bn = 27303;
function Zn(e) {
  return Object.hasOwn(et, e) ? et[e].name : null;
}
function Vt(e) {
  if (typeof e != "string" || e.length > 300) return !1;
  let t;
  try {
    const o = new URL(e);
    if (o.protocol !== "https:" && o.protocol !== "http:") return !1;
    t = o.hostname.toLowerCase();
  } catch {
    return !1;
  }
  if (t === "localhost" || t.endsWith(".localhost") || t === "[::1]") return !0;
  const r = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u.exec(t)?.slice(1).map(Number);
  if (!r || r.some((o) => o > 255)) return !1;
  const [n, s] = r;
  return n === 127 || n === 10 || n === 192 && s === 168 || n === 172 && s >= 16 && s <= 31;
}
function An(e, t) {
  return Object.hasOwn(et, e) ? et[e].reserved ?? [] : Vt(t) && Vt(e) ? rt : [];
}
const En = () => {
  try {
    return globalThis.location?.origin ?? "";
  } catch {
    return "";
  }
}, Ct = (e) => An(e, En()), Qn = (e) => !Object.hasOwn(et, e) && Ct(e).length > 0;
function tr(e, t) {
  const r = Ct(e);
  return [...t.sign, ...t.read].every((n) => !rt.includes(n) || r.includes(n));
}
const de = [0, 3, 5, 1e4, 10002, 10050, Rt], vn = [...de, le, ...rt], _n = [4, ue, 1059], Sn = [tt, le, Rt], nt = /^[0-9a-f]{64}$/u, ft = (e) => typeof e == "number" && Number.isInteger(e) && e >= 0 && e <= 65535, q = (e) => [...new Set(e)];
function he(e) {
  if (!e || typeof e != "object" || Array.isArray(e)) return null;
  const t = e, r = (a) => a === void 0 ? [] : Array.isArray(a) ? a : null, n = r(t.sign), s = r(t.appData), o = r(t.proofs), i = r(t.read), c = r(t.peers);
  if (!n || !s || !o || !i || !c || n.length > W.kinds || i.length > W.kinds || s.length > W.prefixes || o.length > W.origins || c.length > W.peers || !n.every(ft) || !i.every(ft) || n.some((a) => fe.includes(a)) || i.includes(mn) || n.length === 0 && i.length === 0 && c.length === 0) return null;
  for (const a of s)
    if (typeof a != "string" || a.length === 0 || a.length > W.prefixChars || a !== "*" && (a.startsWith(kt) || kt.startsWith(a)) || Ot(a) !== a) return null;
  if ((n.includes(G) || i.includes(G)) !== s.length > 0) return null;
  const l = [];
  for (const a of o) {
    const u = m(a);
    if (!u || u !== a || !u.startsWith("https://")) return null;
    l.push(u);
  }
  if (l.length > 0 && !n.includes(tt) || !c.every((a) => typeof a == "string" && nt.test(a))) return null;
  const d = Ot(t.name);
  return {
    ...d ? { name: d } : {},
    sign: q(n).sort((a, u) => a - u),
    appData: q(s),
    proofs: q(l),
    read: q(i).sort((a, u) => a - u),
    peers: q(c)
  };
}
const er = {
  /** Proofs, and the application's own data: what applications sign on timers. */
  quiet: { burst: 300, perMs: 6e4, hourly: 6e3 },
  public: { burst: 60, perMs: 6e4, hourly: 1200 },
  sensitive: { burst: 30, perMs: 6e4, hourly: 300 },
  read: { burst: 600, perMs: 6e4, hourly: 12e3 }
}, z = {
  contentChars: 1e5,
  tags: 2500,
  /** Who someone follows (kind 3) is one note with a tag for each person: more are let through. */
  followTags: 2e4,
  tagItems: 16,
  tagChars: 1e3,
  clockSlackSec: 600
}, xt = (e) => e >= 3e4 && e < 4e4;
function nr(e) {
  return de.includes(e) && e !== Rt || rt.includes(e) ? "sensitive" : Sn.includes(e) || xt(e) ? "quiet" : "public";
}
const Xt = "bitlogin:site", Tt = (e, t) => e.filter((r) => r[0] === t && typeof r[1] == "string").map((r) => r[1]);
function ye(e, t) {
  const r = Tt(t, "d")[0];
  return r === void 0 || r.startsWith(kt) ? !1 : e.appData.some((n) => n === "*" || r.startsWith(n));
}
function Nn(e, t, r) {
  const n = Tt(r, "u");
  return n.length === 0 ? !1 : n.every((s) => {
    const o = m(s);
    return o !== "" && (o === t || e.proofs.includes(o));
  });
}
function rr(e, t, r, n) {
  const s = m(r);
  if (!s || !t || typeof t != "object") return null;
  const o = t;
  if (!ft(o.kind) || fe.includes(o.kind) || !e.sign.includes(o.kind) || rt.includes(o.kind) && !Ct(s).includes(o.kind) || typeof o.content != "string" || o.content.length > z.contentChars || !Array.isArray(o.tags) || o.tags.length > (o.kind === 3 ? z.followTags : z.tags)) return null;
  const i = [];
  for (const a of o.tags) {
    if (!Array.isArray(a) || a.length === 0 || a.length > z.tagItems || !a.every((u) => typeof u == "string" && u.length <= z.tagChars)) return null;
    if (a[0] !== Xt) {
      if (a[0] === "nswp:world") {
        if (o.kind !== bn) continue;
        if (a.length !== 2 || m(a[1]) !== a[1] || i.some((u) => u[0] === "nswp:world")) return null;
      }
      i.push([...a]);
    }
  }
  if (o.kind === G && !ye(e, i) || o.kind === tt && !Nn(e, s, i)) return null;
  if (o.kind === ue) {
    if (i.length > 0) return null;
  } else
    i.push([Xt, s]);
  const c = Math.floor(n), l = typeof o.created_at == "number" && Number.isInteger(o.created_at) ? o.created_at : c, d = Math.abs(l - c) <= z.clockSlackSec ? l : c;
  return { kind: o.kind, created_at: d, tags: i, content: o.content };
}
function sr(e, t, r) {
  return typeof r == "string" && nt.test(r) && (r === t || e.peers.includes(r));
}
function or(e, t) {
  return typeof t == "string" && nt.test(t) && e.peers.includes(t);
}
function In(e, t, r) {
  if (!ft(r.kind) || !e.read.includes(r.kind) || typeof r.pubkey != "string" || !nt.test(r.pubkey) || !Array.isArray(r.tags)) return null;
  const n = r.tags.filter((o) => Array.isArray(o) && o.every((i) => typeof i == "string"));
  if (r.kind === G && !ye(e, n)) return null;
  if (r.pubkey !== t) return r.pubkey;
  const s = Tt(n, "p")[0];
  return s !== void 0 && nt.test(s) ? s : t;
}
function ir(e, t, r) {
  const n = In(e, t, r);
  return n ? r.pubkey === t && n !== t ? [n, t] : [n] : [];
}
const On = {
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
  30004: "change your lists of worlds",
  30015: "change your interests",
  34235: "post videos",
  34236: "post short videos",
  37300: "announce a world as yours",
  37305: "rate worlds, from one to five stars",
  37306: "post your scores on worlds' boards",
  37307: "show which achievements you hold in worlds",
  37308: "change what is in your bag: the items you carry between worlds"
}, kn = {
  4: "read your private messages (older kind)",
  13: "read your private messages",
  1059: "read your private messages",
  1573: "read orders sent to you",
  7375: "read the money in your Cashu wallet",
  7376: "read what your Cashu wallet spent",
  1e4: "read who you have muted",
  3e4: "read your private lists"
}, Ht = (e) => {
  try {
    return new URL(e).host;
  } catch {
    return e;
  }
};
function ar(e, t) {
  const r = [], n = [], s = [], o = (i, c) => {
    i.includes(c) || i.push(c);
  };
  e.sign.includes(tt) && o(r, `prove who you are to ${[Ht(t), ...e.proofs.map(Ht)].join(", ")}`);
  for (const i of e.sign) {
    if (i === tt) continue;
    if (i === G) {
      e.appData.includes("*") ? o(n, "save application data under any name, including other applications' data") : o(r, `save its own data (${e.appData.join(", ")})`);
      continue;
    }
    const c = On[i];
    if (!c) {
      xt(i) ? o(r, `save its own kind of data (kind ${i})`) : s.push(i);
      continue;
    }
    o(vn.includes(i) ? n : r, c);
  }
  s.length > 0 && o(r, `sign kinds BitLogin has no words for: ${s.join(", ")}`);
  for (const i of e.read) {
    if (i === G) {
      e.appData.includes("*") ? o(n, "read application data saved under any name") : o(r, "read its own saved data");
      continue;
    }
    const c = kn[i];
    c ? o(_n.includes(i) || i === 7375 ? n : r, c) : o(r, xt(i) ? `read its own kind of data (kind ${i})` : `read what is encrypted in kind ${i}`);
  }
  return e.peers.length > 0 && o(r, `exchange encrypted messages with ${e.peers.length === 1 ? "one service" : `${e.peers.length} services`} it names (${e.peers.map((i) => `${i.slice(0, 8)}…`).join(", ")})`), { ordinary: r, sensitive: n };
}
export {
  Un as $,
  er as A,
  jt as B,
  C,
  Ot as D,
  Z as E,
  wn as F,
  ir as G,
  or as H,
  sr as I,
  Wn as J,
  Fn as K,
  Bn as L,
  _n as M,
  Vn as N,
  zn as O,
  ht as P,
  tn as Q,
  rt as R,
  ie as S,
  bt as T,
  $n as U,
  Tn as V,
  qe as W,
  Rn as X,
  se as Y,
  Pn as Z,
  mt as _,
  Hn as a,
  jn as a0,
  Kn as a1,
  zt as a2,
  Et as a3,
  Cn as a4,
  Q as b,
  m as c,
  Yn as d,
  Xn as e,
  qn as f,
  Qn as g,
  Jn as h,
  ar as i,
  Dn as j,
  Zn as k,
  nr as l,
  tr as m,
  He as n,
  Ve as o,
  rr as p,
  H as q,
  he as r,
  Gn as s,
  it as t,
  Ut as u,
  K as v,
  Mn as w,
  U as x,
  Me as y,
  Ln as z
};
