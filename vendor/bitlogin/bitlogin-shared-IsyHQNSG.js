import { a8 as D2 } from "./bitlogin-shared-B2Rc9khL.js";
const wl = {
  debug() {
  }
}, Z2 = (e) => e.reduce((t, n) => t + n.toString(16).padStart(2, "0"), "");
/*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) */
function Qo(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array";
}
function bt(e, t = "") {
  if (!Number.isSafeInteger(e) || e < 0) {
    const n = t && `"${t}" `;
    throw new Error(`${n}expected integer >= 0, got ${e}`);
  }
}
function fe(e, t, n = "") {
  const r = Qo(e), o = e?.length, i = t !== void 0;
  if (!r || i && o !== t) {
    const s = n && `"${n}" `, c = i ? ` of length ${t}` : "", a = r ? `length=${o}` : `type=${typeof e}`;
    throw new Error(s + "expected Uint8Array" + c + ", got " + a);
  }
  return e;
}
function pr(e) {
  if (typeof e != "function" || typeof e.create != "function")
    throw new Error("Hash must wrapped by utils.createHasher");
  bt(e.outputLen), bt(e.blockLen);
}
function Xn(e, t = !0) {
  if (e.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (t && e.finished)
    throw new Error("Hash#digest() has already been called");
}
function W2(e, t) {
  fe(e, void 0, "digestInto() output");
  const n = t.outputLen;
  if (e.length < n)
    throw new Error('"digestInto() output" expected to be of length >=' + n);
}
function mn(...e) {
  for (let t = 0; t < e.length; t++)
    e[t].fill(0);
}
function Rr(e) {
  return new DataView(e.buffer, e.byteOffset, e.byteLength);
}
function Ge(e, t) {
  return e << 32 - t | e >>> t;
}
const yl = /* @ts-ignore */ typeof Uint8Array.from([]).toHex == "function" && typeof Uint8Array.fromHex == "function", F2 = /* @__PURE__ */ Array.from({ length: 256 }, (e, t) => t.toString(16).padStart(2, "0"));
function pe(e) {
  if (fe(e), yl)
    return e.toHex();
  let t = "";
  for (let n = 0; n < e.length; n++)
    t += F2[e[n]];
  return t;
}
const Je = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
function es(e) {
  if (e >= Je._0 && e <= Je._9)
    return e - Je._0;
  if (e >= Je.A && e <= Je.F)
    return e - (Je.A - 10);
  if (e >= Je.a && e <= Je.f)
    return e - (Je.a - 10);
}
function ue(e) {
  if (typeof e != "string")
    throw new Error("hex string expected, got " + typeof e);
  if (yl)
    return Uint8Array.fromHex(e);
  const t = e.length, n = t / 2;
  if (t % 2)
    throw new Error("hex string expected, got unpadded hex of length " + t);
  const r = new Uint8Array(n);
  for (let o = 0, i = 0; o < n; o++, i += 2) {
    const s = es(e.charCodeAt(i)), c = es(e.charCodeAt(i + 1));
    if (s === void 0 || c === void 0) {
      const a = e[i] + e[i + 1];
      throw new Error('hex string expected, got non-hex character "' + a + '" at index ' + i);
    }
    r[o] = s * 16 + c;
  }
  return r;
}
function Be(...e) {
  let t = 0;
  for (let r = 0; r < e.length; r++) {
    const o = e[r];
    fe(o), t += o.length;
  }
  const n = new Uint8Array(t);
  for (let r = 0, o = 0; r < e.length; r++) {
    const i = e[r];
    n.set(i, o), o += i.length;
  }
  return n;
}
function V2(e, t = {}) {
  const n = (o, i) => e(i).update(o).digest(), r = e(void 0);
  return n.outputLen = r.outputLen, n.blockLen = r.blockLen, n.create = (o) => e(o), Object.assign(n, t), Object.freeze(n);
}
function nn(e = 32) {
  const t = typeof globalThis == "object" ? globalThis.crypto : null;
  if (typeof t?.getRandomValues != "function")
    throw new Error("crypto.getRandomValues must be defined");
  return t.getRandomValues(new Uint8Array(e));
}
const G2 = (e) => ({
  oid: Uint8Array.from([6, 9, 96, 134, 72, 1, 101, 3, 4, 2, e])
});
function j2(e, t, n) {
  return e & t ^ ~e & n;
}
function z2(e, t, n) {
  return e & t ^ e & n ^ t & n;
}
class q2 {
  blockLen;
  outputLen;
  padOffset;
  isLE;
  // For partial updates less than block size
  buffer;
  view;
  finished = !1;
  length = 0;
  pos = 0;
  destroyed = !1;
  constructor(t, n, r, o) {
    this.blockLen = t, this.outputLen = n, this.padOffset = r, this.isLE = o, this.buffer = new Uint8Array(t), this.view = Rr(this.buffer);
  }
  update(t) {
    Xn(this), fe(t);
    const { view: n, buffer: r, blockLen: o } = this, i = t.length;
    for (let s = 0; s < i; ) {
      const c = Math.min(o - this.pos, i - s);
      if (c === o) {
        const a = Rr(t);
        for (; o <= i - s; s += o)
          this.process(a, s);
        continue;
      }
      r.set(t.subarray(s, s + c), this.pos), this.pos += c, s += c, this.pos === o && (this.process(n, 0), this.pos = 0);
    }
    return this.length += t.length, this.roundClean(), this;
  }
  digestInto(t) {
    Xn(this), W2(t, this), this.finished = !0;
    const { buffer: n, view: r, blockLen: o, isLE: i } = this;
    let { pos: s } = this;
    n[s++] = 128, mn(this.buffer.subarray(s)), this.padOffset > o - s && (this.process(r, 0), s = 0);
    for (let g = s; g < o; g++)
      n[g] = 0;
    r.setBigUint64(o - 8, BigInt(this.length * 8), i), this.process(r, 0);
    const c = Rr(t), a = this.outputLen;
    if (a % 4)
      throw new Error("_sha2: outputLen must be aligned to 32bit");
    const h = a / 4, w = this.get();
    if (h > w.length)
      throw new Error("_sha2: outputLen bigger than state");
    for (let g = 0; g < h; g++)
      c.setUint32(4 * g, w[g], i);
  }
  digest() {
    const { buffer: t, outputLen: n } = this;
    this.digestInto(t);
    const r = t.slice(0, n);
    return this.destroy(), r;
  }
  _cloneInto(t) {
    t ||= new this.constructor(), t.set(...this.get());
    const { blockLen: n, buffer: r, length: o, finished: i, destroyed: s, pos: c } = this;
    return t.destroyed = s, t.finished = i, t.length = o, t.pos = c, o % n && t.buffer.set(r), t;
  }
  clone() {
    return this._cloneInto();
  }
}
const ot = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]), K2 = /* @__PURE__ */ Uint32Array.from([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]), it = /* @__PURE__ */ new Uint32Array(64);
class Q2 extends q2 {
  constructor(t) {
    super(64, t, 8, !1);
  }
  get() {
    const { A: t, B: n, C: r, D: o, E: i, F: s, G: c, H: a } = this;
    return [t, n, r, o, i, s, c, a];
  }
  // prettier-ignore
  set(t, n, r, o, i, s, c, a) {
    this.A = t | 0, this.B = n | 0, this.C = r | 0, this.D = o | 0, this.E = i | 0, this.F = s | 0, this.G = c | 0, this.H = a | 0;
  }
  process(t, n) {
    for (let g = 0; g < 16; g++, n += 4)
      it[g] = t.getUint32(n, !1);
    for (let g = 16; g < 64; g++) {
      const v = it[g - 15], b = it[g - 2], C = Ge(v, 7) ^ Ge(v, 18) ^ v >>> 3, L = Ge(b, 17) ^ Ge(b, 19) ^ b >>> 10;
      it[g] = L + it[g - 7] + C + it[g - 16] | 0;
    }
    let { A: r, B: o, C: i, D: s, E: c, F: a, G: h, H: w } = this;
    for (let g = 0; g < 64; g++) {
      const v = Ge(c, 6) ^ Ge(c, 11) ^ Ge(c, 25), b = w + v + j2(c, a, h) + K2[g] + it[g] | 0, L = (Ge(r, 2) ^ Ge(r, 13) ^ Ge(r, 22)) + z2(r, o, i) | 0;
      w = h, h = a, a = c, c = s + b | 0, s = i, i = o, o = r, r = b + L | 0;
    }
    r = r + this.A | 0, o = o + this.B | 0, i = i + this.C | 0, s = s + this.D | 0, c = c + this.E | 0, a = a + this.F | 0, h = h + this.G | 0, w = w + this.H | 0, this.set(r, o, i, s, c, a, h, w);
  }
  roundClean() {
    mn(it);
  }
  destroy() {
    this.set(0, 0, 0, 0, 0, 0, 0, 0), mn(this.buffer);
  }
}
class J2 extends Q2 {
  // We cannot use array here since array allows indexing by variable
  // which means optimizer/compiler cannot use registers.
  A = ot[0] | 0;
  B = ot[1] | 0;
  C = ot[2] | 0;
  D = ot[3] | 0;
  E = ot[4] | 0;
  F = ot[5] | 0;
  G = ot[6] | 0;
  H = ot[7] | 0;
  constructor() {
    super(32);
  }
}
const Ke = /* @__PURE__ */ V2(
  () => new J2(),
  /* @__PURE__ */ G2(1)
);
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const Jo = /* @__PURE__ */ BigInt(0), Co = /* @__PURE__ */ BigInt(1);
function er(e, t = "") {
  if (typeof e != "boolean") {
    const n = t && `"${t}" `;
    throw new Error(n + "expected boolean, got type=" + typeof e);
  }
  return e;
}
function bl(e) {
  if (typeof e == "bigint") {
    if (!jn(e))
      throw new Error("positive bigint expected, got " + e);
  } else
    bt(e);
  return e;
}
function Rn(e) {
  const t = bl(e).toString(16);
  return t.length & 1 ? "0" + t : t;
}
function ml(e) {
  if (typeof e != "string")
    throw new Error("hex string expected, got " + typeof e);
  return e === "" ? Jo : BigInt("0x" + e);
}
function Ln(e) {
  return ml(pe(e));
}
function vl(e) {
  return ml(pe(Y2(fe(e)).reverse()));
}
function Yo(e, t) {
  bt(t), e = bl(e);
  const n = ue(e.toString(16).padStart(t * 2, "0"));
  if (n.length !== t)
    throw new Error("number too large");
  return n;
}
function Cl(e, t) {
  return Yo(e, t).reverse();
}
function Y2(e) {
  return Uint8Array.from(e);
}
function X2(e) {
  return Uint8Array.from(e, (t, n) => {
    const r = t.charCodeAt(0);
    if (t.length !== 1 || r > 127)
      throw new Error(`string contains non-ASCII character "${e[n]}" with code ${r} at position ${n}`);
    return r;
  });
}
const jn = (e) => typeof e == "bigint" && Jo <= e;
function ed(e, t, n) {
  return jn(e) && jn(t) && jn(n) && t <= e && e < n;
}
function td(e, t, n, r) {
  if (!ed(t, n, r))
    throw new Error("expected valid " + e + ": " + n + " <= n < " + r + ", got " + t);
}
function nd(e) {
  let t;
  for (t = 0; e > Jo; e >>= Co, t += 1)
    ;
  return t;
}
const Xo = (e) => (Co << BigInt(e)) - Co;
function rd(e, t, n) {
  if (bt(e, "hashLen"), bt(t, "qByteLen"), typeof n != "function")
    throw new Error("hmacFn must be a function");
  const r = (M) => new Uint8Array(M), o = Uint8Array.of(), i = Uint8Array.of(0), s = Uint8Array.of(1), c = 1e3;
  let a = r(e), h = r(e), w = 0;
  const g = () => {
    a.fill(1), h.fill(0), w = 0;
  }, v = (...M) => n(h, Be(a, ...M)), b = (M = o) => {
    h = v(i, M), a = v(), M.length !== 0 && (h = v(s, M), a = v());
  }, C = () => {
    if (w++ >= c)
      throw new Error("drbg: tried max amount of iterations");
    let M = 0;
    const I = [];
    for (; M < t; ) {
      a = v();
      const U = a.slice();
      I.push(U), M += a.length;
    }
    return Be(...I);
  };
  return (M, I) => {
    g(), b(M);
    let U;
    for (; !(U = I(C())); )
      b();
    return g(), U;
  };
}
function ei(e, t = {}, n = {}) {
  if (!e || typeof e != "object")
    throw new Error("expected valid options object");
  function r(i, s, c) {
    const a = e[i];
    if (c && a === void 0)
      return;
    const h = typeof a;
    if (h !== s || a === null)
      throw new Error(`param "${i}" is invalid: expected ${s}, got ${h}`);
  }
  const o = (i, s) => Object.entries(i).forEach(([c, a]) => r(c, a, s));
  o(t, !1), o(n, !0);
}
function ts(e) {
  const t = /* @__PURE__ */ new WeakMap();
  return (n, ...r) => {
    const o = t.get(n);
    if (o !== void 0)
      return o;
    const i = e(n, ...r);
    return t.set(n, i), i;
  };
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const Re = /* @__PURE__ */ BigInt(0), Te = /* @__PURE__ */ BigInt(1), Lt = /* @__PURE__ */ BigInt(2), xl = /* @__PURE__ */ BigInt(3), El = /* @__PURE__ */ BigInt(4), Al = /* @__PURE__ */ BigInt(5), od = /* @__PURE__ */ BigInt(7), kl = /* @__PURE__ */ BigInt(8), id = /* @__PURE__ */ BigInt(9), _l = /* @__PURE__ */ BigInt(16);
function We(e, t) {
  const n = e % t;
  return n >= Re ? n : t + n;
}
function Pe(e, t, n) {
  let r = e;
  for (; t-- > Re; )
    r *= r, r %= n;
  return r;
}
function ns(e, t) {
  if (e === Re)
    throw new Error("invert: expected non-zero number");
  if (t <= Re)
    throw new Error("invert: expected positive modulus, got " + t);
  let n = We(e, t), r = t, o = Re, i = Te;
  for (; n !== Re; ) {
    const c = r / n, a = r % n, h = o - i * c;
    r = n, n = a, o = i, i = h;
  }
  if (r !== Te)
    throw new Error("invert: does not exist");
  return We(o, t);
}
function ti(e, t, n) {
  if (!e.eql(e.sqr(t), n))
    throw new Error("Cannot find square root");
}
function Sl(e, t) {
  const n = (e.ORDER + Te) / El, r = e.pow(t, n);
  return ti(e, r, t), r;
}
function sd(e, t) {
  const n = (e.ORDER - Al) / kl, r = e.mul(t, Lt), o = e.pow(r, n), i = e.mul(t, o), s = e.mul(e.mul(i, Lt), o), c = e.mul(i, e.sub(s, e.ONE));
  return ti(e, c, t), c;
}
function ad(e) {
  const t = gr(e), n = Ll(e), r = n(t, t.neg(t.ONE)), o = n(t, r), i = n(t, t.neg(r)), s = (e + od) / _l;
  return (c, a) => {
    let h = c.pow(a, s), w = c.mul(h, r);
    const g = c.mul(h, o), v = c.mul(h, i), b = c.eql(c.sqr(w), a), C = c.eql(c.sqr(g), a);
    h = c.cmov(h, w, b), w = c.cmov(v, g, C);
    const L = c.eql(c.sqr(w), a), M = c.cmov(h, w, L);
    return ti(c, M, a), M;
  };
}
function Ll(e) {
  if (e < xl)
    throw new Error("sqrt is not defined for small field");
  let t = e - Te, n = 0;
  for (; t % Lt === Re; )
    t /= Lt, n++;
  let r = Lt;
  const o = gr(e);
  for (; rs(o, r) === 1; )
    if (r++ > 1e3)
      throw new Error("Cannot find square root: probably non-prime P");
  if (n === 1)
    return Sl;
  let i = o.pow(r, t);
  const s = (t + Te) / Lt;
  return function(a, h) {
    if (a.is0(h))
      return h;
    if (rs(a, h) !== 1)
      throw new Error("Cannot find square root");
    let w = n, g = a.mul(a.ONE, i), v = a.pow(h, t), b = a.pow(h, s);
    for (; !a.eql(v, a.ONE); ) {
      if (a.is0(v))
        return a.ZERO;
      let C = 1, L = a.sqr(v);
      for (; !a.eql(L, a.ONE); )
        if (C++, L = a.sqr(L), C === w)
          throw new Error("Cannot find square root");
      const M = Te << BigInt(w - C - 1), I = a.pow(g, M);
      w = C, g = a.sqr(I), v = a.mul(v, g), b = a.mul(b, I);
    }
    return b;
  };
}
function cd(e) {
  return e % El === xl ? Sl : e % kl === Al ? sd : e % _l === id ? ad(e) : Ll(e);
}
const ld = [
  "create",
  "isValid",
  "is0",
  "neg",
  "inv",
  "sqrt",
  "sqr",
  "eql",
  "add",
  "sub",
  "mul",
  "pow",
  "div",
  "addN",
  "subN",
  "mulN",
  "sqrN"
];
function dd(e) {
  const t = {
    ORDER: "bigint",
    BYTES: "number",
    BITS: "number"
  }, n = ld.reduce((r, o) => (r[o] = "function", r), t);
  return ei(e, n), e;
}
function ud(e, t, n) {
  if (n < Re)
    throw new Error("invalid exponent, negatives unsupported");
  if (n === Re)
    return e.ONE;
  if (n === Te)
    return t;
  let r = e.ONE, o = t;
  for (; n > Re; )
    n & Te && (r = e.mul(r, o)), o = e.sqr(o), n >>= Te;
  return r;
}
function Tl(e, t, n = !1) {
  const r = new Array(t.length).fill(n ? e.ZERO : void 0), o = t.reduce((s, c, a) => e.is0(c) ? s : (r[a] = s, e.mul(s, c)), e.ONE), i = e.inv(o);
  return t.reduceRight((s, c, a) => e.is0(c) ? s : (r[a] = e.mul(s, r[a]), e.mul(s, c)), i), r;
}
function rs(e, t) {
  const n = (e.ORDER - Te) / Lt, r = e.pow(t, n), o = e.eql(r, e.ONE), i = e.eql(r, e.ZERO), s = e.eql(r, e.neg(e.ONE));
  if (!o && !i && !s)
    throw new Error("invalid Legendre symbol result");
  return o ? 1 : i ? 0 : -1;
}
function hd(e, t) {
  t !== void 0 && bt(t);
  const n = t !== void 0 ? t : e.toString(2).length, r = Math.ceil(n / 8);
  return { nBitLength: n, nByteLength: r };
}
class fd {
  ORDER;
  BITS;
  BYTES;
  isLE;
  ZERO = Re;
  ONE = Te;
  _lengths;
  _sqrt;
  // cached sqrt
  _mod;
  constructor(t, n = {}) {
    if (t <= Re)
      throw new Error("invalid field: expected ORDER > 0, got " + t);
    let r;
    this.isLE = !1, n != null && typeof n == "object" && (typeof n.BITS == "number" && (r = n.BITS), typeof n.sqrt == "function" && (this.sqrt = n.sqrt), typeof n.isLE == "boolean" && (this.isLE = n.isLE), n.allowedLengths && (this._lengths = n.allowedLengths?.slice()), typeof n.modFromBytes == "boolean" && (this._mod = n.modFromBytes));
    const { nBitLength: o, nByteLength: i } = hd(t, r);
    if (i > 2048)
      throw new Error("invalid field: expected ORDER of <= 2048 bytes");
    this.ORDER = t, this.BITS = o, this.BYTES = i, this._sqrt = void 0, Object.preventExtensions(this);
  }
  create(t) {
    return We(t, this.ORDER);
  }
  isValid(t) {
    if (typeof t != "bigint")
      throw new Error("invalid field element: expected bigint, got " + typeof t);
    return Re <= t && t < this.ORDER;
  }
  is0(t) {
    return t === Re;
  }
  // is valid and invertible
  isValidNot0(t) {
    return !this.is0(t) && this.isValid(t);
  }
  isOdd(t) {
    return (t & Te) === Te;
  }
  neg(t) {
    return We(-t, this.ORDER);
  }
  eql(t, n) {
    return t === n;
  }
  sqr(t) {
    return We(t * t, this.ORDER);
  }
  add(t, n) {
    return We(t + n, this.ORDER);
  }
  sub(t, n) {
    return We(t - n, this.ORDER);
  }
  mul(t, n) {
    return We(t * n, this.ORDER);
  }
  pow(t, n) {
    return ud(this, t, n);
  }
  div(t, n) {
    return We(t * ns(n, this.ORDER), this.ORDER);
  }
  // Same as above, but doesn't normalize
  sqrN(t) {
    return t * t;
  }
  addN(t, n) {
    return t + n;
  }
  subN(t, n) {
    return t - n;
  }
  mulN(t, n) {
    return t * n;
  }
  inv(t) {
    return ns(t, this.ORDER);
  }
  sqrt(t) {
    return this._sqrt || (this._sqrt = cd(this.ORDER)), this._sqrt(this, t);
  }
  toBytes(t) {
    return this.isLE ? Cl(t, this.BYTES) : Yo(t, this.BYTES);
  }
  fromBytes(t, n = !1) {
    fe(t);
    const { _lengths: r, BYTES: o, isLE: i, ORDER: s, _mod: c } = this;
    if (r) {
      if (!r.includes(t.length) || t.length > o)
        throw new Error("Field.fromBytes: expected " + r + " bytes, got " + t.length);
      const h = new Uint8Array(o);
      h.set(t, i ? 0 : h.length - t.length), t = h;
    }
    if (t.length !== o)
      throw new Error("Field.fromBytes: expected " + o + " bytes, got " + t.length);
    let a = i ? vl(t) : Ln(t);
    if (c && (a = We(a, s)), !n && !this.isValid(a))
      throw new Error("invalid field element: outside of range 0..ORDER");
    return a;
  }
  // TODO: we don't need it here, move out to separate fn
  invertBatch(t) {
    return Tl(this, t);
  }
  // We can't move this out because Fp6, Fp12 implement it
  // and it's unclear what to return in there.
  cmov(t, n, r) {
    return r ? n : t;
  }
}
function gr(e, t = {}) {
  return new fd(e, t);
}
function Ml(e) {
  if (typeof e != "bigint")
    throw new Error("field order must be bigint");
  const t = e.toString(2).length;
  return Math.ceil(t / 8);
}
function Bl(e) {
  const t = Ml(e);
  return t + Math.ceil(t / 2);
}
function Rl(e, t, n = !1) {
  fe(e);
  const r = e.length, o = Ml(t), i = Bl(t);
  if (r < 16 || r < i || r > 1024)
    throw new Error("expected " + i + "-1024 bytes of input, got " + r);
  const s = n ? vl(e) : Ln(e), c = We(s, t - Te) + Te;
  return n ? Cl(c, o) : Yo(c, o);
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const Kt = /* @__PURE__ */ BigInt(0), Tt = /* @__PURE__ */ BigInt(1);
function tr(e, t) {
  const n = t.negate();
  return e ? n : t;
}
function os(e, t) {
  const n = Tl(e.Fp, t.map((r) => r.Z));
  return t.map((r, o) => e.fromAffine(r.toAffine(n[o])));
}
function Nl(e, t) {
  if (!Number.isSafeInteger(e) || e <= 0 || e > t)
    throw new Error("invalid window size, expected [1.." + t + "], got W=" + e);
}
function Nr(e, t) {
  Nl(e, t);
  const n = Math.ceil(t / e) + 1, r = 2 ** (e - 1), o = 2 ** e, i = Xo(e), s = BigInt(e);
  return { windows: n, windowSize: r, mask: i, maxNumber: o, shiftBy: s };
}
function is(e, t, n) {
  const { windowSize: r, mask: o, maxNumber: i, shiftBy: s } = n;
  let c = Number(e & o), a = e >> s;
  c > r && (c -= i, a += Tt);
  const h = t * r, w = h + Math.abs(c) - 1, g = c === 0, v = c < 0, b = t % 2 !== 0;
  return { nextN: a, offset: w, isZero: g, isNeg: v, isNegF: b, offsetF: h };
}
const $r = /* @__PURE__ */ new WeakMap(), $l = /* @__PURE__ */ new WeakMap();
function Ir(e) {
  return $l.get(e) || 1;
}
function ss(e) {
  if (e !== Kt)
    throw new Error("invalid wNAF");
}
class pd {
  BASE;
  ZERO;
  Fn;
  bits;
  // Parametrized with a given Point class (not individual point)
  constructor(t, n) {
    this.BASE = t.BASE, this.ZERO = t.ZERO, this.Fn = t.Fn, this.bits = n;
  }
  // non-const time multiplication ladder
  _unsafeLadder(t, n, r = this.ZERO) {
    let o = t;
    for (; n > Kt; )
      n & Tt && (r = r.add(o)), o = o.double(), n >>= Tt;
    return r;
  }
  /**
   * Creates a wNAF precomputation window. Used for caching.
   * Default window size is set by `utils.precompute()` and is equal to 8.
   * Number of precomputed points depends on the curve size:
   * 2^(𝑊−1) * (Math.ceil(𝑛 / 𝑊) + 1), where:
   * - 𝑊 is the window size
   * - 𝑛 is the bitlength of the curve order.
   * For a 256-bit curve and window size 8, the number of precomputed points is 128 * 33 = 4224.
   * @param point Point instance
   * @param W window size
   * @returns precomputed point tables flattened to a single array
   */
  precomputeWindow(t, n) {
    const { windows: r, windowSize: o } = Nr(n, this.bits), i = [];
    let s = t, c = s;
    for (let a = 0; a < r; a++) {
      c = s, i.push(c);
      for (let h = 1; h < o; h++)
        c = c.add(s), i.push(c);
      s = c.double();
    }
    return i;
  }
  /**
   * Implements ec multiplication using precomputed tables and w-ary non-adjacent form.
   * More compact implementation:
   * https://github.com/paulmillr/noble-secp256k1/blob/47cb1669b6e506ad66b35fe7d76132ae97465da2/index.ts#L502-L541
   * @returns real and fake (for const-time) points
   */
  wNAF(t, n, r) {
    if (!this.Fn.isValid(r))
      throw new Error("invalid scalar");
    let o = this.ZERO, i = this.BASE;
    const s = Nr(t, this.bits);
    for (let c = 0; c < s.windows; c++) {
      const { nextN: a, offset: h, isZero: w, isNeg: g, isNegF: v, offsetF: b } = is(r, c, s);
      r = a, w ? i = i.add(tr(v, n[b])) : o = o.add(tr(g, n[h]));
    }
    return ss(r), { p: o, f: i };
  }
  /**
   * Implements ec unsafe (non const-time) multiplication using precomputed tables and w-ary non-adjacent form.
   * @param acc accumulator point to add result of multiplication
   * @returns point
   */
  wNAFUnsafe(t, n, r, o = this.ZERO) {
    const i = Nr(t, this.bits);
    for (let s = 0; s < i.windows && r !== Kt; s++) {
      const { nextN: c, offset: a, isZero: h, isNeg: w } = is(r, s, i);
      if (r = c, !h) {
        const g = n[a];
        o = o.add(w ? g.negate() : g);
      }
    }
    return ss(r), o;
  }
  getPrecomputes(t, n, r) {
    let o = $r.get(n);
    return o || (o = this.precomputeWindow(n, t), t !== 1 && (typeof r == "function" && (o = r(o)), $r.set(n, o))), o;
  }
  cached(t, n, r) {
    const o = Ir(t);
    return this.wNAF(o, this.getPrecomputes(o, t, r), n);
  }
  unsafe(t, n, r, o) {
    const i = Ir(t);
    return i === 1 ? this._unsafeLadder(t, n, o) : this.wNAFUnsafe(i, this.getPrecomputes(i, t, r), n, o);
  }
  // We calculate precomputes for elliptic curve point multiplication
  // using windowed method. This specifies window size and
  // stores precomputed values. Usually only base point would be precomputed.
  createCache(t, n) {
    Nl(n, this.bits), $l.set(t, n), $r.delete(t);
  }
  hasCache(t) {
    return Ir(t) !== 1;
  }
}
function gd(e, t, n, r) {
  let o = t, i = e.ZERO, s = e.ZERO;
  for (; n > Kt || r > Kt; )
    n & Tt && (i = i.add(o)), r & Tt && (s = s.add(o)), o = o.double(), n >>= Tt, r >>= Tt;
  return { p1: i, p2: s };
}
function as(e, t, n) {
  if (t) {
    if (t.ORDER !== e)
      throw new Error("Field.ORDER must match order: Fp == p, Fn == n");
    return dd(t), t;
  } else
    return gr(e, { isLE: n });
}
function wd(e, t, n = {}, r) {
  if (r === void 0 && (r = e === "edwards"), !t || typeof t != "object")
    throw new Error(`expected valid ${e} CURVE object`);
  for (const a of ["p", "n", "h"]) {
    const h = t[a];
    if (!(typeof h == "bigint" && h > Kt))
      throw new Error(`CURVE.${a} must be positive bigint`);
  }
  const o = as(t.p, n.Fp, r), i = as(t.n, n.Fn, r), c = ["Gx", "Gy", "a", "b"];
  for (const a of c)
    if (!o.isValid(t[a]))
      throw new Error(`CURVE.${a} must be valid field element of CURVE.Fp`);
  return t = Object.freeze(Object.assign({}, t)), { CURVE: t, Fp: o, Fn: i };
}
function Il(e, t) {
  return function(r) {
    const o = e(r);
    return { secretKey: o, publicKey: t(o) };
  };
}
class Ul {
  oHash;
  iHash;
  blockLen;
  outputLen;
  finished = !1;
  destroyed = !1;
  constructor(t, n) {
    if (pr(t), fe(n, void 0, "key"), this.iHash = t.create(), typeof this.iHash.update != "function")
      throw new Error("Expected instance of class which extends utils.Hash");
    this.blockLen = this.iHash.blockLen, this.outputLen = this.iHash.outputLen;
    const r = this.blockLen, o = new Uint8Array(r);
    o.set(n.length > r ? t.create().update(n).digest() : n);
    for (let i = 0; i < o.length; i++)
      o[i] ^= 54;
    this.iHash.update(o), this.oHash = t.create();
    for (let i = 0; i < o.length; i++)
      o[i] ^= 106;
    this.oHash.update(o), mn(o);
  }
  update(t) {
    return Xn(this), this.iHash.update(t), this;
  }
  digestInto(t) {
    Xn(this), fe(t, this.outputLen, "output"), this.finished = !0, this.iHash.digestInto(t), this.oHash.update(t), this.oHash.digestInto(t), this.destroy();
  }
  digest() {
    const t = new Uint8Array(this.oHash.outputLen);
    return this.digestInto(t), t;
  }
  _cloneInto(t) {
    t ||= Object.create(Object.getPrototypeOf(this), {});
    const { oHash: n, iHash: r, finished: o, destroyed: i, blockLen: s, outputLen: c } = this;
    return t = t, t.finished = o, t.destroyed = i, t.blockLen = s, t.outputLen = c, t.oHash = n._cloneInto(t.oHash), t.iHash = r._cloneInto(t.iHash), t;
  }
  clone() {
    return this._cloneInto();
  }
  destroy() {
    this.destroyed = !0, this.oHash.destroy(), this.iHash.destroy();
  }
}
const Tn = (e, t, n) => new Ul(e, t).update(n).digest();
Tn.create = (e, t) => new Ul(e, t);
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const cs = (e, t) => (e + (e >= 0 ? t : -t) / Ol) / t;
function yd(e, t, n) {
  const [[r, o], [i, s]] = t, c = cs(s * e, n), a = cs(-o * e, n);
  let h = e - c * r - a * i, w = -c * o - a * s;
  const g = h < tt, v = w < tt;
  g && (h = -h), v && (w = -w);
  const b = Xo(Math.ceil(nd(n) / 2)) + Gt;
  if (h < tt || h >= b || w < tt || w >= b)
    throw new Error("splitScalar (endomorphism): failed, k=" + e);
  return { k1neg: g, k1: h, k2neg: v, k2: w };
}
function xo(e) {
  if (!["compact", "recovered", "der"].includes(e))
    throw new Error('Signature format must be "compact", "recovered", or "der"');
  return e;
}
function Ur(e, t) {
  const n = {};
  for (let r of Object.keys(t))
    n[r] = e[r] === void 0 ? t[r] : e[r];
  return er(n.lowS, "lowS"), er(n.prehash, "prehash"), n.format !== void 0 && xo(n.format), n;
}
class bd extends Error {
  constructor(t = "") {
    super(t);
  }
}
const ut = {
  // asn.1 DER encoding utils
  Err: bd,
  // Basic building block is TLV (Tag-Length-Value)
  _tlv: {
    encode: (e, t) => {
      const { Err: n } = ut;
      if (e < 0 || e > 256)
        throw new n("tlv.encode: wrong tag");
      if (t.length & 1)
        throw new n("tlv.encode: unpadded data");
      const r = t.length / 2, o = Rn(r);
      if (o.length / 2 & 128)
        throw new n("tlv.encode: long form length too big");
      const i = r > 127 ? Rn(o.length / 2 | 128) : "";
      return Rn(e) + i + o + t;
    },
    // v - value, l - left bytes (unparsed)
    decode(e, t) {
      const { Err: n } = ut;
      let r = 0;
      if (e < 0 || e > 256)
        throw new n("tlv.encode: wrong tag");
      if (t.length < 2 || t[r++] !== e)
        throw new n("tlv.decode: wrong tlv");
      const o = t[r++], i = !!(o & 128);
      let s = 0;
      if (!i)
        s = o;
      else {
        const a = o & 127;
        if (!a)
          throw new n("tlv.decode(long): indefinite length not supported");
        if (a > 4)
          throw new n("tlv.decode(long): byte length is too big");
        const h = t.subarray(r, r + a);
        if (h.length !== a)
          throw new n("tlv.decode: length bytes not complete");
        if (h[0] === 0)
          throw new n("tlv.decode(long): zero leftmost byte");
        for (const w of h)
          s = s << 8 | w;
        if (r += a, s < 128)
          throw new n("tlv.decode(long): not minimal encoding");
      }
      const c = t.subarray(r, r + s);
      if (c.length !== s)
        throw new n("tlv.decode: wrong value length");
      return { v: c, l: t.subarray(r + s) };
    }
  },
  // https://crypto.stackexchange.com/a/57734 Leftmost bit of first byte is 'negative' flag,
  // since we always use positive integers here. It must always be empty:
  // - add zero byte if exists
  // - if next byte doesn't have a flag, leading zero is not allowed (minimal encoding)
  _int: {
    encode(e) {
      const { Err: t } = ut;
      if (e < tt)
        throw new t("integer: negative integers are not allowed");
      let n = Rn(e);
      if (Number.parseInt(n[0], 16) & 8 && (n = "00" + n), n.length & 1)
        throw new t("unexpected DER parsing assertion: unpadded hex");
      return n;
    },
    decode(e) {
      const { Err: t } = ut;
      if (e[0] & 128)
        throw new t("invalid signature integer: negative");
      if (e[0] === 0 && !(e[1] & 128))
        throw new t("invalid signature integer: unnecessary leading zero");
      return Ln(e);
    }
  },
  toSig(e) {
    const { Err: t, _int: n, _tlv: r } = ut, o = fe(e, void 0, "signature"), { v: i, l: s } = r.decode(48, o);
    if (s.length)
      throw new t("invalid signature: left bytes after parsing");
    const { v: c, l: a } = r.decode(2, i), { v: h, l: w } = r.decode(2, a);
    if (w.length)
      throw new t("invalid signature: left bytes after parsing");
    return { r: n.decode(c), s: n.decode(h) };
  },
  hexFromSig(e) {
    const { _tlv: t, _int: n } = ut, r = t.encode(2, n.encode(e.r)), o = t.encode(2, n.encode(e.s)), i = r + o;
    return t.encode(48, i);
  }
}, tt = BigInt(0), Gt = BigInt(1), Ol = BigInt(2), Nn = BigInt(3), md = BigInt(4);
function vd(e, t = {}) {
  const n = wd("weierstrass", e, t), { Fp: r, Fn: o } = n;
  let i = n.CURVE;
  const { h: s, n: c } = i;
  ei(t, {}, {
    allowInfinityPoint: "boolean",
    clearCofactor: "function",
    isTorsionFree: "function",
    fromBytes: "function",
    toBytes: "function",
    endo: "object"
  });
  const { endo: a } = t;
  if (a && (!r.is0(i.a) || typeof a.beta != "bigint" || !Array.isArray(a.basises)))
    throw new Error('invalid endo: expected "beta": bigint and "basises": array');
  const h = Hl(r, o);
  function w() {
    if (!r.isOdd)
      throw new Error("compression is not supported: Field does not have .isOdd()");
  }
  function g(l, u, p) {
    const { x: f, y } = u.toAffine(), x = r.toBytes(f);
    if (er(p, "isCompressed"), p) {
      w();
      const O = !r.isOdd(y);
      return Be(Pl(O), x);
    } else
      return Be(Uint8Array.of(4), x, r.toBytes(y));
  }
  function v(l) {
    fe(l, void 0, "Point");
    const { publicKey: u, publicKeyUncompressed: p } = h, f = l.length, y = l[0], x = l.subarray(1);
    if (f === u && (y === 2 || y === 3)) {
      const O = r.fromBytes(x);
      if (!r.isValid(O))
        throw new Error("bad point: is not on curve, wrong x");
      const R = L(O);
      let P;
      try {
        P = r.sqrt(R);
      } catch (J) {
        const Y = J instanceof Error ? ": " + J.message : "";
        throw new Error("bad point: is not on curve, sqrt error" + Y);
      }
      w();
      const S = r.isOdd(P);
      return (y & 1) === 1 !== S && (P = r.neg(P)), { x: O, y: P };
    } else if (f === p && y === 4) {
      const O = r.BYTES, R = r.fromBytes(x.subarray(0, O)), P = r.fromBytes(x.subarray(O, O * 2));
      if (!M(R, P))
        throw new Error("bad point: is not on curve");
      return { x: R, y: P };
    } else
      throw new Error(`bad point: got length ${f}, expected compressed=${u} or uncompressed=${p}`);
  }
  const b = t.toBytes || g, C = t.fromBytes || v;
  function L(l) {
    const u = r.sqr(l), p = r.mul(u, l);
    return r.add(r.add(p, r.mul(l, i.a)), i.b);
  }
  function M(l, u) {
    const p = r.sqr(u), f = L(l);
    return r.eql(p, f);
  }
  if (!M(i.Gx, i.Gy))
    throw new Error("bad curve params: generator point");
  const I = r.mul(r.pow(i.a, Nn), md), U = r.mul(r.sqr(i.b), BigInt(27));
  if (r.is0(r.add(I, U)))
    throw new Error("bad curve params: a or b");
  function q(l, u, p = !1) {
    if (!r.isValid(u) || p && r.is0(u))
      throw new Error(`bad point coordinate ${l}`);
    return u;
  }
  function Q(l) {
    if (!(l instanceof m))
      throw new Error("Weierstrass Point expected");
  }
  function A(l) {
    if (!a || !a.basises)
      throw new Error("no endo");
    return yd(l, a.basises, o.ORDER);
  }
  const _ = ts((l, u) => {
    const { X: p, Y: f, Z: y } = l;
    if (r.eql(y, r.ONE))
      return { x: p, y: f };
    const x = l.is0();
    u == null && (u = x ? r.ONE : r.inv(y));
    const O = r.mul(p, u), R = r.mul(f, u), P = r.mul(y, u);
    if (x)
      return { x: r.ZERO, y: r.ZERO };
    if (!r.eql(P, r.ONE))
      throw new Error("invZ was invalid");
    return { x: O, y: R };
  }), E = ts((l) => {
    if (l.is0()) {
      if (t.allowInfinityPoint && !r.is0(l.Y))
        return;
      throw new Error("bad point: ZERO");
    }
    const { x: u, y: p } = l.toAffine();
    if (!r.isValid(u) || !r.isValid(p))
      throw new Error("bad point: x or y not field elements");
    if (!M(u, p))
      throw new Error("bad point: equation left != right");
    if (!l.isTorsionFree())
      throw new Error("bad point: not in prime-order subgroup");
    return !0;
  });
  function T(l, u, p, f, y) {
    return p = new m(r.mul(p.X, l), p.Y, p.Z), u = tr(f, u), p = tr(y, p), u.add(p);
  }
  class m {
    // base / generator point
    static BASE = new m(i.Gx, i.Gy, r.ONE);
    // zero / infinity / identity point
    static ZERO = new m(r.ZERO, r.ONE, r.ZERO);
    // 0, 1, 0
    // math field
    static Fp = r;
    // scalar field
    static Fn = o;
    X;
    Y;
    Z;
    /** Does NOT validate if the point is valid. Use `.assertValidity()`. */
    constructor(u, p, f) {
      this.X = q("x", u), this.Y = q("y", p, !0), this.Z = q("z", f), Object.freeze(this);
    }
    static CURVE() {
      return i;
    }
    /** Does NOT validate if the point is valid. Use `.assertValidity()`. */
    static fromAffine(u) {
      const { x: p, y: f } = u || {};
      if (!u || !r.isValid(p) || !r.isValid(f))
        throw new Error("invalid affine point");
      if (u instanceof m)
        throw new Error("projective point not allowed");
      return r.is0(p) && r.is0(f) ? m.ZERO : new m(p, f, r.ONE);
    }
    static fromBytes(u) {
      const p = m.fromAffine(C(fe(u, void 0, "point")));
      return p.assertValidity(), p;
    }
    static fromHex(u) {
      return m.fromBytes(ue(u));
    }
    get x() {
      return this.toAffine().x;
    }
    get y() {
      return this.toAffine().y;
    }
    /**
     *
     * @param windowSize
     * @param isLazy true will defer table computation until the first multiplication
     * @returns
     */
    precompute(u = 8, p = !0) {
      return d.createCache(this, u), p || this.multiply(Nn), this;
    }
    // TODO: return `this`
    /** A point on curve is valid if it conforms to equation. */
    assertValidity() {
      E(this);
    }
    hasEvenY() {
      const { y: u } = this.toAffine();
      if (!r.isOdd)
        throw new Error("Field doesn't support isOdd");
      return !r.isOdd(u);
    }
    /** Compare one point to another. */
    equals(u) {
      Q(u);
      const { X: p, Y: f, Z: y } = this, { X: x, Y: O, Z: R } = u, P = r.eql(r.mul(p, R), r.mul(x, y)), S = r.eql(r.mul(f, R), r.mul(O, y));
      return P && S;
    }
    /** Flips point to one corresponding to (x, -y) in Affine coordinates. */
    negate() {
      return new m(this.X, r.neg(this.Y), this.Z);
    }
    // Renes-Costello-Batina exception-free doubling formula.
    // There is 30% faster Jacobian formula, but it is not complete.
    // https://eprint.iacr.org/2015/1060, algorithm 3
    // Cost: 8M + 3S + 3*a + 2*b3 + 15add.
    double() {
      const { a: u, b: p } = i, f = r.mul(p, Nn), { X: y, Y: x, Z: O } = this;
      let R = r.ZERO, P = r.ZERO, S = r.ZERO, D = r.mul(y, y), J = r.mul(x, x), Y = r.mul(O, O), G = r.mul(y, x);
      return G = r.add(G, G), S = r.mul(y, O), S = r.add(S, S), R = r.mul(u, S), P = r.mul(f, Y), P = r.add(R, P), R = r.sub(J, P), P = r.add(J, P), P = r.mul(R, P), R = r.mul(G, R), S = r.mul(f, S), Y = r.mul(u, Y), G = r.sub(D, Y), G = r.mul(u, G), G = r.add(G, S), S = r.add(D, D), D = r.add(S, D), D = r.add(D, Y), D = r.mul(D, G), P = r.add(P, D), Y = r.mul(x, O), Y = r.add(Y, Y), D = r.mul(Y, G), R = r.sub(R, D), S = r.mul(Y, J), S = r.add(S, S), S = r.add(S, S), new m(R, P, S);
    }
    // Renes-Costello-Batina exception-free addition formula.
    // There is 30% faster Jacobian formula, but it is not complete.
    // https://eprint.iacr.org/2015/1060, algorithm 1
    // Cost: 12M + 0S + 3*a + 3*b3 + 23add.
    add(u) {
      Q(u);
      const { X: p, Y: f, Z: y } = this, { X: x, Y: O, Z: R } = u;
      let P = r.ZERO, S = r.ZERO, D = r.ZERO;
      const J = i.a, Y = r.mul(i.b, Nn);
      let G = r.mul(p, x), X = r.mul(f, O), ie = r.mul(y, R), N = r.add(p, f), $ = r.add(x, O);
      N = r.mul(N, $), $ = r.add(G, X), N = r.sub(N, $), $ = r.add(p, y);
      let B = r.add(x, R);
      return $ = r.mul($, B), B = r.add(G, ie), $ = r.sub($, B), B = r.add(f, y), P = r.add(O, R), B = r.mul(B, P), P = r.add(X, ie), B = r.sub(B, P), D = r.mul(J, $), P = r.mul(Y, ie), D = r.add(P, D), P = r.sub(X, D), D = r.add(X, D), S = r.mul(P, D), X = r.add(G, G), X = r.add(X, G), ie = r.mul(J, ie), $ = r.mul(Y, $), X = r.add(X, ie), ie = r.sub(G, ie), ie = r.mul(J, ie), $ = r.add($, ie), G = r.mul(X, $), S = r.add(S, G), G = r.mul(B, $), P = r.mul(N, P), P = r.sub(P, G), G = r.mul(N, X), D = r.mul(B, D), D = r.add(D, G), new m(P, S, D);
    }
    subtract(u) {
      return this.add(u.negate());
    }
    is0() {
      return this.equals(m.ZERO);
    }
    /**
     * Constant time multiplication.
     * Uses wNAF method. Windowed method may be 10% faster,
     * but takes 2x longer to generate and consumes 2x memory.
     * Uses precomputes when available.
     * Uses endomorphism for Koblitz curves.
     * @param scalar by which the point would be multiplied
     * @returns New point
     */
    multiply(u) {
      const { endo: p } = t;
      if (!o.isValidNot0(u))
        throw new Error("invalid scalar: out of range");
      let f, y;
      const x = (O) => d.cached(this, O, (R) => os(m, R));
      if (p) {
        const { k1neg: O, k1: R, k2neg: P, k2: S } = A(u), { p: D, f: J } = x(R), { p: Y, f: G } = x(S);
        y = J.add(G), f = T(p.beta, D, Y, O, P);
      } else {
        const { p: O, f: R } = x(u);
        f = O, y = R;
      }
      return os(m, [f, y])[0];
    }
    /**
     * Non-constant-time multiplication. Uses double-and-add algorithm.
     * It's faster, but should only be used when you don't care about
     * an exposed secret key e.g. sig verification, which works over *public* keys.
     */
    multiplyUnsafe(u) {
      const { endo: p } = t, f = this;
      if (!o.isValid(u))
        throw new Error("invalid scalar: out of range");
      if (u === tt || f.is0())
        return m.ZERO;
      if (u === Gt)
        return f;
      if (d.hasCache(this))
        return this.multiply(u);
      if (p) {
        const { k1neg: y, k1: x, k2neg: O, k2: R } = A(u), { p1: P, p2: S } = gd(m, f, x, R);
        return T(p.beta, P, S, y, O);
      } else
        return d.unsafe(f, u);
    }
    /**
     * Converts Projective point to affine (x, y) coordinates.
     * @param invertedZ Z^-1 (inverted zero) - optional, precomputation is useful for invertBatch
     */
    toAffine(u) {
      return _(this, u);
    }
    /**
     * Checks whether Point is free of torsion elements (is in prime subgroup).
     * Always torsion-free for cofactor=1 curves.
     */
    isTorsionFree() {
      const { isTorsionFree: u } = t;
      return s === Gt ? !0 : u ? u(m, this) : d.unsafe(this, c).is0();
    }
    clearCofactor() {
      const { clearCofactor: u } = t;
      return s === Gt ? this : u ? u(m, this) : this.multiplyUnsafe(s);
    }
    isSmallOrder() {
      return this.multiplyUnsafe(s).is0();
    }
    toBytes(u = !0) {
      return er(u, "isCompressed"), this.assertValidity(), b(m, this, u);
    }
    toHex(u = !0) {
      return pe(this.toBytes(u));
    }
    toString() {
      return `<Point ${this.is0() ? "ZERO" : this.toHex()}>`;
    }
  }
  const k = o.BITS, d = new pd(m, t.endo ? Math.ceil(k / 2) : k);
  return m.BASE.precompute(8), m;
}
function Pl(e) {
  return Uint8Array.of(e ? 2 : 3);
}
function Hl(e, t) {
  return {
    secretKey: t.BYTES,
    publicKey: 1 + e.BYTES,
    publicKeyUncompressed: 1 + 2 * e.BYTES,
    publicKeyHasPrefix: !0,
    signature: 2 * t.BYTES
  };
}
function Cd(e, t = {}) {
  const { Fn: n } = e, r = t.randomBytes || nn, o = Object.assign(Hl(e.Fp, n), { seed: Bl(n.ORDER) });
  function i(b) {
    try {
      const C = n.fromBytes(b);
      return n.isValidNot0(C);
    } catch {
      return !1;
    }
  }
  function s(b, C) {
    const { publicKey: L, publicKeyUncompressed: M } = o;
    try {
      const I = b.length;
      return C === !0 && I !== L || C === !1 && I !== M ? !1 : !!e.fromBytes(b);
    } catch {
      return !1;
    }
  }
  function c(b = r(o.seed)) {
    return Rl(fe(b, o.seed, "seed"), n.ORDER);
  }
  function a(b, C = !0) {
    return e.BASE.multiply(n.fromBytes(b)).toBytes(C);
  }
  function h(b) {
    const { secretKey: C, publicKey: L, publicKeyUncompressed: M } = o;
    if (!Qo(b) || "_lengths" in n && n._lengths || C === L)
      return;
    const I = fe(b, void 0, "key").length;
    return I === L || I === M;
  }
  function w(b, C, L = !0) {
    if (h(b) === !0)
      throw new Error("first arg must be private key");
    if (h(C) === !1)
      throw new Error("second arg must be public key");
    const M = n.fromBytes(b);
    return e.fromBytes(C).multiply(M).toBytes(L);
  }
  const g = {
    isValidSecretKey: i,
    isValidPublicKey: s,
    randomSecretKey: c
  }, v = Il(c, a);
  return Object.freeze({ getPublicKey: a, getSharedSecret: w, keygen: v, Point: e, utils: g, lengths: o });
}
function xd(e, t, n = {}) {
  pr(t), ei(n, {}, {
    hmac: "function",
    lowS: "boolean",
    randomBytes: "function",
    bits2int: "function",
    bits2int_modN: "function"
  }), n = Object.assign({}, n);
  const r = n.randomBytes || nn, o = n.hmac || ((p, f) => Tn(t, p, f)), { Fp: i, Fn: s } = e, { ORDER: c, BITS: a } = s, { keygen: h, getPublicKey: w, getSharedSecret: g, utils: v, lengths: b } = Cd(e, n), C = {
    prehash: !0,
    lowS: typeof n.lowS == "boolean" ? n.lowS : !0,
    format: "compact",
    extraEntropy: !1
  }, L = c * Ol < i.ORDER;
  function M(p) {
    const f = c >> Gt;
    return p > f;
  }
  function I(p, f) {
    if (!s.isValidNot0(f))
      throw new Error(`invalid signature ${p}: out of range 1..Point.Fn.ORDER`);
    return f;
  }
  function U() {
    if (L)
      throw new Error('"recovered" sig type is not supported for cofactor >2 curves');
  }
  function q(p, f) {
    xo(f);
    const y = b.signature, x = f === "compact" ? y : f === "recovered" ? y + 1 : void 0;
    return fe(p, x);
  }
  class Q {
    r;
    s;
    recovery;
    constructor(f, y, x) {
      if (this.r = I("r", f), this.s = I("s", y), x != null) {
        if (U(), ![0, 1, 2, 3].includes(x))
          throw new Error("invalid recovery id");
        this.recovery = x;
      }
      Object.freeze(this);
    }
    static fromBytes(f, y = C.format) {
      q(f, y);
      let x;
      if (y === "der") {
        const { r: S, s: D } = ut.toSig(fe(f));
        return new Q(S, D);
      }
      y === "recovered" && (x = f[0], y = "compact", f = f.subarray(1));
      const O = b.signature / 2, R = f.subarray(0, O), P = f.subarray(O, O * 2);
      return new Q(s.fromBytes(R), s.fromBytes(P), x);
    }
    static fromHex(f, y) {
      return this.fromBytes(ue(f), y);
    }
    assertRecovery() {
      const { recovery: f } = this;
      if (f == null)
        throw new Error("invalid recovery id: must be present");
      return f;
    }
    addRecoveryBit(f) {
      return new Q(this.r, this.s, f);
    }
    recoverPublicKey(f) {
      const { r: y, s: x } = this, O = this.assertRecovery(), R = O === 2 || O === 3 ? y + c : y;
      if (!i.isValid(R))
        throw new Error("invalid recovery id: sig.r+curve.n != R.x");
      const P = i.toBytes(R), S = e.fromBytes(Be(Pl((O & 1) === 0), P)), D = s.inv(R), J = _(fe(f, void 0, "msgHash")), Y = s.create(-J * D), G = s.create(x * D), X = e.BASE.multiplyUnsafe(Y).add(S.multiplyUnsafe(G));
      if (X.is0())
        throw new Error("invalid recovery: point at infinify");
      return X.assertValidity(), X;
    }
    // Signatures should be low-s, to prevent malleability.
    hasHighS() {
      return M(this.s);
    }
    toBytes(f = C.format) {
      if (xo(f), f === "der")
        return ue(ut.hexFromSig(this));
      const { r: y, s: x } = this, O = s.toBytes(y), R = s.toBytes(x);
      return f === "recovered" ? (U(), Be(Uint8Array.of(this.assertRecovery()), O, R)) : Be(O, R);
    }
    toHex(f) {
      return pe(this.toBytes(f));
    }
  }
  const A = n.bits2int || function(f) {
    if (f.length > 8192)
      throw new Error("input is too large");
    const y = Ln(f), x = f.length * 8 - a;
    return x > 0 ? y >> BigInt(x) : y;
  }, _ = n.bits2int_modN || function(f) {
    return s.create(A(f));
  }, E = Xo(a);
  function T(p) {
    return td("num < 2^" + a, p, tt, E), s.toBytes(p);
  }
  function m(p, f) {
    return fe(p, void 0, "message"), f ? fe(t(p), void 0, "prehashed message") : p;
  }
  function k(p, f, y) {
    const { lowS: x, prehash: O, extraEntropy: R } = Ur(y, C);
    p = m(p, O);
    const P = _(p), S = s.fromBytes(f);
    if (!s.isValidNot0(S))
      throw new Error("invalid private key");
    const D = [T(S), T(P)];
    if (R != null && R !== !1) {
      const X = R === !0 ? r(b.secretKey) : R;
      D.push(fe(X, void 0, "extraEntropy"));
    }
    const J = Be(...D), Y = P;
    function G(X) {
      const ie = A(X);
      if (!s.isValidNot0(ie))
        return;
      const N = s.inv(ie), $ = e.BASE.multiply(ie).toAffine(), B = s.create($.x);
      if (B === tt)
        return;
      const H = s.create(N * s.create(Y + B * S));
      if (H === tt)
        return;
      let Z = ($.x === B ? 0 : 2) | Number($.y & Gt), K = H;
      return x && M(H) && (K = s.neg(H), Z ^= 1), new Q(B, K, L ? void 0 : Z);
    }
    return { seed: J, k2sig: G };
  }
  function d(p, f, y = {}) {
    const { seed: x, k2sig: O } = k(p, f, y);
    return rd(t.outputLen, s.BYTES, o)(x, O).toBytes(y.format);
  }
  function l(p, f, y, x = {}) {
    const { lowS: O, prehash: R, format: P } = Ur(x, C);
    if (y = fe(y, void 0, "publicKey"), f = m(f, R), !Qo(p)) {
      const S = p instanceof Q ? ", use sig.toBytes()" : "";
      throw new Error("verify expects Uint8Array signature" + S);
    }
    q(p, P);
    try {
      const S = Q.fromBytes(p, P), D = e.fromBytes(y);
      if (O && S.hasHighS())
        return !1;
      const { r: J, s: Y } = S, G = _(f), X = s.inv(Y), ie = s.create(G * X), N = s.create(J * X), $ = e.BASE.multiplyUnsafe(ie).add(D.multiplyUnsafe(N));
      return $.is0() ? !1 : s.create($.x) === J;
    } catch {
      return !1;
    }
  }
  function u(p, f, y = {}) {
    const { prehash: x } = Ur(y, C);
    return f = m(f, x), Q.fromBytes(p, "recovered").recoverPublicKey(f).toBytes();
  }
  return Object.freeze({
    keygen: h,
    getPublicKey: w,
    getSharedSecret: g,
    utils: v,
    lengths: b,
    Point: e,
    sign: d,
    verify: l,
    recoverPublicKey: u,
    Signature: Q,
    hash: t
  });
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const wr = {
  p: BigInt("0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f"),
  n: BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141"),
  h: BigInt(1),
  a: BigInt(0),
  b: BigInt(7),
  Gx: BigInt("0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"),
  Gy: BigInt("0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8")
}, Ed = {
  beta: BigInt("0x7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee"),
  basises: [
    [BigInt("0x3086d221a7d46bcde86c90e49284eb15"), -BigInt("0xe4437ed6010e88286f547fa90abfe4c3")],
    [BigInt("0x114ca50f7a8e2f3f657c1108d9d44cfd8"), BigInt("0x3086d221a7d46bcde86c90e49284eb15")]
  ]
}, Ad = /* @__PURE__ */ BigInt(0), Eo = /* @__PURE__ */ BigInt(2);
function kd(e) {
  const t = wr.p, n = BigInt(3), r = BigInt(6), o = BigInt(11), i = BigInt(22), s = BigInt(23), c = BigInt(44), a = BigInt(88), h = e * e * e % t, w = h * h * e % t, g = Pe(w, n, t) * w % t, v = Pe(g, n, t) * w % t, b = Pe(v, Eo, t) * h % t, C = Pe(b, o, t) * b % t, L = Pe(C, i, t) * C % t, M = Pe(L, c, t) * L % t, I = Pe(M, a, t) * M % t, U = Pe(I, c, t) * L % t, q = Pe(U, n, t) * w % t, Q = Pe(q, s, t) * C % t, A = Pe(Q, r, t) * h % t, _ = Pe(A, Eo, t);
  if (!nr.eql(nr.sqr(_), e))
    throw new Error("Cannot find square root");
  return _;
}
const nr = gr(wr.p, { sqrt: kd }), Pt = /* @__PURE__ */ vd(wr, {
  Fp: nr,
  endo: Ed
}), ni = /* @__PURE__ */ xd(Pt, Ke), ls = {};
function rr(e, ...t) {
  let n = ls[e];
  if (n === void 0) {
    const r = Ke(X2(e));
    n = Be(r, r), ls[e] = n;
  }
  return Ke(Be(n, ...t));
}
const ri = (e) => e.toBytes(!0).slice(1), oi = (e) => e % Eo === Ad;
function Ao(e) {
  const { Fn: t, BASE: n } = Pt, r = t.fromBytes(e), o = n.multiply(r);
  return { scalar: oi(o.y) ? r : t.neg(r), bytes: ri(o) };
}
function Dl(e) {
  const t = nr;
  if (!t.isValidNot0(e))
    throw new Error("invalid x: Fail if x ≥ p");
  const n = t.create(e * e), r = t.create(n * e + BigInt(7));
  let o = t.sqrt(r);
  oi(o) || (o = t.neg(o));
  const i = Pt.fromAffine({ x: e, y: o });
  return i.assertValidity(), i;
}
const pn = Ln;
function Zl(...e) {
  return Pt.Fn.create(pn(rr("BIP0340/challenge", ...e)));
}
function ds(e) {
  return Ao(e).bytes;
}
function _d(e, t, n = nn(32)) {
  const { Fn: r } = Pt, o = fe(e, void 0, "message"), { bytes: i, scalar: s } = Ao(t), c = fe(n, 32, "auxRand"), a = r.toBytes(s ^ pn(rr("BIP0340/aux", c))), h = rr("BIP0340/nonce", a, i, o), { bytes: w, scalar: g } = Ao(h), v = Zl(w, i, o), b = new Uint8Array(64);
  if (b.set(w, 0), b.set(r.toBytes(r.create(g + v * s)), 32), !Wl(b, o, i))
    throw new Error("sign: Invalid signature produced");
  return b;
}
function Wl(e, t, n) {
  const { Fp: r, Fn: o, BASE: i } = Pt, s = fe(e, 64, "signature"), c = fe(t, void 0, "message"), a = fe(n, 32, "publicKey");
  try {
    const h = Dl(pn(a)), w = pn(s.subarray(0, 32));
    if (!r.isValidNot0(w))
      return !1;
    const g = pn(s.subarray(32, 64));
    if (!o.isValidNot0(g))
      return !1;
    const v = Zl(o.toBytes(w), ri(h), c), b = i.multiplyUnsafe(g).add(h.multiplyUnsafe(o.neg(v))), { x: C, y: L } = b.toAffine();
    return !(b.is0() || !oi(L) || C !== w);
  } catch {
    return !1;
  }
}
const rn = /* @__PURE__ */ (() => {
  const n = (r = nn(48)) => Rl(r, wr.n);
  return {
    keygen: Il(n, ds),
    getPublicKey: ds,
    sign: _d,
    verify: Wl,
    Point: Pt,
    utils: {
      randomSecretKey: n,
      taggedHash: rr,
      lift_x: Dl,
      pointToBytes: ri
    },
    lengths: {
      secretKey: 32,
      publicKey: 32,
      publicKeyHasPrefix: !1,
      signature: 64,
      seed: 48
    }
  };
})();
/*! scure-base - MIT License (c) 2022 Paul Miller (paulmillr.com) */
function ii(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array";
}
function Sd(e) {
  if (!ii(e))
    throw new Error("Uint8Array expected");
}
function Fl(e, t) {
  return Array.isArray(t) ? t.length === 0 ? !0 : e ? t.every((n) => typeof n == "string") : t.every((n) => Number.isSafeInteger(n)) : !1;
}
function Ld(e) {
  if (typeof e != "function")
    throw new Error("function expected");
  return !0;
}
function Nt(e, t) {
  if (typeof t != "string")
    throw new Error(`${e}: string expected`);
  return !0;
}
function si(e) {
  if (!Number.isSafeInteger(e))
    throw new Error(`invalid integer: ${e}`);
}
function ko(e) {
  if (!Array.isArray(e))
    throw new Error("array expected");
}
function or(e, t) {
  if (!Fl(!0, t))
    throw new Error(`${e}: array of strings expected`);
}
function Vl(e, t) {
  if (!Fl(!1, t))
    throw new Error(`${e}: array of numbers expected`);
}
// @__NO_SIDE_EFFECTS__
function Gl(...e) {
  const t = (i) => i, n = (i, s) => (c) => i(s(c)), r = e.map((i) => i.encode).reduceRight(n, t), o = e.map((i) => i.decode).reduce(n, t);
  return { encode: r, decode: o };
}
// @__NO_SIDE_EFFECTS__
function jl(e) {
  const t = typeof e == "string" ? e.split("") : e, n = t.length;
  or("alphabet", t);
  const r = new Map(t.map((o, i) => [o, i]));
  return {
    encode: (o) => (ko(o), o.map((i) => {
      if (!Number.isSafeInteger(i) || i < 0 || i >= n)
        throw new Error(`alphabet.encode: digit index outside alphabet "${i}". Allowed: ${e}`);
      return t[i];
    })),
    decode: (o) => (ko(o), o.map((i) => {
      Nt("alphabet.decode", i);
      const s = r.get(i);
      if (s === void 0)
        throw new Error(`Unknown letter: "${i}". Allowed: ${e}`);
      return s;
    }))
  };
}
// @__NO_SIDE_EFFECTS__
function zl(e = "") {
  return Nt("join", e), {
    encode: (t) => (or("join.decode", t), t.join(e)),
    decode: (t) => (Nt("join.decode", t), t.split(e))
  };
}
// @__NO_SIDE_EFFECTS__
function Td(e, t = "=") {
  return si(e), Nt("padding", t), {
    encode(n) {
      for (or("padding.encode", n); n.length * e % 8; )
        n.push(t);
      return n;
    },
    decode(n) {
      or("padding.decode", n);
      let r = n.length;
      if (r * e % 8)
        throw new Error("padding: invalid, string should have whole number of bytes");
      for (; r > 0 && n[r - 1] === t; r--)
        if ((r - 1) * e % 8 === 0)
          throw new Error("padding: invalid, string has too much padding");
      return n.slice(0, r);
    }
  };
}
const ql = (e, t) => t === 0 ? e : ql(t, e % t), ir = /* @__NO_SIDE_EFFECTS__ */ (e, t) => e + (t - ql(e, t)), zn = /* @__PURE__ */ (() => {
  let e = [];
  for (let t = 0; t < 40; t++)
    e.push(2 ** t);
  return e;
})();
function _o(e, t, n, r) {
  if (ko(e), t <= 0 || t > 32)
    throw new Error(`convertRadix2: wrong from=${t}`);
  if (n <= 0 || n > 32)
    throw new Error(`convertRadix2: wrong to=${n}`);
  if (/* @__PURE__ */ ir(t, n) > 32)
    throw new Error(`convertRadix2: carry overflow from=${t} to=${n} carryBits=${/* @__PURE__ */ ir(t, n)}`);
  let o = 0, i = 0;
  const s = zn[t], c = zn[n] - 1, a = [];
  for (const h of e) {
    if (si(h), h >= s)
      throw new Error(`convertRadix2: invalid data word=${h} from=${t}`);
    if (o = o << t | h, i + t > 32)
      throw new Error(`convertRadix2: carry overflow pos=${i} from=${t}`);
    for (i += t; i >= n; i -= n)
      a.push((o >> i - n & c) >>> 0);
    const w = zn[i];
    if (w === void 0)
      throw new Error("invalid carry");
    o &= w - 1;
  }
  if (o = o << n - i & c, !r && i >= t)
    throw new Error("Excess padding");
  if (!r && o > 0)
    throw new Error(`Non-zero padding: ${o}`);
  return r && i > 0 && a.push(o >>> 0), a;
}
// @__NO_SIDE_EFFECTS__
function Kl(e, t = !1) {
  if (si(e), e <= 0 || e > 32)
    throw new Error("radix2: bits should be in (0..32]");
  if (/* @__PURE__ */ ir(8, e) > 32 || /* @__PURE__ */ ir(e, 8) > 32)
    throw new Error("radix2: carry overflow");
  return {
    encode: (n) => {
      if (!ii(n))
        throw new Error("radix2.encode input should be Uint8Array");
      return _o(Array.from(n), 8, e, !t);
    },
    decode: (n) => (Vl("radix2.decode", n), Uint8Array.from(_o(n, e, 8, t)))
  };
}
function us(e) {
  return Ld(e), function(...t) {
    try {
      return e.apply(null, t);
    } catch {
    }
  };
}
const Md = typeof Uint8Array.from([]).toBase64 == "function" && typeof Uint8Array.fromBase64 == "function", Bd = (e, t) => {
  Nt("base64", e);
  const n = /^[A-Za-z0-9=+/]+$/, r = "base64";
  if (e.length > 0 && !n.test(e))
    throw new Error("invalid base64");
  return Uint8Array.fromBase64(e, { alphabet: r, lastChunkHandling: "strict" });
}, mt = Md ? {
  encode(e) {
    return Sd(e), e.toBase64();
  },
  decode(e) {
    return Bd(e);
  }
} : /* @__PURE__ */ Gl(/* @__PURE__ */ Kl(6), /* @__PURE__ */ jl("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"), /* @__PURE__ */ Td(6), /* @__PURE__ */ zl("")), So = /* @__PURE__ */ Gl(/* @__PURE__ */ jl("qpzry9x8gf2tvdw0s3jn54khce6mua7l"), /* @__PURE__ */ zl("")), hs = [996825010, 642813549, 513874426, 1027748829, 705979059];
function on(e) {
  const t = e >> 25;
  let n = (e & 33554431) << 5;
  for (let r = 0; r < hs.length; r++)
    (t >> r & 1) === 1 && (n ^= hs[r]);
  return n;
}
function fs(e, t, n = 1) {
  const r = e.length;
  let o = 1;
  for (let i = 0; i < r; i++) {
    const s = e.charCodeAt(i);
    if (s < 33 || s > 126)
      throw new Error(`Invalid prefix (${e})`);
    o = on(o) ^ s >> 5;
  }
  o = on(o);
  for (let i = 0; i < r; i++)
    o = on(o) ^ e.charCodeAt(i) & 31;
  for (let i of t)
    o = on(o) ^ i;
  for (let i = 0; i < 6; i++)
    o = on(o);
  return o ^= n, So.encode(_o([o % zn[30]], 30, 5, !1));
}
// @__NO_SIDE_EFFECTS__
function Rd(e) {
  const n = /* @__PURE__ */ Kl(5), r = n.decode, o = n.encode, i = us(r);
  function s(g, v, b = 90) {
    Nt("bech32.encode prefix", g), ii(v) && (v = Array.from(v)), Vl("bech32.encode", v);
    const C = g.length;
    if (C === 0)
      throw new TypeError(`Invalid prefix length ${C}`);
    const L = C + 7 + v.length;
    if (b !== !1 && L > b)
      throw new TypeError(`Length ${L} exceeds limit ${b}`);
    const M = g.toLowerCase(), I = fs(M, v, 1);
    return `${M}1${So.encode(v)}${I}`;
  }
  function c(g, v = 90) {
    Nt("bech32.decode input", g);
    const b = g.length;
    if (b < 8 || v !== !1 && b > v)
      throw new TypeError(`invalid string length: ${b} (${g}). Expected (8..${v})`);
    const C = g.toLowerCase();
    if (g !== C && g !== g.toUpperCase())
      throw new Error("String must be lowercase or uppercase");
    const L = C.lastIndexOf("1");
    if (L === 0 || L === -1)
      throw new Error('Letter "1" must be present between prefix and data only');
    const M = C.slice(0, L), I = C.slice(L + 1);
    if (I.length < 6)
      throw new Error("Data must be at least 6 characters long");
    const U = So.decode(I).slice(0, -6), q = fs(M, U, 1);
    if (!I.endsWith(q))
      throw new Error(`Invalid checksum in ${g}: expected "${q}"`);
    return { prefix: M, words: U };
  }
  const a = us(c);
  function h(g) {
    const { prefix: v, words: b } = c(g, !1);
    return { prefix: v, words: b, bytes: r(b) };
  }
  function w(g, v) {
    return s(g, o(v));
  }
  return {
    encode: s,
    decode: c,
    encodeFromBytes: w,
    decodeToBytes: h,
    decodeUnsafe: a,
    fromWords: r,
    fromWordsUnsafe: i,
    toWords: o
  };
}
const Qt = /* @__PURE__ */ Rd();
/*! noble-ciphers - MIT License (c) 2023 Paul Miller (paulmillr.com) */
function Nd(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array";
}
function ps(e) {
  if (typeof e != "boolean")
    throw new Error(`boolean expected, not ${e}`);
}
function Or(e) {
  if (!Number.isSafeInteger(e) || e < 0)
    throw new Error("positive integer expected, got " + e);
}
function Me(e, t, n = "") {
  const r = Nd(e), o = e?.length, i = t !== void 0;
  if (!r || i && o !== t) {
    const s = n && `"${n}" `, c = i ? ` of length ${t}` : "", a = r ? `length=${o}` : `type=${typeof e}`;
    throw new Error(s + "expected Uint8Array" + c + ", got " + a);
  }
  return e;
}
function Se(e) {
  return new Uint32Array(e.buffer, e.byteOffset, Math.floor(e.byteLength / 4));
}
function Jt(...e) {
  for (let t = 0; t < e.length; t++)
    e[t].fill(0);
}
const $d = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68;
function Id(e, t) {
  return e.buffer === t.buffer && // best we can do, may fail with an obscure Proxy
  e.byteOffset < t.byteOffset + t.byteLength && // a starts before b end
  t.byteOffset < e.byteOffset + e.byteLength;
}
function Ql(e, t) {
  if (Id(e, t) && e.byteOffset < t.byteOffset)
    throw new Error("complex overlap of input and output is not supported");
}
function Ud(e, t) {
  if (t == null || typeof t != "object")
    throw new Error("options must be defined");
  return Object.assign(e, t);
}
function Od(e, t) {
  if (e.length !== t.length)
    return !1;
  let n = 0;
  for (let r = 0; r < e.length; r++)
    n |= e[r] ^ t[r];
  return n === 0;
}
const Pd = /* @__NO_SIDE_EFFECTS__ */ (e, t) => {
  function n(r, ...o) {
    if (Me(r, void 0, "key"), !$d)
      throw new Error("Non little-endian hardware is not yet supported");
    if (e.nonceLength !== void 0) {
      const w = o[0];
      Me(w, e.varSizeNonce ? void 0 : e.nonceLength, "nonce");
    }
    const i = e.tagLength;
    i && o[1] !== void 0 && Me(o[1], void 0, "AAD");
    const s = t(r, ...o), c = (w, g) => {
      if (g !== void 0) {
        if (w !== 2)
          throw new Error("cipher output not supported");
        Me(g, void 0, "output");
      }
    };
    let a = !1;
    return {
      encrypt(w, g) {
        if (a)
          throw new Error("cannot encrypt() twice with same key + nonce");
        return a = !0, Me(w), c(s.encrypt.length, g), s.encrypt(w, g);
      },
      decrypt(w, g) {
        if (Me(w), i && w.length < i)
          throw new Error('"ciphertext" expected length bigger than tagLength=' + i);
        return c(s.decrypt.length, g), s.decrypt(w, g);
      }
    };
  }
  return Object.assign(n, e), n;
};
function Jl(e, t, n = !0) {
  if (t === void 0)
    return new Uint8Array(e);
  if (t.length !== e)
    throw new Error('"output" expected Uint8Array of length ' + e + ", got: " + t.length);
  if (n && !jt(t))
    throw new Error("invalid output, must be aligned");
  return t;
}
function jt(e) {
  return e.byteOffset % 4 === 0;
}
function Rt(e) {
  return Uint8Array.from(e);
}
const yt = 16, Hd = 283;
function Dd(e) {
  if (![16, 24, 32].includes(e.length))
    throw new Error('"aes key" expected Uint8Array of length 16/24/32, got length=' + e.length);
}
function ai(e) {
  return e << 1 ^ Hd & -(e >> 7);
}
function Vt(e, t) {
  let n = 0;
  for (; t > 0; t >>= 1)
    n ^= e & -(t & 1), e = ai(e);
  return n;
}
const Lo = /* @__PURE__ */ (() => {
  const e = new Uint8Array(256);
  for (let n = 0, r = 1; n < 256; n++, r ^= ai(r))
    e[n] = r;
  const t = new Uint8Array(256);
  t[0] = 99;
  for (let n = 0; n < 255; n++) {
    let r = e[255 - n];
    r |= r << 8, t[e[n]] = (r ^ r >> 4 ^ r >> 5 ^ r >> 6 ^ r >> 7 ^ 99) & 255;
  }
  return Jt(e), t;
})(), Zd = /* @__PURE__ */ Lo.map((e, t) => Lo.indexOf(t)), Wd = (e) => e << 24 | e >>> 8, Pr = (e) => e << 8 | e >>> 24;
function Yl(e, t) {
  if (e.length !== 256)
    throw new Error("Wrong sbox length");
  const n = new Uint32Array(256).map((h, w) => t(e[w])), r = n.map(Pr), o = r.map(Pr), i = o.map(Pr), s = new Uint32Array(256 * 256), c = new Uint32Array(256 * 256), a = new Uint16Array(256 * 256);
  for (let h = 0; h < 256; h++)
    for (let w = 0; w < 256; w++) {
      const g = h * 256 + w;
      s[g] = n[h] ^ r[w], c[g] = o[h] ^ i[w], a[g] = e[h] << 8 | e[w];
    }
  return { sbox: e, sbox2: a, T0: n, T1: r, T2: o, T3: i, T01: s, T23: c };
}
const ci = /* @__PURE__ */ Yl(Lo, (e) => Vt(e, 3) << 24 | e << 16 | e << 8 | Vt(e, 2)), Xl = /* @__PURE__ */ Yl(Zd, (e) => Vt(e, 11) << 24 | Vt(e, 13) << 16 | Vt(e, 9) << 8 | Vt(e, 14)), Fd = /* @__PURE__ */ (() => {
  const e = new Uint8Array(16);
  for (let t = 0, n = 1; t < 16; t++, n = ai(n))
    e[t] = n;
  return e;
})();
function e0(e) {
  Me(e);
  const t = e.length;
  Dd(e);
  const { sbox2: n } = ci, r = [];
  jt(e) || r.push(e = Rt(e));
  const o = Se(e), i = o.length, s = (a) => ze(n, a, a, a, a), c = new Uint32Array(t + 28);
  c.set(o);
  for (let a = i; a < c.length; a++) {
    let h = c[a - 1];
    a % i === 0 ? h = s(Wd(h)) ^ Fd[a / i - 1] : i > 6 && a % i === 4 && (h = s(h)), c[a] = c[a - i] ^ h;
  }
  return Jt(...r), c;
}
function Vd(e) {
  const t = e0(e), n = t.slice(), r = t.length, { sbox2: o } = ci, { T0: i, T1: s, T2: c, T3: a } = Xl;
  for (let h = 0; h < r; h += 4)
    for (let w = 0; w < 4; w++)
      n[h + w] = t[r - h - 4 + w];
  Jt(t);
  for (let h = 4; h < r - 4; h++) {
    const w = n[h], g = ze(o, w, w, w, w);
    n[h] = i[g & 255] ^ s[g >>> 8 & 255] ^ c[g >>> 16 & 255] ^ a[g >>> 24];
  }
  return n;
}
function pt(e, t, n, r, o, i) {
  return e[n << 8 & 65280 | r >>> 8 & 255] ^ t[o >>> 8 & 65280 | i >>> 24 & 255];
}
function ze(e, t, n, r, o) {
  return e[t & 255 | n & 65280] | e[r >>> 16 & 255 | o >>> 16 & 65280] << 16;
}
function gs(e, t, n, r, o) {
  const { sbox2: i, T01: s, T23: c } = ci;
  let a = 0;
  t ^= e[a++], n ^= e[a++], r ^= e[a++], o ^= e[a++];
  const h = e.length / 4 - 2;
  for (let C = 0; C < h; C++) {
    const L = e[a++] ^ pt(s, c, t, n, r, o), M = e[a++] ^ pt(s, c, n, r, o, t), I = e[a++] ^ pt(s, c, r, o, t, n), U = e[a++] ^ pt(s, c, o, t, n, r);
    t = L, n = M, r = I, o = U;
  }
  const w = e[a++] ^ ze(i, t, n, r, o), g = e[a++] ^ ze(i, n, r, o, t), v = e[a++] ^ ze(i, r, o, t, n), b = e[a++] ^ ze(i, o, t, n, r);
  return { s0: w, s1: g, s2: v, s3: b };
}
function Gd(e, t, n, r, o) {
  const { sbox2: i, T01: s, T23: c } = Xl;
  let a = 0;
  t ^= e[a++], n ^= e[a++], r ^= e[a++], o ^= e[a++];
  const h = e.length / 4 - 2;
  for (let C = 0; C < h; C++) {
    const L = e[a++] ^ pt(s, c, t, o, r, n), M = e[a++] ^ pt(s, c, n, t, o, r), I = e[a++] ^ pt(s, c, r, n, t, o), U = e[a++] ^ pt(s, c, o, r, n, t);
    t = L, n = M, r = I, o = U;
  }
  const w = e[a++] ^ ze(i, t, o, r, n), g = e[a++] ^ ze(i, n, t, o, r), v = e[a++] ^ ze(i, r, n, t, o), b = e[a++] ^ ze(i, o, r, n, t);
  return { s0: w, s1: g, s2: v, s3: b };
}
function jd(e) {
  if (Me(e), e.length % yt !== 0)
    throw new Error("aes-(cbc/ecb).decrypt ciphertext should consist of blocks with size " + yt);
}
function zd(e, t, n) {
  Me(e);
  let r = e.length;
  const o = r % yt;
  if (!t && o !== 0)
    throw new Error("aec/(cbc-ecb): unpadded plaintext with disabled padding");
  jt(e) || (e = Rt(e));
  const i = Se(e);
  if (t) {
    let c = yt - o;
    c || (c = yt), r = r + c;
  }
  n = Jl(r, n), Ql(e, n);
  const s = Se(n);
  return { b: i, o: s, out: n };
}
function qd(e, t) {
  if (!t)
    return e;
  const n = e.length;
  if (!n)
    throw new Error("aes/pcks5: empty ciphertext not allowed");
  const r = e[n - 1];
  if (r <= 0 || r > 16)
    throw new Error("aes/pcks5: wrong padding");
  const o = e.subarray(0, -r);
  for (let i = 0; i < r; i++)
    if (e[n - i - 1] !== r)
      throw new Error("aes/pcks5: wrong padding");
  return o;
}
function Kd(e) {
  const t = new Uint8Array(16), n = Se(t);
  t.set(e);
  const r = yt - e.length;
  for (let o = yt - r; o < yt; o++)
    t[o] = r;
  return n;
}
const t0 = /* @__PURE__ */ Pd({ blockSize: 16, nonceLength: 16 }, function(t, n, r = {}) {
  const o = !r.disablePadding;
  return {
    encrypt(i, s) {
      const c = e0(t), { b: a, o: h, out: w } = zd(i, o, s);
      let g = n;
      const v = [c];
      jt(g) || v.push(g = Rt(g));
      const b = Se(g);
      let C = b[0], L = b[1], M = b[2], I = b[3], U = 0;
      for (; U + 4 <= a.length; )
        C ^= a[U + 0], L ^= a[U + 1], M ^= a[U + 2], I ^= a[U + 3], { s0: C, s1: L, s2: M, s3: I } = gs(c, C, L, M, I), h[U++] = C, h[U++] = L, h[U++] = M, h[U++] = I;
      if (o) {
        const q = Kd(i.subarray(U * 4));
        C ^= q[0], L ^= q[1], M ^= q[2], I ^= q[3], { s0: C, s1: L, s2: M, s3: I } = gs(c, C, L, M, I), h[U++] = C, h[U++] = L, h[U++] = M, h[U++] = I;
      }
      return Jt(...v), w;
    },
    decrypt(i, s) {
      jd(i);
      const c = Vd(t);
      let a = n;
      const h = [c];
      jt(a) || h.push(a = Rt(a));
      const w = Se(a);
      s = Jl(i.length, s), jt(i) || h.push(i = Rt(i)), Ql(i, s);
      const g = Se(i), v = Se(s);
      let b = w[0], C = w[1], L = w[2], M = w[3];
      for (let I = 0; I + 4 <= g.length; ) {
        const U = b, q = C, Q = L, A = M;
        b = g[I + 0], C = g[I + 1], L = g[I + 2], M = g[I + 3];
        const { s0: _, s1: E, s2: T, s3: m } = Gd(c, b, C, L, M);
        v[I++] = _ ^ U, v[I++] = E ^ q, v[I++] = T ^ Q, v[I++] = m ^ A;
      }
      return Jt(...h), qd(s, o);
    }
  };
}), n0 = (e) => Uint8Array.from(e.split(""), (t) => t.charCodeAt(0)), Qd = n0("expand 16-byte k"), Jd = n0("expand 32-byte k"), Yd = Se(Qd), Xd = Se(Jd);
function le(e, t) {
  return e << t | e >>> 32 - t;
}
function To(e) {
  return e.byteOffset % 4 === 0;
}
const $n = 64, eu = 16, r0 = 2 ** 32 - 1, ws = Uint32Array.of();
function tu(e, t, n, r, o, i, s, c) {
  const a = o.length, h = new Uint8Array($n), w = Se(h), g = To(o) && To(i), v = g ? Se(o) : ws, b = g ? Se(i) : ws;
  for (let C = 0; C < a; s++) {
    if (e(t, n, r, w, s, c), s >= r0)
      throw new Error("arx: counter overflow");
    const L = Math.min($n, a - C);
    if (g && L === $n) {
      const M = C / 4;
      if (C % 4 !== 0)
        throw new Error("arx: invalid block position");
      for (let I = 0, U; I < eu; I++)
        U = M + I, b[U] = v[U] ^ w[I];
      C += $n;
      continue;
    }
    for (let M = 0, I; M < L; M++)
      I = C + M, i[I] = o[I] ^ h[M];
    C += L;
  }
}
function nu(e, t) {
  const { allowShortKeys: n, extendNonceFn: r, counterLength: o, counterRight: i, rounds: s } = Ud({ allowShortKeys: !1, counterLength: 8, counterRight: !1, rounds: 20 }, t);
  if (typeof e != "function")
    throw new Error("core must be a function");
  return Or(o), Or(s), ps(i), ps(n), (c, a, h, w, g = 0) => {
    Me(c, void 0, "key"), Me(a, void 0, "nonce"), Me(h, void 0, "data");
    const v = h.length;
    if (w === void 0 && (w = new Uint8Array(v)), Me(w, void 0, "output"), Or(g), g < 0 || g >= r0)
      throw new Error("arx: counter overflow");
    if (w.length < v)
      throw new Error(`arx: output (${w.length}) is shorter than data (${v})`);
    const b = [];
    let C = c.length, L, M;
    if (C === 32)
      b.push(L = Rt(c)), M = Xd;
    else if (C === 16 && n)
      L = new Uint8Array(32), L.set(c), L.set(c, 16), M = Yd, b.push(L);
    else
      throw Me(c, 32, "arx key"), new Error("invalid key size");
    To(a) || b.push(a = Rt(a));
    const I = Se(L);
    if (r) {
      if (a.length !== 24)
        throw new Error("arx: extended nonce must be 24 bytes");
      r(M, I, Se(a.subarray(0, 16)), I), a = a.subarray(16);
    }
    const U = 16 - o;
    if (U !== a.length)
      throw new Error(`arx: nonce must be ${U} or 16 bytes`);
    if (U !== 12) {
      const Q = new Uint8Array(12);
      Q.set(a, i ? 0 : 12 - a.length), a = Q, b.push(a);
    }
    const q = Se(a);
    return tu(e, M, I, q, h, w, g, s), Jt(...b), w;
  };
}
function ru(e, t, n, r, o, i = 20) {
  let s = e[0], c = e[1], a = e[2], h = e[3], w = t[0], g = t[1], v = t[2], b = t[3], C = t[4], L = t[5], M = t[6], I = t[7], U = o, q = n[0], Q = n[1], A = n[2], _ = s, E = c, T = a, m = h, k = w, d = g, l = v, u = b, p = C, f = L, y = M, x = I, O = U, R = q, P = Q, S = A;
  for (let J = 0; J < i; J += 2)
    _ = _ + k | 0, O = le(O ^ _, 16), p = p + O | 0, k = le(k ^ p, 12), _ = _ + k | 0, O = le(O ^ _, 8), p = p + O | 0, k = le(k ^ p, 7), E = E + d | 0, R = le(R ^ E, 16), f = f + R | 0, d = le(d ^ f, 12), E = E + d | 0, R = le(R ^ E, 8), f = f + R | 0, d = le(d ^ f, 7), T = T + l | 0, P = le(P ^ T, 16), y = y + P | 0, l = le(l ^ y, 12), T = T + l | 0, P = le(P ^ T, 8), y = y + P | 0, l = le(l ^ y, 7), m = m + u | 0, S = le(S ^ m, 16), x = x + S | 0, u = le(u ^ x, 12), m = m + u | 0, S = le(S ^ m, 8), x = x + S | 0, u = le(u ^ x, 7), _ = _ + d | 0, S = le(S ^ _, 16), y = y + S | 0, d = le(d ^ y, 12), _ = _ + d | 0, S = le(S ^ _, 8), y = y + S | 0, d = le(d ^ y, 7), E = E + l | 0, O = le(O ^ E, 16), x = x + O | 0, l = le(l ^ x, 12), E = E + l | 0, O = le(O ^ E, 8), x = x + O | 0, l = le(l ^ x, 7), T = T + u | 0, R = le(R ^ T, 16), p = p + R | 0, u = le(u ^ p, 12), T = T + u | 0, R = le(R ^ T, 8), p = p + R | 0, u = le(u ^ p, 7), m = m + k | 0, P = le(P ^ m, 16), f = f + P | 0, k = le(k ^ f, 12), m = m + k | 0, P = le(P ^ m, 8), f = f + P | 0, k = le(k ^ f, 7);
  let D = 0;
  r[D++] = s + _ | 0, r[D++] = c + E | 0, r[D++] = a + T | 0, r[D++] = h + m | 0, r[D++] = w + k | 0, r[D++] = g + d | 0, r[D++] = v + l | 0, r[D++] = b + u | 0, r[D++] = C + p | 0, r[D++] = L + f | 0, r[D++] = M + y | 0, r[D++] = I + x | 0, r[D++] = U + O | 0, r[D++] = q + R | 0, r[D++] = Q + P | 0, r[D++] = A + S | 0;
}
const o0 = /* @__PURE__ */ nu(ru, {
  counterRight: !1,
  counterLength: 4,
  allowShortKeys: !1
});
function ou(e, t, n) {
  return pr(e), n === void 0 && (n = new Uint8Array(e.outputLen)), Tn(e, n, t);
}
const Hr = /* @__PURE__ */ Uint8Array.of(0), ys = /* @__PURE__ */ Uint8Array.of();
function iu(e, t, n, r = 32) {
  pr(e), bt(r, "length");
  const o = e.outputLen;
  if (r > 255 * o)
    throw new Error("Length must be <= 255*HashLen");
  const i = Math.ceil(r / o);
  n === void 0 ? n = ys : fe(n, void 0, "info");
  const s = new Uint8Array(i * o), c = Tn.create(e, t), a = c._cloneInto(), h = new Uint8Array(c.outputLen);
  for (let w = 0; w < i; w++)
    Hr[0] = w + 1, a.update(w === 0 ? ys : h).update(n).update(Hr).digestInto(h), s.set(h, o * w), c._cloneInto(a);
  return c.destroy(), a.destroy(), mn(h, Hr), s.slice(0, r);
}
var su = Object.defineProperty, ye = (e, t) => {
  for (var n in t)
    su(e, n, { get: t[n], enumerable: !0 });
}, Ht = Symbol("verified"), au = (e) => e instanceof Object;
function li(e) {
  if (!au(e) || typeof e.kind != "number" || typeof e.content != "string" || typeof e.created_at != "number" || typeof e.pubkey != "string" || !e.pubkey.match(/^[a-f0-9]{64}$/) || !Array.isArray(e.tags))
    return !1;
  for (let t = 0; t < e.tags.length; t++) {
    let n = e.tags[t];
    if (!Array.isArray(n))
      return !1;
    for (let r = 0; r < n.length; r++)
      if (typeof n[r] != "string")
        return !1;
  }
  return !0;
}
var cu = {};
ye(cu, {
  binarySearch: () => di,
  bytesToHex: () => pe,
  hexToBytes: () => ue,
  insertEventIntoAscendingList: () => du,
  insertEventIntoDescendingList: () => lu,
  mergeReverseSortedLists: () => uu,
  normalizeURL: () => i0,
  utf8Decoder: () => nt,
  utf8Encoder: () => De
});
var nt = new TextDecoder("utf-8"), De = new TextEncoder();
function i0(e) {
  try {
    e.indexOf("://") === -1 && (e = "wss://" + e);
    let t = new URL(e);
    return t.protocol === "http:" ? t.protocol = "ws:" : t.protocol === "https:" && (t.protocol = "wss:"), t.pathname = t.pathname.replace(/\/+/g, "/"), t.pathname.endsWith("/") && (t.pathname = t.pathname.slice(0, -1)), (t.port === "80" && t.protocol === "ws:" || t.port === "443" && t.protocol === "wss:") && (t.port = ""), t.searchParams.sort(), t.hash = "", t.toString();
  } catch {
    throw new Error(`Invalid URL: ${e}`);
  }
}
function lu(e, t) {
  const [n, r] = di(e, (o) => t.id === o.id ? 0 : t.created_at === o.created_at ? -1 : o.created_at - t.created_at);
  return r || e.splice(n, 0, t), e;
}
function du(e, t) {
  const [n, r] = di(e, (o) => t.id === o.id ? 0 : t.created_at === o.created_at ? -1 : t.created_at - o.created_at);
  return r || e.splice(n, 0, t), e;
}
function di(e, t) {
  let n = 0, r = e.length - 1;
  for (; n <= r; ) {
    const o = Math.floor((n + r) / 2), i = t(e[o]);
    if (i === 0)
      return [o, !0];
    i < 0 ? r = o - 1 : n = o + 1;
  }
  return [n, !1];
}
function uu(e, t) {
  const n = new Array(e.length + t.length);
  n.length = 0;
  let r = 0, o = 0, i = [];
  for (; r < e.length && o < t.length; ) {
    let s;
    if (e[r]?.created_at > t[o]?.created_at ? (s = e[r], r++) : (s = t[o], o++), n.length > 0 && n[n.length - 1].created_at === s.created_at) {
      if (i.includes(s.id))
        continue;
    } else
      i.length = 0;
    n.push(s), i.push(s.id);
  }
  for (; r < e.length; ) {
    const s = e[r];
    if (r++, n.length > 0 && n[n.length - 1].created_at === s.created_at) {
      if (i.includes(s.id))
        continue;
    } else
      i.length = 0;
    n.push(s), i.push(s.id);
  }
  for (; o < t.length; ) {
    const s = t[o];
    if (o++, n.length > 0 && n[n.length - 1].created_at === s.created_at) {
      if (i.includes(s.id))
        continue;
    } else
      i.length = 0;
    n.push(s), i.push(s.id);
  }
  return n;
}
var hu = class {
  generateSecretKey() {
    return rn.utils.randomSecretKey();
  }
  getPublicKey(e) {
    return pe(rn.getPublicKey(e));
  }
  finalizeEvent(e, t) {
    const n = e;
    return n.pubkey = pe(rn.getPublicKey(t)), n.id = gn(n), n.sig = pe(rn.sign(ue(gn(n)), t)), n[Ht] = !0, n;
  }
  verifyEvent(e) {
    if (typeof e[Ht] == "boolean")
      return e[Ht];
    try {
      const t = gn(e);
      if (t !== e.id)
        return e[Ht] = !1, !1;
      const n = rn.verify(ue(e.sig), ue(t), ue(e.pubkey));
      return e[Ht] = n, n;
    } catch {
      return e[Ht] = !1, !1;
    }
  }
};
function fu(e) {
  if (!li(e))
    throw new Error("can't serialize event with wrong or missing properties");
  return JSON.stringify([0, e.pubkey, e.created_at, e.kind, e.tags, e.content]);
}
function gn(e) {
  let t = Ke(De.encode(fu(e)));
  return pe(t);
}
var yr = new hu(), ui = yr.generateSecretKey, Yt = yr.getPublicKey, Fe = yr.finalizeEvent, br = yr.verifyEvent, pu = {};
ye(pu, {
  Application: () => _h,
  BadgeAward: () => xu,
  BadgeDefinition: () => mh,
  BlockedRelaysList: () => th,
  BlossomServerList: () => ch,
  BookmarkList: () => Yu,
  Bookmarksets: () => wh,
  Calendar: () => Nh,
  CalendarEventRSVP: () => $h,
  ChannelCreation: () => u0,
  ChannelHideMessage: () => p0,
  ChannelMessage: () => f0,
  ChannelMetadata: () => h0,
  ChannelMuteUser: () => g0,
  ChatMessage: () => Eu,
  ClassifiedListing: () => Th,
  ClientAuth: () => y0,
  Comment: () => Ru,
  CommunitiesList: () => Xu,
  CommunityDefinition: () => Ph,
  CommunityPostApproval: () => Du,
  Contacts: () => mu,
  CreateOrUpdateProduct: () => xh,
  CreateOrUpdateStall: () => Ch,
  Curationsets: () => yh,
  Date: () => Bh,
  DirectMessageRelaysList: () => sh,
  DraftClassifiedListing: () => Mh,
  DraftLong: () => Ah,
  Emojisets: () => kh,
  EncryptedDirectMessage: () => vu,
  EventDeletion: () => Cu,
  FavoriteRelays: () => rh,
  FileMessage: () => ku,
  FileMetadata: () => Bu,
  FileServerPreference: () => ah,
  Followsets: () => fh,
  ForumThread: () => Au,
  GenericRepost: () => wi,
  Genericlists: () => ph,
  GiftWrap: () => w0,
  GroupMetadata: () => Hh,
  HTTPAuth: () => yi,
  Handlerinformation: () => Oh,
  Handlerrecommendation: () => Uh,
  Highlights: () => zu,
  InterestsList: () => oh,
  Interestsets: () => vh,
  JobFeedback: () => Fu,
  JobRequest: () => Zu,
  JobResult: () => Wu,
  Label: () => Hu,
  LightningPubRPC: () => dh,
  LiveChatMessage: () => Nu,
  LiveEvent: () => Sh,
  LongFormArticle: () => Eh,
  Metadata: () => yu,
  Mutelist: () => Ku,
  NWCWalletInfo: () => lh,
  NWCWalletRequest: () => b0,
  NWCWalletResponse: () => uh,
  NormalVideo: () => Su,
  NostrConnect: () => hh,
  OpenTimestamps: () => Tu,
  Photo: () => _u,
  Pinlist: () => Qu,
  Poll: () => Mu,
  PollResponse: () => qu,
  PrivateDirectMessage: () => d0,
  ProblemTracker: () => Uu,
  ProfileBadges: () => bh,
  PublicChatsList: () => eh,
  Reaction: () => gi,
  RecommendRelay: () => bu,
  RelayList: () => Ju,
  RelayReview: () => Ih,
  Relaysets: () => gh,
  Report: () => Ou,
  Reporting: () => Pu,
  Repost: () => pi,
  Seal: () => l0,
  SearchRelaysList: () => nh,
  ShortTextNote: () => c0,
  ShortVideo: () => Lu,
  Time: () => Rh,
  UserEmojiList: () => ih,
  UserStatuses: () => Lh,
  Voice: () => $u,
  VoiceComment: () => Iu,
  Zap: () => ju,
  ZapGoal: () => Vu,
  ZapRequest: () => Gu,
  classifyKind: () => gu,
  isAddressableKind: () => fi,
  isEphemeralKind: () => a0,
  isKind: () => wu,
  isRegularKind: () => s0,
  isReplaceableKind: () => hi
});
function s0(e) {
  return e < 1e4 && e !== 0 && e !== 3;
}
function hi(e) {
  return e === 0 || e === 3 || 1e4 <= e && e < 2e4;
}
function a0(e) {
  return 2e4 <= e && e < 3e4;
}
function fi(e) {
  return 3e4 <= e && e < 4e4;
}
function gu(e) {
  return s0(e) ? "regular" : hi(e) ? "replaceable" : a0(e) ? "ephemeral" : fi(e) ? "parameterized" : "unknown";
}
function wu(e, t) {
  const n = t instanceof Array ? t : [t];
  return li(e) && n.includes(e.kind) || !1;
}
var yu = 0, c0 = 1, bu = 2, mu = 3, vu = 4, Cu = 5, pi = 6, gi = 7, xu = 8, Eu = 9, Au = 11, l0 = 13, d0 = 14, ku = 15, wi = 16, _u = 20, Su = 21, Lu = 22, u0 = 40, h0 = 41, f0 = 42, p0 = 43, g0 = 44, Tu = 1040, w0 = 1059, Mu = 1068, Bu = 1063, Ru = 1111, Nu = 1311, $u = 1222, Iu = 1244, Uu = 1971, Ou = 1984, Pu = 1984, Hu = 1985, Du = 4550, Zu = 5999, Wu = 6999, Fu = 7e3, Vu = 9041, Gu = 9734, ju = 9735, zu = 9802, qu = 1018, Ku = 1e4, Qu = 10001, Ju = 10002, Yu = 10003, Xu = 10004, eh = 10005, th = 10006, nh = 10007, rh = 10012, oh = 10015, ih = 10030, sh = 10050, ah = 10096, ch = 10063, lh = 13194, dh = 21e3, y0 = 22242, b0 = 23194, uh = 23195, hh = 24133, yi = 27235, fh = 3e4, ph = 30001, gh = 30002, wh = 30003, yh = 30004, bh = 30008, mh = 30009, vh = 30015, Ch = 30017, xh = 30018, Eh = 30023, Ah = 30024, kh = 30030, _h = 30078, Sh = 30311, Lh = 30315, Th = 30402, Mh = 30403, Bh = 31922, Rh = 31923, Nh = 31924, $h = 31925, Ih = 31987, Uh = 31989, Oh = 31990, Ph = 34550, Hh = 39e3;
function Dh(e, t) {
  if (e.ids && e.ids.indexOf(t.id) === -1 || e.kinds && e.kinds.indexOf(t.kind) === -1 || e.authors && e.authors.indexOf(t.pubkey) === -1)
    return !1;
  for (let n in e)
    if (n[0] === "#") {
      let r = n.slice(1), o = e[`#${r}`];
      if (o && !t.tags.find(([i, s]) => i === n.slice(1) && o.indexOf(s) !== -1))
        return !1;
    }
  return !(e.since && t.created_at < e.since || e.until && t.created_at > e.until);
}
function Zh(e, t) {
  for (let n = 0; n < e.length; n++)
    if (Dh(e[n], t))
      return !0;
  return !1;
}
var Wh = {};
ye(Wh, {
  getHex64: () => mr,
  getInt: () => m0,
  getSubscriptionId: () => v0,
  matchEventId: () => Fh,
  matchEventKind: () => Gh,
  matchEventPubkey: () => Vh
});
function mr(e, t) {
  let n = t.length + 3, r = e.indexOf(`"${t}":`) + n, o = e.slice(r).indexOf('"') + r + 1;
  return e.slice(o, o + 64);
}
function m0(e, t) {
  let n = t.length, r = e.indexOf(`"${t}":`) + n + 3, o = e.slice(r), i = Math.min(o.indexOf(","), o.indexOf("}"));
  return parseInt(o.slice(0, i), 10);
}
function v0(e) {
  let t = e.slice(0, 22).indexOf('"EVENT"');
  if (t === -1)
    return null;
  let n = e.slice(t + 7 + 1).indexOf('"');
  if (n === -1)
    return null;
  let r = t + 7 + 1 + n, o = e.slice(r + 1, 80).indexOf('"');
  if (o === -1)
    return null;
  let i = r + 1 + o;
  return e.slice(r + 1, i);
}
function Fh(e, t) {
  return t === mr(e, "id");
}
function Vh(e, t) {
  return t === mr(e, "pubkey");
}
function Gh(e, t) {
  return t === m0(e, "kind");
}
var jh = {};
ye(jh, {
  makeAuthEvent: () => C0
});
function C0(e, t) {
  return {
    kind: y0,
    created_at: Math.floor(Date.now() / 1e3),
    tags: [
      ["relay", e],
      ["challenge", t]
    ],
    content: ""
  };
}
var x0 = class extends Error {
  constructor(e, t) {
    super(`Tried to send message '${e} on a closed connection to ${t}.`), this.name = "SendingOnClosedConnection";
  }
}, E0 = class {
  url;
  _connected = !1;
  onclose = null;
  onnotice = (e) => console.debug(`NOTICE from ${this.url}: ${e}`);
  onauth;
  baseEoseTimeout = 4400;
  publishTimeout = 4400;
  pingFrequency = 29e3;
  pingTimeout = 2e4;
  resubscribeBackoff = [1e4, 1e4, 1e4, 2e4, 2e4, 3e4, 6e4];
  openSubs = /* @__PURE__ */ new Map();
  enablePing;
  enableReconnect;
  idleSince = Date.now();
  ongoingOperations = 0;
  reconnectTimeoutHandle;
  pingIntervalHandle;
  reconnectAttempts = 0;
  skipReconnection = !1;
  connectionPromise;
  openCountRequests = /* @__PURE__ */ new Map();
  openEventPublishes = /* @__PURE__ */ new Map();
  ws;
  challenge;
  authPromise;
  serial = 0;
  verifyEvent;
  _WebSocket;
  constructor(e, t) {
    this.url = i0(e), this.verifyEvent = t.verifyEvent, this._WebSocket = t.websocketImplementation || WebSocket, this.enablePing = t.enablePing, this.enableReconnect = t.enableReconnect || !1;
  }
  static async connect(e, t) {
    const n = new E0(e, t);
    return await n.connect(t), n;
  }
  closeAllSubscriptions(e) {
    for (let [t, n] of this.openSubs)
      n.close(e);
    this.openSubs.clear();
    for (let [t, n] of this.openEventPublishes)
      n.reject(new Error(e));
    this.openEventPublishes.clear();
    for (let [t, n] of this.openCountRequests)
      n.reject(new Error(e));
    this.openCountRequests.clear();
  }
  get connected() {
    return this._connected;
  }
  async reconnect() {
    const e = this.resubscribeBackoff[Math.min(this.reconnectAttempts, this.resubscribeBackoff.length - 1)];
    this.reconnectAttempts++, this.reconnectTimeoutHandle = setTimeout(async () => {
      try {
        await this.connect();
      } catch {
      }
    }, e);
  }
  handleHardClose(e) {
    this.pingIntervalHandle && (clearInterval(this.pingIntervalHandle), this.pingIntervalHandle = void 0), this._connected = !1, this.connectionPromise = void 0, this.idleSince = void 0, this.enableReconnect && !this.skipReconnection ? this.reconnect() : (this.onclose?.(), this.closeAllSubscriptions(e));
  }
  async connect(e) {
    let t;
    return this.connectionPromise ? this.connectionPromise : (this.challenge = void 0, this.authPromise = void 0, this.skipReconnection = !1, this.connectionPromise = new Promise((n, r) => {
      e?.timeout && (t = setTimeout(() => {
        r("connection timed out"), this.connectionPromise = void 0, this.skipReconnection = !0, this.onclose?.(), this.handleHardClose("relay connection timed out");
      }, e.timeout)), e?.abort && (e.abort.onabort = r);
      try {
        this.ws = new this._WebSocket(this.url);
      } catch (o) {
        clearTimeout(t), r(o);
        return;
      }
      this.ws.onopen = () => {
        this.reconnectTimeoutHandle && (clearTimeout(this.reconnectTimeoutHandle), this.reconnectTimeoutHandle = void 0), clearTimeout(t), this._connected = !0;
        const o = this.reconnectAttempts > 0;
        this.reconnectAttempts = 0;
        for (const i of this.openSubs.values()) {
          if (i.eosed = !1, o)
            for (let s = 0; s < i.filters.length; s++)
              i.lastEmitted && (i.filters[s].since = i.lastEmitted + 1);
          i.fire();
        }
        this.enablePing && (this.pingIntervalHandle = setInterval(() => this.pingpong(), this.pingFrequency)), n();
      }, this.ws.onerror = () => {
        clearTimeout(t), r("connection failed"), this.connectionPromise = void 0, this.skipReconnection = !0, this.onclose?.(), this.handleHardClose("relay connection failed");
      }, this.ws.onclose = (o) => {
        clearTimeout(t), r(o.message || "websocket closed"), this.handleHardClose("relay connection closed");
      }, this.ws.onmessage = this._onmessage.bind(this);
    }), this.connectionPromise);
  }
  waitForPingPong() {
    return new Promise((e) => {
      this.ws.once("pong", () => e(!0)), this.ws.ping();
    });
  }
  waitForDummyReq() {
    return new Promise((e, t) => {
      if (!this.connectionPromise)
        return t(new Error(`no connection to ${this.url}, can't ping`));
      try {
        const n = this.subscribe(
          [{ ids: ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"], limit: 0 }],
          {
            label: "<forced-ping>",
            oneose: () => {
              e(!0), n.close();
            },
            onclose() {
              e(!0);
            },
            eoseTimeout: this.pingTimeout + 1e3
          }
        );
      } catch (n) {
        t(n);
      }
    });
  }
  async pingpong() {
    this.ws?.readyState === 1 && (await Promise.any([
      this.ws && this.ws.ping && this.ws.once ? this.waitForPingPong() : this.waitForDummyReq(),
      new Promise((t) => setTimeout(() => t(!1), this.pingTimeout))
    ]) || this.ws?.readyState === this._WebSocket.OPEN && this.ws?.close());
  }
  async send(e) {
    if (!this.connectionPromise)
      throw new x0(e, this.url);
    this.connectionPromise.then(() => {
      this.ws?.send(e);
    });
  }
  async auth(e) {
    const t = this.challenge;
    if (!t)
      throw new Error("can't perform auth, no challenge was received");
    return this.authPromise ? this.authPromise : (this.authPromise = new Promise(async (n, r) => {
      try {
        let o = await e(C0(this.url, t)), i = setTimeout(() => {
          let s = this.openEventPublishes.get(o.id);
          s && (s.reject(new Error("auth timed out")), this.openEventPublishes.delete(o.id));
        }, this.publishTimeout);
        this.openEventPublishes.set(o.id, { resolve: n, reject: r, timeout: i }), this.send('["AUTH",' + JSON.stringify(o) + "]");
      } catch (o) {
        console.warn("subscribe auth function failed:", o);
      }
    }), this.authPromise);
  }
  async publish(e) {
    this.idleSince = void 0, this.ongoingOperations++;
    const t = new Promise((n, r) => {
      const o = setTimeout(() => {
        const i = this.openEventPublishes.get(e.id);
        i && (i.reject(new Error("publish timed out")), this.openEventPublishes.delete(e.id));
      }, this.publishTimeout);
      this.openEventPublishes.set(e.id, { resolve: n, reject: r, timeout: o });
    });
    return this.send('["EVENT",' + JSON.stringify(e) + "]"), this.ongoingOperations--, this.ongoingOperations === 0 && (this.idleSince = Date.now()), t;
  }
  async count(e, t) {
    this.serial++;
    const n = t?.id || "count:" + this.serial, r = new Promise((o, i) => {
      this.openCountRequests.set(n, { resolve: o, reject: i });
    });
    return this.send('["COUNT","' + n + '",' + JSON.stringify(e).substring(1)), r;
  }
  subscribe(e, t) {
    t.label !== "<forced-ping>" && (this.idleSince = void 0, this.ongoingOperations++);
    const n = this.prepareSubscription(e, t);
    return n.fire(), t.abort && (t.abort.onabort = () => n.close(String(t.abort.reason || "<aborted>"))), n;
  }
  prepareSubscription(e, t) {
    this.serial++;
    const n = t.id || (t.label ? t.label + ":" : "sub:") + this.serial, r = new zh(this, n, e, t);
    return this.openSubs.set(n, r), r;
  }
  close() {
    this.skipReconnection = !0, this.reconnectTimeoutHandle && (clearTimeout(this.reconnectTimeoutHandle), this.reconnectTimeoutHandle = void 0), this.pingIntervalHandle && (clearInterval(this.pingIntervalHandle), this.pingIntervalHandle = void 0), this.closeAllSubscriptions("relay connection closed by us"), this._connected = !1, this.idleSince = void 0, this.onclose?.(), this.ws?.readyState === this._WebSocket.OPEN && this.ws?.close();
  }
  _onmessage(e) {
    const t = e.data;
    if (!t)
      return;
    const n = v0(t);
    if (n) {
      const r = this.openSubs.get(n);
      if (!r)
        return;
      const o = mr(t, "id"), i = r.alreadyHaveEvent?.(o);
      if (r.receivedEvent?.(this, o), i)
        return;
    }
    try {
      let r = JSON.parse(t);
      switch (r[0]) {
        case "EVENT": {
          const o = this.openSubs.get(r[1]), i = r[2];
          this.verifyEvent(i) && Zh(o.filters, i) ? o.onevent(i) : o.oninvalidevent?.(i), (!o.lastEmitted || o.lastEmitted < i.created_at) && (o.lastEmitted = i.created_at);
          return;
        }
        case "COUNT": {
          const o = r[1], i = r[2], s = this.openCountRequests.get(o);
          s && (s.resolve(i.count), this.openCountRequests.delete(o));
          return;
        }
        case "EOSE": {
          const o = this.openSubs.get(r[1]);
          if (!o)
            return;
          o.receivedEose();
          return;
        }
        case "OK": {
          const o = r[1], i = r[2], s = r[3], c = this.openEventPublishes.get(o);
          c && (clearTimeout(c.timeout), i ? c.resolve(s) : c.reject(new Error(s)), this.openEventPublishes.delete(o));
          return;
        }
        case "CLOSED": {
          const o = r[1], i = this.openSubs.get(o);
          if (!i)
            return;
          i.closed = !0, i.close(r[2]);
          return;
        }
        case "NOTICE": {
          this.onnotice(r[1]);
          return;
        }
        case "AUTH": {
          this.challenge = r[1], this.onauth && this.auth(this.onauth);
          return;
        }
        default: {
          this.openSubs.get(r[1])?.oncustom?.(r);
          return;
        }
      }
    } catch (r) {
      try {
        const [o, i, s] = JSON.parse(t);
        console.warn(`[nostr] relay ${this.url} error processing message:`, r, s);
      } catch {
        console.warn(`[nostr] relay ${this.url} error processing message:`, r);
      }
      return;
    }
  }
}, zh = class {
  relay;
  id;
  lastEmitted;
  closed = !1;
  eosed = !1;
  filters;
  alreadyHaveEvent;
  receivedEvent;
  onevent;
  oninvalidevent;
  oneose;
  onclose;
  oncustom;
  eoseTimeout;
  eoseTimeoutHandle;
  constructor(e, t, n, r) {
    if (n.length === 0)
      throw new Error("subscription can't be created with zero filters");
    this.relay = e, this.filters = n, this.id = t, this.alreadyHaveEvent = r.alreadyHaveEvent, this.receivedEvent = r.receivedEvent, this.eoseTimeout = r.eoseTimeout || e.baseEoseTimeout, this.oneose = r.oneose, this.onclose = r.onclose, this.oninvalidevent = r.oninvalidevent, this.onevent = r.onevent || ((o) => {
      console.warn(
        `onevent() callback not defined for subscription '${this.id}' in relay ${this.relay.url}. event received:`,
        o
      );
    });
  }
  fire() {
    this.relay.send('["REQ","' + this.id + '",' + JSON.stringify(this.filters).substring(1)), this.eoseTimeoutHandle = setTimeout(this.receivedEose.bind(this), this.eoseTimeout);
  }
  receivedEose() {
    this.eosed || (clearTimeout(this.eoseTimeoutHandle), this.eosed = !0, this.oneose?.());
  }
  close(e = "closed by caller") {
    if (!this.closed && this.relay.connected) {
      try {
        this.relay.send('["CLOSE",' + JSON.stringify(this.id) + "]");
      } catch (t) {
        if (!(t instanceof x0)) throw t;
      }
      this.closed = !0;
    }
    this.relay.openSubs.delete(this.id), this.relay.ongoingOperations--, this.relay.ongoingOperations === 0 && (this.relay.idleSince = Date.now()), this.onclose?.(e);
  }
}, A0;
try {
  A0 = WebSocket;
} catch {
}
var k0 = class extends E0 {
  constructor(e, t) {
    super(e, { verifyEvent: br, websocketImplementation: A0, ...t });
  }
  static async connect(e, t) {
    const n = new k0(e, t);
    return await n.connect(), n;
  }
}, qh;
try {
  qh = WebSocket;
} catch {
}
var Mo = {};
ye(Mo, {
  BECH32_REGEX: () => _0,
  Bech32MaxSize: () => bi,
  NostrTypeGuard: () => Kh,
  decode: () => vr,
  decodeNostrURI: () => Jh,
  encodeBytes: () => xr,
  naddrEncode: () => rf,
  neventEncode: () => nf,
  noteEncode: () => ef,
  nprofileEncode: () => tf,
  npubEncode: () => Xh,
  nsecEncode: () => Yh
});
var Kh = {
  isNProfile: (e) => /^nprofile1[a-z\d]+$/.test(e || ""),
  isNEvent: (e) => /^nevent1[a-z\d]+$/.test(e || ""),
  isNAddr: (e) => /^naddr1[a-z\d]+$/.test(e || ""),
  isNSec: (e) => /^nsec1[a-z\d]{58}$/.test(e || ""),
  isNPub: (e) => /^npub1[a-z\d]{58}$/.test(e || ""),
  isNote: (e) => /^note1[a-z\d]+$/.test(e || ""),
  isNcryptsec: (e) => /^ncryptsec1[a-z\d]+$/.test(e || "")
}, bi = 5e3, _0 = /[\x21-\x7E]{1,83}1[023456789acdefghjklmnpqrstuvwxyz]{6,}/;
function Qh(e) {
  const t = new Uint8Array(4);
  return t[0] = e >> 24 & 255, t[1] = e >> 16 & 255, t[2] = e >> 8 & 255, t[3] = e & 255, t;
}
function Jh(e) {
  try {
    return e.startsWith("nostr:") && (e = e.substring(6)), vr(e);
  } catch {
    return { type: "invalid", data: null };
  }
}
function vr(e) {
  let { prefix: t, words: n } = Qt.decode(e, bi), r = new Uint8Array(Qt.fromWords(n));
  switch (t) {
    case "nprofile": {
      let o = Dr(r);
      if (!o[0]?.[0])
        throw new Error("missing TLV 0 for nprofile");
      if (o[0][0].length !== 32)
        throw new Error("TLV 0 should be 32 bytes");
      return {
        type: "nprofile",
        data: {
          pubkey: pe(o[0][0]),
          relays: o[1] ? o[1].map((i) => nt.decode(i)) : []
        }
      };
    }
    case "nevent": {
      let o = Dr(r);
      if (!o[0]?.[0])
        throw new Error("missing TLV 0 for nevent");
      if (o[0][0].length !== 32)
        throw new Error("TLV 0 should be 32 bytes");
      if (o[2] && o[2][0].length !== 32)
        throw new Error("TLV 2 should be 32 bytes");
      if (o[3] && o[3][0].length !== 4)
        throw new Error("TLV 3 should be 4 bytes");
      return {
        type: "nevent",
        data: {
          id: pe(o[0][0]),
          relays: o[1] ? o[1].map((i) => nt.decode(i)) : [],
          author: o[2]?.[0] ? pe(o[2][0]) : void 0,
          kind: o[3]?.[0] ? parseInt(pe(o[3][0]), 16) : void 0
        }
      };
    }
    case "naddr": {
      let o = Dr(r);
      if (!o[0]?.[0])
        throw new Error("missing TLV 0 for naddr");
      if (!o[2]?.[0])
        throw new Error("missing TLV 2 for naddr");
      if (o[2][0].length !== 32)
        throw new Error("TLV 2 should be 32 bytes");
      if (!o[3]?.[0])
        throw new Error("missing TLV 3 for naddr");
      if (o[3][0].length !== 4)
        throw new Error("TLV 3 should be 4 bytes");
      return {
        type: "naddr",
        data: {
          identifier: nt.decode(o[0][0]),
          pubkey: pe(o[2][0]),
          kind: parseInt(pe(o[3][0]), 16),
          relays: o[1] ? o[1].map((i) => nt.decode(i)) : []
        }
      };
    }
    case "nsec":
      return { type: t, data: r };
    case "npub":
    case "note":
      return { type: t, data: pe(r) };
    default:
      throw new Error(`unknown prefix ${t}`);
  }
}
function Dr(e) {
  let t = {}, n = e;
  for (; n.length > 0; ) {
    let r = n[0], o = n[1], i = n.slice(2, 2 + o);
    if (n = n.slice(2 + o), i.length < o)
      throw new Error(`not enough data to read on TLV ${r}`);
    t[r] = t[r] || [], t[r].push(i);
  }
  return t;
}
function Yh(e) {
  return xr("nsec", e);
}
function Xh(e) {
  return xr("npub", ue(e));
}
function ef(e) {
  return xr("note", ue(e));
}
function Cr(e, t) {
  let n = Qt.toWords(t);
  return Qt.encode(e, n, bi);
}
function xr(e, t) {
  return Cr(e, t);
}
function tf(e) {
  let t = mi({
    0: [ue(e.pubkey)],
    1: (e.relays || []).map((n) => De.encode(n))
  });
  return Cr("nprofile", t);
}
function nf(e) {
  let t;
  e.kind !== void 0 && (t = Qh(e.kind));
  let n = mi({
    0: [ue(e.id)],
    1: (e.relays || []).map((r) => De.encode(r)),
    2: e.author ? [ue(e.author)] : [],
    3: t ? [new Uint8Array(t)] : []
  });
  return Cr("nevent", n);
}
function rf(e) {
  let t = new ArrayBuffer(4);
  new DataView(t).setUint32(0, e.kind, !1);
  let n = mi({
    0: [De.encode(e.identifier)],
    1: (e.relays || []).map((r) => De.encode(r)),
    2: [ue(e.pubkey)],
    3: [new Uint8Array(t)]
  });
  return Cr("naddr", n);
}
function mi(e) {
  let t = [];
  return Object.entries(e).reverse().forEach(([n, r]) => {
    r.forEach((o) => {
      let i = new Uint8Array(o.length + 2);
      i.set([parseInt(n)], 0), i.set([o.length], 1), i.set(o, 2), t.push(i);
    });
  }), Be(...t);
}
var Bo = {};
ye(Bo, {
  decrypt: () => of,
  encrypt: () => S0
});
function S0(e, t, n) {
  const r = e instanceof Uint8Array ? e : ue(e), o = ni.getSharedSecret(r, ue("02" + t)), i = L0(o);
  let s = Uint8Array.from(nn(16)), c = De.encode(n), a = t0(i, s).encrypt(c), h = mt.encode(new Uint8Array(a)), w = mt.encode(new Uint8Array(s.buffer));
  return `${h}?iv=${w}`;
}
function of(e, t, n) {
  const r = e instanceof Uint8Array ? e : ue(e);
  let [o, i] = n.split("?iv="), s = ni.getSharedSecret(r, ue("02" + t)), c = L0(s), a = mt.decode(i), h = mt.decode(o), w = t0(c, a).decrypt(h);
  return nt.decode(w);
}
function L0(e) {
  return e.slice(1, 33);
}
var sf = {};
ye(sf, {
  NIP05_REGEX: () => vi,
  isNip05: () => af,
  isValid: () => df,
  queryProfile: () => T0,
  searchDomain: () => lf,
  useFetchImplementation: () => cf
});
var vi = /^(?:([\w.+-]+)@)?([\w_-]+(\.[\w_-]+)+)$/, af = (e) => vi.test(e || ""), Er;
try {
  Er = fetch;
} catch {
}
function cf(e) {
  Er = e;
}
async function lf(e, t = "") {
  try {
    const n = `https://${e}/.well-known/nostr.json?name=${t}`, r = await Er(n, { redirect: "manual" });
    if (r.status !== 200)
      throw Error("Wrong response code");
    return (await r.json()).names;
  } catch {
    return {};
  }
}
async function T0(e) {
  const t = e.match(vi);
  if (!t)
    return null;
  const [, n = "_", r] = t;
  try {
    const o = `https://${r}/.well-known/nostr.json?name=${n}`, i = await Er(o, { redirect: "manual" });
    if (i.status !== 200)
      throw Error("Wrong response code");
    const s = await i.json(), c = s.names[n];
    return c ? { pubkey: c, relays: s.relays?.[c] } : null;
  } catch {
    return null;
  }
}
async function df(e, t) {
  const n = await T0(t);
  return n ? n.pubkey === e : !1;
}
var uf = {};
ye(uf, {
  parse: () => hf
});
function hf(e) {
  const t = {
    reply: void 0,
    root: void 0,
    mentions: [],
    profiles: [],
    quotes: []
  };
  let n, r;
  for (let o = e.tags.length - 1; o >= 0; o--) {
    const i = e.tags[o];
    if (i[0] === "e" && i[1]) {
      const [s, c, a, h, w] = i, g = {
        id: c,
        relays: a ? [a] : [],
        author: w
      };
      if (h === "root") {
        t.root = g;
        continue;
      }
      if (h === "reply") {
        t.reply = g;
        continue;
      }
      if (h === "mention") {
        t.mentions.push(g);
        continue;
      }
      n ? r = g : n = g, t.mentions.push(g);
      continue;
    }
    if (i[0] === "q" && i[1]) {
      const [s, c, a] = i;
      t.quotes.push({
        id: c,
        relays: a ? [a] : []
      });
    }
    if (i[0] === "p" && i[1]) {
      t.profiles.push({
        pubkey: i[1],
        relays: i[2] ? [i[2]] : []
      });
      continue;
    }
  }
  return t.root || (t.root = r || n || t.reply), t.reply || (t.reply = n || t.root), [t.reply, t.root].forEach((o) => {
    if (!o)
      return;
    let i = t.mentions.indexOf(o);
    if (i !== -1 && t.mentions.splice(i, 1), o.author) {
      let s = t.profiles.find((c) => c.pubkey === o.author);
      s && s.relays && (o.relays || (o.relays = []), s.relays.forEach((c) => {
        o.relays?.indexOf(c) === -1 && o.relays.push(c);
      }), s.relays = o.relays);
    }
  }), t.mentions.forEach((o) => {
    if (o.author) {
      let i = t.profiles.find((s) => s.pubkey === o.author);
      i && i.relays && (o.relays || (o.relays = []), i.relays.forEach((s) => {
        o.relays.indexOf(s) === -1 && o.relays.push(s);
      }), i.relays = o.relays);
    }
  }), t;
}
var ff = {};
ye(ff, {
  fetchRelayInformation: () => gf,
  useFetchImplementation: () => pf
});
var M0;
try {
  M0 = fetch;
} catch {
}
function pf(e) {
  M0 = e;
}
async function gf(e) {
  return await (await fetch(e.replace("ws://", "http://").replace("wss://", "https://"), {
    headers: { Accept: "application/nostr+json" }
  })).json();
}
var wf = {};
ye(wf, {
  getPow: () => yf,
  minePow: () => mf
});
function yf(e) {
  let t = 0;
  for (let n = 0; n < 64; n += 8) {
    const r = parseInt(e.substring(n, n + 8), 16);
    if (r === 0)
      t += 32;
    else {
      t += Math.clz32(r);
      break;
    }
  }
  return t;
}
function bf(e) {
  let t = 0;
  for (let n = 0; n < e.length; n++) {
    const r = e[n];
    if (r === 0)
      t += 8;
    else {
      t += Math.clz32(r) - 24;
      break;
    }
  }
  return t;
}
function mf(e, t) {
  let n = 0;
  const r = e, o = ["nonce", n.toString(), t.toString()];
  for (r.tags.push(o); ; ) {
    const i = Math.floor((/* @__PURE__ */ new Date()).getTime() / 1e3);
    i !== r.created_at && (n = 0, r.created_at = i), o[1] = (++n).toString();
    const s = Ke(
      De.encode(JSON.stringify([0, r.pubkey, r.created_at, r.kind, r.tags, r.content]))
    );
    if (bf(s) >= t) {
      r.id = pe(s);
      break;
    }
  }
  return r;
}
var vf = {};
ye(vf, {
  unwrapEvent: () => Bf,
  unwrapManyEvents: () => Rf,
  wrapEvent: () => F0,
  wrapManyEvents: () => Mf
});
var Cf = {};
ye(Cf, {
  createRumor: () => H0,
  createSeal: () => D0,
  createWrap: () => Z0,
  unwrapEvent: () => ki,
  unwrapManyEvents: () => W0,
  wrapEvent: () => sr,
  wrapManyEvents: () => Lf
});
var fn = {};
ye(fn, {
  decrypt: () => Ai,
  encrypt: () => Ei,
  getConversationKey: () => Ci,
  v2: () => _f
});
var B0 = 1, R0 = 65535;
function Ci(e, t) {
  const n = ni.getSharedSecret(e, ue("02" + t)).subarray(1, 33);
  return ou(Ke, n, De.encode("nip44-v2"));
}
function N0(e, t) {
  const n = iu(Ke, e, t, 76);
  return {
    chacha_key: n.subarray(0, 32),
    chacha_nonce: n.subarray(32, 44),
    hmac_key: n.subarray(44, 76)
  };
}
function xi(e) {
  if (!Number.isSafeInteger(e) || e < 1)
    throw new Error("expected positive integer");
  if (e <= 32)
    return 32;
  const t = 1 << Math.floor(Math.log2(e - 1)) + 1, n = t <= 256 ? 32 : t / 8;
  return n * (Math.floor((e - 1) / n) + 1);
}
function xf(e) {
  if (!Number.isSafeInteger(e) || e < B0 || e > R0)
    throw new Error("invalid plaintext size: must be between 1 and 65535 bytes");
  const t = new Uint8Array(2);
  return new DataView(t.buffer).setUint16(0, e, !1), t;
}
function Ef(e) {
  const t = De.encode(e), n = t.length, r = xf(n), o = new Uint8Array(xi(n) - n);
  return Be(r, t, o);
}
function Af(e) {
  const t = new DataView(e.buffer).getUint16(0), n = e.subarray(2, 2 + t);
  if (t < B0 || t > R0 || n.length !== t || e.length !== 2 + xi(t))
    throw new Error("invalid padding");
  return nt.decode(n);
}
function $0(e, t, n) {
  if (n.length !== 32)
    throw new Error("AAD associated data must be 32 bytes");
  const r = Be(n, t);
  return Tn(Ke, e, r);
}
function kf(e) {
  if (typeof e != "string")
    throw new Error("payload must be a valid string");
  const t = e.length;
  if (t < 132 || t > 87472)
    throw new Error("invalid payload length: " + t);
  if (e[0] === "#")
    throw new Error("unknown encryption version");
  let n;
  try {
    n = mt.decode(e);
  } catch (i) {
    throw new Error("invalid base64: " + i.message);
  }
  const r = n.length;
  if (r < 99 || r > 65603)
    throw new Error("invalid data length: " + r);
  const o = n[0];
  if (o !== 2)
    throw new Error("unknown encryption version " + o);
  return {
    nonce: n.subarray(1, 33),
    ciphertext: n.subarray(33, -32),
    mac: n.subarray(-32)
  };
}
function Ei(e, t, n = nn(32)) {
  const { chacha_key: r, chacha_nonce: o, hmac_key: i } = N0(t, n), s = Ef(e), c = o0(r, o, s), a = $0(i, c, n);
  return mt.encode(Be(new Uint8Array([2]), n, c, a));
}
function Ai(e, t) {
  const { nonce: n, ciphertext: r, mac: o } = kf(e), { chacha_key: i, chacha_nonce: s, hmac_key: c } = N0(t, n), a = $0(c, r, n);
  if (!Od(a, o))
    throw new Error("invalid MAC");
  const h = o0(i, s, r);
  return Af(h);
}
var _f = {
  utils: {
    getConversationKey: Ci,
    calcPaddedLen: xi
  },
  encrypt: Ei,
  decrypt: Ai
}, Sf = 2880 * 60, I0 = () => Math.round(Date.now() / 1e3), U0 = () => Math.round(I0() - Math.random() * Sf), O0 = (e, t) => Ci(e, t), P0 = (e, t, n) => Ei(JSON.stringify(e), O0(t, n)), bs = (e, t) => JSON.parse(Ai(e.content, O0(t, e.pubkey)));
function H0(e, t) {
  const n = {
    created_at: I0(),
    content: "",
    tags: [],
    ...e,
    pubkey: Yt(t)
  };
  return n.id = gn(n), n;
}
function D0(e, t, n) {
  return Fe(
    {
      kind: l0,
      content: P0(e, t, n),
      created_at: U0(),
      tags: []
    },
    t
  );
}
function Z0(e, t) {
  const n = ui();
  return Fe(
    {
      kind: w0,
      content: P0(e, n, t),
      created_at: U0(),
      tags: [["p", t]]
    },
    n
  );
}
function sr(e, t, n) {
  const r = H0(e, t), o = D0(r, t, n);
  return Z0(o, n);
}
function Lf(e, t, n) {
  if (!n || n.length === 0)
    throw new Error("At least one recipient is required.");
  const r = Yt(t), o = [sr(e, t, r)];
  return n.forEach((i) => {
    o.push(sr(e, t, i));
  }), o;
}
function ki(e, t) {
  const n = bs(e, t);
  return bs(n, t);
}
function W0(e, t) {
  let n = [];
  return e.forEach((r) => {
    n.push(ki(r, t));
  }), n.sort((r, o) => r.created_at - o.created_at), n;
}
function Tf(e, t, n, r) {
  const o = {
    created_at: Math.ceil(Date.now() / 1e3),
    kind: d0,
    tags: [],
    content: t
  };
  return (Array.isArray(e) ? e : [e]).forEach(({ publicKey: s, relayUrl: c }) => {
    o.tags.push(c ? ["p", s, c] : ["p", s]);
  }), r && o.tags.push(["e", r.eventId, r.relayUrl || "", "reply"]), n && o.tags.push(["subject", n]), o;
}
function F0(e, t, n, r, o) {
  const i = Tf(t, n, r, o);
  return sr(i, e, t.publicKey);
}
function Mf(e, t, n, r, o) {
  if (!t || t.length === 0)
    throw new Error("At least one recipient is required.");
  return [{ publicKey: Yt(e) }, ...t].map(
    (s) => F0(e, s, n, r, o)
  );
}
var Bf = ki, Rf = W0, Nf = {};
ye(Nf, {
  finishRepostEvent: () => $f,
  getRepostedEvent: () => If,
  getRepostedEventPointer: () => V0
});
function $f(e, t, n, r) {
  let o;
  const i = [...e.tags ?? [], ["e", t.id, n], ["p", t.pubkey]];
  return t.kind === c0 ? o = pi : (o = wi, i.push(["k", String(t.kind)])), Fe(
    {
      kind: o,
      tags: i,
      content: e.content === "" || t.tags?.find((s) => s[0] === "-") ? "" : JSON.stringify(t),
      created_at: e.created_at
    },
    r
  );
}
function V0(e) {
  if (![pi, wi].includes(e.kind))
    return;
  let t, n;
  for (let r = e.tags.length - 1; r >= 0 && (t === void 0 || n === void 0); r--) {
    const o = e.tags[r];
    o.length >= 2 && (o[0] === "e" && t === void 0 ? t = o : o[0] === "p" && n === void 0 && (n = o));
  }
  if (t !== void 0)
    return {
      id: t[1],
      relays: [t[2], n?.[2]].filter((r) => typeof r == "string"),
      author: n?.[1]
    };
}
function If(e, { skipVerification: t } = {}) {
  const n = V0(e);
  if (n === void 0 || e.content === "")
    return;
  let r;
  try {
    r = JSON.parse(e.content);
  } catch {
    return;
  }
  if (r.id === n.id && !(!t && !br(r)))
    return r;
}
var Uf = {};
ye(Uf, {
  NOSTR_URI_REGEX: () => _i,
  parse: () => Pf,
  test: () => Of
});
var _i = new RegExp(`nostr:(${_0.source})`);
function Of(e) {
  return typeof e == "string" && new RegExp(`^${_i.source}$`).test(e);
}
function Pf(e) {
  const t = e.match(new RegExp(`^${_i.source}$`));
  if (!t)
    throw new Error(`Invalid Nostr URI: ${e}`);
  return {
    uri: t[0],
    value: t[1],
    decoded: vr(t[1])
  };
}
var Hf = {};
ye(Hf, {
  finishReactionEvent: () => Df,
  getReactedEventPointer: () => Zf
});
function Df(e, t, n) {
  const r = t.tags.filter((o) => o.length >= 2 && (o[0] === "e" || o[0] === "p"));
  return Fe(
    {
      ...e,
      kind: gi,
      tags: [...e.tags ?? [], ...r, ["e", t.id], ["p", t.pubkey]],
      content: e.content ?? "+"
    },
    n
  );
}
function Zf(e) {
  if (e.kind !== gi)
    return;
  let t, n;
  for (let r = e.tags.length - 1; r >= 0 && (t === void 0 || n === void 0); r--) {
    const o = e.tags[r];
    o.length >= 2 && (o[0] === "e" && t === void 0 ? t = o : o[0] === "p" && n === void 0 && (n = o));
  }
  if (!(t === void 0 || n === void 0))
    return {
      id: t[1],
      relays: [t[2], n[2]].filter((r) => r !== void 0),
      author: n[1]
    };
}
var Wf = {};
ye(Wf, {
  parse: () => Vf
});
var Zr = /\W/m, ms = /[^\w\/] |[^\w\/]$|$|,| /m, Ff = 42;
function* Vf(e) {
  let t = [];
  if (typeof e != "string") {
    for (let i = 0; i < e.tags.length; i++) {
      const s = e.tags[i];
      s[0] === "emoji" && s.length >= 3 && t.push({ type: "emoji", shortcode: s[1], url: s[2] });
    }
    e = e.content;
  }
  const n = e.length;
  let r = 0, o = 0;
  e:
    for (; o < n; ) {
      const i = e.indexOf(":", o), s = e.indexOf("#", o);
      if (i === -1 && s === -1)
        break e;
      if (i === -1 || s >= 0 && s < i) {
        if (s === 0 || e[s - 1].match(Zr)) {
          const c = e.slice(s + 1, s + Ff).match(Zr), a = c ? s + 1 + c.index : n;
          yield { type: "text", text: e.slice(r, s) }, yield { type: "hashtag", value: e.slice(s + 1, a) }, o = a, r = o;
          continue e;
        }
        o = s + 1;
        continue e;
      }
      if (e.slice(i - 5, i) === "nostr") {
        const c = e.slice(i + 60).match(Zr), a = c ? i + 60 + c.index : n;
        try {
          let h, { data: w, type: g } = vr(e.slice(i + 1, a));
          switch (g) {
            case "npub":
              h = { pubkey: w };
              break;
            case "note":
              h = { id: w };
              break;
            case "nsec":
              o = a + 1;
              continue;
            default:
              h = w;
          }
          r !== i - 5 && (yield { type: "text", text: e.slice(r, i - 5) }), yield { type: "reference", pointer: h }, o = a, r = o;
          continue e;
        } catch {
          o = i + 1;
          continue e;
        }
      } else if (e.slice(i - 5, i) === "https" || e.slice(i - 4, i) === "http") {
        const c = e.slice(i + 4).match(ms), a = c ? i + 4 + c.index : n, h = e[i - 1] === "s" ? 5 : 4;
        try {
          let w = new URL(e.slice(i - h, a));
          if (w.hostname.indexOf(".") === -1)
            throw new Error("invalid url");
          if (r !== i - h && (yield { type: "text", text: e.slice(r, i - h) }), /\.(png|jpe?g|gif|webp|heic|svg)$/i.test(w.pathname)) {
            yield { type: "image", url: w.toString() }, o = a, r = o;
            continue e;
          }
          if (/\.(mp4|avi|webm|mkv|mov)$/i.test(w.pathname)) {
            yield { type: "video", url: w.toString() }, o = a, r = o;
            continue e;
          }
          if (/\.(mp3|aac|ogg|opus|wav|flac)$/i.test(w.pathname)) {
            yield { type: "audio", url: w.toString() }, o = a, r = o;
            continue e;
          }
          yield { type: "url", url: w.toString() }, o = a, r = o;
          continue e;
        } catch {
          o = a + 1;
          continue e;
        }
      } else if (e.slice(i - 3, i) === "wss" || e.slice(i - 2, i) === "ws") {
        const c = e.slice(i + 4).match(ms), a = c ? i + 4 + c.index : n, h = e[i - 1] === "s" ? 3 : 2;
        try {
          let w = new URL(e.slice(i - h, a));
          if (w.hostname.indexOf(".") === -1)
            throw new Error("invalid ws url");
          r !== i - h && (yield { type: "text", text: e.slice(r, i - h) }), yield { type: "relay", url: w.toString() }, o = a, r = o;
          continue e;
        } catch {
          o = a + 1;
          continue e;
        }
      } else {
        for (let c = 0; c < t.length; c++) {
          const a = t[c];
          if (e[i + a.shortcode.length + 1] === ":" && e.slice(i + 1, i + a.shortcode.length + 1) === a.shortcode) {
            r !== i && (yield { type: "text", text: e.slice(r, i) }), yield a, o = i + a.shortcode.length + 2, r = o;
            continue e;
          }
        }
        o = i + 1;
        continue e;
      }
    }
  r !== n && (yield { type: "text", text: e.slice(r) });
}
var Gf = {};
ye(Gf, {
  channelCreateEvent: () => jf,
  channelHideMessageEvent: () => Kf,
  channelMessageEvent: () => qf,
  channelMetadataEvent: () => zf,
  channelMuteUserEvent: () => Qf
});
var jf = (e, t) => {
  let n;
  if (typeof e.content == "object")
    n = JSON.stringify(e.content);
  else if (typeof e.content == "string")
    n = e.content;
  else
    return;
  return Fe(
    {
      kind: u0,
      tags: [...e.tags ?? []],
      content: n,
      created_at: e.created_at
    },
    t
  );
}, zf = (e, t) => {
  let n;
  if (typeof e.content == "object")
    n = JSON.stringify(e.content);
  else if (typeof e.content == "string")
    n = e.content;
  else
    return;
  return Fe(
    {
      kind: h0,
      tags: [["e", e.channel_create_event_id], ...e.tags ?? []],
      content: n,
      created_at: e.created_at
    },
    t
  );
}, qf = (e, t) => {
  const n = [["e", e.channel_create_event_id, e.relay_url, "root"]];
  return e.reply_to_channel_message_event_id && n.push(["e", e.reply_to_channel_message_event_id, e.relay_url, "reply"]), Fe(
    {
      kind: f0,
      tags: [...n, ...e.tags ?? []],
      content: e.content,
      created_at: e.created_at
    },
    t
  );
}, Kf = (e, t) => {
  let n;
  if (typeof e.content == "object")
    n = JSON.stringify(e.content);
  else if (typeof e.content == "string")
    n = e.content;
  else
    return;
  return Fe(
    {
      kind: p0,
      tags: [["e", e.channel_message_event_id], ...e.tags ?? []],
      content: n,
      created_at: e.created_at
    },
    t
  );
}, Qf = (e, t) => {
  let n;
  if (typeof e.content == "object")
    n = JSON.stringify(e.content);
  else if (typeof e.content == "string")
    n = e.content;
  else
    return;
  return Fe(
    {
      kind: g0,
      tags: [["p", e.pubkey_to_mute], ...e.tags ?? []],
      content: n,
      created_at: e.created_at
    },
    t
  );
}, Jf = {};
ye(Jf, {
  EMOJI_SHORTCODE_REGEX: () => G0,
  matchAll: () => Yf,
  regex: () => Si,
  replaceAll: () => Xf
});
var G0 = /:(\w+):/, Si = () => new RegExp(`\\B${G0.source}\\B`, "g");
function* Yf(e) {
  const t = e.matchAll(Si());
  for (const n of t)
    try {
      const [r, o] = n;
      yield {
        shortcode: r,
        name: o,
        start: n.index,
        end: n.index + r.length
      };
    } catch {
    }
}
function Xf(e, t) {
  return e.replaceAll(Si(), (n, r) => t({
    shortcode: n,
    name: r
  }));
}
var e4 = {};
ye(e4, {
  useFetchImplementation: () => t4,
  validateGithub: () => n4
});
var Li;
try {
  Li = fetch;
} catch {
}
function t4(e) {
  Li = e;
}
async function n4(e, t, n) {
  try {
    return await (await Li(`https://gist.github.com/${t}/${n}/raw`)).text() === `Verifying that I control the following Nostr public key: ${e}`;
  } catch {
    return !1;
  }
}
var r4 = {};
ye(r4, {
  makeNwcRequestEvent: () => i4,
  parseConnectionString: () => o4
});
function o4(e) {
  const { host: t, pathname: n, searchParams: r } = new URL(e), o = n || t, i = r.get("relay"), s = r.get("secret");
  if (!o || !i || !s)
    throw new Error("invalid connection string");
  return { pubkey: o, relay: i, secret: s };
}
async function i4(e, t, n) {
  const o = S0(t, e, JSON.stringify({
    method: "pay_invoice",
    params: {
      invoice: n
    }
  })), i = {
    kind: b0,
    created_at: Math.round(Date.now() / 1e3),
    content: o,
    tags: [["p", e]]
  };
  return Fe(i, t);
}
var s4 = {};
ye(s4, {
  normalizeIdentifier: () => a4
});
function a4(e) {
  return e = e.trim().toLowerCase(), e = e.normalize("NFKC"), Array.from(e).map((t) => /\p{Letter}/u.test(t) || /\p{Number}/u.test(t) ? t : "-").join("");
}
var c4 = {};
ye(c4, {
  getSatoshisAmountFromBolt11: () => p4,
  getZapEndpoint: () => d4,
  makeZapReceipt: () => f4,
  makeZapRequest: () => u4,
  useFetchImplementation: () => l4,
  validateZapRequest: () => h4
});
var Ti;
try {
  Ti = fetch;
} catch {
}
function l4(e) {
  Ti = e;
}
async function d4(e) {
  try {
    let t = "", { lud06: n, lud16: r } = JSON.parse(e.content);
    if (r) {
      let [s, c] = r.split("@");
      t = new URL(`/.well-known/lnurlp/${s}`, `https://${c}`).toString();
    } else if (n) {
      let { words: s } = Qt.decode(n, 1e3), c = Qt.fromWords(s);
      t = nt.decode(c);
    } else
      return null;
    let i = await (await Ti(t)).json();
    if (i.allowsNostr && i.nostrPubkey)
      return i.callback;
  } catch {
  }
  return null;
}
function u4(e) {
  let t = {
    kind: 9734,
    created_at: Math.round(Date.now() / 1e3),
    content: e.comment || "",
    tags: [
      ["p", "pubkey" in e ? e.pubkey : e.event.pubkey],
      ["amount", e.amount.toString()],
      ["relays", ...e.relays]
    ]
  };
  if ("event" in e) {
    if (t.tags.push(["e", e.event.id]), hi(e.event.kind)) {
      const n = ["a", `${e.event.kind}:${e.event.pubkey}:`];
      t.tags.push(n);
    } else if (fi(e.event.kind)) {
      let n = e.event.tags.find(([o, i]) => o === "d" && i);
      if (!n)
        throw new Error("d tag not found or is empty");
      const r = ["a", `${e.event.kind}:${e.event.pubkey}:${n[1]}`];
      t.tags.push(r);
    }
    t.tags.push(["k", e.event.kind.toString()]);
  }
  return t;
}
function h4(e) {
  let t;
  try {
    t = JSON.parse(e);
  } catch {
    return "Invalid zap request JSON.";
  }
  if (!li(t))
    return "Zap request is not a valid Nostr event.";
  if (!br(t))
    return "Invalid signature on zap request.";
  let n = t.tags.find(([i, s]) => i === "p" && s);
  if (!n)
    return "Zap request doesn't have a 'p' tag.";
  if (!n[1].match(/^[a-f0-9]{64}$/))
    return "Zap request 'p' tag is not valid hex.";
  let r = t.tags.find(([i, s]) => i === "e" && s);
  return r && !r[1].match(/^[a-f0-9]{64}$/) ? "Zap request 'e' tag is not valid hex." : t.tags.find(([i, s]) => i === "relays" && s) ? null : "Zap request doesn't have a 'relays' tag.";
}
function f4({
  zapRequest: e,
  preimage: t,
  bolt11: n,
  paidAt: r
}) {
  let o = JSON.parse(e), i = o.tags.filter(([c]) => c === "e" || c === "p" || c === "a"), s = {
    kind: 9735,
    created_at: Math.round(r.getTime() / 1e3),
    content: "",
    tags: [...i, ["P", o.pubkey], ["bolt11", n], ["description", e]]
  };
  return t && s.tags.push(["preimage", t]), s;
}
function p4(e) {
  if (e.length < 50)
    return 0;
  e = e.substring(0, 50);
  const t = e.lastIndexOf("1");
  if (t === -1)
    return 0;
  const n = e.substring(0, t);
  if (!n.startsWith("lnbc"))
    return 0;
  const r = n.substring(4);
  if (r.length < 1)
    return 0;
  const o = r[r.length - 1], i = o.charCodeAt(0) - 48, s = i >= 0 && i <= 9;
  let c = r.length - 1;
  if (s && c++, c < 1)
    return 0;
  const a = parseInt(r.substring(0, c));
  switch (o) {
    case "m":
      return a * 1e5;
    case "u":
      return a * 100;
    case "n":
      return a / 10;
    case "p":
      return a / 1e4;
    default:
      return a * 1e8;
  }
}
var g4 = {};
ye(g4, {
  Negentropy: () => z0,
  NegentropyStorageVector: () => b4,
  NegentropySync: () => m4
});
var Wr = 97, zt = 32, j0 = 16, xt = {
  Skip: 0,
  Fingerprint: 1,
  IdList: 2
}, et = class {
  _raw;
  length;
  constructor(e) {
    typeof e == "number" ? (this._raw = new Uint8Array(e), this.length = 0) : e instanceof Uint8Array ? (this._raw = new Uint8Array(e), this.length = e.length) : (this._raw = new Uint8Array(512), this.length = 0);
  }
  unwrap() {
    return this._raw.subarray(0, this.length);
  }
  get capacity() {
    return this._raw.byteLength;
  }
  extend(e) {
    if (e instanceof et && (e = e.unwrap()), typeof e.length != "number")
      throw Error("bad length");
    const t = e.length + this.length;
    if (this.capacity < t) {
      const n = this._raw, r = Math.max(this.capacity * 2, t);
      this._raw = new Uint8Array(r), this._raw.set(n);
    }
    this._raw.set(e, this.length), this.length += e.length;
  }
  shift() {
    const e = this._raw[0];
    return this._raw = this._raw.subarray(1), this.length--, e;
  }
  shiftN(e = 1) {
    const t = this._raw.subarray(0, e);
    return this._raw = this._raw.subarray(e), this.length -= e, t;
  }
};
function In(e) {
  let t = 0;
  for (; ; ) {
    if (e.length === 0)
      throw Error("parse ends prematurely");
    let n = e.shift();
    if (t = t << 7 | n & 127, (n & 128) === 0)
      break;
  }
  return t;
}
function Xe(e) {
  if (e === 0)
    return new et(new Uint8Array([0]));
  let t = [];
  for (; e !== 0; )
    t.push(e & 127), e >>>= 7;
  t.reverse();
  for (let n = 0; n < t.length - 1; n++)
    t[n] |= 128;
  return new et(new Uint8Array(t));
}
function w4(e) {
  return qn(e, 1)[0];
}
function qn(e, t) {
  if (e.length < t)
    throw Error("parse ends prematurely");
  return e.shiftN(t);
}
var y4 = class {
  buf;
  constructor() {
    this.setToZero();
  }
  setToZero() {
    this.buf = new Uint8Array(zt);
  }
  add(e) {
    let t = 0, n = 0, r = new DataView(this.buf.buffer), o = new DataView(e.buffer);
    for (let i = 0; i < 8; i++) {
      let s = i * 4, c = r.getUint32(s, !0), a = o.getUint32(s, !0), h = c;
      h += t, h += a, h > 4294967295 && (n = 1), r.setUint32(s, h & 4294967295, !0), t = n, n = 0;
    }
  }
  negate() {
    let e = new DataView(this.buf.buffer);
    for (let n = 0; n < 8; n++) {
      let r = n * 4;
      e.setUint32(r, ~e.getUint32(r, !0));
    }
    let t = new Uint8Array(zt);
    t[0] = 1, this.add(t);
  }
  getFingerprint(e) {
    let t = new et();
    return t.extend(this.buf), t.extend(Xe(e)), Ke(t.unwrap()).subarray(0, j0);
  }
}, b4 = class {
  items;
  sealed;
  constructor() {
    this.items = [], this.sealed = !1;
  }
  insert(e, t) {
    if (this.sealed)
      throw Error("already sealed");
    const n = ue(t);
    if (n.byteLength !== zt)
      throw Error("bad id size for added item");
    this.items.push({ timestamp: e, id: n });
  }
  seal() {
    if (this.sealed)
      throw Error("already sealed");
    this.sealed = !0, this.items.sort(Fr);
    for (let e = 1; e < this.items.length; e++)
      if (Fr(this.items[e - 1], this.items[e]) === 0)
        throw Error("duplicate item inserted");
  }
  unseal() {
    this.sealed = !1;
  }
  size() {
    return this._checkSealed(), this.items.length;
  }
  getItem(e) {
    if (this._checkSealed(), e >= this.items.length)
      throw Error("out of range");
    return this.items[e];
  }
  iterate(e, t, n) {
    this._checkSealed(), this._checkBounds(e, t);
    for (let r = e; r < t && n(this.items[r], r); ++r)
      ;
  }
  findLowerBound(e, t, n) {
    return this._checkSealed(), this._checkBounds(e, t), this._binarySearch(this.items, e, t, (r) => Fr(r, n) < 0);
  }
  fingerprint(e, t) {
    let n = new y4();
    return n.setToZero(), this.iterate(e, t, (r) => (n.add(r.id), !0)), n.getFingerprint(t - e);
  }
  _checkSealed() {
    if (!this.sealed)
      throw Error("not sealed");
  }
  _checkBounds(e, t) {
    if (e > t || t > this.items.length)
      throw Error("bad range");
  }
  _binarySearch(e, t, n, r) {
    let o = n - t;
    for (; o > 0; ) {
      let i = t, s = Math.floor(o / 2);
      i += s, r(e[i]) ? (t = ++i, o -= s + 1) : o = s;
    }
    return t;
  }
}, z0 = class {
  storage;
  frameSizeLimit;
  lastTimestampIn;
  lastTimestampOut;
  constructor(e, t = 6e4) {
    if (t < 4096)
      throw Error("frameSizeLimit too small");
    this.storage = e, this.frameSizeLimit = t, this.lastTimestampIn = 0, this.lastTimestampOut = 0;
  }
  _bound(e, t) {
    return { timestamp: e, id: t || new Uint8Array(0) };
  }
  initiate() {
    let e = new et();
    return e.extend(new Uint8Array([Wr])), this.splitRange(0, this.storage.size(), this._bound(Number.MAX_VALUE), e), pe(e.unwrap());
  }
  reconcile(e, t, n) {
    const r = new et(ue(e));
    this.lastTimestampIn = this.lastTimestampOut = 0;
    let o = new et();
    o.extend(new Uint8Array([Wr]));
    let i = w4(r);
    if (i < 96 || i > 111)
      throw Error("invalid negentropy protocol version byte");
    if (i !== Wr)
      throw Error("unsupported negentropy protocol version requested: " + (i - 96));
    let s = this.storage.size(), c = this._bound(0), a = 0, h = !1;
    for (; r.length !== 0; ) {
      let w = new et(), g = () => {
        h && (h = !1, w.extend(this.encodeBound(c)), w.extend(Xe(xt.Skip)));
      }, v = this.decodeBound(r), b = In(r), C = a, L = this.storage.findLowerBound(a, s, v);
      if (b === xt.Skip)
        h = !0;
      else if (b === xt.Fingerprint) {
        let M = qn(r, j0), I = this.storage.fingerprint(C, L);
        q0(M, I) !== 0 ? (g(), this.splitRange(C, L, v, w)) : h = !0;
      } else if (b === xt.IdList) {
        let M = In(r), I = {};
        for (let U = 0; U < M; U++) {
          let q = qn(r, zt);
          I[pe(q)] = q;
        }
        if (h = !0, this.storage.iterate(C, L, (U) => {
          let q = U.id;
          const Q = pe(q);
          return I[Q] ? delete I[pe(q)] : t?.(Q), !0;
        }), n)
          for (let U of Object.values(I))
            n(pe(U));
      } else
        throw Error("unexpected mode");
      if (this.exceededFrameSizeLimit(o.length + w.length)) {
        let M = this.storage.fingerprint(L, s);
        o.extend(this.encodeBound(this._bound(Number.MAX_VALUE))), o.extend(Xe(xt.Fingerprint)), o.extend(M);
        break;
      } else
        o.extend(w);
      a = L, c = v;
    }
    return o.length === 1 ? null : pe(o.unwrap());
  }
  splitRange(e, t, n, r) {
    let o = t - e, i = 16;
    if (o < i * 2)
      r.extend(this.encodeBound(n)), r.extend(Xe(xt.IdList)), r.extend(Xe(o)), this.storage.iterate(e, t, (s) => (r.extend(s.id), !0));
    else {
      let s = Math.floor(o / i), c = o % i, a = e;
      for (let h = 0; h < i; h++) {
        let w = s + (h < c ? 1 : 0), g = this.storage.fingerprint(a, a + w);
        a += w;
        let v;
        if (a === t)
          v = n;
        else {
          let b, C;
          this.storage.iterate(a - 1, a + 1, (L, M) => (M === a - 1 ? b = L : C = L, !0)), v = this.getMinimalBound(b, C);
        }
        r.extend(this.encodeBound(v)), r.extend(Xe(xt.Fingerprint)), r.extend(g);
      }
    }
  }
  exceededFrameSizeLimit(e) {
    return e > this.frameSizeLimit - 200;
  }
  decodeTimestampIn(e) {
    let t = In(e);
    return t = t === 0 ? Number.MAX_VALUE : t - 1, this.lastTimestampIn === Number.MAX_VALUE || t === Number.MAX_VALUE ? (this.lastTimestampIn = Number.MAX_VALUE, Number.MAX_VALUE) : (t += this.lastTimestampIn, this.lastTimestampIn = t, t);
  }
  decodeBound(e) {
    let t = this.decodeTimestampIn(e), n = In(e);
    if (n > zt)
      throw Error("bound key too long");
    let r = qn(e, n);
    return { timestamp: t, id: r };
  }
  encodeTimestampOut(e) {
    if (e === Number.MAX_VALUE)
      return this.lastTimestampOut = Number.MAX_VALUE, Xe(0);
    let t = e;
    return e -= this.lastTimestampOut, this.lastTimestampOut = t, Xe(e + 1);
  }
  encodeBound(e) {
    let t = new et();
    return t.extend(this.encodeTimestampOut(e.timestamp)), t.extend(Xe(e.id.length)), t.extend(e.id), t;
  }
  getMinimalBound(e, t) {
    if (t.timestamp !== e.timestamp)
      return this._bound(t.timestamp);
    {
      let n = 0, r = t.id, o = e.id;
      for (let i = 0; i < zt && r[i] === o[i]; i++)
        n++;
      return this._bound(t.timestamp, t.id.subarray(0, n + 1));
    }
  }
};
function q0(e, t) {
  for (let n = 0; n < e.byteLength; n++) {
    if (e[n] < t[n])
      return -1;
    if (e[n] > t[n])
      return 1;
  }
  return e.byteLength > t.byteLength ? 1 : e.byteLength < t.byteLength ? -1 : 0;
}
function Fr(e, t) {
  return e.timestamp === t.timestamp ? q0(e.id, t.id) : e.timestamp - t.timestamp;
}
var m4 = class {
  relay;
  storage;
  neg;
  filter;
  subscription;
  onhave;
  onneed;
  constructor(e, t, n, r = {}) {
    this.relay = e, this.storage = t, this.neg = new z0(t), this.onhave = r.onhave, this.onneed = r.onneed, this.filter = n, this.subscription = this.relay.prepareSubscription([{}], { label: r.label || "negentropy" }), this.subscription.oncustom = (o) => {
      switch (o[0]) {
        case "NEG-MSG": {
          o.length < 3 && console.warn(`got invalid NEG-MSG from ${this.relay.url}: ${o}`);
          try {
            const i = this.neg.reconcile(o[2], this.onhave, this.onneed);
            i ? this.relay.send(`["NEG-MSG", "${this.subscription.id}", "${i}"]`) : (this.close(), r.onclose?.());
          } catch (i) {
            console.error("negentropy reconcile error:", i), r?.onclose?.(`reconcile error: ${i}`);
          }
          break;
        }
        case "NEG-CLOSE": {
          const i = o[2];
          console.warn("negentropy error:", i), r.onclose?.(i);
          break;
        }
        case "NEG-ERR":
          r.onclose?.();
      }
    };
  }
  async start() {
    const e = this.neg.initiate();
    this.relay.send(`["NEG-OPEN","${this.subscription.id}",${JSON.stringify(this.filter)},"${e}"]`);
  }
  close() {
    this.relay.send(`["NEG-CLOSE","${this.subscription.id}"]`), this.subscription.close();
  }
}, v4 = {};
ye(v4, {
  getToken: () => C4,
  hashPayload: () => Mi,
  unpackEventFromToken: () => Q0,
  validateEvent: () => n2,
  validateEventKind: () => Y0,
  validateEventMethodTag: () => e2,
  validateEventPayloadTag: () => t2,
  validateEventTimestamp: () => J0,
  validateEventUrlTag: () => X0,
  validateToken: () => x4
});
var K0 = "Nostr ";
async function C4(e, t, n, r = !1, o) {
  const i = {
    kind: yi,
    tags: [
      ["u", e],
      ["method", t]
    ],
    created_at: Math.round((/* @__PURE__ */ new Date()).getTime() / 1e3),
    content: ""
  };
  o && i.tags.push(["payload", Mi(o)]);
  const s = await n(i);
  return (r ? K0 : "") + mt.encode(De.encode(JSON.stringify(s)));
}
async function x4(e, t, n) {
  const r = await Q0(e).catch((i) => {
    throw i;
  });
  return await n2(r, t, n).catch((i) => {
    throw i;
  });
}
async function Q0(e) {
  if (!e)
    throw new Error("Missing token");
  e = e.replace(K0, "");
  const t = nt.decode(mt.decode(e));
  if (!t || t.length === 0 || !t.startsWith("{"))
    throw new Error("Invalid token");
  return JSON.parse(t);
}
function J0(e) {
  return e.created_at ? Math.round((/* @__PURE__ */ new Date()).getTime() / 1e3) - e.created_at < 60 : !1;
}
function Y0(e) {
  return e.kind === yi;
}
function X0(e, t) {
  const n = e.tags.find((r) => r[0] === "u");
  return n ? n.length > 0 && n[1] === t : !1;
}
function e2(e, t) {
  const n = e.tags.find((r) => r[0] === "method");
  return n ? n.length > 0 && n[1].toLowerCase() === t.toLowerCase() : !1;
}
function Mi(e) {
  const t = Ke(De.encode(JSON.stringify(e)));
  return pe(t);
}
function t2(e, t) {
  const n = e.tags.find((o) => o[0] === "payload");
  if (!n)
    return !1;
  const r = Mi(t);
  return n.length > 0 && n[1] === r;
}
async function n2(e, t, n, r) {
  if (!br(e))
    throw new Error("Invalid nostr event, signature invalid");
  if (!Y0(e))
    throw new Error("Invalid nostr event, kind invalid");
  if (!J0(e))
    throw new Error("Invalid nostr event, created_at timestamp invalid");
  if (!X0(e, t))
    throw new Error("Invalid nostr event, url tag invalid");
  if (!e2(e, n))
    throw new Error("Invalid nostr event, method tag invalid");
  if (r && typeof r == "object" && Object.keys(r).length > 0 && !t2(e, r))
    throw new Error("Invalid nostr event, payload tag does not match request body hash");
  return !0;
}
class Ct extends Error {
  constructor(t, n) {
    super(t), this.code = n;
  }
}
class r2 extends Ct {
}
class E4 extends Ct {
}
class o2 extends Ct {
}
class vs extends o2 {
}
class Cs extends o2 {
}
class xs extends Ct {
}
class Es extends Ct {
}
class Vr extends Ct {
}
class A4 extends Ct {
}
class k4 extends Ct {
}
function Un(e) {
  try {
    e.indexOf("://") === -1 && (e = "wss://" + e);
    const t = new URL(e);
    return t.protocol === "http:" ? t.protocol = "ws:" : t.protocol === "https:" && (t.protocol = "wss:"), t.pathname = t.pathname.replace(/\/+/g, "/"), t.pathname.endsWith("/") && (t.pathname = t.pathname.slice(0, -1)), (t.port === "80" && t.protocol === "ws:" || t.port === "443" && t.protocol === "wss:") && (t.port = ""), t.searchParams.sort(), t.hash = "", t.toString();
  } catch {
    throw new Error(`Invalid URL: ${e}`);
  }
}
const _4 = 1e3, S4 = 300 * 1e3, L4 = 1e3;
class i2 {
  constructor() {
    this.relays = /* @__PURE__ */ new Map(), this.enablePing = !1, this.maxWaitForConnection = 3e3;
  }
  async ensureRelay(t, n) {
    t = Un(t);
    let r = this.relays.get(t);
    r || (r = new k0(t, {
      enablePing: this.enablePing,
      enableReconnect: !1
    }), r.onclose = () => {
      this.relays.delete(t);
    }, this.relays.set(t, r));
    try {
      await r.connect({
        timeout: n?.connectionTimeout,
        abort: n?.abort
      });
    } catch (o) {
      throw this.relays.delete(t), o;
    }
    return r;
  }
  close(t) {
    t.map(Un).forEach((n) => {
      this.relays.get(n)?.close(), this.relays.delete(n);
    });
  }
  subscribe(t, n, r) {
    const o = [], i = /* @__PURE__ */ new Set();
    for (const b of t) {
      const C = Un(b);
      i.has(C) || (i.add(C), o.push(C));
    }
    let s = !1;
    const c = /* @__PURE__ */ new Map(), a = /* @__PURE__ */ new Set(), h = /* @__PURE__ */ new Set(), w = (b) => {
      if (h.has(b))
        return !0;
      if (h.add(b), h.size > L4) {
        const C = h.values().next().value;
        C !== void 0 && h.delete(C);
      }
      return !1;
    }, g = (b) => {
      if (s)
        return Promise.resolve();
      const C = Math.min(_4 * 2 ** b, S4);
      return new Promise((L) => {
        const M = setTimeout(() => {
          a.delete(I), L();
        }, C), I = () => {
          clearTimeout(M), a.delete(I), L();
        };
        a.add(I);
      });
    }, v = async (b) => {
      let C = 0;
      for (; !s; ) {
        let L;
        try {
          L = await this.ensureRelay(b, {
            connectionTimeout: this.maxWaitForConnection,
            abort: r.abort
          });
        } catch (I) {
          if (s)
            return;
          const U = I?.message || String(I);
          r.ondisconnect?.(b, U), await g(C++);
          continue;
        }
        if (s)
          return;
        r.onconnect?.(b), C = 0;
        const M = await new Promise((I) => {
          const U = L.subscribe([n], {
            eoseTimeout: 1,
            // 1ms (if 0 is provided, uses default of 4400ms)
            onevent: r.onevent,
            onclose: I,
            abort: r.abort,
            alreadyHaveEvent: w
          });
          c.set(b, U);
        });
        if (c.delete(b), s)
          return;
        r.ondisconnect?.(b, M), await g(C++);
      }
    };
    return o.forEach((b) => {
      v(b);
    }), {
      close(b) {
        s || (s = !0, a.forEach((C) => C()), a.clear(), c.forEach((C) => C.close(b)), c.clear());
      }
    };
  }
  publish(t, n, r) {
    return t.map(Un).map(async (o, i, s) => {
      if (s.indexOf(o) !== i)
        return Promise.reject("duplicate url");
      let c;
      try {
        c = await this.ensureRelay(o, {
          connectionTimeout: this.maxWaitForConnection,
          abort: r?.abort
        });
      } catch (a) {
        return "connection failure: " + String(a);
      }
      return c.publish(n);
    });
  }
  listConnectionStatus() {
    const t = /* @__PURE__ */ new Map();
    return this.relays.forEach((n, r) => t.set(r, n.connected)), t;
  }
  destroy() {
    this.relays.forEach((t) => t.close()), this.relays = /* @__PURE__ */ new Map();
  }
}
const As = /^[0-9a-f]{64}$/;
class vt {
  static parseWalletConnectUrl(t, n = !1) {
    t = t.replace("nostrwalletconnect://", "http://").replace("nostr+walletconnect://", "http://").replace("nostrwalletconnect:", "http://").replace("nostr+walletconnect:", "http://");
    const r = new URL(t), o = r.searchParams.getAll("relay"), i = {
      walletPubkey: r.host,
      relayUrls: o
    }, s = r.searchParams.get("secret");
    s && (i.secret = s);
    const c = r.searchParams.get("lud16");
    if (c && (i.lud16 = c), !i.walletPubkey)
      throw new Error("Invalid NWC URL: missing wallet pubkey");
    if (!As.test(i.walletPubkey))
      throw new Error("Invalid NWC URL: invalid wallet pubkey");
    if (!i.relayUrls?.length)
      throw new Error("Invalid NWC URL: no relay URLs provided");
    for (const a of i.relayUrls)
      try {
        new URL(a);
      } catch {
        throw new Error(`Invalid relay URL: ${a}`);
      }
    if (n && !i.secret)
      throw new Error("Invalid NWC URL: missing secret parameter");
    if (i.secret && !As.test(i.secret))
      throw new Error("Invalid NWC URL: invalid secret");
    return i;
  }
  constructor(t) {
    t && t.nostrWalletConnectUrl && (t = {
      ...vt.parseWalletConnectUrl(t.nostrWalletConnectUrl, t.requireSecret),
      ...t
    }), this.options = {
      ...t || {}
    }, this.relayUrls = this.options.relayUrls, this.logger = t?.logger || wl, this.pool = new i2(), this.options.secret && (this.secret = this.options.secret.toLowerCase().startsWith("nsec") ? Mo.decode(this.options.secret).data : this.options.secret), this.lud16 = this.options.lud16, this.walletPubkey = this.options.walletPubkey.toLowerCase().startsWith("npub") ? Mo.decode(this.options.walletPubkey).data : this.options.walletPubkey;
  }
  get nostrWalletConnectUrl() {
    return this.getNostrWalletConnectUrl();
  }
  getNostrWalletConnectUrl(t = !0) {
    let n = `nostr+walletconnect://${this.walletPubkey}?relay=${this.relayUrls.join("&relay=")}&pubkey=${this.publicKey}`;
    return t && (n = `${n}&secret=${this.secret}`), this.lud16 && (n = `${n}&lud16=${this.lud16}`), n;
  }
  get connected() {
    const t = Array.from(this.pool.listConnectionStatus().values());
    return !!t.length && t.includes(!0);
  }
  get publicKey() {
    if (!this.secret)
      throw new Error("Missing secret key");
    return Yt(ue(this.secret));
  }
  get encryptionType() {
    if (!this._encryptionType)
      throw new Error("Missing encryption or version");
    return this._encryptionType;
  }
  getPublicKey() {
    return Promise.resolve(this.publicKey);
  }
  signEvent(t) {
    if (!this.secret)
      throw new Error("Missing secret key");
    return Promise.resolve(Fe(t, ue(this.secret)));
  }
  getEventHash(t) {
    return gn(t);
  }
  close() {
    return this.pool.close(this.relayUrls);
  }
  async encrypt(t, n) {
    if (!this.secret)
      throw new Error("Missing secret");
    let r;
    if (this.encryptionType === "nip04")
      r = await Bo.encrypt(this.secret, t, n);
    else {
      const o = fn.getConversationKey(ue(this.secret), t);
      r = fn.encrypt(n, o);
    }
    return r;
  }
  async decrypt(t, n) {
    if (!this.secret)
      throw new Error("Missing secret");
    let r;
    if (this.encryptionType === "nip04")
      r = await Bo.decrypt(this.secret, t, n);
    else {
      const o = fn.getConversationKey(ue(this.secret), t);
      r = fn.decrypt(n, o);
    }
    return r;
  }
  static getAuthorizationUrl(t, n = {}, r) {
    if (t.indexOf("/#/") > -1)
      throw new Error("hash router paths not supported");
    const o = new URL(t);
    return n.name && o.searchParams.set("name", n.name), o.searchParams.set("pubkey", r), n.returnTo && o.searchParams.set("return_to", n.returnTo), n.budgetRenewal && o.searchParams.set("budget_renewal", n.budgetRenewal), n.expiresAt && o.searchParams.set("expires_at", Math.floor(n.expiresAt.getTime() / 1e3).toString()), n.maxAmount && o.searchParams.set("max_amount", n.maxAmount.toString()), n.requestMethods && o.searchParams.set("request_methods", n.requestMethods.join(" ")), n.notificationTypes && o.searchParams.set("notification_types", n.notificationTypes.join(" ")), n.isolated && o.searchParams.set("isolated", "true"), n.metadata && o.searchParams.set("metadata", JSON.stringify(n.metadata)), o;
  }
  /**
   * create a new client-initiated NWC connection via HTTP deeplink
   *
   * @param authorizationBasePath the deeplink path e.g. https://my.albyhub.com/apps/new
   * @param options configure the created app (e.g. the name, budget, expiration)
   * @param secret optionally pass a secret, otherwise one will be generated.
   */
  static fromAuthorizationUrl(t, n = {}, r) {
    r = r || pe(ui()), n.name || (n.name = document.location.host);
    const o = this.getAuthorizationUrl(t, n, Yt(ue(r))), i = 600, s = 400, c = window.outerHeight / 2 + window.screenY - i / 2, a = window.outerWidth / 2 + window.screenX - s / 2;
    return new Promise((h, w) => {
      const g = window.open(o.toString(), `${document.title} - Wallet Connect`, `height=${i},width=${s},top=${c},left=${a}`);
      if (!g) {
        w(new Error("failed to execute window.open"));
        return;
      }
      const v = () => {
        g && g.closed && (clearInterval(C), window.removeEventListener("message", b), w(new Error("Popup closed")));
      }, b = (L) => {
        const M = L.data;
        if (M && M.type === "nwc:success" && L.origin === `${o.protocol}//${o.host}`) {
          if (!M.relayUrls && M.relayUrl && (M.relayUrls = [M.relayUrl]), !M.relayUrls) {
            w(new Error("no relayUrls or relayUrl in response"));
            return;
          }
          if (!M.walletPubkey) {
            w(new Error("no walletPubkey in response"));
            return;
          }
          h(new vt({
            relayUrls: M.relayUrls,
            walletPubkey: M.walletPubkey,
            secret: r,
            lud16: M.lud16
          })), clearInterval(C), window.removeEventListener("message", b), g && g.close();
        }
      }, C = setInterval(v, 500);
      window.addEventListener("message", b);
    });
  }
  async getWalletServiceInfo() {
    await this._checkConnected();
    const t = await new Promise((c, a) => {
      let h = !1;
      const w = setTimeout(() => {
        h || (h = !0, g.close(), a(new Error("no info event (kind 13194) returned from relay")));
      }, 1e4), g = this.pool.subscribe(this.relayUrls, {
        kinds: [13194],
        limit: 1,
        authors: [this.walletPubkey]
      }, {
        onevent: (v) => {
          h || (h = !0, clearTimeout(w), g.close(), c(v));
        }
      });
    }), n = t.content, r = t.tags.find((c) => c[0] === "notifications"), o = t.tags.find((c) => c[0] === "v"), i = t.tags.find((c) => c[0] === "encryption");
    let s = ["nip04"];
    return o && o[1].includes("1.0") && s.push("nip44_v2"), i && (s = i[1].split(" ")), {
      encryptions: s,
      // delimiter is " " per spec, but Alby NWC originally returned ","
      capabilities: n.split(/[ |,]/g),
      notifications: r?.[1]?.split(" ") || []
    };
  }
  async getInfo() {
    try {
      return await this.executeNip47Request("get_info", {}, (n) => !!n.methods, { replyTimeout: 1e4 });
    } catch (t) {
      throw console.error("Failed to request get_info", t), t;
    }
  }
  async getBudget() {
    try {
      return await this.executeNip47Request("get_budget", {}, (n) => n !== void 0, { replyTimeout: 1e4 });
    } catch (t) {
      throw console.error("Failed to request get_budget", t), t;
    }
  }
  async getBalance() {
    try {
      return await this.executeNip47Request("get_balance", {}, (n) => n.balance !== void 0, { replyTimeout: 1e4 });
    } catch (t) {
      throw console.error("Failed to request get_balance", t), t;
    }
  }
  async payInvoice(t) {
    try {
      return await this.executeNip47Request("pay_invoice", t, (r) => !!r);
    } catch (n) {
      throw console.error("Failed to request pay_invoice", n), n;
    }
  }
  async payKeysend(t) {
    try {
      return await this.executeNip47Request("pay_keysend", t, (r) => !!r.preimage);
    } catch (n) {
      throw console.error("Failed to request pay_keysend", n), n;
    }
  }
  async signMessage(t) {
    try {
      return await this.executeNip47Request("sign_message", t, (r) => r.message === t.message && !!r.signature);
    } catch (n) {
      throw console.error("Failed to request sign_message", n), n;
    }
  }
  async createConnection(t) {
    try {
      return await this.executeNip47Request("create_connection", t, (r) => !!r.wallet_pubkey);
    } catch (n) {
      throw console.error("Failed to request create_connection", n), n;
    }
  }
  async multiPayInvoice(t) {
    try {
      return {
        invoices: await this.executeMultiNip47Request("multi_pay_invoice", t, t.invoices.length, (r) => !!r.preimage),
        // TODO: error handling
        errors: []
      };
    } catch (n) {
      throw console.error("Failed to request multi_pay_invoice", n), n;
    }
  }
  async multiPayKeysend(t) {
    try {
      return {
        keysends: await this.executeMultiNip47Request("multi_pay_keysend", t, t.keysends.length, (r) => !!r.preimage),
        // TODO: error handling
        errors: []
      };
    } catch (n) {
      throw console.error("Failed to request multi_pay_keysend", n), n;
    }
  }
  async makeInvoice(t) {
    try {
      if (!t.amount)
        throw new Error("No amount specified");
      return await this.executeNip47Request("make_invoice", t, (r) => !!r.invoice);
    } catch (n) {
      throw console.error("Failed to request make_invoice", n), n;
    }
  }
  async makeHoldInvoice(t) {
    try {
      if (!t.amount)
        throw new Error("No amount specified");
      if (!t.payment_hash)
        throw new Error("No payment hash specified");
      return await this.executeNip47Request("make_hold_invoice", t, (r) => !!r.invoice);
    } catch (n) {
      throw console.error("Failed to request make_hold_invoice", n), n;
    }
  }
  async settleHoldInvoice(t) {
    try {
      return await this.executeNip47Request("settle_hold_invoice", t, (r) => !!r);
    } catch (n) {
      throw console.error("Failed to request settle_hold_invoice", n), n;
    }
  }
  async cancelHoldInvoice(t) {
    try {
      return await this.executeNip47Request("cancel_hold_invoice", t, (r) => !!r);
    } catch (n) {
      throw console.error("Failed to request cancel_hold_invoice", n), n;
    }
  }
  async lookupInvoice(t) {
    try {
      return await this.executeNip47Request("lookup_invoice", t, (r) => !!r.invoice);
    } catch (n) {
      throw console.error("Failed to request lookup_invoice", n), n;
    }
  }
  async listTransactions(t) {
    try {
      return await this.executeNip47Request("list_transactions", t, (r) => !!r.transactions, { replyTimeout: 1e4 });
    } catch (n) {
      throw console.error("Failed to request list_transactions", n), n;
    }
  }
  async subscribeNotifications(t, n) {
    this.logger.debug("checking connection to relays"), await this._checkConnected(), await this._selectEncryptionType(), this.logger.debug("subscribing to relays");
    const r = this.pool.subscribe(this.relayUrls, {
      kinds: [...this.encryptionType === "nip04" ? [23196] : [23197]],
      authors: [this.walletPubkey],
      "#p": [this.publicKey]
    }, {
      onevent: async (o) => {
        let i;
        try {
          i = await this.decrypt(this.walletPubkey, o.content);
        } catch (c) {
          console.error("failed to decrypt request event content", c);
          return;
        }
        let s;
        try {
          s = JSON.parse(i);
        } catch (c) {
          console.error("Failed to parse decrypted event content", c);
          return;
        }
        s.notification ? (!n || n.indexOf(s.notification_type) > -1) && t(s) : console.error("No notification in response", s);
      },
      onconnect: (o) => {
        this.logger.debug("relay connected", o);
      },
      ondisconnect: (o, i) => {
        this.logger.debug("relay disconnected", o, i);
      }
    });
    return this.logger.debug("subscribed to relays"), () => {
      r?.close();
    };
  }
  async executeNip47Request(t, n, r, o) {
    return await this._checkConnected(), await this._selectEncryptionType(), new Promise((i, s) => {
      (async () => {
        const c = {
          method: t,
          params: n
        }, a = await this.encrypt(this.walletPubkey, JSON.stringify(c)), h = {
          kind: 23194,
          created_at: Math.floor(Date.now() / 1e3),
          tags: [
            ["p", this.walletPubkey],
            // TODO: Remove version tag after 01-06-2025
            ["v", this.encryptionType === "nip44_v2" ? "1.0" : "0.0"],
            ["encryption", this.encryptionType]
          ],
          content: a
        }, w = await this.signEvent(h), g = this.pool.subscribe(this.relayUrls, {
          kinds: [23195],
          authors: [this.walletPubkey],
          "#e": [w.id]
        }, {
          onevent: async (M) => {
            clearTimeout(b), g.close();
            const I = await this.decrypt(this.walletPubkey, M.content);
            let U;
            try {
              U = JSON.parse(I);
            } catch {
              clearTimeout(b), g.close(), s(new Es("failed to deserialize response", "INTERNAL"));
              return;
            }
            U.result ? r(U.result) ? i(U.result) : (clearTimeout(b), g.close(), s(new Vr("response from NWC failed validation: " + JSON.stringify(U.result), "INTERNAL"))) : (clearTimeout(b), g.close(), s(new E4(U.error?.message || "unknown Error", U.error?.code || "INTERNAL")));
          }
        });
        function v() {
          g.close(), s(new Cs(`reply timeout: event ${w.id}`, "INTERNAL"));
        }
        const b = setTimeout(v, o?.replyTimeout || 6e4);
        function C() {
          g.close(), s(new vs(`publish timeout: ${w.id}`, "INTERNAL"));
        }
        const L = setTimeout(C, o?.publishTimeout || 5e3);
        try {
          await Promise.any(this.pool.publish(this.relayUrls, w)), clearTimeout(L);
        } catch (M) {
          clearTimeout(L), s(new xs(`failed to publish: ${M}`, "INTERNAL"));
        }
      })();
    });
  }
  /**
   * @deprecated
   * multi- methods were removed from NIP-47.
   */
  async executeMultiNip47Request(t, n, r, o, i) {
    await this._checkConnected(), await this._selectEncryptionType();
    const s = [];
    return new Promise((c, a) => {
      (async () => {
        const h = {
          method: t,
          params: n
        }, w = await this.encrypt(this.walletPubkey, JSON.stringify(h)), g = {
          kind: 23194,
          created_at: Math.floor(Date.now() / 1e3),
          tags: [
            ["p", this.walletPubkey],
            // TODO: Remove version tag after 01-06-2025
            ["v", this.encryptionType === "nip44_v2" ? "1.0" : "0.0"],
            ["encryption", this.encryptionType]
          ],
          content: w
        }, v = await this.signEvent(g), b = this.pool.subscribe(this.relayUrls, {
          kinds: [23195],
          authors: [this.walletPubkey],
          "#e": [v.id]
        }, {
          onevent: async (U) => {
            const q = await this.decrypt(this.walletPubkey, U.content);
            let Q;
            try {
              Q = JSON.parse(q);
            } catch {
              clearTimeout(L), b.close(), a(new Es("failed to deserialize response", "INTERNAL"));
            }
            if (Q.result) {
              if (!o(Q.result)) {
                clearTimeout(L), b.close(), a(new Vr("Response from NWC failed validation: " + JSON.stringify(Q.result), "INTERNAL"));
                return;
              }
              const A = U.tags.find((_) => _[0] === "d")?.[1];
              if (A === void 0) {
                clearTimeout(L), b.close(), a(new Vr("No d tag found in response event", "INTERNAL"));
                return;
              }
              s.push({
                ...Q.result,
                dTag: A
              }), s.length === r && (clearTimeout(L), b.close(), c(s));
            } else
              clearTimeout(L), b.close(), a(new A4(Q.error?.message, Q.error?.code));
          }
        });
        function C() {
          b.close(), a(new Cs(`reply timeout: event ${v.id}`, "INTERNAL"));
        }
        const L = setTimeout(C, i?.replyTimeout || 6e4);
        function M() {
          b.close(), a(new vs(`Publish timeout: ${v.id}`, "INTERNAL"));
        }
        const I = setTimeout(M, i?.publishTimeout || 5e3);
        try {
          await Promise.any(this.pool.publish(this.relayUrls, v)), clearTimeout(I);
        } catch (U) {
          clearTimeout(I), a(new xs(`Failed to publish: ${U}`, "INTERNAL"));
        }
      })();
    });
  }
  async _checkConnected() {
    if (!this.secret)
      throw new Error("Missing secret key");
    if (!this.relayUrls)
      throw new Error("Missing relay url");
    try {
      await Promise.any(this.relayUrls.map((t) => this.pool.ensureRelay(t)));
    } catch (t) {
      throw console.error("failed to connect to any relay", t), new r2("Failed to connect to " + this.relayUrls.join(","), "OTHER");
    }
  }
  async _selectEncryptionType() {
    if (!this._encryptionType) {
      const t = await this.getWalletServiceInfo(), n = this._findPreferredEncryptionType(t.encryptions);
      if (!n)
        throw new k4("no compatible encryption or version found between wallet and client", "UNSUPPORTED_ENCRYPTION");
      n === "nip04" && console.warn("NIP-04 encryption is about to be deprecated. Please upgrade your wallet service to use NIP-44 instead."), this._encryptionType = n;
    }
  }
  _findPreferredEncryptionType(t) {
    return t.includes("nip44_v2") ? "nip44_v2" : t.includes("nip04") ? "nip04" : null;
  }
}
const T4 = {
  get_info: "getInfo",
  get_balance: "getBalance",
  make_invoice: "makeInvoice",
  pay_invoice: "sendPayment",
  pay_keysend: "payKeysend",
  lookup_invoice: "lookupInvoice",
  list_transactions: "listTransactions",
  multi_pay_invoice: "sendMultiPayment",
  multi_pay_keysend: "multiKeysend",
  sign_message: "signMessage"
};
class Ar {
  get options() {
    return this.client.options;
  }
  static async fromAuthorizationUrl(t, n = {}, r) {
    const o = await vt.fromAuthorizationUrl(t, n, r);
    return new Ar({
      client: o
    });
  }
  constructor(t) {
    this._enabled = !1, this.client = t?.client || new vt(t), this.subscribers = {};
  }
  on(t, n) {
    this.subscribers[t] = n;
  }
  notify(t, n) {
    const r = this.subscribers[t];
    r && r(n);
  }
  getPublicKey() {
    return this.client.getPublicKey();
  }
  signEvent(t) {
    return this.client.signEvent(t);
  }
  async enable() {
    this._enabled = !0;
  }
  close() {
    return this.client.close();
  }
  async getInfo() {
    await this.checkEnabled();
    const t = ["lightning", "nostr"], n = "Alby JS SDK";
    try {
      const r = await this.client.getInfo(), o = {
        methods: r.methods.map((i) => T4[i]),
        node: {
          alias: r.alias,
          pubkey: r.pubkey,
          color: r.color
        },
        supports: t,
        version: n
      };
      return this.notify("getInfo", o), o;
    } catch (r) {
      return console.error("Using minimal getInfo", r), {
        methods: ["sendPayment"],
        node: {},
        supports: t,
        version: n
      };
    }
  }
  async getBalance() {
    await this.checkEnabled();
    const t = await this.client.getBalance(), n = {
      // NWC uses msats - convert to sats for webln
      balance: Math.floor(t.balance / 1e3),
      currency: "sats"
    };
    return this.notify("getBalance", n), n;
  }
  async sendPayment(t) {
    await this.checkEnabled();
    const r = { preimage: (await this.client.payInvoice({ invoice: t })).preimage };
    return this.notify("sendPayment", r), r;
  }
  async sendPaymentAsync(t) {
    return await this.checkEnabled(), this.client.payInvoice({ invoice: t }), this.notify("sendPaymentAsync", {}), {};
  }
  async keysend(t) {
    await this.checkEnabled();
    const r = { preimage: (await this.client.payKeysend(ks(t))).preimage };
    return this.notify("keysend", r), r;
  }
  async signMessage(t) {
    await this.checkEnabled();
    const n = await this.client.signMessage({
      message: t
    }), r = {
      message: n.message,
      signature: n.signature
    };
    return this.notify("keysend", r), r;
  }
  async makeInvoice(t) {
    await this.checkEnabled();
    const n = typeof t == "object" ? t : void 0, r = +(n?.amount ?? t);
    if (!r)
      throw new Error("No amount specified");
    const i = { paymentRequest: (await this.client.makeInvoice({
      amount: r * 1e3,
      // NIP-47 uses msat
      description: n?.defaultMemo
      // TODO: support additional fields below
      //expiry: 86500,
      //description_hash: "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
    })).invoice };
    return this.notify("makeInvoice", i), i;
  }
  async lookupInvoice(t) {
    await this.checkEnabled();
    const n = await this.client.lookupInvoice({
      invoice: t.paymentRequest,
      payment_hash: t.paymentHash
    }), r = {
      preimage: n.preimage,
      paymentRequest: n.invoice,
      paid: !!n.settled_at
    };
    return this.notify("lookupInvoice", r), r;
  }
  async listTransactions(t) {
    await this.checkEnabled();
    const r = {
      transactions: (await this.client.listTransactions(t)).transactions.map(M4)
    };
    return this.notify("listTransactions", r), r;
  }
  // NOTE: this method may change - it has not been proposed to be added to the WebLN spec yet.
  async sendMultiPayment(t) {
    await this.checkEnabled();
    const r = {
      payments: (await this.client.multiPayInvoice({
        invoices: t.map((o, i) => ({
          invoice: o,
          id: i.toString()
        }))
      })).invoices.map((o) => {
        const i = t[parseInt(o.dTag)];
        if (!i)
          throw new Error("Could not find paymentRequest matching response d tag");
        return {
          paymentRequest: i,
          preimage: o.preimage
        };
      }),
      // TODO: error handling
      errors: []
    };
    return this.notify("sendMultiPayment", r), r;
  }
  // NOTE: this method may change - it has not been proposed to be added to the WebLN spec yet.
  async multiKeysend(t) {
    await this.checkEnabled();
    const r = {
      keysends: (await this.client.multiPayKeysend({
        keysends: t.map((o, i) => ({
          ...ks(o),
          id: i.toString()
        }))
      })).keysends.map((o) => {
        const i = t[parseInt(o.dTag)];
        if (!i)
          throw new Error("Could not find keysend matching response d tag");
        return {
          keysend: i,
          preimage: o.preimage
        };
      }),
      // TODO: error handling
      errors: []
    };
    return this.notify("multiKeysend", r), r;
  }
  // not-yet implemented WebLN interface methods
  lnurl(t) {
    throw new Error("Method not implemented.");
  }
  request(t, n) {
    throw new Error("Method not implemented.");
  }
  verifyMessage(t, n) {
    throw new Error("Method not implemented.");
  }
  async checkEnabled() {
    if (!this._enabled)
      throw new Error("please call enable() and await the promise before calling this function");
  }
}
function M4(e) {
  return {
    ...e,
    // NWC uses msats - convert to sats for webln
    amount: Math.floor(e.amount / 1e3),
    fees_paid: e.fees_paid ? Math.floor(e.fees_paid / 1e3) : 0
  };
}
function ks(e) {
  return {
    amount: +e.amount * 1e3,
    // NIP-47 uses msat
    pubkey: e.destination,
    tlv_records: e.customRecords ? Object.entries(e.customRecords).map((t) => ({
      type: parseInt(t[0]),
      value: Z2(new TextEncoder().encode(t[1]))
    })) : []
    // TODO: support optional preimage
    // preimage?: "123",
  };
}
class s2 {
  constructor(t) {
    if (this.appSecretKey = t.appSecretKey || pe(ui()), this.options = {
      ...t,
      appPubkey: Yt(ue(this.appSecretKey))
    }, !this.options.relayUrls)
      throw new Error("Missing relay urls");
    if (!this.options.requestMethods)
      throw new Error("Missing request methods");
    this.pool = new i2(), this.logger = t.logger || wl;
  }
  /**
   * returns the NWA connection URI which should be given to the wallet
   */
  get connectionUri() {
    return this.getConnectionUri();
  }
  /**
   * returns the NWA connection URI which should be given to the wallet
   * @param nwaSchemeSuffix open a specific wallet. e.g. "alby" will set the scheme to
   * nostr+walletauth+alby to ensure the link will be opened in an Alby wallet
   */
  getConnectionUri(t = "") {
    const n = new URLSearchParams({
      request_methods: this.options.requestMethods.join(" "),
      ...this.options.name ? { name: this.options.name } : {},
      ...this.options.icon ? { icon: this.options.icon } : {},
      ...this.options.returnTo ? { return_to: this.options.returnTo } : {},
      ...this.options.notificationTypes ? {
        notification_types: this.options.notificationTypes.join(" ")
      } : {},
      ...this.options.maxAmount ? { max_amount: this.options.maxAmount.toString() } : {},
      ...this.options.budgetRenewal ? { budget_renewal: this.options.budgetRenewal } : {},
      ...this.options.expiresAt ? { expires_at: this.options.expiresAt.toString() } : {},
      ...this.options.isolated ? { isolated: this.options.isolated.toString() } : {},
      ...this.options.metadata ? { metadata: JSON.stringify(this.options.metadata) } : {}
    });
    for (const r of this.options.relayUrls)
      n.append("relay", r);
    return `nostr+walletauth${t ? `+${t}` : ""}://${this.options.appPubkey}?${n.toString().replace(/\+/g, "%20")}`;
  }
  static parseWalletAuthUrl(t) {
    if (!t.startsWith("nostr+walletauth"))
      throw new Error("Unexpected scheme. Should be nostr+walletauth:// or nostr+walletauth+specificapp://");
    const n = t.indexOf(":");
    t = t.substring(n + 1), t.startsWith("//") && (t = t.substring(2)), t = "http://" + t;
    const r = new URL(t), o = r.host;
    if (o?.length !== 64)
      throw new Error("Incorrect app pubkey found in auth string");
    const i = r.searchParams.getAll("relay");
    if (!i)
      throw new Error("No relay URL found in auth string");
    const s = r.searchParams.get("request_methods")?.split(" ");
    if (!s?.length)
      throw new Error("No request methods found in auth string");
    const c = r.searchParams.get("notification_types")?.split(" "), a = r.searchParams.get("max_amount"), h = r.searchParams.get("expires_at"), w = r.searchParams.get("metadata");
    return {
      name: r.searchParams.get("name") || void 0,
      icon: r.searchParams.get("icon") || void 0,
      returnTo: r.searchParams.get("return_to") || void 0,
      relayUrls: i,
      appPubkey: o,
      requestMethods: s,
      notificationTypes: c,
      budgetRenewal: r.searchParams.get("budget_renewal"),
      expiresAt: h ? parseInt(h) : void 0,
      maxAmount: a ? parseInt(a) : void 0,
      isolated: r.searchParams.get("isolated") === "true",
      metadata: w ? JSON.parse(w) : void 0
    };
  }
  /**
   * Waits for a new app connection to be created via NWA (https://github.com/nostr-protocol/nips/pull/851)
   *
   * @returns a new NWCClient
   */
  async subscribe(t) {
    this.logger.debug("checking connection to relays"), await this._checkConnected(), this.logger.debug("subscribing to info event");
    const n = this.pool.subscribe(this.options.relayUrls, {
      kinds: [13194],
      // NIP-47 info event
      "#p": [this.options.appPubkey]
    }, {
      onevent: async (r) => {
        const o = new vt({
          relayUrls: this.options.relayUrls,
          secret: this.appSecretKey,
          walletPubkey: r.pubkey
        });
        try {
          const i = await o.getInfo();
          o.options.lud16 = i.lud16, o.lud16 = i.lud16;
        } catch (i) {
          console.error("failed to fetch get_info", i);
        }
        t.onSuccess(o), n?.close();
      },
      onconnect: (r) => {
        this.logger.debug("relay connected", r);
      },
      ondisconnect: (r, o) => {
        this.logger.debug("relay disconnected", r, o);
      }
    });
    return {
      unsub: () => {
        n?.close();
      }
    };
  }
  close() {
    return this.pool.close(this.options.relayUrls);
  }
  async _checkConnected() {
    if (!this.appSecretKey)
      throw new Error("Missing secret key");
    if (!this.options.relayUrls)
      throw new Error("Missing relay urls");
    try {
      await Promise.any(this.options.relayUrls.map((t) => this.pool.ensureRelay(t)));
    } catch (t) {
      throw console.error("failed to connect to any relay", t), new r2("Failed to connect to " + this.options.relayUrls.join(","), "OTHER");
    }
  }
}
const B4 = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68;
if (!B4)
  throw new Error("Non little-endian hardware is not supported");
var Gr = {}, _s;
function R4() {
  return _s || (_s = 1, (function(e) {
    /*! scure-base - MIT License (c) 2022 Paul Miller (paulmillr.com) */
    Object.defineProperty(e, "__esModule", { value: !0 }), e.bytes = e.stringToBytes = e.str = e.bytesToString = e.hex = e.utf8 = e.bech32m = e.bech32 = e.base58check = e.base58xmr = e.base58xrp = e.base58flickr = e.base58 = e.base64url = e.base64 = e.base32crockford = e.base32hex = e.base32 = e.base16 = e.utils = e.assertNumber = void 0;
    function t(d) {
      if (!Number.isSafeInteger(d))
        throw new Error(`Wrong integer: ${d}`);
    }
    e.assertNumber = t;
    function n(...d) {
      const l = (f, y) => (x) => f(y(x)), u = Array.from(d).reverse().reduce((f, y) => f ? l(f, y.encode) : y.encode, void 0), p = d.reduce((f, y) => f ? l(f, y.decode) : y.decode, void 0);
      return { encode: u, decode: p };
    }
    function r(d) {
      return {
        encode: (l) => {
          if (!Array.isArray(l) || l.length && typeof l[0] != "number")
            throw new Error("alphabet.encode input should be an array of numbers");
          return l.map((u) => {
            if (t(u), u < 0 || u >= d.length)
              throw new Error(`Digit index outside alphabet: ${u} (alphabet: ${d.length})`);
            return d[u];
          });
        },
        decode: (l) => {
          if (!Array.isArray(l) || l.length && typeof l[0] != "string")
            throw new Error("alphabet.decode input should be array of strings");
          return l.map((u) => {
            if (typeof u != "string")
              throw new Error(`alphabet.decode: not string element=${u}`);
            const p = d.indexOf(u);
            if (p === -1)
              throw new Error(`Unknown letter: "${u}". Allowed: ${d}`);
            return p;
          });
        }
      };
    }
    function o(d = "") {
      if (typeof d != "string")
        throw new Error("join separator should be string");
      return {
        encode: (l) => {
          if (!Array.isArray(l) || l.length && typeof l[0] != "string")
            throw new Error("join.encode input should be array of strings");
          for (let u of l)
            if (typeof u != "string")
              throw new Error(`join.encode: non-string input=${u}`);
          return l.join(d);
        },
        decode: (l) => {
          if (typeof l != "string")
            throw new Error("join.decode input should be string");
          return l.split(d);
        }
      };
    }
    function i(d, l = "=") {
      if (t(d), typeof l != "string")
        throw new Error("padding chr should be string");
      return {
        encode(u) {
          if (!Array.isArray(u) || u.length && typeof u[0] != "string")
            throw new Error("padding.encode input should be array of strings");
          for (let p of u)
            if (typeof p != "string")
              throw new Error(`padding.encode: non-string input=${p}`);
          for (; u.length * d % 8; )
            u.push(l);
          return u;
        },
        decode(u) {
          if (!Array.isArray(u) || u.length && typeof u[0] != "string")
            throw new Error("padding.encode input should be array of strings");
          for (let f of u)
            if (typeof f != "string")
              throw new Error(`padding.decode: non-string input=${f}`);
          let p = u.length;
          if (p * d % 8)
            throw new Error("Invalid padding: string should have whole number of bytes");
          for (; p > 0 && u[p - 1] === l; p--)
            if (!((p - 1) * d % 8))
              throw new Error("Invalid padding: string has too much padding");
          return u.slice(0, p);
        }
      };
    }
    function s(d) {
      if (typeof d != "function")
        throw new Error("normalize fn should be function");
      return { encode: (l) => l, decode: (l) => d(l) };
    }
    function c(d, l, u) {
      if (l < 2)
        throw new Error(`convertRadix: wrong from=${l}, base cannot be less than 2`);
      if (u < 2)
        throw new Error(`convertRadix: wrong to=${u}, base cannot be less than 2`);
      if (!Array.isArray(d))
        throw new Error("convertRadix: data should be array");
      if (!d.length)
        return [];
      let p = 0;
      const f = [], y = Array.from(d);
      for (y.forEach((x) => {
        if (t(x), x < 0 || x >= l)
          throw new Error(`Wrong integer: ${x}`);
      }); ; ) {
        let x = 0, O = !0;
        for (let R = p; R < y.length; R++) {
          const P = y[R], S = l * x + P;
          if (!Number.isSafeInteger(S) || l * x / l !== x || S - P !== l * x)
            throw new Error("convertRadix: carry overflow");
          if (x = S % u, y[R] = Math.floor(S / u), !Number.isSafeInteger(y[R]) || y[R] * u + x !== S)
            throw new Error("convertRadix: carry overflow");
          if (O)
            y[R] ? O = !1 : p = R;
          else continue;
        }
        if (f.push(x), O)
          break;
      }
      for (let x = 0; x < d.length - 1 && d[x] === 0; x++)
        f.push(0);
      return f.reverse();
    }
    const a = (d, l) => l ? a(l, d % l) : d, h = (d, l) => d + (l - a(d, l));
    function w(d, l, u, p) {
      if (!Array.isArray(d))
        throw new Error("convertRadix2: data should be array");
      if (l <= 0 || l > 32)
        throw new Error(`convertRadix2: wrong from=${l}`);
      if (u <= 0 || u > 32)
        throw new Error(`convertRadix2: wrong to=${u}`);
      if (h(l, u) > 32)
        throw new Error(`convertRadix2: carry overflow from=${l} to=${u} carryBits=${h(l, u)}`);
      let f = 0, y = 0;
      const x = 2 ** u - 1, O = [];
      for (const R of d) {
        if (t(R), R >= 2 ** l)
          throw new Error(`convertRadix2: invalid data word=${R} from=${l}`);
        if (f = f << l | R, y + l > 32)
          throw new Error(`convertRadix2: carry overflow pos=${y} from=${l}`);
        for (y += l; y >= u; y -= u)
          O.push((f >> y - u & x) >>> 0);
        f &= 2 ** y - 1;
      }
      if (f = f << u - y & x, !p && y >= l)
        throw new Error("Excess padding");
      if (!p && f)
        throw new Error(`Non-zero padding: ${f}`);
      return p && y > 0 && O.push(f >>> 0), O;
    }
    function g(d) {
      return t(d), {
        encode: (l) => {
          if (!(l instanceof Uint8Array))
            throw new Error("radix.encode input should be Uint8Array");
          return c(Array.from(l), 2 ** 8, d);
        },
        decode: (l) => {
          if (!Array.isArray(l) || l.length && typeof l[0] != "number")
            throw new Error("radix.decode input should be array of strings");
          return Uint8Array.from(c(l, d, 2 ** 8));
        }
      };
    }
    function v(d, l = !1) {
      if (t(d), d <= 0 || d > 32)
        throw new Error("radix2: bits should be in (0..32]");
      if (h(8, d) > 32 || h(d, 8) > 32)
        throw new Error("radix2: carry overflow");
      return {
        encode: (u) => {
          if (!(u instanceof Uint8Array))
            throw new Error("radix2.encode input should be Uint8Array");
          return w(Array.from(u), 8, d, !l);
        },
        decode: (u) => {
          if (!Array.isArray(u) || u.length && typeof u[0] != "number")
            throw new Error("radix2.decode input should be array of strings");
          return Uint8Array.from(w(u, d, 8, l));
        }
      };
    }
    function b(d) {
      if (typeof d != "function")
        throw new Error("unsafeWrapper fn should be function");
      return function(...l) {
        try {
          return d.apply(null, l);
        } catch {
        }
      };
    }
    function C(d, l) {
      if (t(d), typeof l != "function")
        throw new Error("checksum fn should be function");
      return {
        encode(u) {
          if (!(u instanceof Uint8Array))
            throw new Error("checksum.encode: input should be Uint8Array");
          const p = l(u).slice(0, d), f = new Uint8Array(u.length + d);
          return f.set(u), f.set(p, u.length), f;
        },
        decode(u) {
          if (!(u instanceof Uint8Array))
            throw new Error("checksum.decode: input should be Uint8Array");
          const p = u.slice(0, -d), f = l(p).slice(0, d), y = u.slice(-d);
          for (let x = 0; x < d; x++)
            if (f[x] !== y[x])
              throw new Error("Invalid checksum");
          return p;
        }
      };
    }
    e.utils = { alphabet: r, chain: n, checksum: C, radix: g, radix2: v, join: o, padding: i }, e.base16 = n(v(4), r("0123456789ABCDEF"), o("")), e.base32 = n(v(5), r("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"), i(5), o("")), e.base32hex = n(v(5), r("0123456789ABCDEFGHIJKLMNOPQRSTUV"), i(5), o("")), e.base32crockford = n(v(5), r("0123456789ABCDEFGHJKMNPQRSTVWXYZ"), o(""), s((d) => d.toUpperCase().replace(/O/g, "0").replace(/[IL]/g, "1"))), e.base64 = n(v(6), r("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"), i(6), o("")), e.base64url = n(v(6), r("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"), i(6), o(""));
    const L = (d) => n(g(58), r(d), o(""));
    e.base58 = L("123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"), e.base58flickr = L("123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ"), e.base58xrp = L("rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz");
    const M = [0, 2, 3, 5, 6, 7, 9, 10, 11];
    e.base58xmr = {
      encode(d) {
        let l = "";
        for (let u = 0; u < d.length; u += 8) {
          const p = d.subarray(u, u + 8);
          l += e.base58.encode(p).padStart(M[p.length], "1");
        }
        return l;
      },
      decode(d) {
        let l = [];
        for (let u = 0; u < d.length; u += 11) {
          const p = d.slice(u, u + 11), f = M.indexOf(p.length), y = e.base58.decode(p);
          for (let x = 0; x < y.length - f; x++)
            if (y[x] !== 0)
              throw new Error("base58xmr: wrong padding");
          l = l.concat(Array.from(y.slice(y.length - f)));
        }
        return Uint8Array.from(l);
      }
    };
    const I = (d) => n(C(4, (l) => d(d(l))), e.base58);
    e.base58check = I;
    const U = n(r("qpzry9x8gf2tvdw0s3jn54khce6mua7l"), o("")), q = [996825010, 642813549, 513874426, 1027748829, 705979059];
    function Q(d) {
      const l = d >> 25;
      let u = (d & 33554431) << 5;
      for (let p = 0; p < q.length; p++)
        (l >> p & 1) === 1 && (u ^= q[p]);
      return u;
    }
    function A(d, l, u = 1) {
      const p = d.length;
      let f = 1;
      for (let y = 0; y < p; y++) {
        const x = d.charCodeAt(y);
        if (x < 33 || x > 126)
          throw new Error(`Invalid prefix (${d})`);
        f = Q(f) ^ x >> 5;
      }
      f = Q(f);
      for (let y = 0; y < p; y++)
        f = Q(f) ^ d.charCodeAt(y) & 31;
      for (let y of l)
        f = Q(f) ^ y;
      for (let y = 0; y < 6; y++)
        f = Q(f);
      return f ^= u, U.encode(w([f % 2 ** 30], 30, 5, !1));
    }
    function _(d) {
      const l = d === "bech32" ? 1 : 734539939, u = v(5), p = u.decode, f = u.encode, y = b(p);
      function x(S, D, J = 90) {
        if (typeof S != "string")
          throw new Error(`bech32.encode prefix should be string, not ${typeof S}`);
        if (!Array.isArray(D) || D.length && typeof D[0] != "number")
          throw new Error(`bech32.encode words should be array of numbers, not ${typeof D}`);
        const Y = S.length + 7 + D.length;
        if (J !== !1 && Y > J)
          throw new TypeError(`Length ${Y} exceeds limit ${J}`);
        return S = S.toLowerCase(), `${S}1${U.encode(D)}${A(S, D, l)}`;
      }
      function O(S, D = 90) {
        if (typeof S != "string")
          throw new Error(`bech32.decode input should be string, not ${typeof S}`);
        if (S.length < 8 || D !== !1 && S.length > D)
          throw new TypeError(`Wrong string length: ${S.length} (${S}). Expected (8..${D})`);
        const J = S.toLowerCase();
        if (S !== J && S !== S.toUpperCase())
          throw new Error("String must be lowercase or uppercase");
        S = J;
        const Y = S.lastIndexOf("1");
        if (Y === 0 || Y === -1)
          throw new Error('Letter "1" must be present between prefix and data only');
        const G = S.slice(0, Y), X = S.slice(Y + 1);
        if (X.length < 6)
          throw new Error("Data must be at least 6 characters long");
        const ie = U.decode(X).slice(0, -6), N = A(G, ie, l);
        if (!X.endsWith(N))
          throw new Error(`Invalid checksum in ${S}: expected "${N}"`);
        return { prefix: G, words: ie };
      }
      const R = b(O);
      function P(S) {
        const { prefix: D, words: J } = O(S, !1);
        return { prefix: D, words: J, bytes: p(J) };
      }
      return { encode: x, decode: O, decodeToBytes: P, decodeUnsafe: R, fromWords: p, fromWordsUnsafe: y, toWords: f };
    }
    e.bech32 = _("bech32"), e.bech32m = _("bech32m"), e.utf8 = {
      encode: (d) => new TextDecoder().decode(d),
      decode: (d) => new TextEncoder().encode(d)
    }, e.hex = n(v(4), r("0123456789abcdef"), o(""), s((d) => {
      if (typeof d != "string" || d.length % 2)
        throw new TypeError(`hex.decode: expected string, got ${typeof d} with length ${d.length}`);
      return d.toLowerCase();
    }));
    const E = {
      utf8: e.utf8,
      hex: e.hex,
      base16: e.base16,
      base32: e.base32,
      base64: e.base64,
      base64url: e.base64url,
      base58: e.base58,
      base58xmr: e.base58xmr
    }, T = `Invalid encoding type. Available types: ${Object.keys(E).join(", ")}`, m = (d, l) => {
      if (typeof d != "string" || !E.hasOwnProperty(d))
        throw new TypeError(T);
      if (!(l instanceof Uint8Array))
        throw new TypeError("bytesToString() expects Uint8Array");
      return E[d].encode(l);
    };
    e.bytesToString = m, e.str = e.bytesToString;
    const k = (d, l) => {
      if (!E.hasOwnProperty(d))
        throw new TypeError(T);
      if (typeof l != "string")
        throw new TypeError("stringToBytes() expects string");
      return E[d].decode(l);
    };
    e.stringToBytes = k, e.bytes = e.stringToBytes;
  })(Gr)), Gr;
}
var jr, Ss;
function N4() {
  if (Ss) return jr;
  Ss = 1;
  const { bech32: e, hex: t, utf8: n } = R4(), r = {
    // default network is bitcoin
    bech32: "bc",
    pubKeyHash: 0,
    scriptHash: 5,
    validWitnessVersions: [0]
  }, o = {
    bech32: "tb",
    pubKeyHash: 111,
    scriptHash: 196,
    validWitnessVersions: [0]
  }, i = {
    bech32: "tbs",
    pubKeyHash: 111,
    scriptHash: 196,
    validWitnessVersions: [0]
  }, s = {
    bech32: "bcrt",
    pubKeyHash: 111,
    scriptHash: 196,
    validWitnessVersions: [0]
  }, c = {
    bech32: "sb",
    pubKeyHash: 63,
    scriptHash: 123,
    validWitnessVersions: [0]
  }, a = [
    "option_data_loss_protect",
    "initial_routing_sync",
    "option_upfront_shutdown_script",
    "gossip_queries",
    "var_onion_optin",
    "gossip_queries_ex",
    "option_static_remotekey",
    "payment_secret",
    "basic_mpp",
    "option_support_large_channel"
  ], h = {
    m: BigInt(1e3),
    u: BigInt(1e6),
    n: BigInt(1e9),
    p: BigInt(1e12)
  }, w = BigInt("2100000000000000000"), g = BigInt(1e11), v = {
    payment_hash: 1,
    payment_secret: 16,
    description: 13,
    payee: 19,
    description_hash: 23,
    // commit to longer descriptions (used by lnurl-pay)
    expiry: 6,
    // default: 3600 (1 hour)
    min_final_cltv_expiry: 24,
    // default: 9
    fallback_address: 9,
    route_hint: 3,
    // for extra routing info (private etc.)
    feature_bits: 5,
    metadata: 27
  }, b = {};
  for (let A = 0, _ = Object.keys(v); A < _.length; A++) {
    const E = _[A], T = v[_[A]].toString();
    b[T] = E;
  }
  const C = {
    1: (A) => t.encode(e.fromWordsUnsafe(A)),
    // 256 bits
    16: (A) => t.encode(e.fromWordsUnsafe(A)),
    // 256 bits
    13: (A) => n.encode(e.fromWordsUnsafe(A)),
    // string variable length
    19: (A) => t.encode(e.fromWordsUnsafe(A)),
    // 264 bits
    23: (A) => t.encode(e.fromWordsUnsafe(A)),
    // 256 bits
    27: (A) => t.encode(e.fromWordsUnsafe(A)),
    // variable
    6: M,
    // default: 3600 (1 hour)
    24: M,
    // default: 9
    3: I,
    // for extra routing info (private etc.)
    5: U
    // keep feature bits as array of 5 bit words
  };
  function L(A) {
    return (_) => ({
      tagCode: parseInt(A),
      words: e.encode("unknown", _, Number.MAX_SAFE_INTEGER)
    });
  }
  function M(A) {
    return A.reverse().reduce((_, E, T) => _ + E * Math.pow(32, T), 0);
  }
  function I(A) {
    const _ = [];
    let E, T, m, k, d, l = e.fromWordsUnsafe(A);
    for (; l.length > 0; )
      E = t.encode(l.slice(0, 33)), T = t.encode(l.slice(33, 41)), m = parseInt(t.encode(l.slice(41, 45)), 16), k = parseInt(
        t.encode(l.slice(45, 49)),
        16
      ), d = parseInt(t.encode(l.slice(49, 51)), 16), l = l.slice(51), _.push({
        pubkey: E,
        short_channel_id: T,
        fee_base_msat: m,
        fee_proportional_millionths: k,
        cltv_expiry_delta: d
      });
    return _;
  }
  function U(A) {
    const _ = A.slice().reverse().map((m) => [
      !!(m & 1),
      !!(m & 2),
      !!(m & 4),
      !!(m & 8),
      !!(m & 16)
    ]).reduce((m, k) => m.concat(k), []);
    for (; _.length < a.length * 2; )
      _.push(!1);
    const E = {};
    a.forEach((m, k) => {
      let d;
      _[k * 2] ? d = "required" : _[k * 2 + 1] ? d = "supported" : d = "unsupported", E[m] = d;
    });
    const T = _.slice(a.length * 2);
    return E.extra_bits = {
      start_bit: a.length * 2,
      bits: T,
      has_required: T.reduce(
        (m, k, d) => d % 2 !== 0 ? m || !1 : m || k,
        !1
      )
    }, E;
  }
  function q(A, _) {
    let E, T;
    if (A.slice(-1).match(/^[munp]$/))
      E = A.slice(-1), T = A.slice(0, -1);
    else {
      if (A.slice(-1).match(/^[^munp0-9]$/))
        throw new Error("Not a valid multiplier for the amount");
      T = A;
    }
    if (!T.match(/^\d+$/))
      throw new Error("Not a valid human readable amount");
    const m = BigInt(T), k = E ? m * g / h[E] : m * g;
    if (E === "p" && m % BigInt(10) !== BigInt(0) || k > w)
      throw new Error("Amount is outside of valid range");
    return _ ? k.toString() : k;
  }
  function Q(A, _) {
    if (typeof A != "string")
      throw new Error("Lightning Payment Request must be string");
    if (A.slice(0, 2).toLowerCase() !== "ln")
      throw new Error("Not a proper lightning payment request");
    const E = [], T = e.decode(A, Number.MAX_SAFE_INTEGER);
    A = A.toLowerCase();
    const m = T.prefix;
    let k = T.words, d = A.slice(m.length + 1), l = k.slice(-104);
    k = k.slice(0, -104);
    let u = m.match(/^ln(\S+?)(\d*)([a-zA-Z]?)$/);
    if (u && !u[2] && (u = m.match(/^ln(\S+)$/)), !u)
      throw new Error("Not a proper lightning payment request");
    E.push({
      name: "lightning_network",
      letters: "ln"
    });
    const p = u[1];
    let f;
    if (_) {
      if (_.bech32 === void 0 || _.pubKeyHash === void 0 || _.scriptHash === void 0 || !Array.isArray(_.validWitnessVersions))
        throw new Error("Invalid network");
      f = _;
    } else
      switch (p) {
        case r.bech32:
          f = r;
          break;
        case o.bech32:
          f = o;
          break;
        case i.bech32:
          f = i;
          break;
        case s.bech32:
          f = s;
          break;
        case c.bech32:
          f = c;
          break;
      }
    if (!f || f.bech32 !== p)
      throw new Error("Unknown coin bech32 prefix");
    E.push({
      name: "coin_network",
      letters: p,
      value: f
    });
    const y = u[2];
    let x;
    if (y) {
      const G = u[3];
      x = q(y + G, !0), E.push({
        name: "amount",
        letters: u[2] + u[3],
        value: x
      });
    } else
      x = null;
    E.push({
      name: "separator",
      letters: "1"
    });
    const O = M(k.slice(0, 7));
    k = k.slice(7), E.push({
      name: "timestamp",
      letters: d.slice(0, 7),
      value: O
    }), d = d.slice(7);
    let R, P, S, D;
    for (; k.length > 0; ) {
      const G = k[0].toString();
      R = b[G] || "unknown_tag", P = C[G] || L(G), k = k.slice(1), S = M(k.slice(0, 2)), k = k.slice(2), D = k.slice(0, S), k = k.slice(S), E.push({
        name: R,
        tag: d[0],
        letters: d.slice(0, 3 + S),
        value: P(D)
        // see: parsers for more comments
      }), d = d.slice(3 + S);
    }
    E.push({
      name: "signature",
      letters: d.slice(0, 104),
      value: t.encode(e.fromWordsUnsafe(l))
    }), d = d.slice(104), E.push({
      name: "checksum",
      letters: d
    });
    let J = {
      paymentRequest: A,
      sections: E,
      get expiry() {
        let G = E.find((X) => X.name === "expiry");
        if (G) return Y("timestamp") + G.value;
      },
      get route_hints() {
        return E.filter((G) => G.name === "route_hint").map((G) => G.value);
      }
    };
    for (let G in v)
      G !== "route_hint" && Object.defineProperty(J, G, {
        get() {
          return Y(G);
        }
      });
    return J;
    function Y(G) {
      let X = E.find((ie) => ie.name === G);
      return X ? X.value : void 0;
    }
  }
  return jr = {
    decode: Q,
    hrpToMillisat: q
  }, jr;
}
N4();
const Ls = (e) => {
  let t;
  const n = /* @__PURE__ */ new Set(), r = (h, w) => {
    const g = typeof h == "function" ? h(t) : h;
    if (!Object.is(g, t)) {
      const v = t;
      t = w ?? (typeof g != "object" || g === null) ? g : Object.assign({}, t, g), n.forEach((b) => b(t, v));
    }
  }, o = () => t, c = { setState: r, getState: o, getInitialState: () => a, subscribe: (h) => (n.add(h), () => n.delete(h)) }, a = t = e(r, o, c);
  return c;
}, $4 = ((e) => e ? Ls(e) : Ls);
function I4(e, ...t) {
  if (!(e instanceof Uint8Array))
    throw new Error("Expected Uint8Array");
  if (t.length > 0 && !t.includes(e.length))
    throw new Error(`Expected Uint8Array of length ${t}, not of length=${e.length}`);
}
function Ts(e, t = !0) {
  if (e.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (t && e.finished)
    throw new Error("Hash#digest() has already been called");
}
function U4(e, t) {
  I4(e);
  const n = t.outputLen;
  if (e.length < n)
    throw new Error(`digestInto() expects output buffer of length at least ${n}`);
}
/*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const a2 = (e) => e instanceof Uint8Array, zr = (e) => new DataView(e.buffer, e.byteOffset, e.byteLength), je = (e, t) => e << 32 - t | e >>> t, O4 = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68;
if (!O4)
  throw new Error("Non little-endian hardware is not supported");
const P4 = /* @__PURE__ */ Array.from({ length: 256 }, (e, t) => t.toString(16).padStart(2, "0"));
function H4(e) {
  if (!a2(e))
    throw new Error("Uint8Array expected");
  let t = "";
  for (let n = 0; n < e.length; n++)
    t += P4[e[n]];
  return t;
}
function D4(e) {
  if (typeof e != "string")
    throw new Error(`utf8ToBytes expected string, got ${typeof e}`);
  return new Uint8Array(new TextEncoder().encode(e));
}
function c2(e) {
  if (typeof e == "string" && (e = D4(e)), !a2(e))
    throw new Error(`expected Uint8Array, got ${typeof e}`);
  return e;
}
class Z4 {
  // Safe version that clones internal state
  clone() {
    return this._cloneInto();
  }
}
function W4(e) {
  const t = (r) => e().update(c2(r)).digest(), n = e();
  return t.outputLen = n.outputLen, t.blockLen = n.blockLen, t.create = () => e(), t;
}
function F4(e, t, n, r) {
  if (typeof e.setBigUint64 == "function")
    return e.setBigUint64(t, n, r);
  const o = BigInt(32), i = BigInt(4294967295), s = Number(n >> o & i), c = Number(n & i), a = r ? 4 : 0, h = r ? 0 : 4;
  e.setUint32(t + a, s, r), e.setUint32(t + h, c, r);
}
class V4 extends Z4 {
  constructor(t, n, r, o) {
    super(), this.blockLen = t, this.outputLen = n, this.padOffset = r, this.isLE = o, this.finished = !1, this.length = 0, this.pos = 0, this.destroyed = !1, this.buffer = new Uint8Array(t), this.view = zr(this.buffer);
  }
  update(t) {
    Ts(this);
    const { view: n, buffer: r, blockLen: o } = this;
    t = c2(t);
    const i = t.length;
    for (let s = 0; s < i; ) {
      const c = Math.min(o - this.pos, i - s);
      if (c === o) {
        const a = zr(t);
        for (; o <= i - s; s += o)
          this.process(a, s);
        continue;
      }
      r.set(t.subarray(s, s + c), this.pos), this.pos += c, s += c, this.pos === o && (this.process(n, 0), this.pos = 0);
    }
    return this.length += t.length, this.roundClean(), this;
  }
  digestInto(t) {
    Ts(this), U4(t, this), this.finished = !0;
    const { buffer: n, view: r, blockLen: o, isLE: i } = this;
    let { pos: s } = this;
    n[s++] = 128, this.buffer.subarray(s).fill(0), this.padOffset > o - s && (this.process(r, 0), s = 0);
    for (let g = s; g < o; g++)
      n[g] = 0;
    F4(r, o - 8, BigInt(this.length * 8), i), this.process(r, 0);
    const c = zr(t), a = this.outputLen;
    if (a % 4)
      throw new Error("_sha2: outputLen should be aligned to 32bit");
    const h = a / 4, w = this.get();
    if (h > w.length)
      throw new Error("_sha2: outputLen bigger than state");
    for (let g = 0; g < h; g++)
      c.setUint32(4 * g, w[g], i);
  }
  digest() {
    const { buffer: t, outputLen: n } = this;
    this.digestInto(t);
    const r = t.slice(0, n);
    return this.destroy(), r;
  }
  _cloneInto(t) {
    t || (t = new this.constructor()), t.set(...this.get());
    const { blockLen: n, buffer: r, length: o, finished: i, destroyed: s, pos: c } = this;
    return t.length = o, t.pos = c, t.finished = i, t.destroyed = s, o % n && t.buffer.set(r), t;
  }
}
const G4 = (e, t, n) => e & t ^ ~e & n, j4 = (e, t, n) => e & t ^ e & n ^ t & n, z4 = /* @__PURE__ */ new Uint32Array([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]), st = /* @__PURE__ */ new Uint32Array([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]), at = /* @__PURE__ */ new Uint32Array(64);
class q4 extends V4 {
  constructor() {
    super(64, 32, 8, !1), this.A = st[0] | 0, this.B = st[1] | 0, this.C = st[2] | 0, this.D = st[3] | 0, this.E = st[4] | 0, this.F = st[5] | 0, this.G = st[6] | 0, this.H = st[7] | 0;
  }
  get() {
    const { A: t, B: n, C: r, D: o, E: i, F: s, G: c, H: a } = this;
    return [t, n, r, o, i, s, c, a];
  }
  // prettier-ignore
  set(t, n, r, o, i, s, c, a) {
    this.A = t | 0, this.B = n | 0, this.C = r | 0, this.D = o | 0, this.E = i | 0, this.F = s | 0, this.G = c | 0, this.H = a | 0;
  }
  process(t, n) {
    for (let g = 0; g < 16; g++, n += 4)
      at[g] = t.getUint32(n, !1);
    for (let g = 16; g < 64; g++) {
      const v = at[g - 15], b = at[g - 2], C = je(v, 7) ^ je(v, 18) ^ v >>> 3, L = je(b, 17) ^ je(b, 19) ^ b >>> 10;
      at[g] = L + at[g - 7] + C + at[g - 16] | 0;
    }
    let { A: r, B: o, C: i, D: s, E: c, F: a, G: h, H: w } = this;
    for (let g = 0; g < 64; g++) {
      const v = je(c, 6) ^ je(c, 11) ^ je(c, 25), b = w + v + G4(c, a, h) + z4[g] + at[g] | 0, L = (je(r, 2) ^ je(r, 13) ^ je(r, 22)) + j4(r, o, i) | 0;
      w = h, h = a, a = c, c = s + b | 0, s = i, i = o, o = r, r = b + L | 0;
    }
    r = r + this.A | 0, o = o + this.B | 0, i = i + this.C | 0, s = s + this.D | 0, c = c + this.E | 0, a = a + this.F | 0, h = h + this.G | 0, w = w + this.H | 0, this.set(r, o, i, s, c, a, h, w);
  }
  roundClean() {
    at.fill(0);
  }
  destroy() {
    this.set(0, 0, 0, 0, 0, 0, 0, 0), this.buffer.fill(0);
  }
}
const K4 = /* @__PURE__ */ W4(() => new q4());
var qr = {}, Ms;
function Q4() {
  return Ms || (Ms = 1, (function(e) {
    /*! scure-base - MIT License (c) 2022 Paul Miller (paulmillr.com) */
    Object.defineProperty(e, "__esModule", { value: !0 }), e.bytes = e.stringToBytes = e.str = e.bytesToString = e.hex = e.utf8 = e.bech32m = e.bech32 = e.base58check = e.base58xmr = e.base58xrp = e.base58flickr = e.base58 = e.base64url = e.base64 = e.base32crockford = e.base32hex = e.base32 = e.base16 = e.utils = e.assertNumber = void 0;
    function t(d) {
      if (!Number.isSafeInteger(d))
        throw new Error(`Wrong integer: ${d}`);
    }
    e.assertNumber = t;
    function n(...d) {
      const l = (f, y) => (x) => f(y(x)), u = Array.from(d).reverse().reduce((f, y) => f ? l(f, y.encode) : y.encode, void 0), p = d.reduce((f, y) => f ? l(f, y.decode) : y.decode, void 0);
      return { encode: u, decode: p };
    }
    function r(d) {
      return {
        encode: (l) => {
          if (!Array.isArray(l) || l.length && typeof l[0] != "number")
            throw new Error("alphabet.encode input should be an array of numbers");
          return l.map((u) => {
            if (t(u), u < 0 || u >= d.length)
              throw new Error(`Digit index outside alphabet: ${u} (alphabet: ${d.length})`);
            return d[u];
          });
        },
        decode: (l) => {
          if (!Array.isArray(l) || l.length && typeof l[0] != "string")
            throw new Error("alphabet.decode input should be array of strings");
          return l.map((u) => {
            if (typeof u != "string")
              throw new Error(`alphabet.decode: not string element=${u}`);
            const p = d.indexOf(u);
            if (p === -1)
              throw new Error(`Unknown letter: "${u}". Allowed: ${d}`);
            return p;
          });
        }
      };
    }
    function o(d = "") {
      if (typeof d != "string")
        throw new Error("join separator should be string");
      return {
        encode: (l) => {
          if (!Array.isArray(l) || l.length && typeof l[0] != "string")
            throw new Error("join.encode input should be array of strings");
          for (let u of l)
            if (typeof u != "string")
              throw new Error(`join.encode: non-string input=${u}`);
          return l.join(d);
        },
        decode: (l) => {
          if (typeof l != "string")
            throw new Error("join.decode input should be string");
          return l.split(d);
        }
      };
    }
    function i(d, l = "=") {
      if (t(d), typeof l != "string")
        throw new Error("padding chr should be string");
      return {
        encode(u) {
          if (!Array.isArray(u) || u.length && typeof u[0] != "string")
            throw new Error("padding.encode input should be array of strings");
          for (let p of u)
            if (typeof p != "string")
              throw new Error(`padding.encode: non-string input=${p}`);
          for (; u.length * d % 8; )
            u.push(l);
          return u;
        },
        decode(u) {
          if (!Array.isArray(u) || u.length && typeof u[0] != "string")
            throw new Error("padding.encode input should be array of strings");
          for (let f of u)
            if (typeof f != "string")
              throw new Error(`padding.decode: non-string input=${f}`);
          let p = u.length;
          if (p * d % 8)
            throw new Error("Invalid padding: string should have whole number of bytes");
          for (; p > 0 && u[p - 1] === l; p--)
            if (!((p - 1) * d % 8))
              throw new Error("Invalid padding: string has too much padding");
          return u.slice(0, p);
        }
      };
    }
    function s(d) {
      if (typeof d != "function")
        throw new Error("normalize fn should be function");
      return { encode: (l) => l, decode: (l) => d(l) };
    }
    function c(d, l, u) {
      if (l < 2)
        throw new Error(`convertRadix: wrong from=${l}, base cannot be less than 2`);
      if (u < 2)
        throw new Error(`convertRadix: wrong to=${u}, base cannot be less than 2`);
      if (!Array.isArray(d))
        throw new Error("convertRadix: data should be array");
      if (!d.length)
        return [];
      let p = 0;
      const f = [], y = Array.from(d);
      for (y.forEach((x) => {
        if (t(x), x < 0 || x >= l)
          throw new Error(`Wrong integer: ${x}`);
      }); ; ) {
        let x = 0, O = !0;
        for (let R = p; R < y.length; R++) {
          const P = y[R], S = l * x + P;
          if (!Number.isSafeInteger(S) || l * x / l !== x || S - P !== l * x)
            throw new Error("convertRadix: carry overflow");
          if (x = S % u, y[R] = Math.floor(S / u), !Number.isSafeInteger(y[R]) || y[R] * u + x !== S)
            throw new Error("convertRadix: carry overflow");
          if (O)
            y[R] ? O = !1 : p = R;
          else continue;
        }
        if (f.push(x), O)
          break;
      }
      for (let x = 0; x < d.length - 1 && d[x] === 0; x++)
        f.push(0);
      return f.reverse();
    }
    const a = (d, l) => l ? a(l, d % l) : d, h = (d, l) => d + (l - a(d, l));
    function w(d, l, u, p) {
      if (!Array.isArray(d))
        throw new Error("convertRadix2: data should be array");
      if (l <= 0 || l > 32)
        throw new Error(`convertRadix2: wrong from=${l}`);
      if (u <= 0 || u > 32)
        throw new Error(`convertRadix2: wrong to=${u}`);
      if (h(l, u) > 32)
        throw new Error(`convertRadix2: carry overflow from=${l} to=${u} carryBits=${h(l, u)}`);
      let f = 0, y = 0;
      const x = 2 ** u - 1, O = [];
      for (const R of d) {
        if (t(R), R >= 2 ** l)
          throw new Error(`convertRadix2: invalid data word=${R} from=${l}`);
        if (f = f << l | R, y + l > 32)
          throw new Error(`convertRadix2: carry overflow pos=${y} from=${l}`);
        for (y += l; y >= u; y -= u)
          O.push((f >> y - u & x) >>> 0);
        f &= 2 ** y - 1;
      }
      if (f = f << u - y & x, !p && y >= l)
        throw new Error("Excess padding");
      if (!p && f)
        throw new Error(`Non-zero padding: ${f}`);
      return p && y > 0 && O.push(f >>> 0), O;
    }
    function g(d) {
      return t(d), {
        encode: (l) => {
          if (!(l instanceof Uint8Array))
            throw new Error("radix.encode input should be Uint8Array");
          return c(Array.from(l), 2 ** 8, d);
        },
        decode: (l) => {
          if (!Array.isArray(l) || l.length && typeof l[0] != "number")
            throw new Error("radix.decode input should be array of strings");
          return Uint8Array.from(c(l, d, 2 ** 8));
        }
      };
    }
    function v(d, l = !1) {
      if (t(d), d <= 0 || d > 32)
        throw new Error("radix2: bits should be in (0..32]");
      if (h(8, d) > 32 || h(d, 8) > 32)
        throw new Error("radix2: carry overflow");
      return {
        encode: (u) => {
          if (!(u instanceof Uint8Array))
            throw new Error("radix2.encode input should be Uint8Array");
          return w(Array.from(u), 8, d, !l);
        },
        decode: (u) => {
          if (!Array.isArray(u) || u.length && typeof u[0] != "number")
            throw new Error("radix2.decode input should be array of strings");
          return Uint8Array.from(w(u, d, 8, l));
        }
      };
    }
    function b(d) {
      if (typeof d != "function")
        throw new Error("unsafeWrapper fn should be function");
      return function(...l) {
        try {
          return d.apply(null, l);
        } catch {
        }
      };
    }
    function C(d, l) {
      if (t(d), typeof l != "function")
        throw new Error("checksum fn should be function");
      return {
        encode(u) {
          if (!(u instanceof Uint8Array))
            throw new Error("checksum.encode: input should be Uint8Array");
          const p = l(u).slice(0, d), f = new Uint8Array(u.length + d);
          return f.set(u), f.set(p, u.length), f;
        },
        decode(u) {
          if (!(u instanceof Uint8Array))
            throw new Error("checksum.decode: input should be Uint8Array");
          const p = u.slice(0, -d), f = l(p).slice(0, d), y = u.slice(-d);
          for (let x = 0; x < d; x++)
            if (f[x] !== y[x])
              throw new Error("Invalid checksum");
          return p;
        }
      };
    }
    e.utils = { alphabet: r, chain: n, checksum: C, radix: g, radix2: v, join: o, padding: i }, e.base16 = n(v(4), r("0123456789ABCDEF"), o("")), e.base32 = n(v(5), r("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"), i(5), o("")), e.base32hex = n(v(5), r("0123456789ABCDEFGHIJKLMNOPQRSTUV"), i(5), o("")), e.base32crockford = n(v(5), r("0123456789ABCDEFGHJKMNPQRSTVWXYZ"), o(""), s((d) => d.toUpperCase().replace(/O/g, "0").replace(/[IL]/g, "1"))), e.base64 = n(v(6), r("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"), i(6), o("")), e.base64url = n(v(6), r("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"), i(6), o(""));
    const L = (d) => n(g(58), r(d), o(""));
    e.base58 = L("123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"), e.base58flickr = L("123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ"), e.base58xrp = L("rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz");
    const M = [0, 2, 3, 5, 6, 7, 9, 10, 11];
    e.base58xmr = {
      encode(d) {
        let l = "";
        for (let u = 0; u < d.length; u += 8) {
          const p = d.subarray(u, u + 8);
          l += e.base58.encode(p).padStart(M[p.length], "1");
        }
        return l;
      },
      decode(d) {
        let l = [];
        for (let u = 0; u < d.length; u += 11) {
          const p = d.slice(u, u + 11), f = M.indexOf(p.length), y = e.base58.decode(p);
          for (let x = 0; x < y.length - f; x++)
            if (y[x] !== 0)
              throw new Error("base58xmr: wrong padding");
          l = l.concat(Array.from(y.slice(y.length - f)));
        }
        return Uint8Array.from(l);
      }
    };
    const I = (d) => n(C(4, (l) => d(d(l))), e.base58);
    e.base58check = I;
    const U = n(r("qpzry9x8gf2tvdw0s3jn54khce6mua7l"), o("")), q = [996825010, 642813549, 513874426, 1027748829, 705979059];
    function Q(d) {
      const l = d >> 25;
      let u = (d & 33554431) << 5;
      for (let p = 0; p < q.length; p++)
        (l >> p & 1) === 1 && (u ^= q[p]);
      return u;
    }
    function A(d, l, u = 1) {
      const p = d.length;
      let f = 1;
      for (let y = 0; y < p; y++) {
        const x = d.charCodeAt(y);
        if (x < 33 || x > 126)
          throw new Error(`Invalid prefix (${d})`);
        f = Q(f) ^ x >> 5;
      }
      f = Q(f);
      for (let y = 0; y < p; y++)
        f = Q(f) ^ d.charCodeAt(y) & 31;
      for (let y of l)
        f = Q(f) ^ y;
      for (let y = 0; y < 6; y++)
        f = Q(f);
      return f ^= u, U.encode(w([f % 2 ** 30], 30, 5, !1));
    }
    function _(d) {
      const l = d === "bech32" ? 1 : 734539939, u = v(5), p = u.decode, f = u.encode, y = b(p);
      function x(S, D, J = 90) {
        if (typeof S != "string")
          throw new Error(`bech32.encode prefix should be string, not ${typeof S}`);
        if (!Array.isArray(D) || D.length && typeof D[0] != "number")
          throw new Error(`bech32.encode words should be array of numbers, not ${typeof D}`);
        const Y = S.length + 7 + D.length;
        if (J !== !1 && Y > J)
          throw new TypeError(`Length ${Y} exceeds limit ${J}`);
        return S = S.toLowerCase(), `${S}1${U.encode(D)}${A(S, D, l)}`;
      }
      function O(S, D = 90) {
        if (typeof S != "string")
          throw new Error(`bech32.decode input should be string, not ${typeof S}`);
        if (S.length < 8 || D !== !1 && S.length > D)
          throw new TypeError(`Wrong string length: ${S.length} (${S}). Expected (8..${D})`);
        const J = S.toLowerCase();
        if (S !== J && S !== S.toUpperCase())
          throw new Error("String must be lowercase or uppercase");
        S = J;
        const Y = S.lastIndexOf("1");
        if (Y === 0 || Y === -1)
          throw new Error('Letter "1" must be present between prefix and data only');
        const G = S.slice(0, Y), X = S.slice(Y + 1);
        if (X.length < 6)
          throw new Error("Data must be at least 6 characters long");
        const ie = U.decode(X).slice(0, -6), N = A(G, ie, l);
        if (!X.endsWith(N))
          throw new Error(`Invalid checksum in ${S}: expected "${N}"`);
        return { prefix: G, words: ie };
      }
      const R = b(O);
      function P(S) {
        const { prefix: D, words: J } = O(S, !1);
        return { prefix: D, words: J, bytes: p(J) };
      }
      return { encode: x, decode: O, decodeToBytes: P, decodeUnsafe: R, fromWords: p, fromWordsUnsafe: y, toWords: f };
    }
    e.bech32 = _("bech32"), e.bech32m = _("bech32m"), e.utf8 = {
      encode: (d) => new TextDecoder().decode(d),
      decode: (d) => new TextEncoder().encode(d)
    }, e.hex = n(v(4), r("0123456789abcdef"), o(""), s((d) => {
      if (typeof d != "string" || d.length % 2)
        throw new TypeError(`hex.decode: expected string, got ${typeof d} with length ${d.length}`);
      return d.toLowerCase();
    }));
    const E = {
      utf8: e.utf8,
      hex: e.hex,
      base16: e.base16,
      base32: e.base32,
      base64: e.base64,
      base64url: e.base64url,
      base58: e.base58,
      base58xmr: e.base58xmr
    }, T = `Invalid encoding type. Available types: ${Object.keys(E).join(", ")}`, m = (d, l) => {
      if (typeof d != "string" || !E.hasOwnProperty(d))
        throw new TypeError(T);
      if (!(l instanceof Uint8Array))
        throw new TypeError("bytesToString() expects Uint8Array");
      return E[d].encode(l);
    };
    e.bytesToString = m, e.str = e.bytesToString;
    const k = (d, l) => {
      if (!E.hasOwnProperty(d))
        throw new TypeError(T);
      if (typeof l != "string")
        throw new TypeError("stringToBytes() expects string");
      return E[d].decode(l);
    };
    e.stringToBytes = k, e.bytes = e.stringToBytes;
  })(qr)), qr;
}
var Kr, Bs;
function J4() {
  if (Bs) return Kr;
  Bs = 1;
  const { bech32: e, hex: t, utf8: n } = Q4(), r = {
    // default network is bitcoin
    bech32: "bc",
    pubKeyHash: 0,
    scriptHash: 5,
    validWitnessVersions: [0]
  }, o = {
    bech32: "tb",
    pubKeyHash: 111,
    scriptHash: 196,
    validWitnessVersions: [0]
  }, i = {
    bech32: "tbs",
    pubKeyHash: 111,
    scriptHash: 196,
    validWitnessVersions: [0]
  }, s = {
    bech32: "bcrt",
    pubKeyHash: 111,
    scriptHash: 196,
    validWitnessVersions: [0]
  }, c = {
    bech32: "sb",
    pubKeyHash: 63,
    scriptHash: 123,
    validWitnessVersions: [0]
  }, a = [
    "option_data_loss_protect",
    "initial_routing_sync",
    "option_upfront_shutdown_script",
    "gossip_queries",
    "var_onion_optin",
    "gossip_queries_ex",
    "option_static_remotekey",
    "payment_secret",
    "basic_mpp",
    "option_support_large_channel"
  ], h = {
    m: BigInt(1e3),
    u: BigInt(1e6),
    n: BigInt(1e9),
    p: BigInt(1e12)
  }, w = BigInt("2100000000000000000"), g = BigInt(1e11), v = {
    payment_hash: 1,
    payment_secret: 16,
    description: 13,
    payee: 19,
    description_hash: 23,
    // commit to longer descriptions (used by lnurl-pay)
    expiry: 6,
    // default: 3600 (1 hour)
    min_final_cltv_expiry: 24,
    // default: 9
    fallback_address: 9,
    route_hint: 3,
    // for extra routing info (private etc.)
    feature_bits: 5,
    metadata: 27
  }, b = {};
  for (let A = 0, _ = Object.keys(v); A < _.length; A++) {
    const E = _[A], T = v[_[A]].toString();
    b[T] = E;
  }
  const C = {
    1: (A) => t.encode(e.fromWordsUnsafe(A)),
    // 256 bits
    16: (A) => t.encode(e.fromWordsUnsafe(A)),
    // 256 bits
    13: (A) => n.encode(e.fromWordsUnsafe(A)),
    // string variable length
    19: (A) => t.encode(e.fromWordsUnsafe(A)),
    // 264 bits
    23: (A) => t.encode(e.fromWordsUnsafe(A)),
    // 256 bits
    27: (A) => t.encode(e.fromWordsUnsafe(A)),
    // variable
    6: M,
    // default: 3600 (1 hour)
    24: M,
    // default: 9
    3: I,
    // for extra routing info (private etc.)
    5: U
    // keep feature bits as array of 5 bit words
  };
  function L(A) {
    return (_) => ({
      tagCode: parseInt(A),
      words: e.encode("unknown", _, Number.MAX_SAFE_INTEGER)
    });
  }
  function M(A) {
    return A.reverse().reduce((_, E, T) => _ + E * Math.pow(32, T), 0);
  }
  function I(A) {
    const _ = [];
    let E, T, m, k, d, l = e.fromWordsUnsafe(A);
    for (; l.length > 0; )
      E = t.encode(l.slice(0, 33)), T = t.encode(l.slice(33, 41)), m = parseInt(t.encode(l.slice(41, 45)), 16), k = parseInt(
        t.encode(l.slice(45, 49)),
        16
      ), d = parseInt(t.encode(l.slice(49, 51)), 16), l = l.slice(51), _.push({
        pubkey: E,
        short_channel_id: T,
        fee_base_msat: m,
        fee_proportional_millionths: k,
        cltv_expiry_delta: d
      });
    return _;
  }
  function U(A) {
    const _ = A.slice().reverse().map((m) => [
      !!(m & 1),
      !!(m & 2),
      !!(m & 4),
      !!(m & 8),
      !!(m & 16)
    ]).reduce((m, k) => m.concat(k), []);
    for (; _.length < a.length * 2; )
      _.push(!1);
    const E = {};
    a.forEach((m, k) => {
      let d;
      _[k * 2] ? d = "required" : _[k * 2 + 1] ? d = "supported" : d = "unsupported", E[m] = d;
    });
    const T = _.slice(a.length * 2);
    return E.extra_bits = {
      start_bit: a.length * 2,
      bits: T,
      has_required: T.reduce(
        (m, k, d) => d % 2 !== 0 ? m || !1 : m || k,
        !1
      )
    }, E;
  }
  function q(A, _) {
    let E, T;
    if (A.slice(-1).match(/^[munp]$/))
      E = A.slice(-1), T = A.slice(0, -1);
    else {
      if (A.slice(-1).match(/^[^munp0-9]$/))
        throw new Error("Not a valid multiplier for the amount");
      T = A;
    }
    if (!T.match(/^\d+$/))
      throw new Error("Not a valid human readable amount");
    const m = BigInt(T), k = E ? m * g / h[E] : m * g;
    if (E === "p" && m % BigInt(10) !== BigInt(0) || k > w)
      throw new Error("Amount is outside of valid range");
    return _ ? k.toString() : k;
  }
  function Q(A, _) {
    if (typeof A != "string")
      throw new Error("Lightning Payment Request must be string");
    if (A.slice(0, 2).toLowerCase() !== "ln")
      throw new Error("Not a proper lightning payment request");
    const E = [], T = e.decode(A, Number.MAX_SAFE_INTEGER);
    A = A.toLowerCase();
    const m = T.prefix;
    let k = T.words, d = A.slice(m.length + 1), l = k.slice(-104);
    k = k.slice(0, -104);
    let u = m.match(/^ln(\S+?)(\d*)([a-zA-Z]?)$/);
    if (u && !u[2] && (u = m.match(/^ln(\S+)$/)), !u)
      throw new Error("Not a proper lightning payment request");
    E.push({
      name: "lightning_network",
      letters: "ln"
    });
    const p = u[1];
    let f;
    if (_) {
      if (_.bech32 === void 0 || _.pubKeyHash === void 0 || _.scriptHash === void 0 || !Array.isArray(_.validWitnessVersions))
        throw new Error("Invalid network");
      f = _;
    } else
      switch (p) {
        case r.bech32:
          f = r;
          break;
        case o.bech32:
          f = o;
          break;
        case i.bech32:
          f = i;
          break;
        case s.bech32:
          f = s;
          break;
        case c.bech32:
          f = c;
          break;
      }
    if (!f || f.bech32 !== p)
      throw new Error("Unknown coin bech32 prefix");
    E.push({
      name: "coin_network",
      letters: p,
      value: f
    });
    const y = u[2];
    let x;
    if (y) {
      const G = u[3];
      x = q(y + G, !0), E.push({
        name: "amount",
        letters: u[2] + u[3],
        value: x
      });
    } else
      x = null;
    E.push({
      name: "separator",
      letters: "1"
    });
    const O = M(k.slice(0, 7));
    k = k.slice(7), E.push({
      name: "timestamp",
      letters: d.slice(0, 7),
      value: O
    }), d = d.slice(7);
    let R, P, S, D;
    for (; k.length > 0; ) {
      const G = k[0].toString();
      R = b[G] || "unknown_tag", P = C[G] || L(G), k = k.slice(1), S = M(k.slice(0, 2)), k = k.slice(2), D = k.slice(0, S), k = k.slice(S), E.push({
        name: R,
        tag: d[0],
        letters: d.slice(0, 3 + S),
        value: P(D)
        // see: parsers for more comments
      }), d = d.slice(3 + S);
    }
    E.push({
      name: "signature",
      letters: d.slice(0, 104),
      value: t.encode(e.fromWordsUnsafe(l))
    }), d = d.slice(104), E.push({
      name: "checksum",
      letters: d
    });
    let J = {
      paymentRequest: A,
      sections: E,
      get expiry() {
        let G = E.find((X) => X.name === "expiry");
        if (G) return Y("timestamp") + G.value;
      },
      get route_hints() {
        return E.filter((G) => G.name === "route_hint").map((G) => G.value);
      }
    };
    for (let G in v)
      G !== "route_hint" && Object.defineProperty(J, G, {
        get() {
          return Y(G);
        }
      });
    return J;
    function Y(G) {
      let X = E.find((ie) => ie.name === G);
      return X ? X.value : void 0;
    }
  }
  return Kr = {
    decode: Q,
    hrpToMillisat: q
  }, Kr;
}
var Y4 = J4();
const X4 = (e) => Uint8Array.from(e.match(/.{1,2}/g).map((t) => parseInt(t, 16))), e3 = (e) => {
  if (!e)
    return null;
  try {
    const t = Y4.decode(e);
    if (!t || !t.sections)
      return null;
    const n = t.sections.find((C) => C.name === "payment_hash");
    if (n?.name !== "payment_hash" || !n.value)
      return null;
    const r = n.value;
    let o = 0, i = 0, s = "0";
    const c = t.sections.find((C) => C.name === "amount");
    c?.name === "amount" && c.value && (s = c.value, i = parseInt(c.value), o = parseInt(c.value) / 1e3);
    const a = t.sections.find((C) => C.name === "timestamp");
    if (a?.name !== "timestamp" || !a.value)
      return null;
    const h = a.value;
    let w;
    const g = t.sections.find((C) => C.name === "expiry");
    g?.name === "expiry" && (w = g.value);
    const v = t.sections.find((C) => C.name === "description"), b = v?.name === "description" ? v?.value : void 0;
    return {
      paymentHash: r,
      satoshi: o,
      millisatoshi: i,
      amountRaw: s,
      timestamp: h,
      expiry: w,
      description: b
    };
  } catch {
    return null;
  }
};
function t3(e, t) {
  try {
    if (!/^[0-9a-fA-F]{64}$/.test(e) || !/^[0-9a-fA-F]{64}$/.test(t))
      return !1;
    const n = H4(K4(X4(e)));
    return t === n;
  } catch {
    return !1;
  }
}
class n3 {
  constructor(t) {
    if (this.paymentRequest = t.pr, !this.paymentRequest)
      throw new Error("Invalid payment request");
    const n = e3(this.paymentRequest);
    if (!n)
      throw new Error("Failed to decode payment request");
    this.paymentHash = n.paymentHash, this.satoshi = n.satoshi, this.millisatoshi = n.millisatoshi, this.amountRaw = n.amountRaw, this.timestamp = n.timestamp, this.expiry = n.expiry, this.createdDate = new Date(this.timestamp * 1e3), this.expiryDate = this.expiry ? new Date((this.timestamp + this.expiry) * 1e3) : void 0, this.description = n.description ?? null, this.verify = t.verify ?? null, this.preimage = t.preimage ?? null, this.successAction = t.successAction ?? null;
  }
  async isPaid() {
    if (this.preimage)
      return this.validatePreimage(this.preimage);
    if (this.verify)
      return await this.verifyPayment();
    throw new Error("Could not verify payment");
  }
  validatePreimage(t) {
    return !t || !this.paymentHash ? !1 : t3(t, this.paymentHash);
  }
  async verifyPayment() {
    try {
      if (!this.verify)
        throw new Error("LNURL verify not available");
      const t = await fetch(this.verify);
      if (!t.ok)
        throw new Error(`Verification request failed: ${t.status} ${t.statusText}`);
      const n = await t.json();
      return n.preimage && (this.preimage = n.preimage), n.settled;
    } catch (t) {
      return console.error("Failed to check LNURL-verify", t), !1;
    }
  }
  hasExpired() {
    const { expiryDate: t } = this;
    return t ? t.getTime() < Date.now() : !1;
  }
}
const r3 = 1e8, o3 = async (e) => {
  const t = "https://getalby.com/api/rates/" + e.toLowerCase() + ".json", n = await fetch(t);
  if (!n.ok)
    throw new Error(`Failed to fetch rate: ${n.status} ${n.statusText}`);
  return (await n.json()).rate_float / r3;
}, i3 = async ({ satoshi: e, currency: t }) => {
  const n = await o3(t);
  return Number(e) * n;
};
var Qr = { exports: {} }, Rs;
function s3() {
  return Rs || (Rs = 1, (function(e, t) {
    var n = (function() {
      var r = function(A, _) {
        var E = 236, T = 17, m = A, k = i[_], d = null, l = 0, u = null, p = [], f = {}, y = function(N, $) {
          l = m * 4 + 17, d = (function(B) {
            for (var H = new Array(B), Z = 0; Z < B; Z += 1) {
              H[Z] = new Array(B);
              for (var K = 0; K < B; K += 1)
                H[Z][K] = null;
            }
            return H;
          })(l), x(0, 0), x(l - 7, 0), x(0, l - 7), P(), R(), D(N, $), m >= 7 && S(N), u == null && (u = G(m, k, p)), J(u, $);
        }, x = function(N, $) {
          for (var B = -1; B <= 7; B += 1)
            if (!(N + B <= -1 || l <= N + B))
              for (var H = -1; H <= 7; H += 1)
                $ + H <= -1 || l <= $ + H || (0 <= B && B <= 6 && (H == 0 || H == 6) || 0 <= H && H <= 6 && (B == 0 || B == 6) || 2 <= B && B <= 4 && 2 <= H && H <= 4 ? d[N + B][$ + H] = !0 : d[N + B][$ + H] = !1);
        }, O = function() {
          for (var N = 0, $ = 0, B = 0; B < 8; B += 1) {
            y(!0, B);
            var H = c.getLostPoint(f);
            (B == 0 || N > H) && (N = H, $ = B);
          }
          return $;
        }, R = function() {
          for (var N = 8; N < l - 8; N += 1)
            d[N][6] == null && (d[N][6] = N % 2 == 0);
          for (var $ = 8; $ < l - 8; $ += 1)
            d[6][$] == null && (d[6][$] = $ % 2 == 0);
        }, P = function() {
          for (var N = c.getPatternPosition(m), $ = 0; $ < N.length; $ += 1)
            for (var B = 0; B < N.length; B += 1) {
              var H = N[$], Z = N[B];
              if (d[H][Z] == null)
                for (var K = -2; K <= 2; K += 1)
                  for (var te = -2; te <= 2; te += 1)
                    K == -2 || K == 2 || te == -2 || te == 2 || K == 0 && te == 0 ? d[H + K][Z + te] = !0 : d[H + K][Z + te] = !1;
            }
        }, S = function(N) {
          for (var $ = c.getBCHTypeNumber(m), B = 0; B < 18; B += 1) {
            var H = !N && ($ >> B & 1) == 1;
            d[Math.floor(B / 3)][B % 3 + l - 8 - 3] = H;
          }
          for (var B = 0; B < 18; B += 1) {
            var H = !N && ($ >> B & 1) == 1;
            d[B % 3 + l - 8 - 3][Math.floor(B / 3)] = H;
          }
        }, D = function(N, $) {
          for (var B = k << 3 | $, H = c.getBCHTypeInfo(B), Z = 0; Z < 15; Z += 1) {
            var K = !N && (H >> Z & 1) == 1;
            Z < 6 ? d[Z][8] = K : Z < 8 ? d[Z + 1][8] = K : d[l - 15 + Z][8] = K;
          }
          for (var Z = 0; Z < 15; Z += 1) {
            var K = !N && (H >> Z & 1) == 1;
            Z < 8 ? d[8][l - Z - 1] = K : Z < 9 ? d[8][15 - Z - 1 + 1] = K : d[8][15 - Z - 1] = K;
          }
          d[l - 8][8] = !N;
        }, J = function(N, $) {
          for (var B = -1, H = l - 1, Z = 7, K = 0, te = c.getMaskFunction($), ee = l - 1; ee > 0; ee -= 2)
            for (ee == 6 && (ee -= 1); ; ) {
              for (var ge = 0; ge < 2; ge += 1)
                if (d[H][ee - ge] == null) {
                  var ve = !1;
                  K < N.length && (ve = (N[K] >>> Z & 1) == 1);
                  var ne = te(H, ee - ge);
                  ne && (ve = !ve), d[H][ee - ge] = ve, Z -= 1, Z == -1 && (K += 1, Z = 7);
                }
              if (H += B, H < 0 || l <= H) {
                H -= B, B = -B;
                break;
              }
            }
        }, Y = function(N, $) {
          for (var B = 0, H = 0, Z = 0, K = new Array($.length), te = new Array($.length), ee = 0; ee < $.length; ee += 1) {
            var ge = $[ee].dataCount, ve = $[ee].totalCount - ge;
            H = Math.max(H, ge), Z = Math.max(Z, ve), K[ee] = new Array(ge);
            for (var ne = 0; ne < K[ee].length; ne += 1)
              K[ee][ne] = 255 & N.getBuffer()[ne + B];
            B += ge;
            var Ue = c.getErrorCorrectPolynomial(ve), Oe = h(K[ee], Ue.getLength() - 1), Ji = Oe.mod(Ue);
            te[ee] = new Array(Ue.getLength() - 1);
            for (var ne = 0; ne < te[ee].length; ne += 1) {
              var Yi = ne + Ji.getLength() - te[ee].length;
              te[ee][ne] = Yi >= 0 ? Ji.getAt(Yi) : 0;
            }
          }
          for (var Xi = 0, ne = 0; ne < $.length; ne += 1)
            Xi += $[ne].totalCount;
          for (var Br = new Array(Xi), Bn = 0, ne = 0; ne < H; ne += 1)
            for (var ee = 0; ee < $.length; ee += 1)
              ne < K[ee].length && (Br[Bn] = K[ee][ne], Bn += 1);
          for (var ne = 0; ne < Z; ne += 1)
            for (var ee = 0; ee < $.length; ee += 1)
              ne < te[ee].length && (Br[Bn] = te[ee][ne], Bn += 1);
          return Br;
        }, G = function(N, $, B) {
          for (var H = w.getRSBlocks(N, $), Z = g(), K = 0; K < B.length; K += 1) {
            var te = B[K];
            Z.put(te.getMode(), 4), Z.put(te.getLength(), c.getLengthInBits(te.getMode(), N)), te.write(Z);
          }
          for (var ee = 0, K = 0; K < H.length; K += 1)
            ee += H[K].dataCount;
          if (Z.getLengthInBits() > ee * 8)
            throw "code length overflow. (" + Z.getLengthInBits() + ">" + ee * 8 + ")";
          for (Z.getLengthInBits() + 4 <= ee * 8 && Z.put(0, 4); Z.getLengthInBits() % 8 != 0; )
            Z.putBit(!1);
          for (; !(Z.getLengthInBits() >= ee * 8 || (Z.put(E, 8), Z.getLengthInBits() >= ee * 8)); )
            Z.put(T, 8);
          return Y(Z, H);
        };
        f.addData = function(N, $) {
          $ = $ || "Byte";
          var B = null;
          switch ($) {
            case "Numeric":
              B = v(N);
              break;
            case "Alphanumeric":
              B = b(N);
              break;
            case "Byte":
              B = C(N);
              break;
            case "Kanji":
              B = L(N);
              break;
            default:
              throw "mode:" + $;
          }
          p.push(B), u = null;
        }, f.isDark = function(N, $) {
          if (N < 0 || l <= N || $ < 0 || l <= $)
            throw N + "," + $;
          return d[N][$];
        }, f.getModuleCount = function() {
          return l;
        }, f.make = function() {
          if (m < 1) {
            for (var N = 1; N < 40; N++) {
              for (var $ = w.getRSBlocks(N, k), B = g(), H = 0; H < p.length; H++) {
                var Z = p[H];
                B.put(Z.getMode(), 4), B.put(Z.getLength(), c.getLengthInBits(Z.getMode(), N)), Z.write(B);
              }
              for (var K = 0, H = 0; H < $.length; H++)
                K += $[H].dataCount;
              if (B.getLengthInBits() <= K * 8)
                break;
            }
            m = N;
          }
          y(!1, O());
        }, f.createTableTag = function(N, $) {
          N = N || 2, $ = typeof $ > "u" ? N * 4 : $;
          var B = "";
          B += '<table style="', B += " border-width: 0px; border-style: none;", B += " border-collapse: collapse;", B += " padding: 0px; margin: " + $ + "px;", B += '">', B += "<tbody>";
          for (var H = 0; H < f.getModuleCount(); H += 1) {
            B += "<tr>";
            for (var Z = 0; Z < f.getModuleCount(); Z += 1)
              B += '<td style="', B += " border-width: 0px; border-style: none;", B += " border-collapse: collapse;", B += " padding: 0px; margin: 0px;", B += " width: " + N + "px;", B += " height: " + N + "px;", B += " background-color: ", B += f.isDark(H, Z) ? "#000000" : "#ffffff", B += ";", B += '"/>';
            B += "</tr>";
          }
          return B += "</tbody>", B += "</table>", B;
        }, f.createSvgTag = function(N, $, B, H) {
          var Z = {};
          typeof arguments[0] == "object" && (Z = arguments[0], N = Z.cellSize, $ = Z.margin, B = Z.alt, H = Z.title), N = N || 2, $ = typeof $ > "u" ? N * 4 : $, B = typeof B == "string" ? { text: B } : B || {}, B.text = B.text || null, B.id = B.text ? B.id || "qrcode-description" : null, H = typeof H == "string" ? { text: H } : H || {}, H.text = H.text || null, H.id = H.text ? H.id || "qrcode-title" : null;
          var K = f.getModuleCount() * N + $ * 2, te, ee, ge, ve, ne = "", Ue;
          for (Ue = "l" + N + ",0 0," + N + " -" + N + ",0 0,-" + N + "z ", ne += '<svg version="1.1" xmlns="http://www.w3.org/2000/svg"', ne += Z.scalable ? "" : ' width="' + K + 'px" height="' + K + 'px"', ne += ' viewBox="0 0 ' + K + " " + K + '" ', ne += ' preserveAspectRatio="xMinYMin meet"', ne += H.text || B.text ? ' role="img" aria-labelledby="' + X([H.id, B.id].join(" ").trim()) + '"' : "", ne += ">", ne += H.text ? '<title id="' + X(H.id) + '">' + X(H.text) + "</title>" : "", ne += B.text ? '<description id="' + X(B.id) + '">' + X(B.text) + "</description>" : "", ne += '<rect width="100%" height="100%" fill="white" cx="0" cy="0"/>', ne += '<path d="', ge = 0; ge < f.getModuleCount(); ge += 1)
            for (ve = ge * N + $, te = 0; te < f.getModuleCount(); te += 1)
              f.isDark(ge, te) && (ee = te * N + $, ne += "M" + ee + "," + ve + Ue);
          return ne += '" stroke="transparent" fill="black"/>', ne += "</svg>", ne;
        }, f.createDataURL = function(N, $) {
          N = N || 2, $ = typeof $ > "u" ? N * 4 : $;
          var B = f.getModuleCount() * N + $ * 2, H = $, Z = B - $;
          return Q(B, B, function(K, te) {
            if (H <= K && K < Z && H <= te && te < Z) {
              var ee = Math.floor((K - H) / N), ge = Math.floor((te - H) / N);
              return f.isDark(ge, ee) ? 0 : 1;
            } else
              return 1;
          });
        }, f.createImgTag = function(N, $, B) {
          N = N || 2, $ = typeof $ > "u" ? N * 4 : $;
          var H = f.getModuleCount() * N + $ * 2, Z = "";
          return Z += "<img", Z += ' src="', Z += f.createDataURL(N, $), Z += '"', Z += ' width="', Z += H, Z += '"', Z += ' height="', Z += H, Z += '"', B && (Z += ' alt="', Z += X(B), Z += '"'), Z += "/>", Z;
        };
        var X = function(N) {
          for (var $ = "", B = 0; B < N.length; B += 1) {
            var H = N.charAt(B);
            switch (H) {
              case "<":
                $ += "&lt;";
                break;
              case ">":
                $ += "&gt;";
                break;
              case "&":
                $ += "&amp;";
                break;
              case '"':
                $ += "&quot;";
                break;
              default:
                $ += H;
                break;
            }
          }
          return $;
        }, ie = function(N) {
          var $ = 1;
          N = typeof N > "u" ? $ * 2 : N;
          var B = f.getModuleCount() * $ + N * 2, H = N, Z = B - N, K, te, ee, ge, ve, ne = {
            "██": "█",
            "█ ": "▀",
            " █": "▄",
            "  ": " "
          }, Ue = {
            "██": "▀",
            "█ ": "▀",
            " █": " ",
            "  ": " "
          }, Oe = "";
          for (K = 0; K < B; K += 2) {
            for (ee = Math.floor((K - H) / $), ge = Math.floor((K + 1 - H) / $), te = 0; te < B; te += 1)
              ve = "█", H <= te && te < Z && H <= K && K < Z && f.isDark(ee, Math.floor((te - H) / $)) && (ve = " "), H <= te && te < Z && H <= K + 1 && K + 1 < Z && f.isDark(ge, Math.floor((te - H) / $)) ? ve += " " : ve += "█", Oe += N < 1 && K + 1 >= Z ? Ue[ve] : ne[ve];
            Oe += `
`;
          }
          return B % 2 && N > 0 ? Oe.substring(0, Oe.length - B - 1) + Array(B + 1).join("▀") : Oe.substring(0, Oe.length - 1);
        };
        return f.createASCII = function(N, $) {
          if (N = N || 1, N < 2)
            return ie($);
          N -= 1, $ = typeof $ > "u" ? N * 2 : $;
          var B = f.getModuleCount() * N + $ * 2, H = $, Z = B - $, K, te, ee, ge, ve = Array(N + 1).join("██"), ne = Array(N + 1).join("  "), Ue = "", Oe = "";
          for (K = 0; K < B; K += 1) {
            for (ee = Math.floor((K - H) / N), Oe = "", te = 0; te < B; te += 1)
              ge = 1, H <= te && te < Z && H <= K && K < Z && f.isDark(ee, Math.floor((te - H) / N)) && (ge = 0), Oe += ge ? ve : ne;
            for (ee = 0; ee < N; ee += 1)
              Ue += Oe + `
`;
          }
          return Ue.substring(0, Ue.length - 1);
        }, f.renderTo2dContext = function(N, $) {
          $ = $ || 2;
          for (var B = f.getModuleCount(), H = 0; H < B; H++)
            for (var Z = 0; Z < B; Z++)
              N.fillStyle = f.isDark(H, Z) ? "black" : "white", N.fillRect(H * $, Z * $, $, $);
        }, f;
      };
      r.stringToBytesFuncs = {
        default: function(A) {
          for (var _ = [], E = 0; E < A.length; E += 1) {
            var T = A.charCodeAt(E);
            _.push(T & 255);
          }
          return _;
        }
      }, r.stringToBytes = r.stringToBytesFuncs.default, r.createStringToBytes = function(A, _) {
        var E = (function() {
          for (var m = U(A), k = function() {
            var R = m.read();
            if (R == -1) throw "eof";
            return R;
          }, d = 0, l = {}; ; ) {
            var u = m.read();
            if (u == -1) break;
            var p = k(), f = k(), y = k(), x = String.fromCharCode(u << 8 | p), O = f << 8 | y;
            l[x] = O, d += 1;
          }
          if (d != _)
            throw d + " != " + _;
          return l;
        })(), T = 63;
        return function(m) {
          for (var k = [], d = 0; d < m.length; d += 1) {
            var l = m.charCodeAt(d);
            if (l < 128)
              k.push(l);
            else {
              var u = E[m.charAt(d)];
              typeof u == "number" ? (u & 255) == u ? k.push(u) : (k.push(u >>> 8), k.push(u & 255)) : k.push(T);
            }
          }
          return k;
        };
      };
      var o = {
        MODE_NUMBER: 1,
        MODE_ALPHA_NUM: 2,
        MODE_8BIT_BYTE: 4,
        MODE_KANJI: 8
      }, i = {
        L: 1,
        M: 0,
        Q: 3,
        H: 2
      }, s = {
        PATTERN000: 0,
        PATTERN001: 1,
        PATTERN010: 2,
        PATTERN011: 3,
        PATTERN100: 4,
        PATTERN101: 5,
        PATTERN110: 6,
        PATTERN111: 7
      }, c = (function() {
        var A = [
          [],
          [6, 18],
          [6, 22],
          [6, 26],
          [6, 30],
          [6, 34],
          [6, 22, 38],
          [6, 24, 42],
          [6, 26, 46],
          [6, 28, 50],
          [6, 30, 54],
          [6, 32, 58],
          [6, 34, 62],
          [6, 26, 46, 66],
          [6, 26, 48, 70],
          [6, 26, 50, 74],
          [6, 30, 54, 78],
          [6, 30, 56, 82],
          [6, 30, 58, 86],
          [6, 34, 62, 90],
          [6, 28, 50, 72, 94],
          [6, 26, 50, 74, 98],
          [6, 30, 54, 78, 102],
          [6, 28, 54, 80, 106],
          [6, 32, 58, 84, 110],
          [6, 30, 58, 86, 114],
          [6, 34, 62, 90, 118],
          [6, 26, 50, 74, 98, 122],
          [6, 30, 54, 78, 102, 126],
          [6, 26, 52, 78, 104, 130],
          [6, 30, 56, 82, 108, 134],
          [6, 34, 60, 86, 112, 138],
          [6, 30, 58, 86, 114, 142],
          [6, 34, 62, 90, 118, 146],
          [6, 30, 54, 78, 102, 126, 150],
          [6, 24, 50, 76, 102, 128, 154],
          [6, 28, 54, 80, 106, 132, 158],
          [6, 32, 58, 84, 110, 136, 162],
          [6, 26, 54, 82, 110, 138, 166],
          [6, 30, 58, 86, 114, 142, 170]
        ], _ = 1335, E = 7973, T = 21522, m = {}, k = function(d) {
          for (var l = 0; d != 0; )
            l += 1, d >>>= 1;
          return l;
        };
        return m.getBCHTypeInfo = function(d) {
          for (var l = d << 10; k(l) - k(_) >= 0; )
            l ^= _ << k(l) - k(_);
          return (d << 10 | l) ^ T;
        }, m.getBCHTypeNumber = function(d) {
          for (var l = d << 12; k(l) - k(E) >= 0; )
            l ^= E << k(l) - k(E);
          return d << 12 | l;
        }, m.getPatternPosition = function(d) {
          return A[d - 1];
        }, m.getMaskFunction = function(d) {
          switch (d) {
            case s.PATTERN000:
              return function(l, u) {
                return (l + u) % 2 == 0;
              };
            case s.PATTERN001:
              return function(l, u) {
                return l % 2 == 0;
              };
            case s.PATTERN010:
              return function(l, u) {
                return u % 3 == 0;
              };
            case s.PATTERN011:
              return function(l, u) {
                return (l + u) % 3 == 0;
              };
            case s.PATTERN100:
              return function(l, u) {
                return (Math.floor(l / 2) + Math.floor(u / 3)) % 2 == 0;
              };
            case s.PATTERN101:
              return function(l, u) {
                return l * u % 2 + l * u % 3 == 0;
              };
            case s.PATTERN110:
              return function(l, u) {
                return (l * u % 2 + l * u % 3) % 2 == 0;
              };
            case s.PATTERN111:
              return function(l, u) {
                return (l * u % 3 + (l + u) % 2) % 2 == 0;
              };
            default:
              throw "bad maskPattern:" + d;
          }
        }, m.getErrorCorrectPolynomial = function(d) {
          for (var l = h([1], 0), u = 0; u < d; u += 1)
            l = l.multiply(h([1, a.gexp(u)], 0));
          return l;
        }, m.getLengthInBits = function(d, l) {
          if (1 <= l && l < 10)
            switch (d) {
              case o.MODE_NUMBER:
                return 10;
              case o.MODE_ALPHA_NUM:
                return 9;
              case o.MODE_8BIT_BYTE:
                return 8;
              case o.MODE_KANJI:
                return 8;
              default:
                throw "mode:" + d;
            }
          else if (l < 27)
            switch (d) {
              case o.MODE_NUMBER:
                return 12;
              case o.MODE_ALPHA_NUM:
                return 11;
              case o.MODE_8BIT_BYTE:
                return 16;
              case o.MODE_KANJI:
                return 10;
              default:
                throw "mode:" + d;
            }
          else if (l < 41)
            switch (d) {
              case o.MODE_NUMBER:
                return 14;
              case o.MODE_ALPHA_NUM:
                return 13;
              case o.MODE_8BIT_BYTE:
                return 16;
              case o.MODE_KANJI:
                return 12;
              default:
                throw "mode:" + d;
            }
          else
            throw "type:" + l;
        }, m.getLostPoint = function(d) {
          for (var l = d.getModuleCount(), u = 0, p = 0; p < l; p += 1)
            for (var f = 0; f < l; f += 1) {
              for (var y = 0, x = d.isDark(p, f), O = -1; O <= 1; O += 1)
                if (!(p + O < 0 || l <= p + O))
                  for (var R = -1; R <= 1; R += 1)
                    f + R < 0 || l <= f + R || O == 0 && R == 0 || x == d.isDark(p + O, f + R) && (y += 1);
              y > 5 && (u += 3 + y - 5);
            }
          for (var p = 0; p < l - 1; p += 1)
            for (var f = 0; f < l - 1; f += 1) {
              var P = 0;
              d.isDark(p, f) && (P += 1), d.isDark(p + 1, f) && (P += 1), d.isDark(p, f + 1) && (P += 1), d.isDark(p + 1, f + 1) && (P += 1), (P == 0 || P == 4) && (u += 3);
            }
          for (var p = 0; p < l; p += 1)
            for (var f = 0; f < l - 6; f += 1)
              d.isDark(p, f) && !d.isDark(p, f + 1) && d.isDark(p, f + 2) && d.isDark(p, f + 3) && d.isDark(p, f + 4) && !d.isDark(p, f + 5) && d.isDark(p, f + 6) && (u += 40);
          for (var f = 0; f < l; f += 1)
            for (var p = 0; p < l - 6; p += 1)
              d.isDark(p, f) && !d.isDark(p + 1, f) && d.isDark(p + 2, f) && d.isDark(p + 3, f) && d.isDark(p + 4, f) && !d.isDark(p + 5, f) && d.isDark(p + 6, f) && (u += 40);
          for (var S = 0, f = 0; f < l; f += 1)
            for (var p = 0; p < l; p += 1)
              d.isDark(p, f) && (S += 1);
          var D = Math.abs(100 * S / l / l - 50) / 5;
          return u += D * 10, u;
        }, m;
      })(), a = (function() {
        for (var A = new Array(256), _ = new Array(256), E = 0; E < 8; E += 1)
          A[E] = 1 << E;
        for (var E = 8; E < 256; E += 1)
          A[E] = A[E - 4] ^ A[E - 5] ^ A[E - 6] ^ A[E - 8];
        for (var E = 0; E < 255; E += 1)
          _[A[E]] = E;
        var T = {};
        return T.glog = function(m) {
          if (m < 1)
            throw "glog(" + m + ")";
          return _[m];
        }, T.gexp = function(m) {
          for (; m < 0; )
            m += 255;
          for (; m >= 256; )
            m -= 255;
          return A[m];
        }, T;
      })();
      function h(A, _) {
        if (typeof A.length > "u")
          throw A.length + "/" + _;
        var E = (function() {
          for (var m = 0; m < A.length && A[m] == 0; )
            m += 1;
          for (var k = new Array(A.length - m + _), d = 0; d < A.length - m; d += 1)
            k[d] = A[d + m];
          return k;
        })(), T = {};
        return T.getAt = function(m) {
          return E[m];
        }, T.getLength = function() {
          return E.length;
        }, T.multiply = function(m) {
          for (var k = new Array(T.getLength() + m.getLength() - 1), d = 0; d < T.getLength(); d += 1)
            for (var l = 0; l < m.getLength(); l += 1)
              k[d + l] ^= a.gexp(a.glog(T.getAt(d)) + a.glog(m.getAt(l)));
          return h(k, 0);
        }, T.mod = function(m) {
          if (T.getLength() - m.getLength() < 0)
            return T;
          for (var k = a.glog(T.getAt(0)) - a.glog(m.getAt(0)), d = new Array(T.getLength()), l = 0; l < T.getLength(); l += 1)
            d[l] = T.getAt(l);
          for (var l = 0; l < m.getLength(); l += 1)
            d[l] ^= a.gexp(a.glog(m.getAt(l)) + k);
          return h(d, 0).mod(m);
        }, T;
      }
      var w = (function() {
        var A = [
          // L
          // M
          // Q
          // H
          // 1
          [1, 26, 19],
          [1, 26, 16],
          [1, 26, 13],
          [1, 26, 9],
          // 2
          [1, 44, 34],
          [1, 44, 28],
          [1, 44, 22],
          [1, 44, 16],
          // 3
          [1, 70, 55],
          [1, 70, 44],
          [2, 35, 17],
          [2, 35, 13],
          // 4
          [1, 100, 80],
          [2, 50, 32],
          [2, 50, 24],
          [4, 25, 9],
          // 5
          [1, 134, 108],
          [2, 67, 43],
          [2, 33, 15, 2, 34, 16],
          [2, 33, 11, 2, 34, 12],
          // 6
          [2, 86, 68],
          [4, 43, 27],
          [4, 43, 19],
          [4, 43, 15],
          // 7
          [2, 98, 78],
          [4, 49, 31],
          [2, 32, 14, 4, 33, 15],
          [4, 39, 13, 1, 40, 14],
          // 8
          [2, 121, 97],
          [2, 60, 38, 2, 61, 39],
          [4, 40, 18, 2, 41, 19],
          [4, 40, 14, 2, 41, 15],
          // 9
          [2, 146, 116],
          [3, 58, 36, 2, 59, 37],
          [4, 36, 16, 4, 37, 17],
          [4, 36, 12, 4, 37, 13],
          // 10
          [2, 86, 68, 2, 87, 69],
          [4, 69, 43, 1, 70, 44],
          [6, 43, 19, 2, 44, 20],
          [6, 43, 15, 2, 44, 16],
          // 11
          [4, 101, 81],
          [1, 80, 50, 4, 81, 51],
          [4, 50, 22, 4, 51, 23],
          [3, 36, 12, 8, 37, 13],
          // 12
          [2, 116, 92, 2, 117, 93],
          [6, 58, 36, 2, 59, 37],
          [4, 46, 20, 6, 47, 21],
          [7, 42, 14, 4, 43, 15],
          // 13
          [4, 133, 107],
          [8, 59, 37, 1, 60, 38],
          [8, 44, 20, 4, 45, 21],
          [12, 33, 11, 4, 34, 12],
          // 14
          [3, 145, 115, 1, 146, 116],
          [4, 64, 40, 5, 65, 41],
          [11, 36, 16, 5, 37, 17],
          [11, 36, 12, 5, 37, 13],
          // 15
          [5, 109, 87, 1, 110, 88],
          [5, 65, 41, 5, 66, 42],
          [5, 54, 24, 7, 55, 25],
          [11, 36, 12, 7, 37, 13],
          // 16
          [5, 122, 98, 1, 123, 99],
          [7, 73, 45, 3, 74, 46],
          [15, 43, 19, 2, 44, 20],
          [3, 45, 15, 13, 46, 16],
          // 17
          [1, 135, 107, 5, 136, 108],
          [10, 74, 46, 1, 75, 47],
          [1, 50, 22, 15, 51, 23],
          [2, 42, 14, 17, 43, 15],
          // 18
          [5, 150, 120, 1, 151, 121],
          [9, 69, 43, 4, 70, 44],
          [17, 50, 22, 1, 51, 23],
          [2, 42, 14, 19, 43, 15],
          // 19
          [3, 141, 113, 4, 142, 114],
          [3, 70, 44, 11, 71, 45],
          [17, 47, 21, 4, 48, 22],
          [9, 39, 13, 16, 40, 14],
          // 20
          [3, 135, 107, 5, 136, 108],
          [3, 67, 41, 13, 68, 42],
          [15, 54, 24, 5, 55, 25],
          [15, 43, 15, 10, 44, 16],
          // 21
          [4, 144, 116, 4, 145, 117],
          [17, 68, 42],
          [17, 50, 22, 6, 51, 23],
          [19, 46, 16, 6, 47, 17],
          // 22
          [2, 139, 111, 7, 140, 112],
          [17, 74, 46],
          [7, 54, 24, 16, 55, 25],
          [34, 37, 13],
          // 23
          [4, 151, 121, 5, 152, 122],
          [4, 75, 47, 14, 76, 48],
          [11, 54, 24, 14, 55, 25],
          [16, 45, 15, 14, 46, 16],
          // 24
          [6, 147, 117, 4, 148, 118],
          [6, 73, 45, 14, 74, 46],
          [11, 54, 24, 16, 55, 25],
          [30, 46, 16, 2, 47, 17],
          // 25
          [8, 132, 106, 4, 133, 107],
          [8, 75, 47, 13, 76, 48],
          [7, 54, 24, 22, 55, 25],
          [22, 45, 15, 13, 46, 16],
          // 26
          [10, 142, 114, 2, 143, 115],
          [19, 74, 46, 4, 75, 47],
          [28, 50, 22, 6, 51, 23],
          [33, 46, 16, 4, 47, 17],
          // 27
          [8, 152, 122, 4, 153, 123],
          [22, 73, 45, 3, 74, 46],
          [8, 53, 23, 26, 54, 24],
          [12, 45, 15, 28, 46, 16],
          // 28
          [3, 147, 117, 10, 148, 118],
          [3, 73, 45, 23, 74, 46],
          [4, 54, 24, 31, 55, 25],
          [11, 45, 15, 31, 46, 16],
          // 29
          [7, 146, 116, 7, 147, 117],
          [21, 73, 45, 7, 74, 46],
          [1, 53, 23, 37, 54, 24],
          [19, 45, 15, 26, 46, 16],
          // 30
          [5, 145, 115, 10, 146, 116],
          [19, 75, 47, 10, 76, 48],
          [15, 54, 24, 25, 55, 25],
          [23, 45, 15, 25, 46, 16],
          // 31
          [13, 145, 115, 3, 146, 116],
          [2, 74, 46, 29, 75, 47],
          [42, 54, 24, 1, 55, 25],
          [23, 45, 15, 28, 46, 16],
          // 32
          [17, 145, 115],
          [10, 74, 46, 23, 75, 47],
          [10, 54, 24, 35, 55, 25],
          [19, 45, 15, 35, 46, 16],
          // 33
          [17, 145, 115, 1, 146, 116],
          [14, 74, 46, 21, 75, 47],
          [29, 54, 24, 19, 55, 25],
          [11, 45, 15, 46, 46, 16],
          // 34
          [13, 145, 115, 6, 146, 116],
          [14, 74, 46, 23, 75, 47],
          [44, 54, 24, 7, 55, 25],
          [59, 46, 16, 1, 47, 17],
          // 35
          [12, 151, 121, 7, 152, 122],
          [12, 75, 47, 26, 76, 48],
          [39, 54, 24, 14, 55, 25],
          [22, 45, 15, 41, 46, 16],
          // 36
          [6, 151, 121, 14, 152, 122],
          [6, 75, 47, 34, 76, 48],
          [46, 54, 24, 10, 55, 25],
          [2, 45, 15, 64, 46, 16],
          // 37
          [17, 152, 122, 4, 153, 123],
          [29, 74, 46, 14, 75, 47],
          [49, 54, 24, 10, 55, 25],
          [24, 45, 15, 46, 46, 16],
          // 38
          [4, 152, 122, 18, 153, 123],
          [13, 74, 46, 32, 75, 47],
          [48, 54, 24, 14, 55, 25],
          [42, 45, 15, 32, 46, 16],
          // 39
          [20, 147, 117, 4, 148, 118],
          [40, 75, 47, 7, 76, 48],
          [43, 54, 24, 22, 55, 25],
          [10, 45, 15, 67, 46, 16],
          // 40
          [19, 148, 118, 6, 149, 119],
          [18, 75, 47, 31, 76, 48],
          [34, 54, 24, 34, 55, 25],
          [20, 45, 15, 61, 46, 16]
        ], _ = function(m, k) {
          var d = {};
          return d.totalCount = m, d.dataCount = k, d;
        }, E = {}, T = function(m, k) {
          switch (k) {
            case i.L:
              return A[(m - 1) * 4 + 0];
            case i.M:
              return A[(m - 1) * 4 + 1];
            case i.Q:
              return A[(m - 1) * 4 + 2];
            case i.H:
              return A[(m - 1) * 4 + 3];
            default:
              return;
          }
        };
        return E.getRSBlocks = function(m, k) {
          var d = T(m, k);
          if (typeof d > "u")
            throw "bad rs block @ typeNumber:" + m + "/errorCorrectionLevel:" + k;
          for (var l = d.length / 3, u = [], p = 0; p < l; p += 1)
            for (var f = d[p * 3 + 0], y = d[p * 3 + 1], x = d[p * 3 + 2], O = 0; O < f; O += 1)
              u.push(_(y, x));
          return u;
        }, E;
      })(), g = function() {
        var A = [], _ = 0, E = {};
        return E.getBuffer = function() {
          return A;
        }, E.getAt = function(T) {
          var m = Math.floor(T / 8);
          return (A[m] >>> 7 - T % 8 & 1) == 1;
        }, E.put = function(T, m) {
          for (var k = 0; k < m; k += 1)
            E.putBit((T >>> m - k - 1 & 1) == 1);
        }, E.getLengthInBits = function() {
          return _;
        }, E.putBit = function(T) {
          var m = Math.floor(_ / 8);
          A.length <= m && A.push(0), T && (A[m] |= 128 >>> _ % 8), _ += 1;
        }, E;
      }, v = function(A) {
        var _ = o.MODE_NUMBER, E = A, T = {};
        T.getMode = function() {
          return _;
        }, T.getLength = function(d) {
          return E.length;
        }, T.write = function(d) {
          for (var l = E, u = 0; u + 2 < l.length; )
            d.put(m(l.substring(u, u + 3)), 10), u += 3;
          u < l.length && (l.length - u == 1 ? d.put(m(l.substring(u, u + 1)), 4) : l.length - u == 2 && d.put(m(l.substring(u, u + 2)), 7));
        };
        var m = function(d) {
          for (var l = 0, u = 0; u < d.length; u += 1)
            l = l * 10 + k(d.charAt(u));
          return l;
        }, k = function(d) {
          if ("0" <= d && d <= "9")
            return d.charCodeAt(0) - 48;
          throw "illegal char :" + d;
        };
        return T;
      }, b = function(A) {
        var _ = o.MODE_ALPHA_NUM, E = A, T = {};
        T.getMode = function() {
          return _;
        }, T.getLength = function(k) {
          return E.length;
        }, T.write = function(k) {
          for (var d = E, l = 0; l + 1 < d.length; )
            k.put(
              m(d.charAt(l)) * 45 + m(d.charAt(l + 1)),
              11
            ), l += 2;
          l < d.length && k.put(m(d.charAt(l)), 6);
        };
        var m = function(k) {
          if ("0" <= k && k <= "9")
            return k.charCodeAt(0) - 48;
          if ("A" <= k && k <= "Z")
            return k.charCodeAt(0) - 65 + 10;
          switch (k) {
            case " ":
              return 36;
            case "$":
              return 37;
            case "%":
              return 38;
            case "*":
              return 39;
            case "+":
              return 40;
            case "-":
              return 41;
            case ".":
              return 42;
            case "/":
              return 43;
            case ":":
              return 44;
            default:
              throw "illegal char :" + k;
          }
        };
        return T;
      }, C = function(A) {
        var _ = o.MODE_8BIT_BYTE, E = r.stringToBytes(A), T = {};
        return T.getMode = function() {
          return _;
        }, T.getLength = function(m) {
          return E.length;
        }, T.write = function(m) {
          for (var k = 0; k < E.length; k += 1)
            m.put(E[k], 8);
        }, T;
      }, L = function(A) {
        var _ = o.MODE_KANJI, E = r.stringToBytesFuncs.SJIS;
        if (!E)
          throw "sjis not supported.";
        (function(k, d) {
          var l = E(k);
          if (l.length != 2 || (l[0] << 8 | l[1]) != d)
            throw "sjis not supported.";
        })("友", 38726);
        var T = E(A), m = {};
        return m.getMode = function() {
          return _;
        }, m.getLength = function(k) {
          return ~~(T.length / 2);
        }, m.write = function(k) {
          for (var d = T, l = 0; l + 1 < d.length; ) {
            var u = (255 & d[l]) << 8 | 255 & d[l + 1];
            if (33088 <= u && u <= 40956)
              u -= 33088;
            else if (57408 <= u && u <= 60351)
              u -= 49472;
            else
              throw "illegal char at " + (l + 1) + "/" + u;
            u = (u >>> 8 & 255) * 192 + (u & 255), k.put(u, 13), l += 2;
          }
          if (l < d.length)
            throw "illegal char at " + (l + 1);
        }, m;
      }, M = function() {
        var A = [], _ = {};
        return _.writeByte = function(E) {
          A.push(E & 255);
        }, _.writeShort = function(E) {
          _.writeByte(E), _.writeByte(E >>> 8);
        }, _.writeBytes = function(E, T, m) {
          T = T || 0, m = m || E.length;
          for (var k = 0; k < m; k += 1)
            _.writeByte(E[k + T]);
        }, _.writeString = function(E) {
          for (var T = 0; T < E.length; T += 1)
            _.writeByte(E.charCodeAt(T));
        }, _.toByteArray = function() {
          return A;
        }, _.toString = function() {
          var E = "";
          E += "[";
          for (var T = 0; T < A.length; T += 1)
            T > 0 && (E += ","), E += A[T];
          return E += "]", E;
        }, _;
      }, I = function() {
        var A = 0, _ = 0, E = 0, T = "", m = {}, k = function(l) {
          T += String.fromCharCode(d(l & 63));
        }, d = function(l) {
          if (!(l < 0)) {
            if (l < 26)
              return 65 + l;
            if (l < 52)
              return 97 + (l - 26);
            if (l < 62)
              return 48 + (l - 52);
            if (l == 62)
              return 43;
            if (l == 63)
              return 47;
          }
          throw "n:" + l;
        };
        return m.writeByte = function(l) {
          for (A = A << 8 | l & 255, _ += 8, E += 1; _ >= 6; )
            k(A >>> _ - 6), _ -= 6;
        }, m.flush = function() {
          if (_ > 0 && (k(A << 6 - _), A = 0, _ = 0), E % 3 != 0)
            for (var l = 3 - E % 3, u = 0; u < l; u += 1)
              T += "=";
        }, m.toString = function() {
          return T;
        }, m;
      }, U = function(A) {
        var _ = A, E = 0, T = 0, m = 0, k = {};
        k.read = function() {
          for (; m < 8; ) {
            if (E >= _.length) {
              if (m == 0)
                return -1;
              throw "unexpected end of file./" + m;
            }
            var l = _.charAt(E);
            if (E += 1, l == "=")
              return m = 0, -1;
            if (l.match(/^\s$/))
              continue;
            T = T << 6 | d(l.charCodeAt(0)), m += 6;
          }
          var u = T >>> m - 8 & 255;
          return m -= 8, u;
        };
        var d = function(l) {
          if (65 <= l && l <= 90)
            return l - 65;
          if (97 <= l && l <= 122)
            return l - 97 + 26;
          if (48 <= l && l <= 57)
            return l - 48 + 52;
          if (l == 43)
            return 62;
          if (l == 47)
            return 63;
          throw "c:" + l;
        };
        return k;
      }, q = function(A, _) {
        var E = A, T = _, m = new Array(A * _), k = {};
        k.setPixel = function(p, f, y) {
          m[f * E + p] = y;
        }, k.write = function(p) {
          p.writeString("GIF87a"), p.writeShort(E), p.writeShort(T), p.writeByte(128), p.writeByte(0), p.writeByte(0), p.writeByte(0), p.writeByte(0), p.writeByte(0), p.writeByte(255), p.writeByte(255), p.writeByte(255), p.writeString(","), p.writeShort(0), p.writeShort(0), p.writeShort(E), p.writeShort(T), p.writeByte(0);
          var f = 2, y = l(f);
          p.writeByte(f);
          for (var x = 0; y.length - x > 255; )
            p.writeByte(255), p.writeBytes(y, x, 255), x += 255;
          p.writeByte(y.length - x), p.writeBytes(y, x, y.length - x), p.writeByte(0), p.writeString(";");
        };
        var d = function(p) {
          var f = p, y = 0, x = 0, O = {};
          return O.write = function(R, P) {
            if (R >>> P)
              throw "length over";
            for (; y + P >= 8; )
              f.writeByte(255 & (R << y | x)), P -= 8 - y, R >>>= 8 - y, x = 0, y = 0;
            x = R << y | x, y = y + P;
          }, O.flush = function() {
            y > 0 && f.writeByte(x);
          }, O;
        }, l = function(p) {
          for (var f = 1 << p, y = (1 << p) + 1, x = p + 1, O = u(), R = 0; R < f; R += 1)
            O.add(String.fromCharCode(R));
          O.add(String.fromCharCode(f)), O.add(String.fromCharCode(y));
          var P = M(), S = d(P);
          S.write(f, x);
          var D = 0, J = String.fromCharCode(m[D]);
          for (D += 1; D < m.length; ) {
            var Y = String.fromCharCode(m[D]);
            D += 1, O.contains(J + Y) ? J = J + Y : (S.write(O.indexOf(J), x), O.size() < 4095 && (O.size() == 1 << x && (x += 1), O.add(J + Y)), J = Y);
          }
          return S.write(O.indexOf(J), x), S.write(y, x), S.flush(), P.toByteArray();
        }, u = function() {
          var p = {}, f = 0, y = {};
          return y.add = function(x) {
            if (y.contains(x))
              throw "dup key:" + x;
            p[x] = f, f += 1;
          }, y.size = function() {
            return f;
          }, y.indexOf = function(x) {
            return p[x];
          }, y.contains = function(x) {
            return typeof p[x] < "u";
          }, y;
        };
        return k;
      }, Q = function(A, _, E) {
        for (var T = q(A, _), m = 0; m < _; m += 1)
          for (var k = 0; k < A; k += 1)
            T.setPixel(k, m, E(k, m));
        var d = M();
        T.write(d);
        for (var l = I(), u = d.toByteArray(), p = 0; p < u.length; p += 1)
          l.writeByte(u[p]);
        return l.flush(), "data:image/gif;base64," + l;
      };
      return r;
    })();
    (function() {
      n.stringToBytesFuncs["UTF-8"] = function(r) {
        function o(i) {
          for (var s = [], c = 0; c < i.length; c++) {
            var a = i.charCodeAt(c);
            a < 128 ? s.push(a) : a < 2048 ? s.push(
              192 | a >> 6,
              128 | a & 63
            ) : a < 55296 || a >= 57344 ? s.push(
              224 | a >> 12,
              128 | a >> 6 & 63,
              128 | a & 63
            ) : (c++, a = 65536 + ((a & 1023) << 10 | i.charCodeAt(c) & 1023), s.push(
              240 | a >> 18,
              128 | a >> 12 & 63,
              128 | a >> 6 & 63,
              128 | a & 63
            ));
          }
          return s;
        }
        return o(r);
      };
    })(), (function(r) {
      e.exports = r();
    })(function() {
      return n;
    });
  })(Qr)), Qr.exports;
}
var a3 = s3();
const Bi = /* @__PURE__ */ D2(a3);
class Kn {
  constructor(t) {
    this._config = t;
  }
  async unload() {
  }
}
const c3 = (e) => {
  const t = [];
  for (let n = 0, r = atob(e.replace(/[ \r\n]+$/, "")); n < r.length; ++n) {
    let o = r.charCodeAt(n).toString(16);
    o.length === 1 && (o = "0" + o), t[t.length] = o;
  }
  return t.join("");
};
let ke;
async function l2() {
  try {
    if (ke) return ke;
    const e = (await import("./bitlogin-shared-DxcpMAo3.js").then((t) => t.i)).default;
    return ke = new e(), ke;
  } catch (e) {
    throw console.error(e), new Error("LNC is not available");
  }
}
const Ns = "ONLY CONNECT TO TRUSTED WEBSITES";
class d2 {
  constructor(t) {
    this.lnc = t;
  }
  enable() {
    return Promise.resolve();
  }
  async getInfo() {
    const t = await ke.lnd.lightning.getInfo();
    return { methods: ["enable", "getBalance", "getInfo", "sendPayment"], version: "1.0", node: { alias: t.alias, pubkey: t.identityPubkey, color: t.color }, supports: ["lightning"] };
  }
  makeInvoice(t) {
    throw new Error("Method not implemented.");
  }
  async sendPayment(t) {
    const n = await ke.lnd.lightning.sendPaymentSync({ paymentRequest: t });
    if (n.paymentError) throw new Error(n.paymentError);
    if (!n.paymentPreimage) throw new Error("No preimage in response");
    if (typeof n.paymentPreimage != "string") throw new Error("expected preimage as string");
    return { preimage: c3(n.paymentPreimage) };
  }
  async getBalance() {
    var t;
    const n = await ke.lnd.lightning.channelBalance();
    return { balance: parseInt(((t = n.localBalance) == null ? void 0 : t.sat) || "0") };
  }
  keysend(t) {
    throw new Error("Method not implemented.");
  }
  lnurl(t) {
    throw new Error("Method not implemented.");
  }
  lookupInvoice(t) {
    throw new Error("Method not implemented.");
  }
  signMessage(t) {
    throw new Error("Method not implemented.");
  }
  verifyMessage(t, n) {
    throw new Error("Method not implemented.");
  }
}
class u2 {
  constructor(t, n) {
    this._instanceUrl = t, this._adminKey = n;
  }
  enable() {
    return Promise.resolve();
  }
  async getInfo() {
    return { node: { alias: (await this.requestLnbits("GET", "/api/v1/wallet")).name, pubkey: "" }, methods: ["getInfo", "getBalance", "sendPayment"], version: "1.0", supports: ["lightning"] };
  }
  async makeInvoice(t) {
    return { paymentRequest: (await this.requestLnbits("POST", "/api/v1/payments", { amount: t.amount || t.defaultAmount || +t, memo: t.defaultMemo, out: !1 })).payment_request };
  }
  async sendPayment(t) {
    const n = await this.requestLnbits("POST", "/api/v1/payments", { bolt11: t, out: !0 }), r = await this.requestLnbits("GET", `/api/v1/payments/${n.payment_hash}`);
    if (!r.preimage) throw new Error("No preimage");
    return { preimage: r.preimage };
  }
  async getBalance() {
    const t = await this.requestLnbits("GET", "/api/v1/wallet");
    return { balance: Math.floor(t.balance / 1e3) };
  }
  keysend(t) {
    throw new Error("Method not implemented.");
  }
  lnurl(t) {
    throw new Error("Method not implemented.");
  }
  lookupInvoice(t) {
    throw new Error("Method not implemented.");
  }
  signMessage(t) {
    throw new Error("Method not implemented.");
  }
  verifyMessage(t, n) {
    throw new Error("Method not implemented.");
  }
  async requestLnbits(t, n, r) {
    let o = null;
    const i = new Headers();
    if (i.append("Accept", "application/json"), i.append("Content-Type", "application/json"), i.append("X-Api-Key", this._adminKey), t === "POST") o = JSON.stringify(r);
    else if (r !== void 0) throw new Error("TODO: support args in GET");
    const s = await fetch(this._instanceUrl + n + "", { method: t, headers: i, body: o });
    if (!s.ok) {
      const c = await s.json();
      throw console.error("errBody", c), new Error(c.detail);
    }
    return await s.json();
  }
}
function qe() {
  return qe = Object.assign ? Object.assign.bind() : function(e) {
    for (var t = 1; t < arguments.length; t++) {
      var n = arguments[t];
      for (var r in n) Object.prototype.hasOwnProperty.call(n, r) && (e[r] = n[r]);
    }
    return e;
  }, qe.apply(this, arguments);
}
class Ye extends Kn {
  constructor(t) {
    super(t);
  }
  async init() {
    if (!this._config.nwcUrl) throw new Error("no nwc URL provided");
    return new Ar({ nostrWalletConnectUrl: this._config.nwcUrl });
  }
}
const l3 = { "extension.generic": class extends Kn {
  constructor(e) {
    super(e);
  }
  init() {
    if (!window.webln) throw new Error("No WebLN provider available");
    return Promise.resolve(window.webln);
  }
}, "nwc.alby": Ye, "nwc.albyhub": Ye, "nwc.generic": Ye, "nwc.lnfi": Ye, "nwc.coinos": Ye, "nwc.flash": Ye, "nwc.cashume": Ye, "nwc.lnbits": Ye, "nwc.rizful": Ye, lnbits: class extends Kn {
  constructor(e) {
    super(e);
  }
  async init() {
    if (!this._config.lnbitsInstanceUrl) throw new Error("no lnbits URL provided");
    if (!this._config.lnbitsAdminKey) throw new Error("no lnbits admin key provided");
    return new u2(this._config.lnbitsInstanceUrl, this._config.lnbitsAdminKey);
  }
}, lnc: class extends Kn {
  constructor(e) {
    super(e);
  }
  async init() {
    await l2();
    const e = new d2(ke);
    try {
      const t = !ke.credentials.pairingPhrase;
      for (t ? (console.log("Pairing phrase does not exist"), ke.credentials.password = Ns) : console.log("Pairing phrase set"), await ke.connect(), t || (ke.credentials.password = Ns); !ke.isConnected; ) console.log("Waiting to connect..."), await new Promise((n) => {
        setTimeout(n, 100);
      });
    } catch (t) {
      throw console.error(t), ke.disconnect(), ke.credentials.clear(), t;
    }
    return e;
  }
  async unload() {
    ke.disconnect(), ke.credentials.clear(), await super.unload();
  }
} }, Ro = { showBalance: !0, appName: "Bitcoin Connect", persistConnection: !0 }, V = $4((e, t) => ({ route: "/start", routeHistory: [], modalOpen: !1, currency: void 0, connected: !1, connecting: !1, error: void 0, alias: void 0, balance: void 0, connectorName: void 0, invoice: void 0, provider: void 0, connector: void 0, connectorConfig: void 0, bitcoinConnectConfig: Ro, info: void 0, connectNWC: (n) => t().connect({ connectorName: "NWC", connectorType: "nwc.generic", nwcUrl: n }), connect: async (n, r = { redirectTo: "/connected" }) => {
  e({ connecting: !0, error: void 0 });
  try {
    const o = new l3[n.connectorType](n), i = await o.init();
    let s;
    await i.enable();
    try {
      s = await i.getInfo();
    } catch {
      console.error("Failed to request wallet info");
    }
    if (!t().connecting) return;
    e({ connectorConfig: n, connector: o, connected: !0, connecting: !1, info: s, provider: i, connectorName: n.connectorName, route: r.redirectTo });
    const { bitcoinConnectConfig: c } = t();
    c.persistConnection !== !1 && window.localStorage.setItem("bc:config", JSON.stringify(n));
  } catch (o) {
    console.error(o), e({ error: o.toString(), connecting: !1 }), t().disconnect();
  }
}, disconnect: () => {
  var n;
  (n = t().connector) == null || n.unload(), e({ connectorConfig: void 0, connector: void 0, connected: !1, connecting: !1, connectorName: void 0, provider: void 0, modalOpen: !1 }), window.localStorage.removeItem("bc:config");
}, pushRoute: (n) => {
  t().route !== n && e({ route: n, routeHistory: [...t().routeHistory, t().route] });
}, popRoute() {
  const n = t().routeHistory, r = n.pop() || "/start";
  e({ route: r, routeHistory: n });
}, clearRouteHistory() {
  e({ route: "/start", routeHistory: [] });
}, setModalOpen: (n) => {
  e({ modalOpen: n });
}, setBitcoinConnectConfig: (n) => {
  e({ bitcoinConnectConfig: qe({}, Ro, n) });
  const r = t();
  r.bitcoinConnectConfig.autoConnect === !1 || r.connected || r.connecting || (function() {
    try {
      const { hash: o } = window.location;
      if (o) {
        const i = o.indexOf("?"), s = o.slice(i > 0 ? i : 1), c = new URLSearchParams(s), a = c.get("nwc");
        if (a && a.startsWith("nostr+walletconnect://")) {
          const { searchParams: h } = new URL(a);
          h.get("relay") && h.get("secret") && (c.delete("nwc"), window.location.hash = o.slice(0, i > 0 ? i + 1 : 1) + c.toString(), V.getState().connectNWC(a));
        }
      }
    } catch (o) {
      console.error(o);
    }
  })();
}, setError: (n) => {
  e({ error: n });
}, setCurrency: (n) => {
  n ? window.localStorage.setItem("bc:currency", n) : window.localStorage.removeItem("bc:currency"), e({ currency: n });
}, supports: (n) => {
  const { info: r, provider: o } = t();
  return !(r == null || !r.methods) && r.methods.indexOf(n) > -1 && !(o == null || !o.getBalance);
} }));
function F(e, t, n, r) {
  var o, i = arguments.length, s = i < 3 ? t : r;
  if (typeof Reflect == "object" && typeof Reflect.decorate == "function") s = Reflect.decorate(e, t, n, r);
  else for (var c = e.length - 1; c >= 0; c--) (o = e[c]) && (s = (i < 3 ? o(s) : i > 3 ? o(t, n, s) : o(t, n)) || s);
  return i > 3 && s && Object.defineProperty(t, n, s), s;
}
globalThis.window && ((function() {
  const e = window.localStorage.getItem("bc:config");
  if (e) {
    const n = JSON.parse(e);
    V.getState().connect(n, { redirectTo: "/start" });
  }
  const t = window.localStorage.getItem("bc:currency");
  t && V.getState().setCurrency(t);
})(), window.addEventListener("webln:enabled", () => {
  V.getState().connecting || V.getState().connect({ connectorName: "Extension", connectorType: "extension.generic" }, { redirectTo: "/start" });
})), typeof SuppressedError == "function" && SuppressedError;
const Qn = globalThis, Ri = Qn.ShadowRoot && (Qn.ShadyCSS === void 0 || Qn.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype, h2 = Symbol(), $s = /* @__PURE__ */ new WeakMap();
class d3 {
  constructor(t, n, r) {
    if (this._$cssResult$ = !0, r !== h2) throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
    this.cssText = t, this.t = n;
  }
  get styleSheet() {
    let t = this.o;
    const n = this.t;
    if (Ri && t === void 0) {
      const r = n !== void 0 && n.length === 1;
      r && (t = $s.get(n)), t === void 0 && ((this.o = t = new CSSStyleSheet()).replaceSync(this.cssText), r && $s.set(n, t));
    }
    return t;
  }
  toString() {
    return this.cssText;
  }
}
const Is = Ri ? (e) => e : (e) => e instanceof CSSStyleSheet ? ((t) => {
  let n = "";
  for (const r of t.cssRules) n += r.cssText;
  return ((r) => new d3(typeof r == "string" ? r : r + "", void 0, h2))(n);
})(e) : e, { is: u3, defineProperty: h3, getOwnPropertyDescriptor: f3, getOwnPropertyNames: p3, getOwnPropertySymbols: g3, getPrototypeOf: w3 } = Object, kr = globalThis, Us = kr.trustedTypes, y3 = Us ? Us.emptyScript : "", b3 = kr.reactiveElementPolyfillSupport, wn = (e, t) => e, ar = { toAttribute(e, t) {
  switch (t) {
    case Boolean:
      e = e ? y3 : null;
      break;
    case Object:
    case Array:
      e = e == null ? e : JSON.stringify(e);
  }
  return e;
}, fromAttribute(e, t) {
  let n = e;
  switch (t) {
    case Boolean:
      n = e !== null;
      break;
    case Number:
      n = e === null ? null : Number(e);
      break;
    case Object:
    case Array:
      try {
        n = JSON.parse(e);
      } catch {
        n = null;
      }
  }
  return n;
} }, Ni = (e, t) => !u3(e, t), Os = { attribute: !0, type: String, converter: ar, reflect: !1, useDefault: !1, hasChanged: Ni };
Symbol.metadata ??= Symbol("metadata"), kr.litPropertyMetadata ??= /* @__PURE__ */ new WeakMap();
class sn extends HTMLElement {
  static addInitializer(t) {
    this._$Ei(), (this.l ??= []).push(t);
  }
  static get observedAttributes() {
    return this.finalize(), this._$Eh && [...this._$Eh.keys()];
  }
  static createProperty(t, n = Os) {
    if (n.state && (n.attribute = !1), this._$Ei(), this.prototype.hasOwnProperty(t) && ((n = Object.create(n)).wrapped = !0), this.elementProperties.set(t, n), !n.noAccessor) {
      const r = Symbol(), o = this.getPropertyDescriptor(t, r, n);
      o !== void 0 && h3(this.prototype, t, o);
    }
  }
  static getPropertyDescriptor(t, n, r) {
    const { get: o, set: i } = f3(this.prototype, t) ?? { get() {
      return this[n];
    }, set(s) {
      this[n] = s;
    } };
    return { get: o, set(s) {
      const c = o?.call(this);
      i?.call(this, s), this.requestUpdate(t, c, r);
    }, configurable: !0, enumerable: !0 };
  }
  static getPropertyOptions(t) {
    return this.elementProperties.get(t) ?? Os;
  }
  static _$Ei() {
    if (this.hasOwnProperty(wn("elementProperties"))) return;
    const t = w3(this);
    t.finalize(), t.l !== void 0 && (this.l = [...t.l]), this.elementProperties = new Map(t.elementProperties);
  }
  static finalize() {
    if (this.hasOwnProperty(wn("finalized"))) return;
    if (this.finalized = !0, this._$Ei(), this.hasOwnProperty(wn("properties"))) {
      const n = this.properties, r = [...p3(n), ...g3(n)];
      for (const o of r) this.createProperty(o, n[o]);
    }
    const t = this[Symbol.metadata];
    if (t !== null) {
      const n = litPropertyMetadata.get(t);
      if (n !== void 0) for (const [r, o] of n) this.elementProperties.set(r, o);
    }
    this._$Eh = /* @__PURE__ */ new Map();
    for (const [n, r] of this.elementProperties) {
      const o = this._$Eu(n, r);
      o !== void 0 && this._$Eh.set(o, n);
    }
    this.elementStyles = this.finalizeStyles(this.styles);
  }
  static finalizeStyles(t) {
    const n = [];
    if (Array.isArray(t)) {
      const r = new Set(t.flat(1 / 0).reverse());
      for (const o of r) n.unshift(Is(o));
    } else t !== void 0 && n.push(Is(t));
    return n;
  }
  static _$Eu(t, n) {
    const r = n.attribute;
    return r === !1 ? void 0 : typeof r == "string" ? r : typeof t == "string" ? t.toLowerCase() : void 0;
  }
  constructor() {
    super(), this._$Ep = void 0, this.isUpdatePending = !1, this.hasUpdated = !1, this._$Em = null, this._$Ev();
  }
  _$Ev() {
    this._$ES = new Promise((t) => this.enableUpdating = t), this._$AL = /* @__PURE__ */ new Map(), this._$E_(), this.requestUpdate(), this.constructor.l?.forEach((t) => t(this));
  }
  addController(t) {
    (this._$EO ??= /* @__PURE__ */ new Set()).add(t), this.renderRoot !== void 0 && this.isConnected && t.hostConnected?.();
  }
  removeController(t) {
    this._$EO?.delete(t);
  }
  _$E_() {
    const t = /* @__PURE__ */ new Map(), n = this.constructor.elementProperties;
    for (const r of n.keys()) this.hasOwnProperty(r) && (t.set(r, this[r]), delete this[r]);
    t.size > 0 && (this._$Ep = t);
  }
  createRenderRoot() {
    const t = this.shadowRoot ?? this.attachShadow(this.constructor.shadowRootOptions);
    return ((n, r) => {
      if (Ri) n.adoptedStyleSheets = r.map((o) => o instanceof CSSStyleSheet ? o : o.styleSheet);
      else for (const o of r) {
        const i = document.createElement("style"), s = Qn.litNonce;
        s !== void 0 && i.setAttribute("nonce", s), i.textContent = o.cssText, n.appendChild(i);
      }
    })(t, this.constructor.elementStyles), t;
  }
  connectedCallback() {
    this.renderRoot ??= this.createRenderRoot(), this.enableUpdating(!0), this._$EO?.forEach((t) => t.hostConnected?.());
  }
  enableUpdating(t) {
  }
  disconnectedCallback() {
    this._$EO?.forEach((t) => t.hostDisconnected?.());
  }
  attributeChangedCallback(t, n, r) {
    this._$AK(t, r);
  }
  _$ET(t, n) {
    const r = this.constructor.elementProperties.get(t), o = this.constructor._$Eu(t, r);
    if (o !== void 0 && r.reflect === !0) {
      const i = (r.converter?.toAttribute !== void 0 ? r.converter : ar).toAttribute(n, r.type);
      this._$Em = t, i == null ? this.removeAttribute(o) : this.setAttribute(o, i), this._$Em = null;
    }
  }
  _$AK(t, n) {
    const r = this.constructor, o = r._$Eh.get(t);
    if (o !== void 0 && this._$Em !== o) {
      const i = r.getPropertyOptions(o), s = typeof i.converter == "function" ? { fromAttribute: i.converter } : i.converter?.fromAttribute !== void 0 ? i.converter : ar;
      this._$Em = o, this[o] = s.fromAttribute(n, i.type) ?? this._$Ej?.get(o) ?? null, this._$Em = null;
    }
  }
  requestUpdate(t, n, r) {
    if (t !== void 0) {
      const o = this.constructor, i = this[t];
      if (r ??= o.getPropertyOptions(t), !((r.hasChanged ?? Ni)(i, n) || r.useDefault && r.reflect && i === this._$Ej?.get(t) && !this.hasAttribute(o._$Eu(t, r)))) return;
      this.C(t, n, r);
    }
    this.isUpdatePending === !1 && (this._$ES = this._$EP());
  }
  C(t, n, { useDefault: r, reflect: o, wrapped: i }, s) {
    r && !(this._$Ej ??= /* @__PURE__ */ new Map()).has(t) && (this._$Ej.set(t, s ?? n ?? this[t]), i !== !0 || s !== void 0) || (this._$AL.has(t) || (this.hasUpdated || r || (n = void 0), this._$AL.set(t, n)), o === !0 && this._$Em !== t && (this._$Eq ??= /* @__PURE__ */ new Set()).add(t));
  }
  async _$EP() {
    this.isUpdatePending = !0;
    try {
      await this._$ES;
    } catch (n) {
      Promise.reject(n);
    }
    const t = this.scheduleUpdate();
    return t != null && await t, !this.isUpdatePending;
  }
  scheduleUpdate() {
    return this.performUpdate();
  }
  performUpdate() {
    if (!this.isUpdatePending) return;
    if (!this.hasUpdated) {
      if (this.renderRoot ??= this.createRenderRoot(), this._$Ep) {
        for (const [o, i] of this._$Ep) this[o] = i;
        this._$Ep = void 0;
      }
      const r = this.constructor.elementProperties;
      if (r.size > 0) for (const [o, i] of r) {
        const { wrapped: s } = i, c = this[o];
        s !== !0 || this._$AL.has(o) || c === void 0 || this.C(o, void 0, i, c);
      }
    }
    let t = !1;
    const n = this._$AL;
    try {
      t = this.shouldUpdate(n), t ? (this.willUpdate(n), this._$EO?.forEach((r) => r.hostUpdate?.()), this.update(n)) : this._$EM();
    } catch (r) {
      throw t = !1, this._$EM(), r;
    }
    t && this._$AE(n);
  }
  willUpdate(t) {
  }
  _$AE(t) {
    this._$EO?.forEach((n) => n.hostUpdated?.()), this.hasUpdated || (this.hasUpdated = !0, this.firstUpdated(t)), this.updated(t);
  }
  _$EM() {
    this._$AL = /* @__PURE__ */ new Map(), this.isUpdatePending = !1;
  }
  get updateComplete() {
    return this.getUpdateComplete();
  }
  getUpdateComplete() {
    return this._$ES;
  }
  shouldUpdate(t) {
    return !0;
  }
  update(t) {
    this._$Eq &&= this._$Eq.forEach((n) => this._$ET(n, this[n])), this._$EM();
  }
  updated(t) {
  }
  firstUpdated(t) {
  }
}
sn.elementStyles = [], sn.shadowRootOptions = { mode: "open" }, sn[wn("elementProperties")] = /* @__PURE__ */ new Map(), sn[wn("finalized")] = /* @__PURE__ */ new Map(), b3?.({ ReactiveElement: sn }), (kr.reactiveElementVersions ??= []).push("2.1.0");
const $i = globalThis, cr = $i.trustedTypes, Ps = cr ? cr.createPolicy("lit-html", { createHTML: (e) => e }) : void 0, Hs = "$lit$", dt = `lit$${Math.random().toFixed(9).slice(2)}$`, f2 = "?" + dt, m3 = `<${f2}>`, $t = document, lr = () => $t.createComment(""), vn = (e) => e === null || typeof e != "object" && typeof e != "function", No = Array.isArray, Jr = `[ 	
\f\r]`, an = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g, Ds = /-->/g, Zs = />/g, Et = RegExp(`>|${Jr}(?:([^\\s"'>=/]+)(${Jr}*=${Jr}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`, "g"), Ws = /'/g, Fs = /"/g, Vs = /^(?:script|style|textarea|title)$/i, Cn = Symbol.for("lit-noChange"), Ee = Symbol.for("lit-nothing"), Gs = /* @__PURE__ */ new WeakMap(), Mt = $t.createTreeWalker($t, 129);
function p2(e, t) {
  if (!No(e) || !e.hasOwnProperty("raw")) throw Error("invalid template strings array");
  return Ps !== void 0 ? Ps.createHTML(t) : t;
}
class xn {
  constructor({ strings: t, _$litType$: n }, r) {
    let o;
    this.parts = [];
    let i = 0, s = 0;
    const c = t.length - 1, a = this.parts, [h, w] = ((g, v) => {
      const b = g.length - 1, C = [];
      let L, M = v === 2 ? "<svg>" : v === 3 ? "<math>" : "", I = an;
      for (let U = 0; U < b; U++) {
        const q = g[U];
        let Q, A, _ = -1, E = 0;
        for (; E < q.length && (I.lastIndex = E, A = I.exec(q), A !== null); ) E = I.lastIndex, I === an ? A[1] === "!--" ? I = Ds : A[1] !== void 0 ? I = Zs : A[2] !== void 0 ? (Vs.test(A[2]) && (L = RegExp("</" + A[2], "g")), I = Et) : A[3] !== void 0 && (I = Et) : I === Et ? A[0] === ">" ? (I = L ?? an, _ = -1) : A[1] === void 0 ? _ = -2 : (_ = I.lastIndex - A[2].length, Q = A[1], I = A[3] === void 0 ? Et : A[3] === '"' ? Fs : Ws) : I === Fs || I === Ws ? I = Et : I === Ds || I === Zs ? I = an : (I = Et, L = void 0);
        const T = I === Et && g[U + 1].startsWith("/>") ? " " : "";
        M += I === an ? q + m3 : _ >= 0 ? (C.push(Q), q.slice(0, _) + Hs + q.slice(_) + dt + T) : q + dt + (_ === -2 ? U : T);
      }
      return [p2(g, M + (g[b] || "<?>") + (v === 2 ? "</svg>" : v === 3 ? "</math>" : "")), C];
    })(t, n);
    if (this.el = xn.createElement(h, r), Mt.currentNode = this.el.content, n === 2 || n === 3) {
      const g = this.el.content.firstChild;
      g.replaceWith(...g.childNodes);
    }
    for (; (o = Mt.nextNode()) !== null && a.length < c; ) {
      if (o.nodeType === 1) {
        if (o.hasAttributes()) for (const g of o.getAttributeNames()) if (g.endsWith(Hs)) {
          const v = w[s++], b = o.getAttribute(g).split(dt), C = /([.?@])?(.*)/.exec(v);
          a.push({ type: 1, index: i, name: C[2], strings: b, ctor: C[1] === "." ? C3 : C[1] === "?" ? x3 : C[1] === "@" ? E3 : Sr }), o.removeAttribute(g);
        } else g.startsWith(dt) && (a.push({ type: 6, index: i }), o.removeAttribute(g));
        if (Vs.test(o.tagName)) {
          const g = o.textContent.split(dt), v = g.length - 1;
          if (v > 0) {
            o.textContent = cr ? cr.emptyScript : "";
            for (let b = 0; b < v; b++) o.append(g[b], lr()), Mt.nextNode(), a.push({ type: 2, index: ++i });
            o.append(g[v], lr());
          }
        }
      } else if (o.nodeType === 8) if (o.data === f2) a.push({ type: 2, index: i });
      else {
        let g = -1;
        for (; (g = o.data.indexOf(dt, g + 1)) !== -1; ) a.push({ type: 7, index: i }), g += dt.length - 1;
      }
      i++;
    }
  }
  static createElement(t, n) {
    const r = $t.createElement("template");
    return r.innerHTML = t, r;
  }
}
function Xt(e, t, n = e, r) {
  if (t === Cn) return t;
  let o = r !== void 0 ? n._$Co?.[r] : n._$Cl;
  const i = vn(t) ? void 0 : t._$litDirective$;
  return o?.constructor !== i && (o?._$AO?.(!1), i === void 0 ? o = void 0 : (o = new i(e), o._$AT(e, n, r)), r !== void 0 ? (n._$Co ??= [])[r] = o : n._$Cl = o), o !== void 0 && (t = Xt(e, o._$AS(e, t.values), o, r)), t;
}
class v3 {
  constructor(t, n) {
    this._$AV = [], this._$AN = void 0, this._$AD = t, this._$AM = n;
  }
  get parentNode() {
    return this._$AM.parentNode;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  u(t) {
    const { el: { content: n }, parts: r } = this._$AD, o = (t?.creationScope ?? $t).importNode(n, !0);
    Mt.currentNode = o;
    let i = Mt.nextNode(), s = 0, c = 0, a = r[0];
    for (; a !== void 0; ) {
      if (s === a.index) {
        let h;
        a.type === 2 ? h = new _r(i, i.nextSibling, this, t) : a.type === 1 ? h = new a.ctor(i, a.name, a.strings, this, t) : a.type === 6 && (h = new A3(i, this, t)), this._$AV.push(h), a = r[++c];
      }
      s !== a?.index && (i = Mt.nextNode(), s++);
    }
    return Mt.currentNode = $t, o;
  }
  p(t) {
    let n = 0;
    for (const r of this._$AV) r !== void 0 && (r.strings !== void 0 ? (r._$AI(t, r, n), n += r.strings.length - 2) : r._$AI(t[n])), n++;
  }
}
class _r {
  get _$AU() {
    return this._$AM?._$AU ?? this._$Cv;
  }
  constructor(t, n, r, o) {
    this.type = 2, this._$AH = Ee, this._$AN = void 0, this._$AA = t, this._$AB = n, this._$AM = r, this.options = o, this._$Cv = o?.isConnected ?? !0;
  }
  get parentNode() {
    let t = this._$AA.parentNode;
    const n = this._$AM;
    return n !== void 0 && t?.nodeType === 11 && (t = n.parentNode), t;
  }
  get startNode() {
    return this._$AA;
  }
  get endNode() {
    return this._$AB;
  }
  _$AI(t, n = this) {
    t = Xt(this, t, n), vn(t) ? t === Ee || t == null || t === "" ? (this._$AH !== Ee && this._$AR(), this._$AH = Ee) : t !== this._$AH && t !== Cn && this._(t) : t._$litType$ !== void 0 ? this.$(t) : t.nodeType !== void 0 ? this.T(t) : ((r) => No(r) || typeof r?.[Symbol.iterator] == "function")(t) ? this.k(t) : this._(t);
  }
  O(t) {
    return this._$AA.parentNode.insertBefore(t, this._$AB);
  }
  T(t) {
    this._$AH !== t && (this._$AR(), this._$AH = this.O(t));
  }
  _(t) {
    this._$AH !== Ee && vn(this._$AH) ? this._$AA.nextSibling.data = t : this.T($t.createTextNode(t)), this._$AH = t;
  }
  $(t) {
    const { values: n, _$litType$: r } = t, o = typeof r == "number" ? this._$AC(t) : (r.el === void 0 && (r.el = xn.createElement(p2(r.h, r.h[0]), this.options)), r);
    if (this._$AH?._$AD === o) this._$AH.p(n);
    else {
      const i = new v3(o, this), s = i.u(this.options);
      i.p(n), this.T(s), this._$AH = i;
    }
  }
  _$AC(t) {
    let n = Gs.get(t.strings);
    return n === void 0 && Gs.set(t.strings, n = new xn(t)), n;
  }
  k(t) {
    No(this._$AH) || (this._$AH = [], this._$AR());
    const n = this._$AH;
    let r, o = 0;
    for (const i of t) o === n.length ? n.push(r = new _r(this.O(lr()), this.O(lr()), this, this.options)) : r = n[o], r._$AI(i), o++;
    o < n.length && (this._$AR(r && r._$AB.nextSibling, o), n.length = o);
  }
  _$AR(t = this._$AA.nextSibling, n) {
    for (this._$AP?.(!1, !0, n); t && t !== this._$AB; ) {
      const r = t.nextSibling;
      t.remove(), t = r;
    }
  }
  setConnected(t) {
    this._$AM === void 0 && (this._$Cv = t, this._$AP?.(t));
  }
}
class Sr {
  get tagName() {
    return this.element.tagName;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  constructor(t, n, r, o, i) {
    this.type = 1, this._$AH = Ee, this._$AN = void 0, this.element = t, this.name = n, this._$AM = o, this.options = i, r.length > 2 || r[0] !== "" || r[1] !== "" ? (this._$AH = Array(r.length - 1).fill(new String()), this.strings = r) : this._$AH = Ee;
  }
  _$AI(t, n = this, r, o) {
    const i = this.strings;
    let s = !1;
    if (i === void 0) t = Xt(this, t, n, 0), s = !vn(t) || t !== this._$AH && t !== Cn, s && (this._$AH = t);
    else {
      const c = t;
      let a, h;
      for (t = i[0], a = 0; a < i.length - 1; a++) h = Xt(this, c[r + a], n, a), h === Cn && (h = this._$AH[a]), s ||= !vn(h) || h !== this._$AH[a], h === Ee ? t = Ee : t !== Ee && (t += (h ?? "") + i[a + 1]), this._$AH[a] = h;
    }
    s && !o && this.j(t);
  }
  j(t) {
    t === Ee ? this.element.removeAttribute(this.name) : this.element.setAttribute(this.name, t ?? "");
  }
}
class C3 extends Sr {
  constructor() {
    super(...arguments), this.type = 3;
  }
  j(t) {
    this.element[this.name] = t === Ee ? void 0 : t;
  }
}
class x3 extends Sr {
  constructor() {
    super(...arguments), this.type = 4;
  }
  j(t) {
    this.element.toggleAttribute(this.name, !!t && t !== Ee);
  }
}
class E3 extends Sr {
  constructor(t, n, r, o, i) {
    super(t, n, r, o, i), this.type = 5;
  }
  _$AI(t, n = this) {
    if ((t = Xt(this, t, n, 0) ?? Ee) === Cn) return;
    const r = this._$AH, o = t === Ee && r !== Ee || t.capture !== r.capture || t.once !== r.once || t.passive !== r.passive, i = t !== Ee && (r === Ee || o);
    o && this.element.removeEventListener(this.name, this, r), i && this.element.addEventListener(this.name, this, t), this._$AH = t;
  }
  handleEvent(t) {
    typeof this._$AH == "function" ? this._$AH.call(this.options?.host ?? this.element, t) : this._$AH.handleEvent(t);
  }
}
class A3 {
  constructor(t, n, r) {
    this.element = t, this.type = 6, this._$AN = void 0, this._$AM = n, this.options = r;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  _$AI(t) {
    Xt(this, t);
  }
}
const k3 = $i.litHtmlPolyfillSupport;
k3?.(xn, _r), ($i.litHtmlVersions ??= []).push("3.3.0");
const Jn = globalThis, Ii = Jn.ShadowRoot && (Jn.ShadyCSS === void 0 || Jn.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype, Ui = Symbol(), js = /* @__PURE__ */ new WeakMap();
class g2 {
  constructor(t, n, r) {
    if (this._$cssResult$ = !0, r !== Ui) throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
    this.cssText = t, this.t = n;
  }
  get styleSheet() {
    let t = this.o;
    const n = this.t;
    if (Ii && t === void 0) {
      const r = n !== void 0 && n.length === 1;
      r && (t = js.get(n)), t === void 0 && ((this.o = t = new CSSStyleSheet()).replaceSync(this.cssText), r && js.set(n, t));
    }
    return t;
  }
  toString() {
    return this.cssText;
  }
}
const Lr = (e, ...t) => {
  const n = e.length === 1 ? e[0] : t.reduce((r, o, i) => r + ((s) => {
    if (s._$cssResult$ === !0) return s.cssText;
    if (typeof s == "number") return s;
    throw Error("Value passed to 'css' function must be a 'css' function result: " + s + ". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.");
  })(o) + e[i + 1], e[0]);
  return new g2(n, e, Ui);
}, zs = Ii ? (e) => e : (e) => e instanceof CSSStyleSheet ? ((t) => {
  let n = "";
  for (const r of t.cssRules) n += r.cssText;
  return ((r) => new g2(typeof r == "string" ? r : r + "", void 0, Ui))(n);
})(e) : e, { is: _3, defineProperty: S3, getOwnPropertyDescriptor: L3, getOwnPropertyNames: T3, getOwnPropertySymbols: M3, getPrototypeOf: B3 } = Object, Tr = globalThis, qs = Tr.trustedTypes, R3 = qs ? qs.emptyScript : "", N3 = Tr.reactiveElementPolyfillSupport, yn = (e, t) => e, $o = { toAttribute(e, t) {
  switch (t) {
    case Boolean:
      e = e ? R3 : null;
      break;
    case Object:
    case Array:
      e = e == null ? e : JSON.stringify(e);
  }
  return e;
}, fromAttribute(e, t) {
  let n = e;
  switch (t) {
    case Boolean:
      n = e !== null;
      break;
    case Number:
      n = e === null ? null : Number(e);
      break;
    case Object:
    case Array:
      try {
        n = JSON.parse(e);
      } catch {
        n = null;
      }
  }
  return n;
} }, w2 = (e, t) => !_3(e, t), Ks = { attribute: !0, type: String, converter: $o, reflect: !1, useDefault: !1, hasChanged: w2 };
Symbol.metadata ??= Symbol("metadata"), Tr.litPropertyMetadata ??= /* @__PURE__ */ new WeakMap();
class Ft extends HTMLElement {
  static addInitializer(t) {
    this._$Ei(), (this.l ??= []).push(t);
  }
  static get observedAttributes() {
    return this.finalize(), this._$Eh && [...this._$Eh.keys()];
  }
  static createProperty(t, n = Ks) {
    if (n.state && (n.attribute = !1), this._$Ei(), this.prototype.hasOwnProperty(t) && ((n = Object.create(n)).wrapped = !0), this.elementProperties.set(t, n), !n.noAccessor) {
      const r = Symbol(), o = this.getPropertyDescriptor(t, r, n);
      o !== void 0 && S3(this.prototype, t, o);
    }
  }
  static getPropertyDescriptor(t, n, r) {
    const { get: o, set: i } = L3(this.prototype, t) ?? { get() {
      return this[n];
    }, set(s) {
      this[n] = s;
    } };
    return { get: o, set(s) {
      const c = o?.call(this);
      i?.call(this, s), this.requestUpdate(t, c, r);
    }, configurable: !0, enumerable: !0 };
  }
  static getPropertyOptions(t) {
    return this.elementProperties.get(t) ?? Ks;
  }
  static _$Ei() {
    if (this.hasOwnProperty(yn("elementProperties"))) return;
    const t = B3(this);
    t.finalize(), t.l !== void 0 && (this.l = [...t.l]), this.elementProperties = new Map(t.elementProperties);
  }
  static finalize() {
    if (this.hasOwnProperty(yn("finalized"))) return;
    if (this.finalized = !0, this._$Ei(), this.hasOwnProperty(yn("properties"))) {
      const n = this.properties, r = [...T3(n), ...M3(n)];
      for (const o of r) this.createProperty(o, n[o]);
    }
    const t = this[Symbol.metadata];
    if (t !== null) {
      const n = litPropertyMetadata.get(t);
      if (n !== void 0) for (const [r, o] of n) this.elementProperties.set(r, o);
    }
    this._$Eh = /* @__PURE__ */ new Map();
    for (const [n, r] of this.elementProperties) {
      const o = this._$Eu(n, r);
      o !== void 0 && this._$Eh.set(o, n);
    }
    this.elementStyles = this.finalizeStyles(this.styles);
  }
  static finalizeStyles(t) {
    const n = [];
    if (Array.isArray(t)) {
      const r = new Set(t.flat(1 / 0).reverse());
      for (const o of r) n.unshift(zs(o));
    } else t !== void 0 && n.push(zs(t));
    return n;
  }
  static _$Eu(t, n) {
    const r = n.attribute;
    return r === !1 ? void 0 : typeof r == "string" ? r : typeof t == "string" ? t.toLowerCase() : void 0;
  }
  constructor() {
    super(), this._$Ep = void 0, this.isUpdatePending = !1, this.hasUpdated = !1, this._$Em = null, this._$Ev();
  }
  _$Ev() {
    this._$ES = new Promise((t) => this.enableUpdating = t), this._$AL = /* @__PURE__ */ new Map(), this._$E_(), this.requestUpdate(), this.constructor.l?.forEach((t) => t(this));
  }
  addController(t) {
    (this._$EO ??= /* @__PURE__ */ new Set()).add(t), this.renderRoot !== void 0 && this.isConnected && t.hostConnected?.();
  }
  removeController(t) {
    this._$EO?.delete(t);
  }
  _$E_() {
    const t = /* @__PURE__ */ new Map(), n = this.constructor.elementProperties;
    for (const r of n.keys()) this.hasOwnProperty(r) && (t.set(r, this[r]), delete this[r]);
    t.size > 0 && (this._$Ep = t);
  }
  createRenderRoot() {
    const t = this.shadowRoot ?? this.attachShadow(this.constructor.shadowRootOptions);
    return ((n, r) => {
      if (Ii) n.adoptedStyleSheets = r.map((o) => o instanceof CSSStyleSheet ? o : o.styleSheet);
      else for (const o of r) {
        const i = document.createElement("style"), s = Jn.litNonce;
        s !== void 0 && i.setAttribute("nonce", s), i.textContent = o.cssText, n.appendChild(i);
      }
    })(t, this.constructor.elementStyles), t;
  }
  connectedCallback() {
    this.renderRoot ??= this.createRenderRoot(), this.enableUpdating(!0), this._$EO?.forEach((t) => t.hostConnected?.());
  }
  enableUpdating(t) {
  }
  disconnectedCallback() {
    this._$EO?.forEach((t) => t.hostDisconnected?.());
  }
  attributeChangedCallback(t, n, r) {
    this._$AK(t, r);
  }
  _$ET(t, n) {
    const r = this.constructor.elementProperties.get(t), o = this.constructor._$Eu(t, r);
    if (o !== void 0 && r.reflect === !0) {
      const i = (r.converter?.toAttribute !== void 0 ? r.converter : $o).toAttribute(n, r.type);
      this._$Em = t, i == null ? this.removeAttribute(o) : this.setAttribute(o, i), this._$Em = null;
    }
  }
  _$AK(t, n) {
    const r = this.constructor, o = r._$Eh.get(t);
    if (o !== void 0 && this._$Em !== o) {
      const i = r.getPropertyOptions(o), s = typeof i.converter == "function" ? { fromAttribute: i.converter } : i.converter?.fromAttribute !== void 0 ? i.converter : $o;
      this._$Em = o, this[o] = s.fromAttribute(n, i.type) ?? this._$Ej?.get(o) ?? null, this._$Em = null;
    }
  }
  requestUpdate(t, n, r) {
    if (t !== void 0) {
      const o = this.constructor, i = this[t];
      if (r ??= o.getPropertyOptions(t), !((r.hasChanged ?? w2)(i, n) || r.useDefault && r.reflect && i === this._$Ej?.get(t) && !this.hasAttribute(o._$Eu(t, r)))) return;
      this.C(t, n, r);
    }
    this.isUpdatePending === !1 && (this._$ES = this._$EP());
  }
  C(t, n, { useDefault: r, reflect: o, wrapped: i }, s) {
    r && !(this._$Ej ??= /* @__PURE__ */ new Map()).has(t) && (this._$Ej.set(t, s ?? n ?? this[t]), i !== !0 || s !== void 0) || (this._$AL.has(t) || (this.hasUpdated || r || (n = void 0), this._$AL.set(t, n)), o === !0 && this._$Em !== t && (this._$Eq ??= /* @__PURE__ */ new Set()).add(t));
  }
  async _$EP() {
    this.isUpdatePending = !0;
    try {
      await this._$ES;
    } catch (n) {
      Promise.reject(n);
    }
    const t = this.scheduleUpdate();
    return t != null && await t, !this.isUpdatePending;
  }
  scheduleUpdate() {
    return this.performUpdate();
  }
  performUpdate() {
    if (!this.isUpdatePending) return;
    if (!this.hasUpdated) {
      if (this.renderRoot ??= this.createRenderRoot(), this._$Ep) {
        for (const [o, i] of this._$Ep) this[o] = i;
        this._$Ep = void 0;
      }
      const r = this.constructor.elementProperties;
      if (r.size > 0) for (const [o, i] of r) {
        const { wrapped: s } = i, c = this[o];
        s !== !0 || this._$AL.has(o) || c === void 0 || this.C(o, void 0, i, c);
      }
    }
    let t = !1;
    const n = this._$AL;
    try {
      t = this.shouldUpdate(n), t ? (this.willUpdate(n), this._$EO?.forEach((r) => r.hostUpdate?.()), this.update(n)) : this._$EM();
    } catch (r) {
      throw t = !1, this._$EM(), r;
    }
    t && this._$AE(n);
  }
  willUpdate(t) {
  }
  _$AE(t) {
    this._$EO?.forEach((n) => n.hostUpdated?.()), this.hasUpdated || (this.hasUpdated = !0, this.firstUpdated(t)), this.updated(t);
  }
  _$EM() {
    this._$AL = /* @__PURE__ */ new Map(), this.isUpdatePending = !1;
  }
  get updateComplete() {
    return this.getUpdateComplete();
  }
  getUpdateComplete() {
    return this._$ES;
  }
  shouldUpdate(t) {
    return !0;
  }
  update(t) {
    this._$Eq &&= this._$Eq.forEach((n) => this._$ET(n, this[n])), this._$EM();
  }
  updated(t) {
  }
  firstUpdated(t) {
  }
}
Ft.elementStyles = [], Ft.shadowRootOptions = { mode: "open" }, Ft[yn("elementProperties")] = /* @__PURE__ */ new Map(), Ft[yn("finalized")] = /* @__PURE__ */ new Map(), N3?.({ ReactiveElement: Ft }), (Tr.reactiveElementVersions ??= []).push("2.1.0");
const Oi = globalThis, dr = Oi.trustedTypes, Qs = dr ? dr.createPolicy("lit-html", { createHTML: (e) => e }) : void 0, y2 = "$lit$", ft = `lit$${Math.random().toFixed(9).slice(2)}$`, b2 = "?" + ft, $3 = `<${b2}>`, It = document, En = () => It.createComment(""), An = (e) => e === null || typeof e != "object" && typeof e != "function", Io = Array.isArray, Yr = `[ 	
\f\r]`, cn = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g, Js = /-->/g, Ys = />/g, At = RegExp(`>|${Yr}(?:([^\\s"'>=/]+)(${Yr}*=${Yr}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`, "g"), Xs = /'/g, ea = /"/g, m2 = /^(?:script|style|textarea|title)$/i, v2 = (e) => (t, ...n) => ({ _$litType$: e, strings: t, values: n }), W = v2(1), de = v2(2), en = Symbol.for("lit-noChange"), Ae = Symbol.for("lit-nothing"), ta = /* @__PURE__ */ new WeakMap(), Bt = It.createTreeWalker(It, 129);
function C2(e, t) {
  if (!Io(e) || !e.hasOwnProperty("raw")) throw Error("invalid template strings array");
  return Qs !== void 0 ? Qs.createHTML(t) : t;
}
const I3 = (e, t) => {
  const n = e.length - 1, r = [];
  let o, i = t === 2 ? "<svg>" : t === 3 ? "<math>" : "", s = cn;
  for (let c = 0; c < n; c++) {
    const a = e[c];
    let h, w, g = -1, v = 0;
    for (; v < a.length && (s.lastIndex = v, w = s.exec(a), w !== null); ) v = s.lastIndex, s === cn ? w[1] === "!--" ? s = Js : w[1] !== void 0 ? s = Ys : w[2] !== void 0 ? (m2.test(w[2]) && (o = RegExp("</" + w[2], "g")), s = At) : w[3] !== void 0 && (s = At) : s === At ? w[0] === ">" ? (s = o ?? cn, g = -1) : w[1] === void 0 ? g = -2 : (g = s.lastIndex - w[2].length, h = w[1], s = w[3] === void 0 ? At : w[3] === '"' ? ea : Xs) : s === ea || s === Xs ? s = At : s === Js || s === Ys ? s = cn : (s = At, o = void 0);
    const b = s === At && e[c + 1].startsWith("/>") ? " " : "";
    i += s === cn ? a + $3 : g >= 0 ? (r.push(h), a.slice(0, g) + y2 + a.slice(g) + ft + b) : a + ft + (g === -2 ? c : b);
  }
  return [C2(e, i + (e[n] || "<?>") + (t === 2 ? "</svg>" : t === 3 ? "</math>" : "")), r];
};
class kn {
  constructor({ strings: t, _$litType$: n }, r) {
    let o;
    this.parts = [];
    let i = 0, s = 0;
    const c = t.length - 1, a = this.parts, [h, w] = I3(t, n);
    if (this.el = kn.createElement(h, r), Bt.currentNode = this.el.content, n === 2 || n === 3) {
      const g = this.el.content.firstChild;
      g.replaceWith(...g.childNodes);
    }
    for (; (o = Bt.nextNode()) !== null && a.length < c; ) {
      if (o.nodeType === 1) {
        if (o.hasAttributes()) for (const g of o.getAttributeNames()) if (g.endsWith(y2)) {
          const v = w[s++], b = o.getAttribute(g).split(ft), C = /([.?@])?(.*)/.exec(v);
          a.push({ type: 1, index: i, name: C[2], strings: b, ctor: C[1] === "." ? O3 : C[1] === "?" ? P3 : C[1] === "@" ? H3 : Mr }), o.removeAttribute(g);
        } else g.startsWith(ft) && (a.push({ type: 6, index: i }), o.removeAttribute(g));
        if (m2.test(o.tagName)) {
          const g = o.textContent.split(ft), v = g.length - 1;
          if (v > 0) {
            o.textContent = dr ? dr.emptyScript : "";
            for (let b = 0; b < v; b++) o.append(g[b], En()), Bt.nextNode(), a.push({ type: 2, index: ++i });
            o.append(g[v], En());
          }
        }
      } else if (o.nodeType === 8) if (o.data === b2) a.push({ type: 2, index: i });
      else {
        let g = -1;
        for (; (g = o.data.indexOf(ft, g + 1)) !== -1; ) a.push({ type: 7, index: i }), g += ft.length - 1;
      }
      i++;
    }
  }
  static createElement(t, n) {
    const r = It.createElement("template");
    return r.innerHTML = t, r;
  }
}
function tn(e, t, n = e, r) {
  if (t === en) return t;
  let o = r !== void 0 ? n._$Co?.[r] : n._$Cl;
  const i = An(t) ? void 0 : t._$litDirective$;
  return o?.constructor !== i && (o?._$AO?.(!1), i === void 0 ? o = void 0 : (o = new i(e), o._$AT(e, n, r)), r !== void 0 ? (n._$Co ??= [])[r] = o : n._$Cl = o), o !== void 0 && (t = tn(e, o._$AS(e, t.values), o, r)), t;
}
class U3 {
  constructor(t, n) {
    this._$AV = [], this._$AN = void 0, this._$AD = t, this._$AM = n;
  }
  get parentNode() {
    return this._$AM.parentNode;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  u(t) {
    const { el: { content: n }, parts: r } = this._$AD, o = (t?.creationScope ?? It).importNode(n, !0);
    Bt.currentNode = o;
    let i = Bt.nextNode(), s = 0, c = 0, a = r[0];
    for (; a !== void 0; ) {
      if (s === a.index) {
        let h;
        a.type === 2 ? h = new Mn(i, i.nextSibling, this, t) : a.type === 1 ? h = new a.ctor(i, a.name, a.strings, this, t) : a.type === 6 && (h = new D3(i, this, t)), this._$AV.push(h), a = r[++c];
      }
      s !== a?.index && (i = Bt.nextNode(), s++);
    }
    return Bt.currentNode = It, o;
  }
  p(t) {
    let n = 0;
    for (const r of this._$AV) r !== void 0 && (r.strings !== void 0 ? (r._$AI(t, r, n), n += r.strings.length - 2) : r._$AI(t[n])), n++;
  }
}
class Mn {
  get _$AU() {
    return this._$AM?._$AU ?? this._$Cv;
  }
  constructor(t, n, r, o) {
    this.type = 2, this._$AH = Ae, this._$AN = void 0, this._$AA = t, this._$AB = n, this._$AM = r, this.options = o, this._$Cv = o?.isConnected ?? !0;
  }
  get parentNode() {
    let t = this._$AA.parentNode;
    const n = this._$AM;
    return n !== void 0 && t?.nodeType === 11 && (t = n.parentNode), t;
  }
  get startNode() {
    return this._$AA;
  }
  get endNode() {
    return this._$AB;
  }
  _$AI(t, n = this) {
    t = tn(this, t, n), An(t) ? t === Ae || t == null || t === "" ? (this._$AH !== Ae && this._$AR(), this._$AH = Ae) : t !== this._$AH && t !== en && this._(t) : t._$litType$ !== void 0 ? this.$(t) : t.nodeType !== void 0 ? this.T(t) : ((r) => Io(r) || typeof r?.[Symbol.iterator] == "function")(t) ? this.k(t) : this._(t);
  }
  O(t) {
    return this._$AA.parentNode.insertBefore(t, this._$AB);
  }
  T(t) {
    this._$AH !== t && (this._$AR(), this._$AH = this.O(t));
  }
  _(t) {
    this._$AH !== Ae && An(this._$AH) ? this._$AA.nextSibling.data = t : this.T(It.createTextNode(t)), this._$AH = t;
  }
  $(t) {
    const { values: n, _$litType$: r } = t, o = typeof r == "number" ? this._$AC(t) : (r.el === void 0 && (r.el = kn.createElement(C2(r.h, r.h[0]), this.options)), r);
    if (this._$AH?._$AD === o) this._$AH.p(n);
    else {
      const i = new U3(o, this), s = i.u(this.options);
      i.p(n), this.T(s), this._$AH = i;
    }
  }
  _$AC(t) {
    let n = ta.get(t.strings);
    return n === void 0 && ta.set(t.strings, n = new kn(t)), n;
  }
  k(t) {
    Io(this._$AH) || (this._$AH = [], this._$AR());
    const n = this._$AH;
    let r, o = 0;
    for (const i of t) o === n.length ? n.push(r = new Mn(this.O(En()), this.O(En()), this, this.options)) : r = n[o], r._$AI(i), o++;
    o < n.length && (this._$AR(r && r._$AB.nextSibling, o), n.length = o);
  }
  _$AR(t = this._$AA.nextSibling, n) {
    for (this._$AP?.(!1, !0, n); t && t !== this._$AB; ) {
      const r = t.nextSibling;
      t.remove(), t = r;
    }
  }
  setConnected(t) {
    this._$AM === void 0 && (this._$Cv = t, this._$AP?.(t));
  }
}
class Mr {
  get tagName() {
    return this.element.tagName;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  constructor(t, n, r, o, i) {
    this.type = 1, this._$AH = Ae, this._$AN = void 0, this.element = t, this.name = n, this._$AM = o, this.options = i, r.length > 2 || r[0] !== "" || r[1] !== "" ? (this._$AH = Array(r.length - 1).fill(new String()), this.strings = r) : this._$AH = Ae;
  }
  _$AI(t, n = this, r, o) {
    const i = this.strings;
    let s = !1;
    if (i === void 0) t = tn(this, t, n, 0), s = !An(t) || t !== this._$AH && t !== en, s && (this._$AH = t);
    else {
      const c = t;
      let a, h;
      for (t = i[0], a = 0; a < i.length - 1; a++) h = tn(this, c[r + a], n, a), h === en && (h = this._$AH[a]), s ||= !An(h) || h !== this._$AH[a], h === Ae ? t = Ae : t !== Ae && (t += (h ?? "") + i[a + 1]), this._$AH[a] = h;
    }
    s && !o && this.j(t);
  }
  j(t) {
    t === Ae ? this.element.removeAttribute(this.name) : this.element.setAttribute(this.name, t ?? "");
  }
}
class O3 extends Mr {
  constructor() {
    super(...arguments), this.type = 3;
  }
  j(t) {
    this.element[this.name] = t === Ae ? void 0 : t;
  }
}
class P3 extends Mr {
  constructor() {
    super(...arguments), this.type = 4;
  }
  j(t) {
    this.element.toggleAttribute(this.name, !!t && t !== Ae);
  }
}
class H3 extends Mr {
  constructor(t, n, r, o, i) {
    super(t, n, r, o, i), this.type = 5;
  }
  _$AI(t, n = this) {
    if ((t = tn(this, t, n, 0) ?? Ae) === en) return;
    const r = this._$AH, o = t === Ae && r !== Ae || t.capture !== r.capture || t.once !== r.once || t.passive !== r.passive, i = t !== Ae && (r === Ae || o);
    o && this.element.removeEventListener(this.name, this, r), i && this.element.addEventListener(this.name, this, t), this._$AH = t;
  }
  handleEvent(t) {
    typeof this._$AH == "function" ? this._$AH.call(this.options?.host ?? this.element, t) : this._$AH.handleEvent(t);
  }
}
class D3 {
  constructor(t, n, r) {
    this.element = t, this.type = 6, this._$AN = void 0, this._$AM = n, this.options = r;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  _$AI(t) {
    tn(this, t);
  }
}
const Z3 = Oi.litHtmlPolyfillSupport;
Z3?.(kn, Mn), (Oi.litHtmlVersions ??= []).push("3.3.0");
const Pi = globalThis;
class qt extends Ft {
  constructor() {
    super(...arguments), this.renderOptions = { host: this }, this._$Do = void 0;
  }
  createRenderRoot() {
    const t = super.createRenderRoot();
    return this.renderOptions.renderBefore ??= t.firstChild, t;
  }
  update(t) {
    const n = this.render();
    this.hasUpdated || (this.renderOptions.isConnected = this.isConnected), super.update(t), this._$Do = ((r, o, i) => {
      const s = i?.renderBefore ?? o;
      let c = s._$litPart$;
      if (c === void 0) {
        const a = i?.renderBefore ?? null;
        s._$litPart$ = c = new Mn(o.insertBefore(En(), a), a, void 0, i ?? {});
      }
      return c._$AI(r), c;
    })(n, this.renderRoot, this.renderOptions);
  }
  connectedCallback() {
    super.connectedCallback(), this._$Do?.setConnected(!0);
  }
  disconnectedCallback() {
    super.disconnectedCallback(), this._$Do?.setConnected(!1);
  }
  render() {
    return en;
  }
}
qt._$litElement$ = !0, qt.finalized = !0, Pi.litElementHydrateSupport?.({ LitElement: qt });
const W3 = Pi.litElementPolyfillSupport;
W3?.({ LitElement: qt }), (Pi.litElementVersions ??= []).push("4.2.0");
const oe = (e) => (t, n) => {
  n !== void 0 ? n.addInitializer(() => {
    customElements.define(e, t);
  }) : customElements.define(e, t);
}, F3 = { attribute: !0, type: String, converter: ar, reflect: !1, hasChanged: Ni }, V3 = (e = F3, t, n) => {
  const { kind: r, metadata: o } = n;
  let i = globalThis.litPropertyMetadata.get(o);
  if (i === void 0 && globalThis.litPropertyMetadata.set(o, i = /* @__PURE__ */ new Map()), r === "setter" && ((e = Object.create(e)).wrapped = !0), i.set(n.name, e), r === "accessor") {
    const { name: s } = n;
    return { set(c) {
      const a = t.get.call(this);
      t.set.call(this, c), this.requestUpdate(s, a, e);
    }, init(c) {
      return c !== void 0 && this.C(s, void 0, e, c), c;
    } };
  }
  if (r === "setter") {
    const { name: s } = n;
    return function(c) {
      const a = this[s];
      t.call(this, c), this.requestUpdate(s, a, e);
    };
  }
  throw Error("Unsupported decorator location: " + r);
};
function me(e) {
  return (t, n) => typeof n == "object" ? V3(e, t, n) : ((r, o, i) => {
    const s = o.hasOwnProperty(i);
    return o.constructor.createProperty(i, r), s ? Object.getOwnPropertyDescriptor(o, i) : void 0;
  })(e, t, n);
}
function se(e) {
  return me({ ...e, state: !0, attribute: !1 });
}
let na, ra;
class Hi extends qt {
  updated(t) {
    var n;
    if (super.updated(t), globalThis.document && globalThis.document.documentElement.classList.contains("dark") && (n = this.shadowRoot) != null && (n = n.children) != null && n.length) for (const r of this.shadowRoot.children) r.classList.contains("dark") || r.classList.add("dark");
  }
  _getBrandColorLuminance() {
    if (!globalThis.window) return 0;
    const t = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    let n = window.getComputedStyle(this).getPropertyValue(t ? "--bc-color-brand-dark" : "--bc-color-brand") || window.getComputedStyle(this).getPropertyValue("--bc-color-brand") || "#196CE7";
    if (!n.match(/^#[0-9A-F]{6}$/i)) {
      const r = document.createElement("div");
      r.style.color = n, r.style.display = "none", document.body.appendChild(r), n = window.getComputedStyle(r).color, r.remove();
    }
    return (function(r) {
      if (r.startsWith("#")) return r = r.slice(1), (0.299 * parseInt(r.slice(0, 2), 16) + 0.587 * parseInt(r.slice(2, 4), 16) + 0.114 * parseInt(r.slice(4, 6), 16)) / 255;
      if (r.startsWith("rgb") || r.startsWith("rgba")) {
        const o = r.match(/\d+(\.\d+)?/g);
        return (0.299 * parseFloat(o[0]) + 0.587 * parseFloat(o[1]) + 0.114 * parseFloat(o[2])) / 255;
      }
      throw new Error("Unsupported luminance: " + r);
    })(n);
  }
}
Hi.styles = [Lr(na || (na = ((e) => e)`
      :host {
        // global css reset in shadow DOM
        all: initial;
        font-variant-numeric: slashed-zero;
      }
      // TODO: move to individual components - only needed by a couple of icons
      .hover-animation:hover .hover-right-up {
        transform: translateX(2px) translateY(-2px);
        transition: all 0.3s;
      }
      .hover-animation:hover .hover-right {
        transform: translateX(3px);
        transition: all 0.3s;
      }
    `))];
class ae extends Hi {
  constructor() {
    super(), this._modalOpen = !1, this._connected = !1, this._connecting = !1, this._connectorName = void 0, this._appName = void 0, this._appIcon = void 0, this._filters = void 0, this._error = void 0, this._connected = V.getState().connected, this._connecting = V.getState().connecting, this._connectorName = V.getState().connectorName, this._appName = V.getState().bitcoinConnectConfig.appName, this._appIcon = V.getState().bitcoinConnectConfig.appIcon, this._filters = V.getState().bitcoinConnectConfig.filters, this._error = V.getState().error, this._route = V.getState().route, this._modalOpen = V.getState().modalOpen, V.subscribe((t) => {
      this._connected = t.connected, this._connecting = t.connecting, this._connectorName = t.connectorName, this._appName = t.bitcoinConnectConfig.appName, this._appIcon = t.bitcoinConnectConfig.appIcon, this._filters = t.bitcoinConnectConfig.filters, this._error = t.error, this._route = t.route, this._modalOpen = t.modalOpen;
    });
  }
}
F([se()], ae.prototype, "_modalOpen", void 0), F([se()], ae.prototype, "_connected", void 0), F([se()], ae.prototype, "_connecting", void 0), F([se()], ae.prototype, "_connectorName", void 0), F([se()], ae.prototype, "_appName", void 0), F([se()], ae.prototype, "_appIcon", void 0), F([se()], ae.prototype, "_filters", void 0), F([se()], ae.prototype, "_error", void 0), F([se()], ae.prototype, "_route", void 0);
const bn = de(ra || (ra = ((e) => e)`
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path fill-rule="evenodd" clip-rule="evenodd" d="M15.4635 6.0794C17.4325 6.83684 18.8238 7.94315 18.5058 9.88813C18.3285 10.984 17.8283 11.6586 17.1374 12.0334C16.8767 12.1748 16.8191 12.6131 17.0507 12.7984C18.0431 13.592 18.4393 14.7164 17.8152 16.4238C16.9057 18.9138 14.8635 19.177 12.1521 18.6697C11.9858 18.6385 11.8223 18.7396 11.7792 18.9032L11.4563 20.1009C11.3343 20.5633 10.8605 20.8392 10.3981 20.7173C9.93541 20.5953 9.65932 20.1212 9.78149 19.6586L10.0909 18.5121C10.1354 18.3439 10.0349 18.1715 9.86676 18.1266C9.62998 18.0632 9.39019 17.9976 9.14679 17.9294C8.97646 17.8817 8.79964 17.9822 8.75452 18.1532L8.44373 19.3067C8.32182 19.7688 7.8483 20.0446 7.38616 19.9226C6.92422 19.8007 6.64851 19.3274 6.77026 18.8655L7.08988 17.677C7.13458 17.5073 7.03399 17.3333 6.86481 17.2869C6.81003 17.2718 6.75512 17.2567 6.70008 17.2415L6.69828 17.241C6.4604 17.1755 6.22001 17.1094 5.97667 17.0449L5.42127 16.8919C4.80739 16.7299 4.48576 16.0556 4.74625 15.4767C4.95488 15.013 5.47104 14.7734 5.96239 14.9043C5.97132 14.9067 5.98016 14.909 5.98891 14.9113C6.1066 14.9426 6.10094 14.9199 6.21958 14.8924C6.46112 14.8366 6.58893 14.6373 6.65055 14.4901L7.80952 10.0986L7.81254 10.0867L8.63176 6.98069C8.63683 6.96147 8.64021 6.94184 8.64116 6.92198C8.65547 6.62155 8.78957 6.31876 8.35166 6.11178C8.25682 6.06695 8.16354 6.02432 8.06217 5.99736C8.04539 5.9929 8.02808 5.98833 8.01032 5.98367C7.51444 5.85341 7.21198 5.34932 7.34263 4.85356C7.47162 4.36411 7.9731 4.07202 8.46248 4.2013L9.43668 4.47448C9.68634 4.54012 9.94146 4.60362 10.2006 4.66691C10.3681 4.70784 10.5375 4.60681 10.5815 4.44006L10.8668 3.39102C10.9889 2.9288 11.4625 2.65299 11.9247 2.77495C12.3871 2.89693 12.663 3.37062 12.541 3.83294L12.2715 4.82295C12.2273 4.99041 12.3292 5.16145 12.4975 5.20248C12.7444 5.26269 12.9911 5.32354 13.2353 5.38588C13.4 5.42795 13.5684 5.32988 13.6118 5.16547L13.8783 4.18608C14.0003 3.72357 14.4741 3.44751 14.9366 3.56948C15.3992 3.69145 15.6753 4.16533 15.5533 4.62789L15.2637 5.69461C15.2215 5.85461 15.3091 6.01999 15.4635 6.0794ZM11.2479 8.6805L11.4769 7.81121C11.5836 7.40644 11.9982 7.16477 12.403 7.27142C12.8077 7.37807 13.0494 7.79266 12.9428 8.19743L12.7137 9.06672L13.5829 9.29575C13.9877 9.4024 14.2294 9.81699 14.1227 10.2218C14.0161 10.6265 13.6015 10.8682 13.1967 10.7615L12.3275 10.5325L12.0984 11.4018C11.9918 11.8066 11.5772 12.0483 11.1724 11.9416C10.7676 11.835 10.5259 11.4204 10.6326 11.0156L10.8617 10.1463L9.99225 9.91722C9.58747 9.81056 9.34579 9.39598 9.45245 8.99121C9.5591 8.58644 9.9737 8.34477 10.3785 8.45142L11.2479 8.6805ZM13.2927 12.7001L13.0636 13.5693L12.1942 13.3403C11.7895 13.2336 11.3749 13.4753 11.2682 13.8801C11.1615 14.2848 11.4032 14.6994 11.808 14.8061L12.6774 15.0351L12.4484 15.9045C12.3417 16.3092 12.5834 16.7238 12.9882 16.8305C13.3929 16.9371 13.8075 16.6954 13.9142 16.2907L14.1432 15.4214L15.0125 15.6504C15.4172 15.757 15.8318 15.5154 15.9385 15.1106C16.0451 14.7058 15.8035 14.2912 15.3987 14.1846L14.5295 13.9556L14.7585 13.0863C14.8652 12.6815 14.6235 12.2669 14.2187 12.1603C13.8139 12.0536 13.3994 12.2953 13.2927 12.7001Z" fill="currentColor"/>
</svg>`));
function Di(e) {
  return [...e.v, (e.i ? "!" : "") + e.n].join(":");
}
function G3(e, t = ",") {
  return e.map(Di).join(t);
}
let x2 = typeof CSS < "u" && CSS.escape || ((e) => e.replace(/[!"'`*+.,;:\\/<=>?@#$%&^|~()[\]{}]/g, "\\$&").replace(/^\d/, "\\3$& "));
function ur(e) {
  for (var t = 9, n = e.length; n--; ) t = Math.imul(t ^ e.charCodeAt(n), 1597334677);
  return "#" + ((t ^ t >>> 9) >>> 0).toString(36);
}
function Zi(e, t = "@media ") {
  return t + we(e).map((n) => (typeof n == "string" && (n = { min: n }), n.raw || Object.keys(n).map((r) => `(${r}-width:${n[r]})`).join(" and "))).join(",");
}
function we(e = []) {
  return Array.isArray(e) ? e : e == null ? [] : [e];
}
function oa(e) {
  return e;
}
function Uo() {
}
let _e = { d: 0, b: 134217728, c: 268435456, a: 671088640, u: 805306368, o: 939524096 };
function E2(e) {
  return e.match(/[-=:;]/g)?.length || 0;
}
function Oo(e) {
  return Math.min(/(?:^|width[^\d]+)(\d+(?:.\d+)?)(p)?/.test(e) ? Math.max(0, 29.63 * (+RegExp.$1 / (RegExp.$2 ? 15 : 1)) ** 0.137 - 43) : 0, 15) << 22 | Math.min(E2(e), 15) << 18;
}
let j3 = ["rst-c", "st-ch", "h-chi", "y-lin", "nk", "sited", "ecked", "pty", "ad-on", "cus-w", "ver", "cus", "cus-v", "tive", "sable", "tiona", "quire"];
function Wi({ n: e, i: t, v: n = [] }, r, o, i) {
  e && (e = Di({ n: e, i: t, v: n })), i = [...we(i)];
  for (let s of n) {
    let c = r.theme("screens", s);
    for (let a of we(c && Zi(c) || r.v(s))) i.push(a), o |= c ? 67108864 | Oo(a) : s == "dark" ? 1073741824 : a[0] == "@" ? Oo(a) : 1 << ~(/:([a-z-]+)/.test(a) && ~j3.indexOf(RegExp.$1.slice(2, 7)) || -18);
  }
  return { n: e, p: o, r: i, i: t };
}
let A2 = /* @__PURE__ */ new Map();
function Po(e) {
  if (e.d) {
    let t = [], n = Xr(e.r.reduce((r, o) => o[0] == "@" ? (t.push(o), r) : o ? Xr(r, (i) => Xr(o, (s) => {
      let c = /(:merge\(.+?\))(:[a-z-]+|\\[.+])/.exec(s);
      if (c) {
        let a = i.indexOf(c[1]);
        return ~a ? i.slice(0, a) + c[0] + i.slice(a + c[1].length) : eo(i, s);
      }
      return eo(s, i);
    })) : r, "&"), (r) => eo(r, e.n ? "." + x2(e.n) : ""));
    return n && t.push(n.replace(/:merge\((.+?)\)/g, "$1")), t.reduceRight((r, o) => o + "{" + r + "}", e.d);
  }
}
function Xr(e, t) {
  return e.replace(/ *((?:\(.+?\)|\[.+?\]|[^,])+) *(,|$)/g, (n, r, o) => t(r) + o);
}
function eo(e, t) {
  return e.replace(/&/g, t);
}
let ia = new Intl.Collator("en", { numeric: !0 });
function k2(e, t) {
  for (var n = 0, r = e.length; n < r; ) {
    let o = r + n >> 1;
    0 >= _2(e[o], t) ? n = o + 1 : r = o;
  }
  return r;
}
function _2(e, t) {
  let n = e.p & _e.o;
  return n != (t.p & _e.o) || n != _e.b && n != _e.o ? e.p - t.p || e.o - t.o || ia.compare(sa(e.n), sa(t.n)) || ia.compare(aa(e.n), aa(t.n)) : 0;
}
function sa(e) {
  return (e || "").split(/:/).pop().split("/").pop() || "\0";
}
function aa(e) {
  return (e || "").replace(/\W/g, (t) => String.fromCharCode(127 + t.charCodeAt(0))) + "\0";
}
function to(e, t) {
  return Math.round(parseInt(e, 16) * t);
}
function gt(e, t = {}) {
  if (typeof e == "function") return e(t);
  let { opacityValue: n = "1", opacityVariable: r } = t, o = r ? `var(${r})` : n;
  if (e.includes("<alpha-value>")) return e.replace("<alpha-value>", o);
  if (e[0] == "#" && (e.length == 4 || e.length == 7)) {
    let i = (e.length - 1) / 3, s = [17, 1, 0.062272][i - 1];
    return `rgba(${[to(e.substr(1, i), s), to(e.substr(1 + i, i), s), to(e.substr(1 + 2 * i, i), s), o]})`;
  }
  return o == "1" ? e : o == "0" ? "#0000" : e.replace(/^(rgb|hsl)(\([^)]+)\)$/, `$1a$2,${o})`);
}
function S2(e, t, n, r, o = []) {
  return (function i(s, { n: c, p: a, r: h = [], i: w }, g) {
    let v = [], b = "", C = 0, L = 0;
    for (let U in s || {}) {
      var M, I;
      let q = s[U];
      if (U[0] == "@") {
        if (!q) continue;
        if (U[1] == "a") {
          v.push(...Vi(c, a, fr("" + q), g, a, h, w, !0));
          continue;
        }
        if (U[1] == "l") {
          for (let Q of we(q)) v.push(...i(Q, { n: c, p: (M = _e[U[7]], a & -939524097 | M), r: U[7] == "d" ? [] : h, i: w }, g));
          continue;
        }
        if (U[1] == "i") {
          v.push(...we(q).map((Q) => ({ p: -1, o: 0, r: [], d: U + " " + Q })));
          continue;
        }
        if (U[1] == "k") {
          v.push({ p: _e.d, o: 0, r: [U], d: i(q, { p: _e.d }, g).map(Po).join("") });
          continue;
        }
        if (U[1] == "f") {
          v.push(...we(q).map((Q) => ({ p: _e.d, o: 0, r: [U], d: i(Q, { p: _e.d }, g).map(Po).join("") })));
          continue;
        }
      }
      if (typeof q != "object" || Array.isArray(q)) U == "label" && q ? c = q + ur(JSON.stringify([a, w, s])) : (q || q === 0) && (U = U.replace(/[A-Z]/g, (Q) => "-" + Q.toLowerCase()), L += 1, C = Math.max(C, (I = U)[0] == "-" ? 0 : E2(I) + (/^(?:(border-(?!w|c|sty)|[tlbr].{2,4}m?$|c.{7,8}$)|([fl].{5}l|g.{8}$|pl))/.test(I) ? +!!RegExp.$1 || -!!RegExp.$2 : 0) + 1), b += (b ? ";" : "") + we(q).map((Q) => g.s(U, Fi("" + Q, g.theme) + (w ? " !important" : ""))).join(";"));
      else if (U[0] == "@" || U.includes("&")) {
        let Q = a;
        U[0] == "@" && (U = U.replace(/\bscreen\(([^)]+)\)/g, (A, _) => {
          let E = g.theme("screens", _);
          return E ? (Q |= 67108864, Zi(E, "")) : A;
        }), Q |= Oo(U)), v.push(...i(q, { n: c, p: Q, r: [...h, U], i: w }, g));
      } else v.push(...i(q, { p: a, r: [...h, U] }, g));
    }
    return v.unshift({ n: c, p: a, o: Math.max(0, 15 - L) + 1.5 * Math.min(C || 15, 15), r: h, d: b }), v.sort(_2);
  })(e, Wi(t, n, r, o), n);
}
function Fi(e, t) {
  return e.replace(/theme\((["'`])?(.+?)\1(?:\s*,\s*(["'`])?(.+?)\3)?\)/g, (n, r, o, i, s = "") => {
    let c = t(o, s);
    return typeof c == "function" && /color|fill|stroke/i.test(o) ? gt(c) : "" + we(c).filter((a) => Object(a) !== a);
  });
}
function L2(e, t) {
  let n, r = [];
  for (let o of e) o.d && o.n ? n?.p == o.p && "" + n.r == "" + o.r ? (n.c = [n.c, o.c].filter(Boolean).join(" "), n.d = n.d + ";" + o.d) : r.push(n = { ...o, n: o.n && t }) : r.push({ ...o, n: o.n && t });
  return r;
}
function hr(e, t, n = _e.u, r, o) {
  let i = [];
  for (let s of e) for (let c of (function(a, h, w, g, v) {
    let b = (function(C, L) {
      let M = A2.get(C.n);
      return M ? M(C, L) : L.r(C.n, C.v[0] == "dark");
    })(a = { ...a, i: a.i || v }, h);
    return b ? typeof b == "string" ? ({ r: g, p: w } = Wi(a, h, w, g), L2(hr(fr(b), h, w, g, a.i), a.n)) : Array.isArray(b) ? b.map((C) => {
      var L, M;
      return { o: 0, ...C, r: [...we(g), ...we(C.r)], p: (L = w, M = C.p ?? w, L & -939524097 | M) };
    }) : S2(b, a, h, w, g) : [{ c: Di(a), p: 0, o: 0, r: [] }];
  })(s, t, n, r, o)) i.splice(k2(i, c), 0, c);
  return i;
}
function Vi(e, t, n, r, o, i, s, c) {
  return L2((c ? n.flatMap((a) => hr([a], r, o, i, s)) : hr(n, r, o, i, s)).map((a) => a.p & _e.o && (a.n || t == _e.b) ? { ...a, p: a.p & -939524097 | t, o: 0 } : a), e);
}
function z3(e, t, n, r) {
  return A2.set(e, (o, i) => {
    let { n: s, p: c, r: a, i: h } = Wi(o, i, t);
    return n && Vi(s, t, n, i, c, a, h, r);
  }), e;
}
function no(e, t, n) {
  if (e[e.length - 1] != "(") {
    let r = [], o = !1, i = !1, s = "";
    for (let c of e) if (c != "(" && !/[~@]$/.test(c)) {
      if (c[0] == "!" && (c = c.slice(1), o = !o), c.endsWith(":")) {
        r[c == "dark:" ? "unshift" : "push"](c.slice(0, -1));
        continue;
      }
      c[0] == "-" && (c = c.slice(1), i = !i), c.endsWith("-") && (c = c.slice(0, -1)), c && c != "&" && (s += (s && "-") + c);
    }
    s && (i && (s = "-" + s), t[0].push({ n: s, v: r.filter(q3), i: o }));
  }
}
function q3(e, t, n) {
  return n.indexOf(e) == t;
}
let ca = /* @__PURE__ */ new Map();
function fr(e) {
  let t = ca.get(e);
  if (!t) {
    let n = [], r = [[]], o = 0, i = 0, s = null, c = 0, a = (h, w = 0) => {
      o != c && (n.push(e.slice(o, c + w)), h && no(n, r)), o = c + 1;
    };
    for (; c < e.length; c++) {
      let h = e[c];
      if (i) e[c - 1] != "\\" && (i += +(h == "[") || -(h == "]"));
      else if (h == "[") i += 1;
      else if (s) e[c - 1] != "\\" && s.test(e.slice(c)) && (s = null, o = c + RegExp.lastMatch.length);
      else if (h != "/" || e[c - 1] == "\\" || e[c + 1] != "*" && e[c + 1] != "/") if (h == "(") a(), n.push(h);
      else if (h == ":") e[c + 1] != ":" && a(!1, 1);
      else if (/[\s,)]/.test(h)) {
        a(!0);
        let w = n.lastIndexOf("(");
        if (h == ")") {
          let g = n[w - 1];
          if (/[~@]$/.test(g)) {
            let v = r.shift();
            n.length = w, no([...n, "#"], r);
            let { v: b } = r[0].pop();
            for (let C of v) C.v.splice(+(C.v[0] == "dark") - +(b[0] == "dark"), b.length);
            no([...n, z3(g.length > 1 ? g.slice(0, -1) + ur(JSON.stringify([g, v])) : g + "(" + G3(v) + ")", _e.a, v, /@$/.test(g))], r);
          }
          w = n.lastIndexOf("(", w - 1);
        }
        n.length = w + 1;
      } else /[~@]/.test(h) && e[c + 1] == "(" && r.unshift([]);
      else s = e[c + 1] == "*" ? /^\*\// : /^[\r\n]/;
    }
    a(!0), ca.set(e, t = r[0]);
  }
  return t;
}
function j(e, t, n) {
  return [e, Ho(t, n)];
}
function Ho(e, t) {
  return typeof e == "function" ? e : typeof e == "string" && /^[\w-]+$/.test(e) ? (n, r) => ({ [e]: t ? t(n, r) : Do(n, 1) }) : (n) => e || { [n[1]]: Do(n, 2) };
}
function Do(e, t, n = e.slice(t).find(Boolean) || e.$$ || e.input) {
  return e.input[0] == "-" ? `calc(${n} * -1)` : n;
}
function z(e, t, n, r) {
  return [e, K3(t, n, r)];
}
function K3(e, t, n) {
  let r = typeof t == "string" ? (o, i) => ({ [t]: n ? n(o, i) : o._ }) : t || (({ 1: o, _: i }, s, c) => ({ [o || c]: i }));
  return (o, i) => {
    let s = T2(e || o[1]), c = i.theme(s, o.$$) ?? wt(o.$$, s, i);
    if (c != null) return o._ = Do(o, 0, c), r(o, i, s);
  };
}
function Ce(e, t = {}, n) {
  return [e, Q3(t, n)];
}
function Q3(e = {}, t) {
  return (n, r) => {
    let { section: o = T2(n[0]).replace("-", "") + "Color" } = e, [i, s] = (n.$$.match(/^(\[[^\]]+]|[^/]+?)(?:\/(.+))?$/) || []).slice(1);
    if (!i) return;
    let c = r.theme(o, i) || wt(i, o, r);
    if (!c || typeof c == "object") return;
    let { opacityVariable: a = `--tw-${n[0].replace(/-$/, "")}-opacity`, opacitySection: h = o.replace("Color", "Opacity"), property: w = o, selector: g } = e, v = r.theme(h, s || "DEFAULT") || s && wt(s, h, r), b = t || (({ _: L }) => {
      let M = Yn(w, L);
      return g ? { [g]: M } : M;
    });
    n._ = { value: gt(c, { opacityVariable: a || void 0, opacityValue: v || void 0 }), color: (L) => gt(c, L), opacityVariable: a || void 0, opacityValue: v || void 0 };
    let C = b(n, r);
    if (!n.dark) {
      let L = r.d(o, i, c);
      L && L !== c && (n._ = { value: gt(L, { opacityVariable: a || void 0, opacityValue: v || "1" }), color: (M) => gt(L, M), opacityVariable: a || void 0, opacityValue: v || void 0 }, C = { "&": C, [r.v("dark")]: b(n, r) });
    }
    return C;
  };
}
function Yn(e, t) {
  let n = {};
  return typeof t == "string" ? n[e] = t : (t.opacityVariable && t.value.includes(t.opacityVariable) && (n[t.opacityVariable] = t.opacityValue || "1"), n[e] = t.value), n;
}
function wt(e, t, n) {
  if (e[0] == "[" && e.slice(-1) == "]") {
    if (e = _n(Fi(e.slice(1, -1), n.theme)), !t) return e;
    if (!(/color|fill|stroke/i.test(t) && !/^color:/.test(e) && !/^(#|((hsl|rgb)a?|hwb|lab|lch|color)\(|[a-z]+$)/.test(e) || /image/i.test(t) && !/^image:/.test(e) && !/^[a-z-]+\(/.test(e) || /weight/i.test(t) && !/^(number|any):/.test(e) && !/^\d+$/.test(e) || /position/i.test(t) && /^(length|size):/.test(e))) return e.replace(/^[a-z-]+:/, "");
  }
}
function T2(e) {
  return e.replace(/-./g, (t) => t[1].toUpperCase());
}
function _n(e) {
  return e.includes("url(") ? e.replace(/(.*?)(url\(.*?\))(.*?)/g, (t, n = "", r, o = "") => _n(n) + r + _n(o)) : e.replace(/(^|[^\\])_+/g, (t, n) => n + " ".repeat(t.length - n.length)).replace(/\\_/g, "_").replace(/(calc|min|max|clamp)\(.+\)/g, (t) => t.replace(/(-?\d*\.?\d(?!\b-.+[,)](?![^+\-/*])\D)(?:%|[a-z]+)?|\))([+\-/*])/g, "$1 $2 "));
}
function la({ presets: e = [], ...t }) {
  let n = { darkMode: void 0, darkColor: void 0, preflight: t.preflight !== !1 && [], theme: {}, variants: we(t.variants), rules: we(t.rules), ignorelist: we(t.ignorelist), hash: void 0, stringify: (r, o) => r + ":" + o, finalize: [] };
  for (let r of we([...e, { darkMode: t.darkMode, darkColor: t.darkColor, preflight: t.preflight !== !1 && we(t.preflight), theme: t.theme, hash: t.hash, stringify: t.stringify, finalize: t.finalize }])) {
    let { preflight: o, darkMode: i = n.darkMode, darkColor: s = n.darkColor, theme: c, variants: a, rules: h, ignorelist: w, hash: g = n.hash, stringify: v = n.stringify, finalize: b } = typeof r == "function" ? r(n) : r;
    n = { preflight: n.preflight !== !1 && o !== !1 && [...n.preflight, ...we(o)], darkMode: i, darkColor: s, theme: { ...n.theme, ...c, extend: { ...n.theme.extend, ...c?.extend } }, variants: [...n.variants, ...we(a)], rules: [...n.rules, ...we(h)], ignorelist: [...n.ignorelist, ...we(w)], hash: g, stringify: v, finalize: [...n.finalize, ...we(b)] };
  }
  return n;
}
function da(e, t, n, r, o, i) {
  for (let s of t) {
    let c = n.get(s);
    c || n.set(s, c = r(s));
    let a = c(e, o, i);
    if (a) return a;
  }
}
function J3(e) {
  var t;
  return Zo(e[0], typeof (t = e[1]) == "function" ? t : () => t);
}
function Y3(e) {
  return Array.isArray(e) ? Zo(e[0], Ho(e[1], e[2])) : Zo(e, Ho(void 0, void 0));
}
function Zo(e, t) {
  return M2(e, (n, r, o, i) => {
    let s = r.exec(n);
    if (s) return s.$$ = n.slice(s[0].length), s.dark = i, t(s, o);
  });
}
function M2(e, t) {
  let n = we(e).map(X3);
  return (r, o, i) => {
    for (let s of n) {
      let c = t(r, s, o, i);
      if (c) return c;
    }
  };
}
function X3(e) {
  return typeof e == "string" ? RegExp("^" + e + (e.includes("$") || e.slice(-1) == "-" ? "" : "$")) : e;
}
function ro(e) {
  let t = e?.cssRules ? e : (e && typeof e != "string" ? e : (function(n) {
    let r = document.querySelector(n || 'style[data-twind=""]');
    return r && r.tagName == "STYLE" || (r = document.createElement("style"), document.head.prepend(r)), r.dataset.twind = "claimed", r;
  })(e)).sheet;
  return { target: t, snapshot() {
    let n = Array.from(t.cssRules, (r) => r.cssText);
    return () => {
      this.clear(), n.forEach(this.insert);
    };
  }, clear() {
    for (let n = t.cssRules.length; n--; ) t.deleteRule(n);
  }, destroy() {
    t.ownerNode?.remove();
  }, insert(n, r) {
    try {
      t.insertRule(n, r);
    } catch {
      t.insertRule(":root{}", r);
    }
  }, resume: Uo };
}
let Wo = { screens: { sm: "640px", md: "768px", lg: "1024px", xl: "1280px", "2xl": "1536px" }, columns: { auto: "auto", "3xs": "16rem", "2xs": "18rem", xs: "20rem", sm: "24rem", md: "28rem", lg: "32rem", xl: "36rem", "2xl": "42rem", "3xl": "48rem", "4xl": "56rem", "5xl": "64rem", "6xl": "72rem", "7xl": "80rem" }, spacing: { px: "1px", 0: "0px", .../* @__PURE__ */ Ne(4, "rem", 4, 0.5, 0.5), .../* @__PURE__ */ Ne(12, "rem", 4, 5), 14: "3.5rem", .../* @__PURE__ */ Ne(64, "rem", 4, 16, 4), 72: "18rem", 80: "20rem", 96: "24rem" }, durations: { 75: "75ms", 100: "100ms", 150: "150ms", 200: "200ms", 300: "300ms", 500: "500ms", 700: "700ms", 1e3: "1000ms" }, animation: { none: "none", spin: "spin 1s linear infinite", ping: "ping 1s cubic-bezier(0,0,0.2,1) infinite", pulse: "pulse 2s cubic-bezier(0.4,0,0.6,1) infinite", bounce: "bounce 1s infinite" }, aspectRatio: { auto: "auto", square: "1/1", video: "16/9" }, backdropBlur: /* @__PURE__ */ ce("blur"), backdropBrightness: /* @__PURE__ */ ce("brightness"), backdropContrast: /* @__PURE__ */ ce("contrast"), backdropGrayscale: /* @__PURE__ */ ce("grayscale"), backdropHueRotate: /* @__PURE__ */ ce("hueRotate"), backdropInvert: /* @__PURE__ */ ce("invert"), backdropOpacity: /* @__PURE__ */ ce("opacity"), backdropSaturate: /* @__PURE__ */ ce("saturate"), backdropSepia: /* @__PURE__ */ ce("sepia"), backgroundColor: /* @__PURE__ */ ce("colors"), backgroundImage: { none: "none" }, backgroundOpacity: /* @__PURE__ */ ce("opacity"), backgroundSize: { auto: "auto", cover: "cover", contain: "contain" }, blur: { none: "none", 0: "0", sm: "4px", DEFAULT: "8px", md: "12px", lg: "16px", xl: "24px", "2xl": "40px", "3xl": "64px" }, brightness: { .../* @__PURE__ */ Ne(200, "", 100, 0, 50), .../* @__PURE__ */ Ne(110, "", 100, 90, 5), 75: "0.75", 125: "1.25" }, borderColor: ({ theme: e }) => ({ DEFAULT: e("colors.gray.200", "currentColor"), ...e("colors") }), borderOpacity: /* @__PURE__ */ ce("opacity"), borderRadius: { none: "0px", sm: "0.125rem", DEFAULT: "0.25rem", md: "0.375rem", lg: "0.5rem", xl: "0.75rem", "2xl": "1rem", "3xl": "1.5rem", "1/2": "50%", full: "9999px" }, borderSpacing: /* @__PURE__ */ ce("spacing"), borderWidth: { DEFAULT: "1px", .../* @__PURE__ */ He(8, "px") }, boxShadow: { sm: "0 1px 2px 0 rgba(0,0,0,0.05)", DEFAULT: "0 1px 3px 0 rgba(0,0,0,0.1), 0 1px 2px -1px rgba(0,0,0,0.1)", md: "0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)", lg: "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)", xl: "0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)", "2xl": "0 25px 50px -12px rgba(0,0,0,0.25)", inner: "inset 0 2px 4px 0 rgba(0,0,0,0.05)", none: "0 0 #0000" }, boxShadowColor: ce("colors"), caretColor: /* @__PURE__ */ ce("colors"), accentColor: ({ theme: e }) => ({ auto: "auto", ...e("colors") }), contrast: { .../* @__PURE__ */ Ne(200, "", 100, 0, 50), 75: "0.75", 125: "1.25" }, content: { none: "none" }, divideColor: /* @__PURE__ */ ce("borderColor"), divideOpacity: /* @__PURE__ */ ce("borderOpacity"), divideWidth: /* @__PURE__ */ ce("borderWidth"), dropShadow: { sm: "0 1px 1px rgba(0,0,0,0.05)", DEFAULT: ["0 1px 2px rgba(0,0,0,0.1)", "0 1px 1px rgba(0,0,0,0.06)"], md: ["0 4px 3px rgba(0,0,0,0.07)", "0 2px 2px rgba(0,0,0,0.06)"], lg: ["0 10px 8px rgba(0,0,0,0.04)", "0 4px 3px rgba(0,0,0,0.1)"], xl: ["0 20px 13px rgba(0,0,0,0.03)", "0 8px 5px rgba(0,0,0,0.08)"], "2xl": "0 25px 25px rgba(0,0,0,0.15)", none: "0 0 #0000" }, fill: ({ theme: e }) => ({ ...e("colors"), none: "none" }), grayscale: { DEFAULT: "100%", 0: "0" }, hueRotate: { 0: "0deg", 15: "15deg", 30: "30deg", 60: "60deg", 90: "90deg", 180: "180deg" }, invert: { DEFAULT: "100%", 0: "0" }, flex: { 1: "1 1 0%", auto: "1 1 auto", initial: "0 1 auto", none: "none" }, flexBasis: ({ theme: e }) => ({ ...e("spacing"), ...ln(2, 6), ...ln(12, 12), auto: "auto", full: "100%" }), flexGrow: { DEFAULT: 1, 0: 0 }, flexShrink: { DEFAULT: 1, 0: 0 }, fontFamily: { sans: 'ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans",sans-serif,"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol","Noto Color Emoji"'.split(","), serif: 'ui-serif,Georgia,Cambria,"Times New Roman",Times,serif'.split(","), mono: 'ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace'.split(",") }, fontSize: { xs: ["0.75rem", "1rem"], sm: ["0.875rem", "1.25rem"], base: ["1rem", "1.5rem"], lg: ["1.125rem", "1.75rem"], xl: ["1.25rem", "1.75rem"], "2xl": ["1.5rem", "2rem"], "3xl": ["1.875rem", "2.25rem"], "4xl": ["2.25rem", "2.5rem"], "5xl": ["3rem", "1"], "6xl": ["3.75rem", "1"], "7xl": ["4.5rem", "1"], "8xl": ["6rem", "1"], "9xl": ["8rem", "1"] }, fontWeight: { thin: "100", extralight: "200", light: "300", normal: "400", medium: "500", semibold: "600", bold: "700", extrabold: "800", black: "900" }, gap: /* @__PURE__ */ ce("spacing"), gradientColorStops: /* @__PURE__ */ ce("colors"), gridAutoColumns: { auto: "auto", min: "min-content", max: "max-content", fr: "minmax(0,1fr)" }, gridAutoRows: { auto: "auto", min: "min-content", max: "max-content", fr: "minmax(0,1fr)" }, gridColumn: { auto: "auto", "span-full": "1 / -1" }, gridRow: { auto: "auto", "span-full": "1 / -1" }, gridTemplateColumns: { none: "none" }, gridTemplateRows: { none: "none" }, height: ({ theme: e }) => ({ ...e("spacing"), ...ln(2, 6), min: "min-content", max: "max-content", fit: "fit-content", auto: "auto", full: "100%", screen: "100vh" }), inset: ({ theme: e }) => ({ ...e("spacing"), ...ln(2, 4), auto: "auto", full: "100%" }), keyframes: { spin: { from: { transform: "rotate(0deg)" }, to: { transform: "rotate(360deg)" } }, ping: { "0%": { transform: "scale(1)", opacity: "1" }, "75%,100%": { transform: "scale(2)", opacity: "0" } }, pulse: { "0%,100%": { opacity: "1" }, "50%": { opacity: ".5" } }, bounce: { "0%, 100%": { transform: "translateY(-25%)", animationTimingFunction: "cubic-bezier(0.8,0,1,1)" }, "50%": { transform: "none", animationTimingFunction: "cubic-bezier(0,0,0.2,1)" } } }, letterSpacing: { tighter: "-0.05em", tight: "-0.025em", normal: "0em", wide: "0.025em", wider: "0.05em", widest: "0.1em" }, lineHeight: { .../* @__PURE__ */ Ne(10, "rem", 4, 3), none: "1", tight: "1.25", snug: "1.375", normal: "1.5", relaxed: "1.625", loose: "2" }, margin: ({ theme: e }) => ({ auto: "auto", ...e("spacing") }), maxHeight: ({ theme: e }) => ({ full: "100%", min: "min-content", max: "max-content", fit: "fit-content", screen: "100vh", ...e("spacing") }), maxWidth: ({ theme: e, breakpoints: t }) => ({ ...t(e("screens")), none: "none", 0: "0rem", xs: "20rem", sm: "24rem", md: "28rem", lg: "32rem", xl: "36rem", "2xl": "42rem", "3xl": "48rem", "4xl": "56rem", "5xl": "64rem", "6xl": "72rem", "7xl": "80rem", full: "100%", min: "min-content", max: "max-content", fit: "fit-content", prose: "65ch" }), minHeight: { 0: "0px", full: "100%", min: "min-content", max: "max-content", fit: "fit-content", screen: "100vh" }, minWidth: { 0: "0px", full: "100%", min: "min-content", max: "max-content", fit: "fit-content" }, opacity: { .../* @__PURE__ */ Ne(100, "", 100, 0, 10), 5: "0.05", 25: "0.25", 75: "0.75", 95: "0.95" }, order: { first: "-9999", last: "9999", none: "0" }, padding: /* @__PURE__ */ ce("spacing"), placeholderColor: /* @__PURE__ */ ce("colors"), placeholderOpacity: /* @__PURE__ */ ce("opacity"), outlineColor: /* @__PURE__ */ ce("colors"), outlineOffset: /* @__PURE__ */ He(8, "px"), outlineWidth: /* @__PURE__ */ He(8, "px"), ringColor: ({ theme: e }) => ({ ...e("colors"), DEFAULT: "#3b82f6" }), ringOffsetColor: /* @__PURE__ */ ce("colors"), ringOffsetWidth: /* @__PURE__ */ He(8, "px"), ringOpacity: ({ theme: e }) => ({ ...e("opacity"), DEFAULT: "0.5" }), ringWidth: { DEFAULT: "3px", .../* @__PURE__ */ He(8, "px") }, rotate: { .../* @__PURE__ */ He(2, "deg"), .../* @__PURE__ */ He(12, "deg", 3), .../* @__PURE__ */ He(180, "deg", 45) }, saturate: /* @__PURE__ */ Ne(200, "", 100, 0, 50), scale: { .../* @__PURE__ */ Ne(150, "", 100, 0, 50), .../* @__PURE__ */ Ne(110, "", 100, 90, 5), 75: "0.75", 125: "1.25" }, scrollMargin: /* @__PURE__ */ ce("spacing"), scrollPadding: /* @__PURE__ */ ce("spacing"), sepia: { 0: "0", DEFAULT: "100%" }, skew: { .../* @__PURE__ */ He(2, "deg"), .../* @__PURE__ */ He(12, "deg", 3) }, space: /* @__PURE__ */ ce("spacing"), stroke: ({ theme: e }) => ({ ...e("colors"), none: "none" }), strokeWidth: /* @__PURE__ */ Ne(2), textColor: /* @__PURE__ */ ce("colors"), textDecorationColor: /* @__PURE__ */ ce("colors"), textDecorationThickness: { "from-font": "from-font", auto: "auto", .../* @__PURE__ */ He(8, "px") }, textUnderlineOffset: { auto: "auto", .../* @__PURE__ */ He(8, "px") }, textIndent: /* @__PURE__ */ ce("spacing"), textOpacity: /* @__PURE__ */ ce("opacity"), transitionDuration: ({ theme: e }) => ({ ...e("durations"), DEFAULT: "150ms" }), transitionDelay: /* @__PURE__ */ ce("durations"), transitionProperty: { none: "none", all: "all", DEFAULT: "color,background-color,border-color,text-decoration-color,fill,stroke,opacity,box-shadow,transform,filter,backdrop-filter", colors: "color,background-color,border-color,text-decoration-color,fill,stroke", opacity: "opacity", shadow: "box-shadow", transform: "transform" }, transitionTimingFunction: { DEFAULT: "cubic-bezier(0.4,0,0.2,1)", linear: "linear", in: "cubic-bezier(0.4,0,1,1)", out: "cubic-bezier(0,0,0.2,1)", "in-out": "cubic-bezier(0.4,0,0.2,1)" }, translate: ({ theme: e }) => ({ ...e("spacing"), ...ln(2, 4), full: "100%" }), width: ({ theme: e }) => ({ min: "min-content", max: "max-content", fit: "fit-content", screen: "100vw", ...e("flexBasis") }), willChange: { scroll: "scroll-position" }, zIndex: { .../* @__PURE__ */ Ne(50, "", 1, 0, 10), auto: "auto" } };
function ln(e, t) {
  let n = {};
  do
    for (var r = 1; r < e; r++) n[`${r}/${e}`] = Number((r / e * 100).toFixed(6)) + "%";
  while (++e <= t);
  return n;
}
function He(e, t, n = 0) {
  let r = {};
  for (; n <= e; n = 2 * n || 1) r[n] = n + t;
  return r;
}
function Ne(e, t = "", n = 1, r = 0, o = 1, i = {}) {
  for (; r <= e; r += o) i[r] = r / n + t;
  return i;
}
function ce(e) {
  return ({ theme: t }) => t(e);
}
let e5 = { "*,::before,::after": { boxSizing: "border-box", borderWidth: "0", borderStyle: "solid", borderColor: "theme(borderColor.DEFAULT, currentColor)" }, "::before,::after": { "--tw-content": "''" }, html: { lineHeight: 1.5, WebkitTextSizeAdjust: "100%", MozTabSize: "4", tabSize: 4, fontFamily: `theme(fontFamily.sans, ${Wo.fontFamily.sans})`, fontFeatureSettings: "theme(fontFamily.sans[1].fontFeatureSettings, normal)" }, body: { margin: "0", lineHeight: "inherit" }, hr: { height: "0", color: "inherit", borderTopWidth: "1px" }, "abbr:where([title])": { textDecoration: "underline dotted" }, "h1,h2,h3,h4,h5,h6": { fontSize: "inherit", fontWeight: "inherit" }, a: { color: "inherit", textDecoration: "inherit" }, "b,strong": { fontWeight: "bolder" }, "code,kbd,samp,pre": { fontFamily: `theme(fontFamily.mono, ${Wo.fontFamily.mono})`, fontFeatureSettings: "theme(fontFamily.mono[1].fontFeatureSettings, normal)", fontSize: "1em" }, small: { fontSize: "80%" }, "sub,sup": { fontSize: "75%", lineHeight: 0, position: "relative", verticalAlign: "baseline" }, sub: { bottom: "-0.25em" }, sup: { top: "-0.5em" }, table: { textIndent: "0", borderColor: "inherit", borderCollapse: "collapse" }, "button,input,optgroup,select,textarea": { fontFamily: "inherit", fontSize: "100%", lineHeight: "inherit", color: "inherit", margin: "0", padding: "0" }, "button,select": { textTransform: "none" }, "button,[type='button'],[type='reset'],[type='submit']": { WebkitAppearance: "button", backgroundColor: "transparent", backgroundImage: "none" }, ":-moz-focusring": { outline: "auto" }, ":-moz-ui-invalid": { boxShadow: "none" }, progress: { verticalAlign: "baseline" }, "::-webkit-inner-spin-button,::-webkit-outer-spin-button": { height: "auto" }, "[type='search']": { WebkitAppearance: "textfield", outlineOffset: "-2px" }, "::-webkit-search-decoration": { WebkitAppearance: "none" }, "::-webkit-file-upload-button": { WebkitAppearance: "button", font: "inherit" }, summary: { display: "list-item" }, "blockquote,dl,dd,h1,h2,h3,h4,h5,h6,hr,figure,p,pre": { margin: "0" }, fieldset: { margin: "0", padding: "0" }, legend: { padding: "0" }, "ol,ul,menu": { listStyle: "none", margin: "0", padding: "0" }, textarea: { resize: "vertical" }, "input::placeholder,textarea::placeholder": { opacity: 1, color: "theme(colors.gray.400, #9ca3af)" }, 'button,[role="button"]': { cursor: "pointer" }, ":disabled": { cursor: "default" }, "img,svg,video,canvas,audio,iframe,embed,object": { display: "block", verticalAlign: "middle" }, "img,video": { maxWidth: "100%", height: "auto" }, "[hidden]": { display: "none" } }, t5 = [j("\\[([-\\w]+):(.+)]", ({ 1: e, 2: t }, n) => ({ "@layer overrides": { "&": { [e]: wt(`[${t}]`, "", n) } } })), j("(group|peer)([~/][^-[]+)?", ({ input: e }, { h: t }) => [{ c: t(e) }]), z("aspect-", "aspectRatio"), j("container", (e, { theme: t }) => {
  let { screens: n = t("screens"), center: r, padding: o } = t("container"), i = { width: "100%", marginRight: r && "auto", marginLeft: r && "auto", ...s("xs") };
  for (let c in n) {
    let a = n[c];
    typeof a == "string" && (i[Zi(a)] = { "&": { maxWidth: a, ...s(c) } });
  }
  return i;
  function s(c) {
    let a = o && (typeof o == "string" ? o : o[c] || o.DEFAULT);
    if (a) return { paddingRight: a, paddingLeft: a };
  }
}), z("content-", "content", ({ _: e }) => ({ "--tw-content": e, content: "var(--tw-content)" })), j("(?:box-)?decoration-(slice|clone)", "boxDecorationBreak"), j("box-(border|content)", "boxSizing", ({ 1: e }) => e + "-box"), j("hidden", { display: "none" }), j("table-(auto|fixed)", "tableLayout"), j(["(block|flex|table|grid|inline|contents|flow-root|list-item)", "(inline-(block|flex|table|grid))", "(table-(caption|cell|column|row|(column|row|footer|header)-group))"], "display"), "(float)-(left|right|none)", "(clear)-(left|right|none|both)", "(overflow(?:-[xy])?)-(auto|hidden|clip|visible|scroll)", "(isolation)-(auto)", j("isolate", "isolation"), j("object-(contain|cover|fill|none|scale-down)", "objectFit"), z("object-", "objectPosition"), j("object-(top|bottom|center|(left|right)(-(top|bottom))?)", "objectPosition", On), j("overscroll(-[xy])?-(auto|contain|none)", ({ 1: e = "", 2: t }) => ({ ["overscroll-behavior" + e]: t })), j("(static|fixed|absolute|relative|sticky)", "position"), z("-?inset(-[xy])?(?:$|-)", "inset", ({ 1: e, _: t }) => ({ top: e != "-x" && t, right: e != "-y" && t, bottom: e != "-x" && t, left: e != "-y" && t })), z("-?(top|bottom|left|right)(?:$|-)", "inset"), j("(visible|collapse)", "visibility"), j("invisible", { visibility: "hidden" }), z("-?z-", "zIndex"), j("flex-((row|col)(-reverse)?)", "flexDirection", ua), j("flex-(wrap|wrap-reverse|nowrap)", "flexWrap"), z("(flex-(?:grow|shrink))(?:$|-)"), z("(flex)-"), z("grow(?:$|-)", "flexGrow"), z("shrink(?:$|-)", "flexShrink"), z("basis-", "flexBasis"), z("-?(order)-"), "-?(order)-(\\d+)", z("grid-cols-", "gridTemplateColumns"), j("grid-cols-(\\d+)", "gridTemplateColumns", ga), z("col-", "gridColumn"), j("col-(span)-(\\d+)", "gridColumn", pa), z("col-start-", "gridColumnStart"), j("col-start-(auto|\\d+)", "gridColumnStart"), z("col-end-", "gridColumnEnd"), j("col-end-(auto|\\d+)", "gridColumnEnd"), z("grid-rows-", "gridTemplateRows"), j("grid-rows-(\\d+)", "gridTemplateRows", ga), z("row-", "gridRow"), j("row-(span)-(\\d+)", "gridRow", pa), z("row-start-", "gridRowStart"), j("row-start-(auto|\\d+)", "gridRowStart"), z("row-end-", "gridRowEnd"), j("row-end-(auto|\\d+)", "gridRowEnd"), j("grid-flow-((row|col)(-dense)?)", "gridAutoFlow", (e) => On(ua(e))), j("grid-flow-(dense)", "gridAutoFlow"), z("auto-cols-", "gridAutoColumns"), z("auto-rows-", "gridAutoRows"), z("gap-x(?:$|-)", "gap", "columnGap"), z("gap-y(?:$|-)", "gap", "rowGap"), z("gap(?:$|-)", "gap"), "(justify-(?:items|self))-", j("justify-", "justifyContent", ha), j("(content|items|self)-", (e) => ({ ["align-" + e[1]]: ha(e) })), j("(place-(content|items|self))-", ({ 1: e, $$: t }) => ({ [e]: ("wun".includes(t[3]) ? "space-" : "") + t })), z("p([xytrbl])?(?:$|-)", "padding", Dt("padding")), z("-?m([xytrbl])?(?:$|-)", "margin", Dt("margin")), z("-?space-(x|y)(?:$|-)", "space", ({ 1: e, _: t }) => ({ "&>:not([hidden])~:not([hidden])": { [`--tw-space-${e}-reverse`]: "0", ["margin-" + { y: "top", x: "left" }[e]]: `calc(${t} * calc(1 - var(--tw-space-${e}-reverse)))`, ["margin-" + { y: "bottom", x: "right" }[e]]: `calc(${t} * var(--tw-space-${e}-reverse))` } })), j("space-(x|y)-reverse", ({ 1: e }) => ({ "&>:not([hidden])~:not([hidden])": { [`--tw-space-${e}-reverse`]: "1" } })), z("w-", "width"), z("min-w-", "minWidth"), z("max-w-", "maxWidth"), z("h-", "height"), z("min-h-", "minHeight"), z("max-h-", "maxHeight"), z("font-", "fontWeight"), z("font-", "fontFamily", ({ _: e }) => typeof (e = we(e))[1] == "string" ? { fontFamily: Ze(e) } : { fontFamily: Ze(e[0]), ...e[1] }), j("antialiased", { WebkitFontSmoothing: "antialiased", MozOsxFontSmoothing: "grayscale" }), j("subpixel-antialiased", { WebkitFontSmoothing: "auto", MozOsxFontSmoothing: "auto" }), j("italic", "fontStyle"), j("not-italic", { fontStyle: "normal" }), j("(ordinal|slashed-zero|(normal|lining|oldstyle|proportional|tabular)-nums|(diagonal|stacked)-fractions)", ({ 1: e, 2: t = "", 3: n }) => t == "normal" ? { fontVariantNumeric: "normal" } : { ["--tw-" + (n ? "numeric-fraction" : "pt".includes(t[0]) ? "numeric-spacing" : t ? "numeric-figure" : e)]: e, fontVariantNumeric: "var(--tw-ordinal) var(--tw-slashed-zero) var(--tw-numeric-figure) var(--tw-numeric-spacing) var(--tw-numeric-fraction)", ...ht({ "--tw-ordinal": "var(--tw-empty,/*!*/ /*!*/)", "--tw-slashed-zero": "var(--tw-empty,/*!*/ /*!*/)", "--tw-numeric-figure": "var(--tw-empty,/*!*/ /*!*/)", "--tw-numeric-spacing": "var(--tw-empty,/*!*/ /*!*/)", "--tw-numeric-fraction": "var(--tw-empty,/*!*/ /*!*/)" }) }), z("tracking-", "letterSpacing"), z("leading-", "lineHeight"), j("list-(inside|outside)", "listStylePosition"), z("list-", "listStyleType"), j("list-", "listStyleType"), z("placeholder-opacity-", "placeholderOpacity", ({ _: e }) => ({ "&::placeholder": { "--tw-placeholder-opacity": e } })), Ce("placeholder-", { property: "color", selector: "&::placeholder" }), j("text-(left|center|right|justify|start|end)", "textAlign"), j("text-(ellipsis|clip)", "textOverflow"), z("text-opacity-", "textOpacity", "--tw-text-opacity"), Ce("text-", { property: "color" }), z("text-", "fontSize", ({ _: e }) => typeof e == "string" ? { fontSize: e } : { fontSize: e[0], ...typeof e[1] == "string" ? { lineHeight: e[1] } : e[1] }), z("indent-", "textIndent"), j("(overline|underline|line-through)", "textDecorationLine"), j("no-underline", { textDecorationLine: "none" }), z("underline-offset-", "textUnderlineOffset"), Ce("decoration-", { section: "textDecorationColor", opacityVariable: !1, opacitySection: "opacity" }), z("decoration-", "textDecorationThickness"), j("decoration-", "textDecorationStyle"), j("(uppercase|lowercase|capitalize)", "textTransform"), j("normal-case", { textTransform: "none" }), j("truncate", { overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }), j("align-", "verticalAlign"), j("whitespace-", "whiteSpace"), j("break-normal", { wordBreak: "normal", overflowWrap: "normal" }), j("break-words", { overflowWrap: "break-word" }), j("break-all", { wordBreak: "break-all" }), j("break-keep", { wordBreak: "keep-all" }), Ce("caret-", { opacityVariable: !1, opacitySection: "opacity" }), Ce("accent-", { opacityVariable: !1, opacitySection: "opacity" }), j("bg-gradient-to-([trbl]|[tb][rl])", "backgroundImage", ({ 1: e }) => `linear-gradient(to ${St(e, " ")},var(--tw-gradient-stops))`), Ce("from-", { section: "gradientColorStops", opacityVariable: !1, opacitySection: "opacity" }, ({ _: e }) => ({ "--tw-gradient-from": e.value, "--tw-gradient-to": e.color({ opacityValue: "0" }), "--tw-gradient-stops": "var(--tw-gradient-from),var(--tw-gradient-to)" })), Ce("via-", { section: "gradientColorStops", opacityVariable: !1, opacitySection: "opacity" }, ({ _: e }) => ({ "--tw-gradient-to": e.color({ opacityValue: "0" }), "--tw-gradient-stops": `var(--tw-gradient-from),${e.value},var(--tw-gradient-to)` })), Ce("to-", { section: "gradientColorStops", property: "--tw-gradient-to", opacityVariable: !1, opacitySection: "opacity" }), j("bg-(fixed|local|scroll)", "backgroundAttachment"), j("bg-origin-(border|padding|content)", "backgroundOrigin", ({ 1: e }) => e + "-box"), j(["bg-(no-repeat|repeat(-[xy])?)", "bg-repeat-(round|space)"], "backgroundRepeat"), j("bg-blend-", "backgroundBlendMode"), j("bg-clip-(border|padding|content|text)", "backgroundClip", ({ 1: e }) => e + (e == "text" ? "" : "-box")), z("bg-opacity-", "backgroundOpacity", "--tw-bg-opacity"), Ce("bg-", { section: "backgroundColor" }), z("bg-", "backgroundImage"), z("bg-", "backgroundPosition"), j("bg-(top|bottom|center|(left|right)(-(top|bottom))?)", "backgroundPosition", On), z("bg-", "backgroundSize"), z("rounded(?:$|-)", "borderRadius"), z("rounded-([trbl]|[tb][rl])(?:$|-)", "borderRadius", ({ 1: e, _: t }) => {
  let n = { t: ["tl", "tr"], r: ["tr", "br"], b: ["bl", "br"], l: ["bl", "tl"] }[e] || [e, e];
  return { [`border-${St(n[0])}-radius`]: t, [`border-${St(n[1])}-radius`]: t };
}), j("border-(collapse|separate)", "borderCollapse"), z("border-opacity(?:$|-)", "borderOpacity", "--tw-border-opacity"), j("border-(solid|dashed|dotted|double|none)", "borderStyle"), z("border-spacing(-[xy])?(?:$|-)", "borderSpacing", ({ 1: e, _: t }) => ({ ...ht({ "--tw-border-spacing-x": "0", "--tw-border-spacing-y": "0" }), ["--tw-border-spacing" + (e || "-x")]: t, ["--tw-border-spacing" + (e || "-y")]: t, "border-spacing": "var(--tw-border-spacing-x) var(--tw-border-spacing-y)" })), Ce("border-([xytrbl])-", { section: "borderColor" }, Dt("border", "Color")), Ce("border-"), z("border-([xytrbl])(?:$|-)", "borderWidth", Dt("border", "Width")), z("border(?:$|-)", "borderWidth"), z("divide-opacity(?:$|-)", "divideOpacity", ({ _: e }) => ({ "&>:not([hidden])~:not([hidden])": { "--tw-divide-opacity": e } })), j("divide-(solid|dashed|dotted|double|none)", ({ 1: e }) => ({ "&>:not([hidden])~:not([hidden])": { borderStyle: e } })), j("divide-([xy]-reverse)", ({ 1: e }) => ({ "&>:not([hidden])~:not([hidden])": { ["--tw-divide-" + e]: "1" } })), z("divide-([xy])(?:$|-)", "divideWidth", ({ 1: e, _: t }) => {
  let n = { x: "lr", y: "tb" }[e];
  return { "&>:not([hidden])~:not([hidden])": { [`--tw-divide-${e}-reverse`]: "0", [`border-${St(n[0])}Width`]: `calc(${t} * calc(1 - var(--tw-divide-${e}-reverse)))`, [`border-${St(n[1])}Width`]: `calc(${t} * var(--tw-divide-${e}-reverse))` } };
}), Ce("divide-", { property: "borderColor", selector: "&>:not([hidden])~:not([hidden])" }), z("ring-opacity(?:$|-)", "ringOpacity", "--tw-ring-opacity"), Ce("ring-offset-", { property: "--tw-ring-offset-color", opacityVariable: !1 }), z("ring-offset(?:$|-)", "ringOffsetWidth", "--tw-ring-offset-width"), j("ring-inset", { "--tw-ring-inset": "inset" }), Ce("ring-", { property: "--tw-ring-color" }), z("ring(?:$|-)", "ringWidth", ({ _: e }, { theme: t }) => ({ ...ht({ "--tw-ring-offset-shadow": "0 0 #0000", "--tw-ring-shadow": "0 0 #0000", "--tw-shadow": "0 0 #0000", "--tw-shadow-colored": "0 0 #0000", "&": { "--tw-ring-inset": "var(--tw-empty,/*!*/ /*!*/)", "--tw-ring-offset-width": t("ringOffsetWidth", "", "0px"), "--tw-ring-offset-color": gt(t("ringOffsetColor", "", "#fff")), "--tw-ring-color": gt(t("ringColor", "", "#93c5fd"), { opacityVariable: "--tw-ring-opacity" }), "--tw-ring-opacity": t("ringOpacity", "", "0.5") } }), "--tw-ring-offset-shadow": "var(--tw-ring-inset) 0 0 0 var(--tw-ring-offset-width) var(--tw-ring-offset-color)", "--tw-ring-shadow": `var(--tw-ring-inset) 0 0 0 calc(${e} + var(--tw-ring-offset-width)) var(--tw-ring-color)`, boxShadow: "var(--tw-ring-offset-shadow),var(--tw-ring-shadow),var(--tw-shadow)" })), Ce("shadow-", { section: "boxShadowColor", opacityVariable: !1, opacitySection: "opacity" }, ({ _: e }) => ({ "--tw-shadow-color": e.value, "--tw-shadow": "var(--tw-shadow-colored)" })), z("shadow(?:$|-)", "boxShadow", ({ _: e }) => ({ ...ht({ "--tw-ring-offset-shadow": "0 0 #0000", "--tw-ring-shadow": "0 0 #0000", "--tw-shadow": "0 0 #0000", "--tw-shadow-colored": "0 0 #0000" }), "--tw-shadow": Ze(e), "--tw-shadow-colored": Ze(e).replace(/([^,]\s+)(?:#[a-f\d]+|(?:(?:hsl|rgb)a?|hwb|lab|lch|color|var)\(.+?\)|[a-z]+)(,|$)/g, "$1var(--tw-shadow-color)$2"), boxShadow: "var(--tw-ring-offset-shadow),var(--tw-ring-shadow),var(--tw-shadow)" })), z("(opacity)-"), j("mix-blend-", "mixBlendMode"), ...fa(), ...fa("backdrop-"), z("transition(?:$|-)", "transitionProperty", (e, { theme: t }) => ({ transitionProperty: Ze(e), transitionTimingFunction: e._ == "none" ? void 0 : Ze(t("transitionTimingFunction", "")), transitionDuration: e._ == "none" ? void 0 : Ze(t("transitionDuration", "")) })), z("duration(?:$|-)", "transitionDuration", "transitionDuration", Ze), z("ease(?:$|-)", "transitionTimingFunction", "transitionTimingFunction", Ze), z("delay(?:$|-)", "transitionDelay", "transitionDelay", Ze), z("animate(?:$|-)", "animation", (e, { theme: t, h: n, e: r }) => {
  let o = Ze(e), i = o.split(" "), s = t("keyframes", i[0]);
  return s ? { ["@keyframes " + (i[0] = r(n(i[0])))]: s, animation: i.join(" ") } : { animation: o };
}), "(transform)-(none)", j("transform", Fo), j("transform-(cpu|gpu)", ({ 1: e }) => ({ "--tw-transform": B2(e == "gpu") })), z("scale(-[xy])?-", "scale", ({ 1: e, _: t }) => ({ ["--tw-scale" + (e || "-x")]: t, ["--tw-scale" + (e || "-y")]: t, ...Fo() })), z("-?(rotate)-", "rotate", oo), z("-?(translate-[xy])-", "translate", oo), z("-?(skew-[xy])-", "skew", oo), j("origin-(center|((top|bottom)(-(left|right))?)|left|right)", "transformOrigin", On), "(appearance)-", z("(columns)-"), "(columns)-(\\d+)", "(break-(?:before|after|inside))-", z("(cursor)-"), "(cursor)-", j("snap-(none)", "scroll-snap-type"), j("snap-(x|y|both)", ({ 1: e }) => ({ ...ht({ "--tw-scroll-snap-strictness": "proximity" }), "scroll-snap-type": e + " var(--tw-scroll-snap-strictness)" })), j("snap-(mandatory|proximity)", "--tw-scroll-snap-strictness"), j("snap-(?:(start|end|center)|align-(none))", "scroll-snap-align"), j("snap-(normal|always)", "scroll-snap-stop"), j("scroll-(auto|smooth)", "scroll-behavior"), z("scroll-p([xytrbl])?(?:$|-)", "padding", Dt("scroll-padding")), z("-?scroll-m([xytrbl])?(?:$|-)", "scroll-margin", Dt("scroll-margin")), j("touch-(auto|none|manipulation)", "touch-action"), j("touch-(pinch-zoom|pan-(?:(x|left|right)|(y|up|down)))", ({ 1: e, 2: t, 3: n }) => ({ ...ht({ "--tw-pan-x": "var(--tw-empty,/*!*/ /*!*/)", "--tw-pan-y": "var(--tw-empty,/*!*/ /*!*/)", "--tw-pinch-zoom": "var(--tw-empty,/*!*/ /*!*/)", "--tw-touch-action": "var(--tw-pan-x) var(--tw-pan-y) var(--tw-pinch-zoom)" }), [`--tw-${t ? "pan-x" : n ? "pan-y" : e}`]: e, "touch-action": "var(--tw-touch-action)" })), j("outline-none", { outline: "2px solid transparent", "outline-offset": "2px" }), j("outline", { outlineStyle: "solid" }), j("outline-(dashed|dotted|double)", "outlineStyle"), z("-?(outline-offset)-"), Ce("outline-", { opacityVariable: !1, opacitySection: "opacity" }), z("outline-", "outlineWidth"), "(pointer-events)-", z("(will-change)-"), "(will-change)-", ["resize(?:-(none|x|y))?", "resize", ({ 1: e }) => ({ x: "horizontal", y: "vertical" })[e] || e || "both"], j("select-(none|text|all|auto)", "userSelect"), Ce("fill-", { section: "fill", opacityVariable: !1, opacitySection: "opacity" }), Ce("stroke-", { section: "stroke", opacityVariable: !1, opacitySection: "opacity" }), z("stroke-", "strokeWidth"), j("sr-only", { position: "absolute", width: "1px", height: "1px", padding: "0", margin: "-1px", overflow: "hidden", whiteSpace: "nowrap", clip: "rect(0,0,0,0)", borderWidth: "0" }), j("not-sr-only", { position: "static", width: "auto", height: "auto", padding: "0", margin: "0", overflow: "visible", whiteSpace: "normal", clip: "auto" })];
function On(e) {
  return (typeof e == "string" ? e : e[1]).replace(/-/g, " ").trim();
}
function ua(e) {
  return (typeof e == "string" ? e : e[1]).replace("col", "column");
}
function St(e, t = "-") {
  let n = [];
  for (let r of e) n.push({ t: "top", r: "right", b: "bottom", l: "left" }[r]);
  return n.join(t);
}
function Ze(e) {
  return e && "" + (e._ || e);
}
function ha({ $$: e }) {
  return ({ r: "flex-", "": "flex-", w: "space-", u: "space-", n: "space-" }[e[3] || ""] || "") + e;
}
function Dt(e, t = "") {
  return ({ 1: n, _: r }) => {
    let o = { x: "lr", y: "tb" }[n] || n + n;
    return o ? { ...Yn(e + "-" + St(o[0]) + t, r), ...Yn(e + "-" + St(o[1]) + t, r) } : Yn(e + t, r);
  };
}
function fa(e = "") {
  let t = ["blur", "brightness", "contrast", "grayscale", "hue-rotate", "invert", e && "opacity", "saturate", "sepia", !e && "drop-shadow"].filter(Boolean), n = {};
  for (let r of t) n[`--tw-${e}${r}`] = "var(--tw-empty,/*!*/ /*!*/)";
  return n = { ...ht(n), [`${e}filter`]: t.map((r) => `var(--tw-${e}${r})`).join(" ") }, [`(${e}filter)-(none)`, j(`${e}filter`, n), ...t.map((r) => z(`${r[0] == "h" ? "-?" : ""}(${e}${r})(?:$|-)`, r, ({ 1: o, _: i }) => ({ [`--tw-${o}`]: we(i).map((s) => `${r}(${s})`).join(" "), ...n })))];
}
function oo({ 1: e, _: t }) {
  return { ["--tw-" + e]: t, ...Fo() };
}
function Fo() {
  return { ...ht({ "--tw-translate-x": "0", "--tw-translate-y": "0", "--tw-rotate": "0", "--tw-skew-x": "0", "--tw-skew-y": "0", "--tw-scale-x": "1", "--tw-scale-y": "1", "--tw-transform": B2() }), transform: "var(--tw-transform)" };
}
function B2(e) {
  return [e ? "translate3d(var(--tw-translate-x),var(--tw-translate-y),0)" : "translateX(var(--tw-translate-x)) translateY(var(--tw-translate-y))", "rotate(var(--tw-rotate))", "skewX(var(--tw-skew-x))", "skewY(var(--tw-skew-y))", "scaleX(var(--tw-scale-x))", "scaleY(var(--tw-scale-y))"].join(" ");
}
function pa({ 1: e, 2: t }) {
  return `${e} ${t} / ${e} ${t}`;
}
function ga({ 1: e }) {
  return `repeat(${e},minmax(0,1fr))`;
}
function ht(e) {
  return { "@layer defaults": { "*,::before,::after": e, "::backdrop": e } };
}
let n5 = [["sticky", "@supports ((position: -webkit-sticky) or (position:sticky))"], ["motion-reduce", "@media (prefers-reduced-motion:reduce)"], ["motion-safe", "@media (prefers-reduced-motion:no-preference)"], ["print", "@media print"], ["(portrait|landscape)", ({ 1: e }) => `@media (orientation:${e})`], ["contrast-(more|less)", ({ 1: e }) => `@media (prefers-contrast:${e})`], ["(first-(letter|line)|placeholder|backdrop|before|after)", ({ 1: e }) => `&::${e}`], ["(marker|selection)", ({ 1: e }) => `& *::${e},&::${e}`], ["file", "&::file-selector-button"], ["(first|last|only)", ({ 1: e }) => `&:${e}-child`], ["even", "&:nth-child(2n)"], ["odd", "&:nth-child(odd)"], ["open", "&[open]"], ["(aria|data)-", ({ 1: e, $$: t }, n) => t && `&[${e}-${n.theme(e, t) || wt(t, "", n) || `${t}="true"`}]`], ["((group|peer)(~[^-[]+)?)(-\\[(.+)]|[-[].+?)(\\/.+)?", ({ 2: e, 3: t = "", 4: n, 5: r = "", 6: o = t }, { e: i, h: s, v: c }) => {
  let a = _n(r) || (n[0] == "[" ? n : c(n.slice(1)));
  return `${(a.includes("&") ? a : "&" + a).replace(/&/g, `:merge(.${i(s(e + o))})`)}${e[0] == "p" ? "~" : " "}&`;
}], ["(ltr|rtl)", ({ 1: e }) => `[dir="${e}"] &`], ["supports-", ({ $$: e }, t) => {
  if (e && (e = t.theme("supports", e) || wt(e, "", t)), e) return e.includes(":") || (e += ":var(--tw)"), /^\w*\s*\(/.test(e) || (e = `(${e})`), `@supports ${e.replace(/\b(and|or|not)\b/g, " $1 ").trim()}`;
}], ["max-", ({ $$: e }, t) => {
  if (e && (e = t.theme("screens", e) || wt(e, "", t)), typeof e == "string") return `@media not all and (min-width:${e})`;
}], ["min-", ({ $$: e }, t) => (e && (e = wt(e, "", t)), e && `@media (min-width:${e})`)], [/^\[(.+)]$/, ({ 1: e }) => /[&@]/.test(e) && _n(e).replace(/[}]+$/, "").split("{")]], r5 = { __proto__: null, slate: { 50: "#f8fafc", 100: "#f1f5f9", 200: "#e2e8f0", 300: "#cbd5e1", 400: "#94a3b8", 500: "#64748b", 600: "#475569", 700: "#334155", 800: "#1e293b", 900: "#0f172a" }, gray: { 50: "#f9fafb", 100: "#f3f4f6", 200: "#e5e7eb", 300: "#d1d5db", 400: "#9ca3af", 500: "#6b7280", 600: "#4b5563", 700: "#374151", 800: "#1f2937", 900: "#111827" }, zinc: { 50: "#fafafa", 100: "#f4f4f5", 200: "#e4e4e7", 300: "#d4d4d8", 400: "#a1a1aa", 500: "#71717a", 600: "#52525b", 700: "#3f3f46", 800: "#27272a", 900: "#18181b" }, neutral: { 50: "#fafafa", 100: "#f5f5f5", 200: "#e5e5e5", 300: "#d4d4d4", 400: "#a3a3a3", 500: "#737373", 600: "#525252", 700: "#404040", 800: "#262626", 900: "#171717" }, stone: { 50: "#fafaf9", 100: "#f5f5f4", 200: "#e7e5e4", 300: "#d6d3d1", 400: "#a8a29e", 500: "#78716c", 600: "#57534e", 700: "#44403c", 800: "#292524", 900: "#1c1917" }, red: { 50: "#fef2f2", 100: "#fee2e2", 200: "#fecaca", 300: "#fca5a5", 400: "#f87171", 500: "#ef4444", 600: "#dc2626", 700: "#b91c1c", 800: "#991b1b", 900: "#7f1d1d" }, orange: { 50: "#fff7ed", 100: "#ffedd5", 200: "#fed7aa", 300: "#fdba74", 400: "#fb923c", 500: "#f97316", 600: "#ea580c", 700: "#c2410c", 800: "#9a3412", 900: "#7c2d12" }, amber: { 50: "#fffbeb", 100: "#fef3c7", 200: "#fde68a", 300: "#fcd34d", 400: "#fbbf24", 500: "#f59e0b", 600: "#d97706", 700: "#b45309", 800: "#92400e", 900: "#78350f" }, yellow: { 50: "#fefce8", 100: "#fef9c3", 200: "#fef08a", 300: "#fde047", 400: "#facc15", 500: "#eab308", 600: "#ca8a04", 700: "#a16207", 800: "#854d0e", 900: "#713f12" }, lime: { 50: "#f7fee7", 100: "#ecfccb", 200: "#d9f99d", 300: "#bef264", 400: "#a3e635", 500: "#84cc16", 600: "#65a30d", 700: "#4d7c0f", 800: "#3f6212", 900: "#365314" }, green: { 50: "#f0fdf4", 100: "#dcfce7", 200: "#bbf7d0", 300: "#86efac", 400: "#4ade80", 500: "#22c55e", 600: "#16a34a", 700: "#15803d", 800: "#166534", 900: "#14532d" }, emerald: { 50: "#ecfdf5", 100: "#d1fae5", 200: "#a7f3d0", 300: "#6ee7b7", 400: "#34d399", 500: "#10b981", 600: "#059669", 700: "#047857", 800: "#065f46", 900: "#064e3b" }, teal: { 50: "#f0fdfa", 100: "#ccfbf1", 200: "#99f6e4", 300: "#5eead4", 400: "#2dd4bf", 500: "#14b8a6", 600: "#0d9488", 700: "#0f766e", 800: "#115e59", 900: "#134e4a" }, cyan: { 50: "#ecfeff", 100: "#cffafe", 200: "#a5f3fc", 300: "#67e8f9", 400: "#22d3ee", 500: "#06b6d4", 600: "#0891b2", 700: "#0e7490", 800: "#155e75", 900: "#164e63" }, sky: { 50: "#f0f9ff", 100: "#e0f2fe", 200: "#bae6fd", 300: "#7dd3fc", 400: "#38bdf8", 500: "#0ea5e9", 600: "#0284c7", 700: "#0369a1", 800: "#075985", 900: "#0c4a6e" }, blue: { 50: "#eff6ff", 100: "#dbeafe", 200: "#bfdbfe", 300: "#93c5fd", 400: "#60a5fa", 500: "#3b82f6", 600: "#2563eb", 700: "#1d4ed8", 800: "#1e40af", 900: "#1e3a8a" }, indigo: { 50: "#eef2ff", 100: "#e0e7ff", 200: "#c7d2fe", 300: "#a5b4fc", 400: "#818cf8", 500: "#6366f1", 600: "#4f46e5", 700: "#4338ca", 800: "#3730a3", 900: "#312e81" }, violet: { 50: "#f5f3ff", 100: "#ede9fe", 200: "#ddd6fe", 300: "#c4b5fd", 400: "#a78bfa", 500: "#8b5cf6", 600: "#7c3aed", 700: "#6d28d9", 800: "#5b21b6", 900: "#4c1d95" }, purple: { 50: "#faf5ff", 100: "#f3e8ff", 200: "#e9d5ff", 300: "#d8b4fe", 400: "#c084fc", 500: "#a855f7", 600: "#9333ea", 700: "#7e22ce", 800: "#6b21a8", 900: "#581c87" }, fuchsia: { 50: "#fdf4ff", 100: "#fae8ff", 200: "#f5d0fe", 300: "#f0abfc", 400: "#e879f9", 500: "#d946ef", 600: "#c026d3", 700: "#a21caf", 800: "#86198f", 900: "#701a75" }, pink: { 50: "#fdf2f8", 100: "#fce7f3", 200: "#fbcfe8", 300: "#f9a8d4", 400: "#f472b6", 500: "#ec4899", 600: "#db2777", 700: "#be185d", 800: "#9d174d", 900: "#831843" }, rose: { 50: "#fff1f2", 100: "#ffe4e6", 200: "#fecdd3", 300: "#fda4af", 400: "#fb7185", 500: "#f43f5e", 600: "#e11d48", 700: "#be123c", 800: "#9f1239", 900: "#881337" } };
function o5({ disablePreflight: e } = {}) {
  return (function({ colors: t, disablePreflight: n } = {}) {
    return { preflight: n ? void 0 : e5, theme: { ...Wo, colors: { inherit: "inherit", current: "currentColor", transparent: "transparent", black: "#000", white: "#fff", ...t } }, variants: n5, rules: t5, finalize: (r) => r.n && r.d && r.r.some((o) => /^&::(before|after)$/.test(o)) && !/(^|;)content:/.test(r.d) ? { ...r, d: "content:var(--tw-content);" + r.d } : r };
  })({ colors: r5, disablePreflight: e });
}
let i5 = typeof ShadowRoot < "u" && (typeof ShadyCSS > "u" || ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype;
function io(e) {
  return e.shadowRoot || e.attachShadow({ mode: "open" });
}
const so = { "brand-light": "var(--bc-color-brand, #196CE7)", "brand-dark": "var(--bc-color-brand-dark, var(--bc-color-brand, #3994FF))", "brand-button-text-light": "var(--bc-color-brand-button-text)", "brand-button-text-dark": "var(--bc-color-brand-button-text-dark, var(--bc-color-brand-button-text))", "brand-mixed-light": "color-mix(in srgb, var(--bc-color-brand, #196CE7) var(--bc-brand-mix, 100%), black)", "brand-mixed-dark": "color-mix(in srgb, var(--bc-color-brand-dark, var(--bc-color-brand, #3994FF)) var(--bc-brand-mix, 100%), white)", "foreground-light": "#000", "foreground-dark": "#fff", "background-light": "#fff", "background-dark": "#000", "neutral-primary-light": "#262626", "neutral-primary-dark": "#E4E4E4", "neutral-secondary-light": "#525252", "neutral-secondary-dark": "#A2A2A2", "neutral-tertiary-light": "#A2A2A2", "neutral-tertiary-dark": "#525252" }, s5 = { "glass-light": "linear-gradient(180deg, rgba(211, 211, 211, 0.20) 0%, rgba(255, 255, 255, 0.20) 50%);", "glass-dark": "linear-gradient(180deg, rgba(211, 211, 211, 0.10) 0%, rgba(0, 0, 0, 0.20) 50%)" }, he = () => globalThis.window ? (function(e, t = !0) {
  let n = (function() {
    if (i5) try {
      let a = ro(new CSSStyleSheet());
      return a.connect = (h) => {
        let w = io(h);
        w.adoptedStyleSheets = [...w.adoptedStyleSheets, a.target];
      }, a.disconnect = Uo, a;
    } catch {
    }
    let i = document.createElement("style");
    i.media = "not all", document.head.prepend(i);
    let s = [ro(i)], c = /* @__PURE__ */ new WeakMap();
    return { get target() {
      return s[0].target;
    }, snapshot() {
      let a = s.map((h) => h.snapshot());
      return () => a.forEach((h) => h());
    }, clear() {
      s.forEach((a) => a.clear());
    }, destroy() {
      s.forEach((a) => a.destroy());
    }, insert(a, h, w) {
      s[0].insert(a, h, w);
      let g = this.target.cssRules[h];
      s.forEach((v, b) => b && v.target.insertRule(g.cssText, h));
    }, resume: (a, h) => s[0].resume(a, h), connect(a) {
      let h = document.createElement("style");
      io(a).appendChild(h);
      let w = ro(h), { cssRules: g } = this.target;
      for (let v = 0; v < g.length; v++) w.target.insertRule(g[v].cssText, v);
      s.push(w), c.set(a, w);
    }, disconnect(a) {
      let h = s.indexOf(c.get(a));
      h >= 0 && s.splice(h, 1);
    } };
  })(), r = (function(i, s) {
    let c = la(i), a = (function({ theme: b, darkMode: C, darkColor: L = Uo, variants: M, rules: I, hash: U, stringify: q, ignorelist: Q, finalize: A }) {
      let _ = /* @__PURE__ */ new Map(), E = /* @__PURE__ */ new Map(), T = /* @__PURE__ */ new Map(), m = /* @__PURE__ */ new Map(), k = M2(Q, (u, p) => p.test(u));
      M.push(["dark", Array.isArray(C) || C == "class" ? `${we(C)[1] || ".dark"} &` : typeof C == "string" && C != "media" ? C : "@media (prefers-color-scheme:dark)"]);
      let d = typeof U == "function" ? (u) => U(u, ur) : U ? ur : oa;
      d !== oa && A.push((u) => ({ ...u, n: u.n && d(u.n), d: u.d?.replace(/--(tw(?:-[\w-]+)?)\b/g, (p, f) => "--" + d(f).replace("#", "")) }));
      let l = { theme: (function({ extend: u = {}, ...p }) {
        let f = {}, y = { get colors() {
          return x("colors");
        }, theme: x, negative: () => ({}), breakpoints(R) {
          let P = {};
          for (let S in R) typeof R[S] == "string" && (P["screen-" + S] = R[S]);
          return P;
        } };
        return x;
        function x(R, P, S, D) {
          if (R) {
            if ({ 1: R, 2: D } = /^(\S+?)(?:\s*\/\s*([^/]+))?$/.exec(R) || [, R], /[.[]/.test(R)) {
              let X = [];
              R.replace(/\[([^\]]+)\]|([^.[]+)/g, (ie, N, $ = N) => X.push($)), R = X.shift(), S = P, P = X.join("-");
            }
            let Y = f[R] || Object.assign(Object.assign(f[R] = {}, O(p, R)), O(u, R));
            if (P == null) return Y;
            P || (P = "DEFAULT");
            let G = Y[P] ?? P.split("-").reduce((X, ie) => X?.[ie], Y) ?? S;
            return D ? gt(G, { opacityValue: Fi(D, x) }) : G;
          }
          let J = {};
          for (let Y of [...Object.keys(p), ...Object.keys(u)]) J[Y] = x(Y);
          return J;
        }
        function O(R, P) {
          let S = R[P];
          return typeof S == "function" && (S = S(y)), S && /color|fill|stroke/i.test(P) ? (function D(J, Y = []) {
            let G = {};
            for (let X in J) {
              let ie = J[X], N = [...Y, X];
              G[N.join("-")] = ie, X == "DEFAULT" && (N = Y, G[Y.join("-")] = ie), typeof ie == "object" && Object.assign(G, D(ie, N));
            }
            return G;
          })(S) : S;
        }
      })(b), e: x2, h: d, s: (u, p) => q(u, p, l), d: (u, p, f) => L(u, p, l, f), v: (u) => (_.has(u) || _.set(u, da(u, M, E, J3, l) || "&:" + u), _.get(u)), r(u, p) {
        let f = JSON.stringify([u, p]);
        return T.has(f) || T.set(f, !k(u, l) && da(u, I, m, Y3, l, p)), T.get(f);
      }, f: (u) => A.reduce((p, f) => f(p, l), u) };
      return l;
    })(c), h = /* @__PURE__ */ new Map(), w = [], g = /* @__PURE__ */ new Set();
    function v(b) {
      let C = a.f(b), L = Po(C);
      if (L && !g.has(L)) {
        g.add(L);
        let M = k2(w, b);
        s.insert(L, M, b), w.splice(M, 0, b);
      }
      return C.n;
    }
    return s.resume((b) => h.set(b, b), (b, C) => {
      s.insert(b, w.length, C), w.push(C), g.add(b);
    }), Object.defineProperties(function(b) {
      if (!h.size) for (let L of we(c.preflight)) typeof L == "function" && (L = L(a)), L && (typeof L == "string" ? Vi("", _e.b, fr(L), a, _e.b, [], !1, !0) : S2(L, {}, a, _e.b)).forEach(v);
      let C = h.get(b = "" + b);
      if (!C) {
        let L = /* @__PURE__ */ new Set();
        for (let M of hr(fr(b), a)) L.add(M.c).add(v(M));
        C = [...L].filter(Boolean).join(" "), h.set(b, C).set(C, C);
      }
      return C;
    }, Object.getOwnPropertyDescriptors({ get target() {
      return s.target;
    }, theme: a.theme, config: c, snapshot() {
      let b = s.snapshot(), C = new Set(g), L = new Map(h), M = [...w];
      return () => {
        b(), g = C, h = L, w = M;
      };
    }, clear() {
      s.clear(), g = /* @__PURE__ */ new Set(), h = /* @__PURE__ */ new Map(), w = [];
    }, destroy() {
      this.clear(), s.destroy();
    } }));
  })({ ...e, hash: e.hash ?? t }, n), o = (function(i) {
    let s = new MutationObserver(c);
    return { observe(h) {
      s.observe(h, { attributeFilter: ["class"], subtree: !0, childList: !0 }), a(h), c([{ target: h, type: "" }]);
    }, disconnect() {
      s.disconnect();
    } };
    function c(h) {
      for (let { type: w, target: g } of h) if (w[0] == "a") a(g);
      else for (let v of g.querySelectorAll("[class]")) a(v);
      s.takeRecords();
    }
    function a(h) {
      let w, g = h.getAttribute?.("class");
      g && (function(v, b) {
        return v != b && "" + v.split(" ").sort() != "" + b.split(" ").sort();
      })(g, w = i(g)) && h.setAttribute("class", w);
    }
  })(r);
  return function(i) {
    return class extends i {
      connectedCallback() {
        super.connectedCallback?.(), n.connect(this), o.observe(io(this));
      }
      disconnectedCallback() {
        n.disconnect(this), super.disconnectedCallback?.();
      }
      constructor(...s) {
        super(...s), this.tw = r;
      }
    };
  };
})(la({ darkMode: globalThis.bcDarkMode, theme: { fontFamily: { sans: ["Inter", "sans-serif"], mono: ["Roboto Mono", "monospace"] }, extend: { borderColor: qe({}, so), backgroundColor: qe({}, so), textColor: qe({}, so), backgroundImage: qe({}, s5), animation: { darken: "darken 0.2s ease-out forwards", "fade-in": "fade-in 0.2s ease-out forwards", "slide-up": "slideUp 0.3s ease-out forwards" }, keyframes: { darken: { "0%": { opacity: 0 }, "100%": { opacity: 0.5 } }, lighten: { "0%": { opacity: 0.5 }, "100%": { opacity: 0 } }, "fade-in": { "0%": { opacity: 0 }, "100%": { opacity: 1 } }, "fade-out": { "0%": { opacity: 1 }, "100%": { opacity: 0 } }, slideUp: { from: { transform: "translateY(100%)" }, to: { transform: "translateY(0)" } } } } }, presets: [o5({})], hash: !1 })) : a5;
function a5(e) {
  return e;
}
const Le = "transition-all hover:brightness-90 dark:hover:brightness-110 active:scale-95 cursor-pointer", Vo = "hover-animation", be = "text-brand-mixed-light dark:text-brand-mixed-dark", rt = "text-foreground-light dark:text-foreground-dark", Sn = "text-neutral-primary-light dark:text-neutral-primary-dark", re = "text-neutral-secondary-light dark:text-neutral-secondary-dark", Qe = "text-neutral-tertiary-light dark:text-neutral-tertiary-dark", Ut = "border-neutral-secondary-light dark:border-neutral-secondary-dark", Gi = "border-neutral-tertiary-light dark:border-neutral-tertiary-dark";
let wa, ya, ba, Go = (e) => e;
function R2() {
  return W(wa || (wa = Go`<div
    class="absolute top-0 left-0 w-full h-full rounded-lg border-2 pointer-events-none ${0} opacity-5"
  ></div>`), Gi);
}
function c5(e) {
  V.getState().connected && e(V.getState().provider);
  const t = V.subscribe(async (n, r) => {
    if (n.connected && !r.connected) {
      if (!n.provider) throw new Error("No provider available");
      e(n.provider);
    }
  });
  return () => {
    t();
  };
}
function n6(e) {
  V.getState().connecting && e();
  const t = V.subscribe(async (n, r) => {
    n.connecting && !r.connecting && e();
  });
  return () => {
    t();
  };
}
function r6(e) {
  const t = V.subscribe(async (n, r) => {
    !n.connected && r.connected && e();
  });
  return () => {
    t();
  };
}
function o6(e) {
  const t = V.subscribe(async (n, r) => {
    n.modalOpen && !r.modalOpen && e();
  });
  return () => {
    t();
  };
}
function N2(e) {
  const t = V.subscribe(async (n, r) => {
    !n.modalOpen && r.modalOpen && e();
  });
  return () => {
    t();
  };
}
async function i6() {
  let e = V.getState().provider;
  if (!e && ($2(), await new Promise((t, n) => {
    const r = N2(() => {
      r(), o(), e && t(), n("Modal closed without connecting");
    }), o = c5((i) => {
      e = i;
    });
  }), !e)) throw new Error("No WebLN provider available");
  return e;
}
function s6() {
  return console.warn("Bitcoin Connect: isConnected is deprecated and will be removed in the next major version"), V.getState().connected;
}
function a6(e = {}) {
  V.getState().setBitcoinConnectConfig(e);
}
function c6() {
  window.dispatchEvent(new CustomEvent("bc:balancerefresh"));
}
function $2() {
  const e = document.createElement("bc-modal"), t = document.createElement("bc-connect");
  t.setAttribute("closable", "closable"), e.appendChild(t), document.body.appendChild(e), V.getState().setModalOpen(!0);
}
function l5({ invoice: e, paymentMethods: t, onPaid: n, onCancelled: r }) {
  if (document.querySelector("bc-modal")) throw new Error("bc-modal already in DOM");
  const o = document.createElement("bc-modal"), i = document.createElement("bc-payment");
  i.setAttribute("closable", "closable"), i.setAttribute("invoice", e), t && i.setAttribute("payment-methods", t), o.appendChild(i);
  let s = !1;
  const c = (h) => {
    s = !0, n?.(h.detail);
  };
  window.addEventListener("bc:onpaid", c);
  const a = N2(() => {
    a(), window.removeEventListener("bc:onpaid", c), s || r == null || r();
  });
  return document.body.appendChild(o), V.getState().setModalOpen(!0), { setPaid: (h) => {
    i.setAttribute("paid", "paid"), i.dispatchEvent(new CustomEvent("bc:onpaid", { bubbles: !0, composed: !0, detail: h }));
  } };
}
function ji() {
  const e = document.querySelector("bc-modal");
  e && document.body.removeChild(e), V.getState().setModalOpen(!1), V.getState().clearRouteHistory(), V.getState().setError(void 0);
}
function l6(e) {
  V.getState().connect(e);
}
function d6(e) {
  V.getState().connectNWC(e);
}
function u6() {
  V.getState().disconnect();
}
function h6() {
  return V.getState().connectorConfig;
}
let ma, d5 = (e) => e, Zt = class extends he()(ae) {
  constructor() {
    super(), this._loading = !1, this._loadBalance(), window.addEventListener("bc:balancerefresh", () => {
      this._loadBalance();
    }), this._selectedCurrency = V.getState().currency, V.subscribe((e, t) => {
      this._selectedCurrency = e.currency, e.currency !== t.currency && this._convertBalance(), e.connected !== t.connected && e.connected && this._loadBalance();
    });
  }
  render() {
    return W(ma || (ma = d5` <span
      class="font-medium font-sans mr-2 flex justify-center items-center gap-0.5 ${0}"
    >
      <span class="font-mono">${0} </span></span
    >`), be, this._balance || "Loading...");
  }
  async _convertBalance() {
    if (this._loading || this._balanceSats === void 0) return;
    const e = this._selectedCurrency || "sats";
    if (e === "BTC") this._balance = (this._balanceSats / 1e8).toLocaleString(void 0, { minimumFractionDigits: 8, useGrouping: !0 }) + " BTC";
    else if (e !== "sats") {
      try {
        this._loading = !0;
        const t = await i3({ satoshi: this._balanceSats, currency: e }), n = parseFloat(t.toFixed(2));
        this._balance = new Intl.NumberFormat(void 0, { style: "currency", currency: e }).format(n);
      } catch (t) {
        console.error(t);
      }
      this._loading = !1;
    } else this._balance = this._balanceSats.toLocaleString(void 0, { useGrouping: !0 }) + " sats";
  }
  _loadBalance() {
    var e = this;
    (async function() {
      try {
        const t = V.getState().provider;
        if (t == null || !t.getBalance) return;
        const n = await t.getBalance();
        n && (e._balanceSats = n.balance, e._convertBalance());
      } catch (t) {
        e._balance = "⚠️", console.error(t);
      }
    })();
  }
};
F([se()], Zt.prototype, "_balance", void 0), F([se()], Zt.prototype, "_balanceSats", void 0), F([se()], Zt.prototype, "_loading", void 0), F([se()], Zt.prototype, "_selectedCurrency", void 0), Zt = F([oe("bc-balance")], Zt);
let va, u5 = (e) => e;
const Ot = (e) => de(va || (va = u5`
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100px" height="100px" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid" class=${0}>
<g transform="rotate(0 50 50)">
  <rect x="47" y="24" rx="3" ry="6" width="6" height="12" fill="currentColor">
    <animate attributeName="opacity" values="1;0" keyTimes="0;1" dur="1s" begin="-0.9166666666666666s" repeatCount="indefinite"></animate>
  </rect>
</g><g transform="rotate(30 50 50)">
  <rect x="47" y="24" rx="3" ry="6" width="6" height="12" fill="currentColor">
    <animate attributeName="opacity" values="1;0" keyTimes="0;1" dur="1s" begin="-0.8333333333333334s" repeatCount="indefinite"></animate>
  </rect>
</g><g transform="rotate(60 50 50)">
  <rect x="47" y="24" rx="3" ry="6" width="6" height="12" fill="currentColor">
    <animate attributeName="opacity" values="1;0" keyTimes="0;1" dur="1s" begin="-0.75s" repeatCount="indefinite"></animate>
  </rect>
</g><g transform="rotate(90 50 50)">
  <rect x="47" y="24" rx="3" ry="6" width="6" height="12" fill="currentColor">
    <animate attributeName="opacity" values="1;0" keyTimes="0;1" dur="1s" begin="-0.6666666666666666s" repeatCount="indefinite"></animate>
  </rect>
</g><g transform="rotate(120 50 50)">
  <rect x="47" y="24" rx="3" ry="6" width="6" height="12" fill="currentColor">
    <animate attributeName="opacity" values="1;0" keyTimes="0;1" dur="1s" begin="-0.5833333333333334s" repeatCount="indefinite"></animate>
  </rect>
</g><g transform="rotate(150 50 50)">
  <rect x="47" y="24" rx="3" ry="6" width="6" height="12" fill="currentColor">
    <animate attributeName="opacity" values="1;0" keyTimes="0;1" dur="1s" begin="-0.5s" repeatCount="indefinite"></animate>
  </rect>
</g><g transform="rotate(180 50 50)">
  <rect x="47" y="24" rx="3" ry="6" width="6" height="12" fill="currentColor">
    <animate attributeName="opacity" values="1;0" keyTimes="0;1" dur="1s" begin="-0.4166666666666667s" repeatCount="indefinite"></animate>
  </rect>
</g><g transform="rotate(210 50 50)">
  <rect x="47" y="24" rx="3" ry="6" width="6" height="12" fill="currentColor">
    <animate attributeName="opacity" values="1;0" keyTimes="0;1" dur="1s" begin="-0.3333333333333333s" repeatCount="indefinite"></animate>
  </rect>
</g><g transform="rotate(240 50 50)">
  <rect x="47" y="24" rx="3" ry="6" width="6" height="12" fill="currentColor">
    <animate attributeName="opacity" values="1;0" keyTimes="0;1" dur="1s" begin="-0.25s" repeatCount="indefinite"></animate>
  </rect>
</g><g transform="rotate(270 50 50)">
  <rect x="47" y="24" rx="3" ry="6" width="6" height="12" fill="currentColor">
    <animate attributeName="opacity" values="1;0" keyTimes="0;1" dur="1s" begin="-0.16666666666666666s" repeatCount="indefinite"></animate>
  </rect>
</g><g transform="rotate(300 50 50)">
  <rect x="47" y="24" rx="3" ry="6" width="6" height="12" fill="currentColor">
    <animate attributeName="opacity" values="1;0" keyTimes="0;1" dur="1s" begin="-0.08333333333333333s" repeatCount="indefinite"></animate>
  </rect>
</g><g transform="rotate(330 50 50)">
  <rect x="47" y="24" rx="3" ry="6" width="6" height="12" fill="currentColor">
    <animate attributeName="opacity" values="1;0" keyTimes="0;1" dur="1s" begin="0s" repeatCount="indefinite"></animate>
  </rect>
</g>
</svg>`), e || "w-7 h-7");
let Ca, xa, Ea, Aa, ka, _a, Sa, La, kt = (e) => e, Pn = class extends he()(ae) {
  constructor() {
    super(), this.title = "Connect Wallet", this._showBalance = void 0, this._showBalance = V.getState().bitcoinConnectConfig.showBalance && V.getState().supports("getBalance"), V.subscribe((e) => {
      this._showBalance = e.bitcoinConnectConfig.showBalance && e.supports("getBalance");
    });
  }
  render() {
    const e = this._connecting || !this._connected && this._modalOpen;
    return W(Ca || (Ca = kt`<div>
      <div
        class="relative inline-flex ${0} cursor-pointer 
          rounded-lg gap-2 justify-center items-center"
        @click=${0}
      >
        <div
          class="absolute top-0 left-0 w-full h-full rounded-lg pointer-events-none ${0}"
        ></div>
        ${0}
        <bci-button variant="primary">
          ${0}
          <span class="font-semibold">
            ${0}
          </span>
        </bci-button>
        ${0}
      </div>
    </div>`), Le, this._onClick, this._connected ? "bg-glass-light dark:bg-glass-dark" : "", this._connected ? R2() : "", e ? W(xa || (xa = kt` ${0} `), Ot("w-11 h-11 -mr-2 mr-1 -ml-2.5")) : this._connected ? null : W(Ea || (Ea = kt`<span class="-ml-0.5">${0}</span>`), bn), e ? W(Aa || (Aa = kt`Connecting...`)) : this._connected ? W(ka || (ka = kt`Connected`)) : W(_a || (_a = kt`${0}`), this.title), this._connected && this._showBalance ? W(Sa || (Sa = kt`<bc-balance class="select-none cursor-pointer"></bc-balance> `)) : null);
  }
  _onClick() {
    $2();
  }
};
F([me()], Pn.prototype, "title", void 0), F([se()], Pn.prototype, "_showBalance", void 0), Pn = F([oe("bc-button")], Pn);
const h5 = de(La || (La = ((e) => e)`
<svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-6 h-6">
<path d="M7 16.5106L13.5511 22L23 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`));
let Ta, Ma, Ba, Ra, Na, $a, Wt = (e) => e, ct = class extends he()(ae) {
  constructor() {
    super(...arguments), this.title = "Pay Now", this.paymentMethods = "all", this._waitingForInvoice = !1, this._paid = !1;
  }
  updated(e) {
    var t;
    super.updated(e), e.has("invoice") && this.invoice && this._waitingForInvoice && this._launchModal(), e.has("invoice") && !this.invoice && (this._waitingForInvoice = !1, this._paid = !1), e.has("preimage") && this.preimage && ((t = this._setPaid) == null || t.call(this, { preimage: this.preimage }));
  }
  render() {
    const e = !this._paid && (this._waitingForInvoice || this._modalOpen);
    return W(Ta || (Ta = Wt` <div class="inline-flex" @click=${0}>
      <bci-button variant="primary">
        ${0}
        <span class="font-semibold">
          ${0}
        </span>
      </bci-button>
    </div>`), this._onClick, e ? W(Ma || (Ma = Wt`${0}`), Ot("w-11 h-11 -mr-2 -ml-2.5 ")) : this._paid ? W(Ba || (Ba = Wt`<span class="-ml-0.5">${0}</span>`), h5) : W(Ra || (Ra = Wt`<span class="-ml-0.5">${0}</span>`), bn), e ? W(Na || (Na = Wt`Loading...`)) : W($a || ($a = Wt`${0}`), this._paid ? "Paid" : this.title));
  }
  _onClick() {
    this._paid || (this._waitingForInvoice = !0, this.invoice && this._launchModal());
  }
  _launchModal() {
    if (this._waitingForInvoice = !1, !this.invoice) throw new Error("No invoice available");
    const { setPaid: e } = l5({ onPaid: () => {
      this._paid = !0;
    }, invoice: this.invoice, paymentMethods: this.paymentMethods });
    this._setPaid = e;
  }
};
F([me()], ct.prototype, "title", void 0), F([me()], ct.prototype, "invoice", void 0), F([me({ type: String, attribute: "payment-methods" })], ct.prototype, "paymentMethods", void 0), F([me({})], ct.prototype, "preimage", void 0), F([se()], ct.prototype, "_waitingForInvoice", void 0), F([se()], ct.prototype, "_paid", void 0), ct = F([oe("bc-pay-button")], ct);
let Ia, Ua, f5 = (e) => e, dn = class extends he()(Hi) {
  constructor() {
    super(...arguments), this.variant = "secondary", this.ghost = !1, this.block = !1;
  }
  render() {
    const e = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches, t = window.getComputedStyle(this).getPropertyValue(e ? "--bc-color-brand-button-text-dark" : "--bc-color-brand-button-text") || window.getComputedStyle(this).getPropertyValue("--bc-color-brand-button-text");
    return W(Ia || (Ia = f5`<button
      class="w-full relative h-10 px-4 font-sans font-semibold rounded-lg flex justify-center items-center
        ${0} rounded-lg w-full ${0}
        ${0}
        ${0}
        "
    >
      ${0}
      <!-- TODO: why can the inner border not be conditionally rendered? -->

      <div
        class="flex gap-2  ${0} justify-center items-center"
      >
        <slot></slot>
      </div>
    </button>`), this.ghost ? "" : "shadow", Le, this.variant === "primary" ? "bg-brand-light dark:bg-brand-dark" : "", this.variant === "primary" ? t ? "text-brand-button-text-light dark:text-brand-button-text-dark" : this._getBrandColorLuminance() > 0.5 ? "text-black" : "text-white" : this.variant === "secondary" ? `${be}` : `${Qe}`, this.ghost ? null : this.variant === "primary" ? R2() : this.variant === "secondary" ? W(ya || (ya = Go`<div
    class="absolute -z-10 top-0 left-0 w-full h-full border-2 rounded-lg ${0}"
  ></div>`), "border-brand-mixed-light dark:border-brand-mixed-dark") : W(ba || (ba = Go`<div
    class="absolute -z-10 top-0 left-0 w-full h-full border-2 rounded-lg ${0}"
  ></div>`), Gi), this.block ? "w-full" : "");
  }
};
F([me()], dn.prototype, "variant", void 0), F([me({ type: Boolean })], dn.prototype, "ghost", void 0), F([me({ type: Boolean })], dn.prototype, "block", void 0), dn = F([oe("bci-button")], dn);
const p5 = de(Ua || (Ua = ((e) => e)`
<svg width="55" height="55" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">

<rect x="34" y="6" width="24" height="24" rx="5.99998" fill="#34D14A"/>
<path d="M43.3358 10H47.2816V16.3676H44.8352V12.0498H42.6436L43.3358 10Z" fill="white"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M46 26C48.4853 26 50.5 24.027 50.5 21.5932C50.5 19.1594 48.4853 17.1865 46 17.1865C43.5147 17.1865 41.5 19.1594 41.5 21.5932C41.5 24.027 43.5147 26 46 26ZM48.457 21.5932C48.457 22.9221 47.357 23.9994 46 23.9994C44.643 23.9994 43.5429 22.9221 43.5429 21.5932C43.5429 20.2643 44.643 19.187 46 19.187C47.357 19.187 48.457 20.2643 48.457 21.5932Z" fill="white"/>
<rect x="6" y="6" width="24" height="24" rx="5.99998" fill="white"/>
<g clip-path="url(#clip0_1455_976)">
<path d="M16.0072 25.2004C16.3321 25.2668 16.6642 25.3073 16.9979 25.3213C16.3121 25.5485 15.6308 25.7902 14.952 26.0365H14.9515C14.3197 26.2633 13.69 26.4964 13.0496 26.6985C12.5337 26.8585 12.0072 26.9977 11.469 27.0079C10.4279 27.0337 9.63614 26.4775 9.51127 25.4086C9.40844 24.4379 9.79297 23.4781 10.0985 22.5688C10.4263 21.645 10.7661 20.725 11.0811 19.7966C11.102 19.9872 11.1317 20.1764 11.17 20.3632C11.2516 20.7628 11.3738 21.1556 11.5327 21.5314C11.6886 21.8999 11.8814 22.2552 12.1057 22.5875C12.3278 22.9162 12.583 23.2256 12.864 23.5064C13.1448 23.7874 13.4542 24.0424 13.7829 24.2647C14.1152 24.4892 14.4705 24.682 14.839 24.8377C15.2146 24.9966 15.6076 25.1185 16.0072 25.2004Z" fill="#FFC802"/>
<path d="M12.8642 14.7179C12.6606 14.9216 12.4707 15.14 12.2968 15.37C12.5044 14.3843 12.6856 13.3925 12.8728 12.4029C13.1169 11.225 13.39 9.50918 14.6962 9.08685C15.397 8.87198 16.1159 9.1935 16.6638 9.6336C17.2983 10.1455 17.8194 10.791 18.3533 11.4048C18.7768 11.9048 19.2011 12.4045 19.6324 12.8979H17.2582C16.8373 12.8979 16.4163 12.9404 16.007 13.0241C15.6074 13.1058 15.2146 13.228 14.8388 13.3866C14.4703 13.5425 14.115 13.7354 13.7827 13.9599C13.4537 14.182 13.1446 14.4371 12.8638 14.7182L12.8642 14.7179Z" fill="#FFC802"/>
<path d="M26.9836 22.5092C26.4926 23.0008 25.812 23.2299 25.1456 23.4C24.9876 23.4398 24.829 23.476 24.6699 23.5105C23.3451 23.7868 22.0079 24.0064 20.6863 24.2964C20.702 24.2858 20.718 24.2752 20.7338 24.2647C21.0625 24.0426 21.3716 23.7874 21.6527 23.5064C21.9337 23.2254 22.1886 22.9162 22.4109 22.5875C22.6355 22.2552 22.8283 21.8999 22.9842 21.5314C23.1431 21.1558 23.265 20.7628 23.3469 20.3632C23.4306 19.9539 23.4731 19.5329 23.4731 19.1119V16.7548C24.2683 17.449 25.0814 18.1231 25.8723 18.8226C26.0525 18.9841 26.2303 19.1486 26.4013 19.3198C26.8373 19.7586 27.241 20.2498 27.4109 20.8453C27.5859 21.4506 27.4318 22.063 26.984 22.5092H26.9836Z" fill="#FFC802"/>
<path d="M21.2 19.2375C21.2 21.4121 19.4371 23.175 17.2625 23.175C15.0878 23.175 13.325 21.4121 13.325 19.2375C13.325 17.0628 15.0878 15.3 17.2625 15.3H21.2V19.2375Z" fill="#202020"/>
</g>
<g clip-path="url(#clip1_1455_976)">
<rect x="6" y="34.0806" width="24" height="24" rx="5.99998" fill="url(#paint0_linear_1455_976)"/>
<path d="M22.1146 53.6518C24.2167 53.6518 25.1736 48.9971 25.1736 47.2322C25.1736 45.8565 24.2243 45.0228 22.9764 45.0228C21.7363 45.0228 20.7296 45.5561 20.7171 46.2165C20.717 47.9592 20.4103 53.6518 22.1146 53.6518Z" fill="white" stroke="black" stroke-width="0.626014"/>
<path d="M14.4364 53.6518C12.3343 53.6518 11.3775 48.9971 11.3775 47.2322C11.3775 45.8565 12.3267 45.0228 13.5746 45.0228C14.8147 45.0228 15.8215 45.5561 15.834 46.2165C15.834 47.9592 16.1407 53.6518 14.4364 53.6518Z" fill="white" stroke="black" stroke-width="0.626014"/>
<path d="M23.5442 46.5772C23.5893 46.5504 23.6381 46.5536 23.6731 46.5733C23.6898 46.5827 23.7 46.5939 23.7053 46.6035C23.7098 46.6117 23.7142 46.6242 23.7122 46.6455C23.4691 49.0543 22.1626 51.0462 20.4065 51.9629C19.8161 52.2711 19.4127 52.8105 19.0579 53.2783C18.7734 53.6536 18.5149 53.9885 18.2004 54.2363C17.8861 53.9886 17.6273 53.6534 17.343 53.2783C16.9882 52.8105 16.5856 52.2711 15.9954 51.9629C14.2459 51.0498 12.943 49.07 12.6926 46.6729C12.6904 46.6517 12.6941 46.639 12.6985 46.6309C12.7038 46.6213 12.7139 46.6092 12.7307 46.5996C12.7654 46.5799 12.8143 46.5763 12.8596 46.6026C14.4209 47.5178 16.222 48.0429 18.1799 48.043C20.1382 48.043 21.9728 47.5083 23.5442 46.5772Z" fill="#FFDF6F" stroke="black" stroke-width="0.622835"/>
<ellipse cx="18.2128" cy="46.625" rx="5.50893" ry="1.83631" fill="black" stroke="black" stroke-width="0.626014"/>
<path d="M13.7889 49.7133C13.7889 49.7133 16.5062 50.6315 18.2545 50.6315C20.0028 50.6315 22.7201 49.7133 22.7201 49.7133" stroke="black" stroke-width="0.626014" stroke-linecap="round"/>
<circle cx="1.24567" cy="1.24567" r="1.24567" transform="matrix(-1 0 0 1 14.2769 37.5268)" fill="black"/>
<path d="M12.8236 38.5856L15.1488 40.9109" stroke="black" stroke-width="0.622835"/>
<circle cx="23.2044" cy="38.7725" r="1.24567" fill="black"/>
<path d="M23.4328 38.5856L21.1075 40.9109" stroke="black" stroke-width="0.622835"/>
<path d="M18.1597 38.9386C20.9689 38.9388 23.3127 41.3062 23.8669 44.4589C23.9959 45.1923 23.6018 45.9098 22.928 46.2269C21.4872 46.9049 19.8781 47.2843 18.1802 47.2843C16.4643 47.2843 14.8396 46.8963 13.3872 46.2045C12.7157 45.8847 12.3249 45.1667 12.456 44.4346C13.0181 41.2939 15.3575 38.9386 18.1597 38.9386Z" fill="#FFDF6F"/>
<path d="M18.1597 38.9386L18.1597 38.6272H18.1597V38.9386ZM18.1802 47.2843V47.5957H18.1802L18.1802 47.2843ZM13.3872 46.2045L13.2533 46.4857L13.3872 46.2045ZM23.8669 44.4589L24.1736 44.405L23.8669 44.4589ZM22.928 46.2269L22.7954 45.9451L22.928 46.2269ZM18.1597 38.9386L18.1596 39.25C20.7781 39.2502 23.0246 41.4662 23.5602 44.5128L23.8669 44.4589L24.1736 44.405C23.6007 41.1462 21.1598 38.6274 18.1597 38.6272L18.1597 38.9386ZM22.928 46.2269L22.7954 45.9451C21.3951 46.6041 19.8313 46.9729 18.1802 46.9729L18.1802 47.2843L18.1802 47.5957C19.925 47.5957 21.5792 47.2058 23.0606 46.5087L22.928 46.2269ZM18.1802 47.2843V46.9729C16.5117 46.9729 14.9327 46.5957 13.5211 45.9234L13.3872 46.2045L13.2533 46.4857C14.7465 47.1969 16.4169 47.5957 18.1802 47.5957V47.2843ZM12.456 44.4346L12.7625 44.4894C13.3056 41.4547 15.5478 39.25 18.1597 39.25V38.9386V38.6272C15.1672 38.6272 12.7305 41.1332 12.1494 44.3797L12.456 44.4346ZM13.3872 46.2045L13.5211 45.9234C12.9697 45.6607 12.6575 45.0764 12.7625 44.4894L12.456 44.4346L12.1494 44.3797C11.9924 45.257 12.4618 46.1086 13.2533 46.4857L13.3872 46.2045ZM23.8669 44.4589L23.5602 44.5128C23.6636 45.1008 23.3487 45.6848 22.7954 45.9451L22.928 46.2269L23.0606 46.5087C23.855 46.1349 24.3281 45.2838 24.1736 44.405L23.8669 44.4589Z" fill="black"/>
<path d="M18.1598 41.1393C20.1469 41.1394 21.8292 42.3718 22.4069 44.0749C22.5945 44.6277 22.2738 45.2031 21.7332 45.4235C20.6303 45.873 19.4243 46.1216 18.1598 46.1217C16.8951 46.1217 15.6886 45.8731 14.5854 45.4234C14.0448 45.2031 13.7241 44.6277 13.9117 44.0749C14.4896 42.3717 16.1725 41.1393 18.1598 41.1393Z" fill="black"/>
<ellipse cx="19.5919" cy="43.7967" rx="1.03806" ry="0.830447" fill="white"/>
<ellipse cx="16.6202" cy="43.7972" rx="1.03806" ry="0.830447" fill="white"/>
<g clip-path="url(#clip2_1455_976)">
<rect x="5" y="32.8384" width="26" height="26" fill="url(#pattern0_1455_976)"/>
</g>
</g>
<path d="M54.5 44.9997H53V40.9997C53 40.4693 52.7893 39.9606 52.4142 39.5855C52.0391 39.2104 51.5304 38.9997 51 38.9997H47V37.4997C47 36.8367 46.7366 36.2008 46.2678 35.732C45.7989 35.2631 45.163 34.9997 44.5 34.9997C43.837 34.9997 43.2011 35.2631 42.7322 35.732C42.2634 36.2008 42 36.8367 42 37.4997V38.9997H38C37.4696 38.9997 36.9609 39.2104 36.5858 39.5855C36.2107 39.9606 36 40.4693 36 40.9997V44.7997H37.5C39 44.7997 40.2 45.9997 40.2 47.4997C40.2 48.9997 39 50.1997 37.5 50.1997H36V53.9997C36 54.5302 36.2107 55.0389 36.5858 55.4139C36.9609 55.789 37.4696 55.9997 38 55.9997H41.8V54.4997C41.8 52.9997 43 51.7997 44.5 51.7997C46 51.7997 47.2 52.9997 47.2 54.4997V55.9997H51C51.5304 55.9997 52.0391 55.789 52.4142 55.4139C52.7893 55.0389 53 54.5302 53 53.9997V49.9997H54.5C55.163 49.9997 55.7989 49.7363 56.2678 49.2675C56.7366 48.7987 57 48.1628 57 47.4997C57 46.8367 56.7366 46.2008 56.2678 45.732C55.7989 45.2631 55.163 44.9997 54.5 44.9997Z" fill="#A2A2A2"/>
<defs>
<pattern id="pattern0_1455_976" patternContentUnits="objectBoundingBox" width="1" height="1">
<use xlink:href="#image0_1455_976" transform="scale(0.0078125)"/>
</pattern>
<linearGradient id="paint0_linear_1455_976" x1="18" y1="34.0806" x2="18" y2="56.9377" gradientUnits="userSpaceOnUse">
<stop offset="0.669102" stop-color="#FFDE6E"/>
<stop offset="1" stop-color="#F8C455"/>
</linearGradient>
<clipPath id="clip0_1455_976">
<rect width="18" height="18" fill="white" transform="translate(9.5 9)"/>
</clipPath>
<clipPath id="clip1_1455_976">
<rect x="6" y="34.0806" width="24" height="24" rx="5.99998" fill="white"/>
</clipPath>
<clipPath id="clip2_1455_976">
<rect width="26" height="26" fill="white" transform="translate(5 32.4443)"/>
</clipPath>
<image id="image0_1455_976" width="128" height="128" preserveAspectRatio="none" xlink:href="data:image/png;base64,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"/>
</defs>
</svg>

`));
let Oa, g5 = (e) => e;
class Ve extends he()(ae) {
  constructor(t, n, r, o) {
    super(), this._connectorType = t, this._title = n, this._background = r, this._icon = o;
  }
  render() {
    return W(Oa || (Oa = g5`<button
      class="flex flex-col justify-between items-center w-32 -mx-4 cursor-pointer ${0}"
      aria-label="Connect with ${0}"
      @click=${0}
    >
      <div
        class="w-16 h-16 drop-shadow-[0_10px_15px_rgba(0,0,0,0.25)] dark:drop-shadow-[0_10px_15px_rgba(255,255,255,0.15)] rounded-2xl flex justify-center items-center overflow-hidden"
        style="background: ${0};"
      >
        ${0}
      </div>
      <span
        class="text-sm mt-3 font-sans font-medium text-center w-28 h-7 flex justify-center items-center ${0}"
      >
        ${0}
      </span>
    </button>`), Le, this._title, this._onClick, this._background, this._icon, re, this._title);
  }
  _connect(t) {
    V.getState().connect(qe({}, t, { connectorName: this._title, connectorType: this._connectorType }));
  }
}
let Pa, Ha = class extends Ve {
  constructor() {
    super("extension.generic", "Browser Extensions", "#F4F4F4", p5);
  }
  _onClick() {
    this._connect({});
  }
};
Ha = F([oe("bc-extension-connector")], Ha);
const I2 = de(Pa || (Pa = ((e) => e)`<?xml version="1.0" encoding="UTF-8"?>
<svg id="Layer_1" data-name="Layer 1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8000 8000" width="40" height="40">
  <path d="M1404.94034,2404.75143c.19948.39893.416.79745.63896,1.19934-.21965-.3998-.4293-.7996-.63896-1.19934ZM1398.36987,2392.55825c.01.02001.01999.03996.01999.04996.01999.02001.03998.04996.04998.06997-.01999-.03996-.04998-.07997-.06997-.11993ZM7957.22848,6407.80899c-75.3022-453.82005-341.31246-1051.68618-631.76608-1536.83905-217.58172,280.41299-443.70125,543.12568-695.66263,796.78364,151.96083,272.22676,381.52012,831.33939,371.78586,1131.07073-3.34955,103.13742-84.59871,186.38404-187.48323,193.03587-323.69068,20.92769-761.15088-169.80941-1126.96417-352.01125-274.08918,250.36976-539.73074,478.97192-815.02811,690.20321,570.85548,338.56749,1305.54247,669.74202,1904.46573,668.08293,872.77622,46.26671,1378.68446-776.20339,1180.65263-1590.32607ZM5249.15884,5683.56479c1101.91285-1101.01171,2353.03599-2527.31198,2708.11113-4090.5697,253.93721-1273.80049-760.34667-1869.98142-1895.16006-1469.66567,211.65045,278.23428,364.22738,589.33979,457.73054,914.98744,86.80988-20.20216,196.93112-34.80914,289.99476-31.50156,103.33929,3.67279,186.93541,86.38156,191.60732,189.77353,13.96581,309.07109-235.73659,902.8025-402.1382,1193.8406,0,.01-.01.02001-.01.03001l-.04998.07991c-624.44753,1143.09071-1591.89389,2208.42396-2600.29743,3077.06633l-.22964-.19984c-263.64443,226.46298-526.16056,433.98687-804.2439,626.56893.39938.34966.79882.69956,1.19826,1.04946-509.31622,353.04862-1419.46673,925.33606-2012.13405,893.44541-103.82534-5.58671-186.23795-90.1864-188.67838-194.22674-6.97909-297.53161,215.6413-843.71786,363.83869-1111.11806-237.05325-259.94423-464.71032-529.69327-686.31643-814.38364-1228.33988,1900.32534-772.83666,3911.20697,1772.96127,2814.86279,1004.95316-454.63593,1968.00538-1208.05697,2803.81609-2000.0392ZM2528.2177,4000.38756c-468.17105-551.20508-806.89093-1020.88409-1125.16461-1599.13417h-.01c-.00197-.02709-.02111-.04517-.02999-.07997h-.01c-.00225-.03154-.04191-.05163-.03986-.08992,0,0-.01,0-.01-.01-1.46642-2.7001-3.08021-5.72568-4.5634-8.46529.01999.02001.03998.04996.04998.06997-165.01013-287.23702-415.64692-882.63022-403.53149-1193.46936,4.07951-104.66591,88.1281-188.31126,192.71288-192.04153,92.1143-3.28547,200.69379,10.46969,286.62767,30.61985,93.58312-325.69743,246.26999-636.85321,458.06014-915.09749C797.66386-275.84563-214.1867,319.25478,39.32792,1592.99819c208.75964,1126.24494,1140.55524,2354.14531,1865.30175,3206.20191-1.24817,1.76903,1.23818-1.76903,0,0,177.91975,202.67638,363.17881,406.52227,558.17368,604.08153,267.29912-191.50259,530.82373-396.10806,795.10723-617.7438-259.10108-257.46588-503.73334-520.6384-729.69288-785.15026ZM1420.59738,2433.86513c.84886,1.56913,1.71746,3.17821,2.5963,4.82725-.85885-1.58908-1.72745-3.19816-2.5963-4.82725ZM1457.40366,2502.26682c.92857,1.699,1.83716,3.39806,2.73599,5.07711-.89883-1.64904-1.80742-3.3481-2.73599-5.07711ZM1403.01311,2401.17342c-.01-.01-.01987-.02995-.02986-.03996.01.01.01987.02995.01987.03996.01999.03001.02999.04996.03998.06997-.01-.02001-.01999-.03996-.02999-.06997ZM1404.94034,2404.75143c.19948.39893.416.79745.63896,1.19934-.21965-.3998-.4293-.7996-.63896-1.19934Z" fill="#ffe480"/>
  <path d="M2762.56314,2987.43935c-683.41752-683.42045-683.41752-1791.46134,0-2474.87781,683.41752-683.41755,1791.45841-683.41755,2474.87885,0,683.41068,683.41648,683.41068,1791.45737,0,2474.87781l-1237.44089,1237.44089-1237.43796-1237.44089Z" fill="#fff"/>
</svg>`)), U2 = "Alby Hub";
let Da, Za = class extends Ve {
  constructor() {
    super("nwc.albyhub", U2, "#000000", I2);
  }
  async _onClick() {
    V.getState().pushRoute("/alby-hub");
  }
};
Za = F([oe("bc-alby-hub-connector")], Za);
const w5 = de(Da || (Da = ((e) => e)`<svg width="393" height="392" viewBox="0 0 393 392" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M179.272 99.0639C169.038 88.8691 152.419 88.9782 142.221 99.2091L76.2474 165.414C66.0488 175.646 66.1786 191.974 76.4095 202.17L184.58 310.34C194.813 320.534 211.4 320.449 221.597 310.218L253.749 278.066C244.372 287.443 236.656 280.701 227.512 271.595L209.578 253.662C195.964 259.051 180.052 256.374 169.022 245.365L155.356 231.699C154.896 231.243 154.542 230.767 154.292 230.17C154.043 229.572 153.914 228.931 153.914 228.284C153.913 227.637 154.041 226.995 154.289 226.398C154.537 225.8 154.926 225.293 155.385 224.837L163.119 217.103L146.284 200.268C143.648 197.638 143.218 193.391 145.575 190.522C148.269 187.228 153.153 187.053 156.108 190.002L173.171 207.051L184.728 195.494L167.853 178.661C165.216 176.03 164.787 171.784 167.164 168.895C167.794 168.128 168.578 167.501 169.465 167.054C170.353 166.608 171.323 166.352 172.315 166.303C173.307 166.254 174.298 166.413 175.225 166.77C176.152 167.127 176.994 167.673 177.697 168.375L194.829 185.393L202.089 178.132C202.545 177.673 202.994 177.259 203.592 177.01C204.189 176.761 204.83 176.632 205.478 176.632C206.125 176.631 206.766 176.758 207.364 177.006C207.962 177.254 208.505 177.618 208.962 178.077L222.65 191.738C233.542 202.609 236.39 218.431 231.298 231.943L249.235 249.88C258.379 258.985 266.03 265.785 275.408 256.408L315.979 215.836C306.227 225.588 298.215 218.075 288.578 208.446L179.272 99.0639Z" fill="url(#paint0_linear_1_280)"/>
<path d="M255.975 81.0273L221.487 115.487L298.115 192.116C305.45 199.419 311.825 205.239 318.899 202.417C322.988 200.787 325.795 196.351 324.228 192.238C287.561 96.0253 287.546 96.0238 282.682 85.507C277.818 74.9901 264.138 72.7602 255.975 81.0273Z" fill="#897FFF"/>
<path d="M255.975 81.0273L221.487 115.487L298.115 192.116C305.45 199.419 311.825 205.239 318.899 202.417C322.988 200.787 325.795 196.351 324.228 192.238C287.561 96.0253 287.546 96.0238 282.682 85.507C277.818 74.9901 264.138 72.7602 255.975 81.0273Z" fill="#897FFF"/>
<path d="M255.975 81.0273L221.487 115.487L298.115 192.116C305.45 199.419 311.825 205.239 318.899 202.417C322.988 200.787 325.795 196.351 324.228 192.238C287.561 96.0253 287.546 96.0238 282.682 85.507C277.818 74.9901 264.138 72.7602 255.975 81.0273Z" fill="#897FFF"/>
<path d="M255.975 81.0273L221.487 115.487L298.115 192.116C305.45 199.419 311.825 205.239 318.899 202.417C322.988 200.787 325.795 196.351 324.228 192.238C287.561 96.0253 287.546 96.0238 282.682 85.507C277.818 74.9901 264.138 72.7602 255.975 81.0273Z" fill="#897FFF"/>
<path d="M255.975 81.0273L221.487 115.487L298.115 192.116C305.45 199.419 311.825 205.239 318.899 202.417C322.988 200.787 325.795 196.351 324.228 192.238C287.561 96.0253 287.546 96.0238 282.682 85.507C277.818 74.9901 264.138 72.7602 255.975 81.0273Z" fill="#897FFF"/>
<defs>
<linearGradient id="paint0_linear_1_280" x1="192.323" y1="78.4384" x2="192.323" y2="317.939" gradientUnits="userSpaceOnUse">
<stop stop-color="#FFCA4A"/>
<stop offset="1" stop-color="#F7931A"/>
</linearGradient>
</defs>
</svg>`)), zi = "NWC";
let Wa, Fa = class extends Ve {
  constructor() {
    super("nwc.generic", zi, "#ffffff", w5);
  }
  async _onClick() {
    V.getState().pushRoute("/nwc");
  }
};
Fa = F([oe("bc-nwc-connector")], Fa);
const y5 = de(Wa || (Wa = ((e) => e)`<svg class="w-10 h-10" width="28" height="55" viewBox="0 0 28 55" xmlns="http://www.w3.org/2000/svg"><g fill="#ffffff" fill-rule="nonzero"><path d="M27.25 30.506L11.354 53.692a.84.84 0 11-1.385-.954l15.896-23.185a.84.84 0 111.385.953zM25.16 26.374L9.629 49.082a.84.84 0 01-1.385-.954L23.776 25.42a.84.84 0 011.385.954zM20.438 1.576L2.43 27.895h16.895l-1.136 1.68H.363a.84.84 0 01-.227-1.158L19.006.622a.84.84 0 011.159-.227c.398.253.52.78.273 1.181z"></path><path d="M22.118 6.617L10.24 23.99h11.763l-1.158 1.68H7.062l1.136-1.68L20.733 5.686a.84.84 0 011.385.931z"></path></g></svg>`));
let Va, Ga = class extends Ve {
  constructor() {
    super("lnc", "Lightning Node Connect", "#101727", y5);
  }
  async _onClick() {
    const e = window.prompt("Enter pairing phrase");
    if (!e) return;
    const t = await l2();
    if (!t) throw new Error("LNC not supported");
    t.credentials.pairingPhrase = e, this._connect({});
  }
};
Ga = F([oe("bc-lnc-connector")], Ga);
const O2 = de(Va || (Va = ((e) => e)`<svg width="256" height="256" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M256 0H0V256H256V0Z" fill="#673AB7"/>
<path d="M165 53H91V134.785H113.31V202L165 112.224H135.934L165 53Z" fill="white"/>
</svg>`)), jo = "LNbits";
let ja = class extends Ve {
  constructor() {
    super("lnbits", jo, "#673ab7", O2);
  }
  async _onClick() {
    V.getState().pushRoute("/lnbits");
  }
};
ja = F([oe("bc-lnbits-connector")], ja);
const zo = "LNbits NWC Plugin";
let za, qa = class extends Ve {
  constructor() {
    super("lnbits", zo, "#673ab7", O2);
  }
  async _onClick() {
    V.getState().pushRoute("/lnbits-nwc");
  }
};
qa = F([oe("bc-lnbits-nwc-connector")], qa);
const b5 = de(za || (za = ((e) => e)`<svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M40 17.5H34.4V23.1H40V17.5Z" fill="#041011"/>
<path d="M16.7 0V5.6L27.8 8.9L22.2 0H16.7Z" fill="#041011"/>
<path d="M29.4 35H35L36.7 25L29.4 29.4V35Z" fill="#041011"/>
<path d="M35 5H29.4V10.6L36.1 16.1L35 5Z" fill="#041011"/>
<path d="M16.7 40H22.2L27.8 29.4L16.7 34.4V40Z" fill="#041011"/>
<path d="M5 29.4V35H10.6L22.2 26.7L5 29.4Z" fill="#041011"/>
<path d="M18.9 18.6L5.6 17.5H0V23.1H5.6L18.9 18.6Z" fill="#041011"/>
<path d="M10.6 5H5V10.6L21.1 12.8L10.6 5Z" fill="#041011"/>
</svg>
`)), m5 = "LN Link";
let Ka, Qa = class extends Ve {
  constructor() {
    super("nwc.generic", m5, "#ffffff", b5);
  }
  async _onClick() {
    V.getState().pushRoute("/lnfi");
  }
};
Qa = F([oe("bc-lnfi-nwc-connector")], Qa);
const v5 = de(Ka || (Ka = ((e) => e)`<svg width="48" height="48" viewBox="0 0 19.05 19.05" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#ffffff"/><g transform="translate(46.987939,-145.34756)"><path fill-rule="evenodd" clip-rule="evenodd" d="m -37.462939,146.46815 c -4.641638,0 -8.404413,3.76277 -8.404413,8.40441 0,4.64164 3.762775,8.40441 8.404413,8.40441 4.641638,0 8.40441,-3.76277 8.40441,-8.40441 0,-4.64164 -3.762772,-8.40441 -8.40441,-8.40441 z m -9.525,8.40441 c 0,-5.26053 4.264475,-9.525 9.525,-9.525 5.260525,0 9.525,4.26447 9.525,9.525 0,5.26053 -4.264475,9.525 -9.525,9.525 -5.260525,0 -9.525,-4.26447 -9.525,-9.525 z" fill="#000000"/><path fill-rule="evenodd" clip-rule="evenodd" d="m -37.462939,160.84902 c 3.300703,0 5.976461,-2.67576 5.976461,-5.97646 0,-3.30073 -2.675758,-5.97649 -5.976461,-5.97649 -3.300704,0 -5.976461,2.67576 -5.976461,5.97649 0,3.3007 2.675757,5.97646 5.976461,5.97646 z m 0,-1.21396 c 2.630249,0 4.7625,-2.13225 4.7625,-4.7625 0,-2.63025 -2.132251,-4.7625 -4.7625,-4.7625 -2.630249,0 -4.7625,2.13225 -4.7625,4.7625 0,2.63025 2.132251,4.7625 4.7625,4.7625 z" fill="#000000"/><path fill-rule="evenodd" clip-rule="evenodd" d="m -37.462913,151.4062 c 0,0 -2.6e-5,0 -2.6e-5,0 -1.914419,0 -3.466359,1.55194 -3.466359,3.46636 0,1.91442 1.55194,3.46636 3.466359,3.46636 0,0 2.6e-5,0 2.6e-5,0 z" fill="#000000"/></g></svg>`)), C5 = "Coinos";
let Ja, Ya = class extends Ve {
  constructor() {
    super("nwc.coinos", C5, "#ffffff", v5);
  }
  async _onClick() {
    try {
      var e;
      const t = V.getState().bitcoinConnectConfig.providerConfig, n = await vt.fromAuthorizationUrl("https://coinos.io/apps/new", qe({}, (t == null || (e = t.nwc) == null ? void 0 : e.authorizationUrlOptions) || {}, { name: this._appName }));
      n.close(), await V.getState().connect({ nwcUrl: n.nostrWalletConnectUrl, connectorName: "Coinos", connectorType: "nwc.coinos" });
    } catch (t) {
      console.error(t), alert("" + t);
    }
  }
};
Ya = F([oe("bc-coinos-connector")], Ya);
const x5 = de(Ja || (Ja = ((e) => e)`<svg version="1.0" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 20630 20630" preserveAspectRatio="xMidYMid meet"><g transform="translate(0.000000,20630.000000) scale(1.000000,-1.000000)"><path fill="black" d="M5645 20623 c-856 -42 -1650 -251 -2395 -629 -502 -254 -897 -527 -1325 -915 -1015 -920 -1688 -2201 -1869 -3559 -54 -403 -51 -132 -51 -5210 0 -4938 -1 -4788 41 -5125 189 -1512 946 -2882 2129 -3850 353 -290 711 -519 1140 -730 714 -352 1468 -548 2295 -595 239 -13 9171 -13 9410 0 1083 62 2073 388 2960 975 885 585 1587 1388 2056 2350 323 662 507 1339 576 2115 19 216 19 9504 0 9730 -67 784 -266 1498 -606 2179 -566 1130 -1469 2042 -2591 2617 -701 359 -1348 545 -2205 636 -88 9 -1206 12 -4810 13 -2582 1 -4722 0 -4755 -2z"/><path fill="white" d="M13504 11628 l2333 -3 -3181 -3813 -3181 -3813 -3 2540 -2 2541 -2336 0 c-1285 0 -2334 4 -2332 8 2 4 1434 1723 3183 3820 l3180 3811 3 -2544 2 -2545 2334 -2z"/></g></svg>`)), E5 = "Flash Wallet";
let Xa, ec = class extends Ve {
  constructor() {
    super("nwc.flash", E5, "#000000", x5);
  }
  async _onClick() {
    V.getState().pushRoute("/flash-wallet");
  }
};
ec = F([oe("bc-flash-connector")], ec);
const A5 = de(Xa || (Xa = ((e) => e)`<svg class="w-12 h-12" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
<rect width="17.2816" height="20" fill="url(#pattern0_6321_527)"/>
<defs>
<pattern id="pattern0_6321_527" patternContentUnits="objectBoundingBox" width="1" height="1">
<use xlink:href="#image0_6321_527" transform="matrix(0.00248348 0 0 0.00214592 0.08 0.05)"/>
</pattern>
<image id="image0_6321_527" width="404" height="404" xlink:href="data:image/png;base64,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"/>
</defs>
</svg>
`)), qo = "Rizful";
let tc = class extends Ve {
  constructor() {
    super("nwc.rizful", qo, "#000000", A5);
  }
  async _onClick() {
    V.getState().pushRoute("/rizful");
  }
};
tc = F([oe("bc-rizful-connector")], tc);
let nc, rc, oc, ic, sc, ac, cc, lc, dc, uc, hc, fc, pc, gc, $e = (e) => e, ao = class extends he()(ae) {
  constructor() {
    super(...arguments), this._showAll = !1;
  }
  render() {
    const e = [];
    return e.push({ order: 0, result: W(nc || (nc = $e`<bc-alby-hub-connector></bc-alby-hub-connector>`)) }), e.push({ order: 0, result: W(rc || (rc = $e`<bc-coinos-connector></bc-coinos-connector>`)) }), e.push({ order: 0, result: W(oc || (oc = $e`<bc-flash-connector></bc-flash-connector>`)) }), e.push({ order: 0, result: W(ic || (ic = $e`<bc-cashu-me-connector></bc-cashu-me-connector>`)) }), this._filters && this._filters.indexOf("nwc") > -1 && e.push({ order: 0, result: W(sc || (sc = $e`<bc-lnbits-nwc-connector></bc-lnbits-nwc-connector>`)) }), e.push({ order: 0, result: W(ac || (ac = $e`<bc-rizful-connector></bc-rizful-connector>`)) }), e.push({ order: 0, result: W(cc || (cc = $e`<bc-nwc-connector></bc-nwc-connector>`)) }), e.push({ order: 10, result: W(lc || (lc = $e`<bc-lnfi-nwc-connector></bc-lnfi-nwc-connector>`)) }), this._filters && this._filters.indexOf("nwc") !== -1 || (window.webln && e.push({ order: 0, result: W(dc || (dc = $e`<bc-extension-connector></bc-extension-connector>`)) }), e.push({ order: 7, result: W(uc || (uc = $e`<bc-lnbits-connector></bc-lnbits-connector>`)) }), e.push({ order: 9, result: W(hc || (hc = $e`<bc-lnc-connector></bc-lnc-connector>`)) })), e.sort((t, n) => t.order - n.order), W(fc || (fc = $e`
      <div>
        <div
          class="flex justify-center items-start flex-wrap gap-5 ${0}"
        >
          ${0}
        </div>
        ${0}
      </div>
    `), this._showAll ? "max-h-96 overflow-y-auto" : "", (this._showAll ? e : e.slice(0, 9)).map((t) => t.result), !this._showAll && e.length > 9 ? W(pc || (pc = $e`<div class="text-center">
              <button
                class="${0} text-xs font-medium mt-8 ${0}"
                aria-label="Show all ${0} wallet connectors"
                @click=${0}
              >
                show all (${0})
              </button>
            </div> `), Le, re, e.length, this._toggleShowAll, e.length) : null);
  }
  _toggleShowAll() {
    this._showAll = !0;
  }
};
F([se()], ao.prototype, "_showAll", void 0), ao = F([oe("bc-connector-list")], ao);
const k5 = de(gc || (gc = ((e) => e)`
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-6 h-6">
<path d="M11.25 20.25H4.75C4.19772 20.25 3.75 19.8023 3.75 19.25L3.75 4.75C3.75 4.19772 4.19772 3.75 4.75 3.75L11.25 3.75" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M20.25 12L9 12M20.25 12L15.75 16.5M20.25 12L15.75 7.5" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" class="hover-right"/>
</svg>`));
let wc, yc, bc = (e) => e;
function qi(e) {
  return W(wc || (wc = bc`<div class="mt-12">
    ${0}

    <bci-button
      @click=${0}
      ghost
      variant="neutral"
      class=${0}
    >
      ${0}
      <span class="text-sm ${0}"
        >Disconnect</span
      >
    </bci-button>
  </div>`), e ? W(yc || (yc = bc`<span class="text-xs mb-1 ${0}"
          >Connected through
          <span class="font-bold">${0}</span></span
        >`), re, e) : null, _5, Vo, k5, Qe);
}
function _5() {
  V.getState().setModalOpen(!1), setTimeout(() => {
    V.getState().disconnect();
  }, 200);
}
const mc = (e) => String.fromCodePoint(...e.split("").map((t) => 127397 + t.toUpperCase().charCodeAt(0)));
let vc, co, Cc, xc, Ec, Ac, Hn = (e) => e, Dn = (co = class extends (vc = he()(ae)) {
  constructor() {
    super(), this._isSwitchingCurrency = !1, this._selectedCurrency = V.getState().currency, V.subscribe((e) => {
      this._selectedCurrency = e.currency;
    });
  }
  render() {
    if (!this._isSwitchingCurrency) return W(Cc || (Cc = Hn`<div class="flex justify-center items-center gap-2">
        <button
          class="${0}"
          aria-label="Switch currency (current: ${0})"
          @click=${0}
        >
          <slot></slot>
        </button>
      </div>`), Le, this._selectedCurrency || "sats", this._showSelectVisibility);
    const e = (() => {
      const n = [{ name: "SATS", value: "sats", flag: "₿" }, { name: "BTC", value: "BTC", flag: "₿" }, { name: "USD", value: "USD", flag: mc("US") }, { name: "EUR", value: "EUR", flag: "🇪🇺" }];
      return n.push(...Object.entries({ JP: "JPY", CN: "CNY", GB: "GBP", CH: "CHF", IN: "INR", AE: "AED", AF: "AFN", AL: "ALL", DZ: "DZD", AO: "AOA", AR: "ARS", AM: "AMD", AW: "AWG", AU: "AUD", AZ: "AZN", BS: "BSD", BH: "BHD", BD: "BDT", BB: "BBD", BY: "BYN", BZ: "BZD", BM: "BMD", BT: "BTN", BO: "BOB", BA: "BAM", BW: "BWP", BR: "BRL", BN: "BND", BG: "BGN", BI: "BIF", CV: "CVE", KH: "KHR", CA: "CAD", KY: "KYD", CF: "XAF", CL: "CLP", CO: "COU", KM: "KMF", CD: "CDF", CR: "CRC", CU: "CUC", CW: "ANG", CZ: "CZK", DK: "DKK", DJ: "DJF", DM: "XCD", DO: "DOP", EG: "EGP", ER: "ERN", ET: "ETB", FJ: "FJD", PF: "XPF", GM: "GMD", GE: "GEL", GH: "GHS", GI: "GIP", GT: "GTQ", GN: "GNF", GY: "GYD", HN: "HNL", HK: "HKD", HU: "HUF", IS: "ISK", ID: "IDR", IR: "XDR", IQ: "IQD", IL: "ILS", JM: "JMD", JO: "JOD", KZ: "KZT", KE: "KES", KR: "KRW", KW: "KWD", KG: "KGS", LA: "LAK", LB: "LBP", LR: "LRD", LY: "LYD", MO: "MOP", MG: "MGA", MW: "MWK", MY: "MYR", MV: "MVR", MR: "MRU", MU: "MUR", MX: "MXN", MD: "MDL", MN: "MNT", MA: "MAD", MZ: "MZN", MM: "MMK", NP: "NPR", NZ: "NZD", NI: "NIO", NE: "XOF", NG: "NGN", MK: "MKD", NO: "NOK", OM: "OMR", PK: "PKR", PG: "PGK", PY: "PYG", PE: "PEN", PH: "PHP", PL: "PLN", QA: "QAR", RO: "RON", RU: "RUB", RW: "RWF", SH: "SHP", WS: "WST", ST: "STN", SA: "SAR", RS: "RSD", SC: "SCR", SL: "SLL", SG: "SGD", SB: "SBD", SO: "SOS", ZA: "ZAR", SS: "SSP", LK: "LKR", SD: "SDG", SR: "SRD", SE: "SEK", SY: "SYP", TW: "TWD", TJ: "TJS", TZ: "TZS", TH: "THB", TO: "TOP", TT: "TTD", TN: "TND", TR: "TRY", TM: "TMT", UG: "UGX", UA: "UAH", UY: "UYU", UZ: "UZS", VU: "VUV", VN: "VND", YE: "YER", ZM: "ZMW", ZW: "ZWL" }).map(([r, o]) => ({ name: r, value: o, flag: mc(r) }))), n;
    })(), t = this._selectedCurrency || "sats";
    return W(xc || (xc = Hn`<div
      class="h-48 overflow-y-scroll px-4 grid grid-cols-2 gap-3 currencies-list -mb-10"
      role="list"
      aria-label="Available currencies"
    >
      ${0}
    </div>`), e.map((n) => W(Ec || (Ec = Hn`
          <button
            class="${0} flex items-center justify-center py-2 px-4 hover:text-white hover:bg-blue-500 rounded-lg hover:border-blue-500 cursor-pointer"
            aria-label="Select ${0} currency"
            aria-pressed="${0}"
            @click=${0}
          >
            <span class="text-orange-400 inline-block mr-2 text-xl"
              >${0}</span
            ><span class="text-xl">${0}</span>
          </button>
        `), t === n.value ? "bg-blue-500 text-white" : "", n.value, t === n.value, () => this._selectCurrency(n.value), n.flag, n.value)));
  }
  _showSelectVisibility() {
    this._isSwitchingCurrency = !0;
  }
  _selectCurrency(e) {
    V.getState().setCurrency(e), this._isSwitchingCurrency = !1;
  }
}, co.styles = [...vc.styles, Lr(Ac || (Ac = Hn`
      .currencies-list {
        mask-image: linear-gradient(
          to bottom,
          black calc(100% - 96px),
          transparent 100%
        );
      }
      /* width */
      ::-webkit-scrollbar {
        width: 6px;
        height: 18px;
      }

      /* Track */
      ::-webkit-scrollbar-track {
        background: #66666666;
      }

      /* Handle */
      ::-webkit-scrollbar-thumb {
        background: #888;
      }

      /* Handle on hover */
      ::-webkit-scrollbar-thumb:hover {
        background: #555;
      }
    `))], co);
F([se()], Dn.prototype, "_isSwitchingCurrency", void 0), F([se()], Dn.prototype, "_selectedCurrency", void 0), Dn = F([oe("bc-currency-switcher")], Dn);
let kc, _c, Sc, Lc, Tc, Mc, un = (e) => e, lo = class extends he()(ae) {
  constructor() {
    super(), this._showBalance = void 0, this._showBalance = V.getState().bitcoinConnectConfig.showBalance && V.getState().supports("getBalance"), V.subscribe((e) => {
      this._showBalance = e.bitcoinConnectConfig.showBalance && e.supports("getBalance");
    });
  }
  render() {
    return W(kc || (kc = un`<div
      class="flex flex-col justify-center items-center w-full font-sans"
    >
      ${0}
    </div>`), this._connected ? W(_c || (_c = un`
            ${0}
            ${0}
          `), W(this._showBalance ? Sc || (Sc = un`<span
                    class="text-xs font-medium mb-2 ${0}"
                    >Balance</span
                  >
                  <bc-currency-switcher>
                    <bc-balance class="text-2xl"></bc-balance>
                  </bc-currency-switcher>`) : Lc || (Lc = un` <span
                  class="text-lg font-medium mt-4 -mb-4 ${0}"
                  >Wallet Connected</span
                >`), re), qi(this._connectorName)) : W(Tc || (Tc = un`
            <h1
              class="my-8 ${0} w-64 max-w-full text-center"
              role="heading"
              aria-level="1"
            >
              How would you like to
              connect${0}?
            </h1>

            <bc-connector-list></bc-connector-list>

            <div class="flex flex-col items-center w-full font-sans text-sm">
              <p class="mt-8 ${0} text-center">
                Don't have a bitcoin lightning wallet?
                <button
                  class="font-bold ${0} ${0}"
                  aria-label="Get a bitcoin lightning wallet"
                  @click=${0}
                >
                  Get one here
                </button>
              </p>
            </div>
          `), Sn, this._appName && this._appName !== Ro.appName ? `
to ${this._appName}` : "", Sn, Le, be, () => V.getState().pushRoute("/new-wallet")));
  }
};
F([se()], lo.prototype, "_showBalance", void 0), lo = F([oe("bc-start")], lo);
const S5 = de(Mc || (Mc = ((e) => e)`<svg width="25" height="24" viewBox="0 0 25 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-7 h-7">
<path d="M14.2929 16L10.6464 12.3536C10.4512 12.1583 10.4512 11.8417 10.6464 11.6464L14.2929 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`));
let Bc, Rc, L5 = (e) => e, uo = class extends he()(ae) {
  constructor() {
    super(...arguments), this._goBack = () => {
      V.getState().popRoute(), V.getState().setError(void 0);
    };
  }
  render() {
    return W(Bc || (Bc = L5`<div
      class="flex justify-center items-center gap-2 w-full relative pb-4"
    >
      <div class="absolute left-8 h-full flex items-center justify-center">
        <button
          class="${0} ${0}"
          @click=${0}
          aria-label="Go back"
          title="Go back"
        >
          ${0}
        </button>
      </div>
      <div class="font-sans font-medium ${0}">
        ${0}
      </div>
    </div>`), Le, Qe, this._goBack, S5, Sn, this.heading);
  }
};
F([me()], uo.prototype, "heading", void 0), uo = F([oe("bc-navbar")], uo);
const Nc = de(Rc || (Rc = ((e) => e)`<svg width="25" height="24" viewBox="0 0 25 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M9.5 6H6.1C5.53995 6 5.25992 6 5.04601 6.10899C4.85785 6.20487 4.70487 6.35785 4.60899 6.54601C4.5 6.75992 4.5 7.03995 4.5 7.6V18.4C4.5 18.9601 4.5 19.2401 4.60899 19.454C4.70487 19.6422 4.85785 19.7951 5.04601 19.891C5.25992 20 5.53995 20 6.1 20H16.9C17.4601 20 17.7401 20 17.954 19.891C18.1422 19.7951 18.2951 19.6422 18.391 19.454C18.5 19.2401 18.5 18.9601 18.5 18.4V15" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M14.5 4H20.5M20.5 4V10M20.5 4L11.5 13" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" class="hover-right-up"/>
</svg>`));
let $c, Ic, Uc, Oc = (e) => e;
function P2(e) {
  const t = `border-t ${Gi} ${e ? "w-24" : "w-full"}`;
  return W($c || ($c = Oc`<div
    class="w-full px-8 flex gap-4 justify-center items-center opacity-60 dark:opacity-60"
  >
    <hr class=${0} />
    ${0}
  </div>`), t, e ? W(Ic || (Ic = Oc`
          <span class=${0}>${0}</span>
          <hr class=${0} />
        `), Qe, e, t) : null);
}
const T5 = de(Uc || (Uc = ((e) => e)`<svg width="49" height="24" viewBox="0 0 49 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-16 h-16 -my-4">
<ellipse opacity="0.1" cx="7.70773" cy="21.5226" rx="3.4509" ry="0.637088" fill="black"/>
<path d="M11.0342 18.4211C12.817 18.4211 13.6285 14.4735 13.6285 12.9767C13.6285 11.8101 12.8235 11.103 11.7652 11.103C10.7135 11.103 9.85965 11.5553 9.84905 12.1153C9.84902 13.5933 9.5889 18.4211 11.0342 18.4211Z" fill="white" stroke="currentColor" stroke-width="0.530907"/>
<path d="M4.52264 18.4211C2.73985 18.4211 1.9284 14.4735 1.9284 12.9767C1.9284 11.8101 2.7334 11.103 3.79171 11.103C4.84341 11.103 5.69723 11.5553 5.70784 12.1153C5.70786 13.5933 5.96799 18.4211 4.52264 18.4211Z" fill="white" stroke="currentColor" stroke-width="0.530907"/>
<mask id="path-4-inside-1_362_874" fill="white">
<path fill-rule="evenodd" clip-rule="evenodd" d="M12.6445 12.5235C12.6735 12.2374 12.352 12.0646 12.1046 12.2113C10.8114 12.9776 9.30208 13.4175 7.68997 13.4175C6.09291 13.4175 4.59668 12.9858 3.31165 12.2326C3.06376 12.0873 2.74334 12.2612 2.77318 12.547C2.9933 14.6548 4.14156 16.4192 5.71508 17.2405C6.15438 17.4698 6.46173 17.8751 6.77033 18.282C7.0197 18.6108 7.26988 18.9407 7.59116 19.1797C7.62857 19.2075 7.66755 19.2222 7.70759 19.2222C7.74762 19.2222 7.78658 19.2075 7.82397 19.1797C8.14538 18.9407 8.39562 18.6108 8.64504 18.2819C8.9536 17.875 9.26091 17.4698 9.70016 17.2405C11.2796 16.4162 12.4305 14.6418 12.6445 12.5235Z"/>
</mask>
<path fill-rule="evenodd" clip-rule="evenodd" d="M12.6445 12.5235C12.6735 12.2374 12.352 12.0646 12.1046 12.2113C10.8114 12.9776 9.30208 13.4175 7.68997 13.4175C6.09291 13.4175 4.59668 12.9858 3.31165 12.2326C3.06376 12.0873 2.74334 12.2612 2.77318 12.547C2.9933 14.6548 4.14156 16.4192 5.71508 17.2405C6.15438 17.4698 6.46173 17.8751 6.77033 18.282C7.0197 18.6108 7.26988 18.9407 7.59116 19.1797C7.62857 19.2075 7.66755 19.2222 7.70759 19.2222C7.74762 19.2222 7.78658 19.2075 7.82397 19.1797C8.14538 18.9407 8.39562 18.6108 8.64504 18.2819C8.9536 17.875 9.26091 17.4698 9.70016 17.2405C11.2796 16.4162 12.4305 14.6418 12.6445 12.5235Z" fill="#FFDF6F"/>
<path d="M5.71508 17.2405L5.96074 16.7698L5.71508 17.2405ZM6.77033 18.282L6.34731 18.6028H6.34731L6.77033 18.282ZM7.59116 19.1797L7.27429 19.6057L7.27429 19.6057L7.59116 19.1797ZM7.82397 19.1797L8.14076 19.6058L8.14076 19.6058L7.82397 19.1797ZM8.64504 18.2819L8.22202 17.9611L8.22202 17.9611L8.64504 18.2819ZM9.70016 17.2405L9.94582 17.7112H9.94582L9.70016 17.2405ZM12.1046 12.2113L12.3752 12.668L12.1046 12.2113ZM12.6445 12.5235L12.1163 12.4702L12.6445 12.5235ZM11.8339 11.7545C10.6205 12.4737 9.20424 12.8866 7.68997 12.8866V13.9484C9.39992 13.9484 11.0024 13.4815 12.3752 12.668L11.8339 11.7545ZM7.68997 12.8866C6.18981 12.8866 4.78593 12.4813 3.5801 11.7746L3.0432 12.6907C4.40743 13.4902 5.996 13.9484 7.68997 13.9484V12.8866ZM2.24515 12.6022C2.48098 14.8605 3.71574 16.7958 5.46941 17.7111L5.96074 16.7698C4.56738 16.0426 3.50562 14.4492 3.30122 12.4919L2.24515 12.6022ZM5.46941 17.7111C5.78479 17.8758 6.0236 18.1759 6.34731 18.6028L7.19335 17.9612C6.89987 17.5742 6.52397 17.0638 5.96074 16.7698L5.46941 17.7111ZM6.34731 18.6028C6.58755 18.9196 6.88185 19.3137 7.27429 19.6057L7.90804 18.7537C7.65791 18.5676 7.45184 18.302 7.19335 17.9612L6.34731 18.6028ZM7.27429 19.6057C7.38246 19.6861 7.5299 19.7531 7.70759 19.7531V18.6913C7.80519 18.6913 7.87468 18.7289 7.90803 18.7537L7.27429 19.6057ZM7.70759 19.7531C7.8852 19.7531 8.03259 19.6862 8.14076 19.6058L7.50719 18.7537C7.54057 18.7289 7.61005 18.6913 7.70759 18.6913V19.7531ZM8.14076 19.6058C8.53339 19.3138 8.82778 18.9195 9.06806 18.6027L8.22202 17.9611C7.96346 18.302 7.75738 18.5677 7.50719 18.7537L8.14076 19.6058ZM9.06806 18.6027C9.39174 18.1759 9.6305 17.8758 9.94582 17.7112L9.45451 16.7699C8.89133 17.0638 8.51547 17.5741 8.22202 17.9611L9.06806 18.6027ZM9.94582 17.7112C11.706 16.7925 12.9435 14.8462 13.1728 12.5769L12.1163 12.4702C11.9176 14.4373 10.8531 16.0399 9.45451 16.7699L9.94582 17.7112ZM3.5801 11.7746C3.28427 11.6012 2.93961 11.6167 2.67587 11.7666C2.40507 11.9206 2.20605 12.2278 2.24515 12.6022L3.30122 12.4919C3.30493 12.5275 3.29778 12.5713 3.27544 12.6121C3.25447 12.6503 3.22616 12.6752 3.20065 12.6897C3.15164 12.7176 3.09113 12.7188 3.0432 12.6907L3.5801 11.7746ZM12.3752 12.668C12.3274 12.6963 12.2669 12.6954 12.2177 12.6677C12.1921 12.6533 12.1637 12.6286 12.1426 12.5903C12.12 12.5496 12.1127 12.5057 12.1163 12.4702L13.1728 12.5769C13.2106 12.2021 13.0103 11.8954 12.7386 11.7425C12.4741 11.5936 12.1291 11.5796 11.8339 11.7545L12.3752 12.668Z" fill="black" mask="url(#path-4-inside-1_362_874)"/>
<ellipse cx="7.72545" cy="12.4621" rx="4.67198" ry="1.55733" fill="black" stroke="black" stroke-width="0.530907"/>
<path d="M3.97363 15.0811C3.97363 15.0811 6.27807 15.8597 7.76077 15.8597C9.24347 15.8597 11.5479 15.0811 11.5479 15.0811" stroke="black" stroke-width="0.530907" stroke-linecap="round"/>
<circle cx="1.05642" cy="1.05642" r="1.05642" transform="matrix(-1 0 0 1 4.38745 4.74609)" fill="black"/>
<path d="M3.15497 5.64404L5.12695 7.61603" stroke="black" stroke-width="0.528211"/>
<circle cx="11.9585" cy="5.80252" r="1.05642" fill="black"/>
<path d="M12.1522 5.64404L10.1802 7.61603" stroke="black" stroke-width="0.528211"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M3.63088 12.1065C3.0615 11.8354 2.73014 11.2267 2.84114 10.606C3.31755 7.94167 5.303 5.94336 7.67995 5.94336C10.0627 5.94336 12.052 7.95136 12.5222 10.6253C12.6316 11.2472 12.2975 11.8556 11.7262 12.1245C10.5037 12.6998 9.13817 13.0214 7.69756 13.0214C6.24199 13.0214 4.86309 12.6931 3.63088 12.1065Z" fill="#FFDF6F"/>
<path d="M12.5222 10.6253L12.7823 10.5796L12.5222 10.6253ZM11.7262 12.1245L11.8386 12.3635L11.7262 12.1245ZM2.84114 10.606L3.10112 10.6525L2.84114 10.606ZM3.63088 12.1065L3.7444 11.868L3.63088 12.1065ZM3.10112 10.6525C3.56146 8.07803 5.46436 6.20746 7.67995 6.20746V5.67925C5.14164 5.67925 3.07364 7.8053 2.58115 10.5595L3.10112 10.6525ZM7.67995 6.20746C9.90088 6.20746 11.8077 8.08716 12.2621 10.6711L12.7823 10.5796C12.2962 7.81556 10.2244 5.67925 7.67995 5.67925V6.20746ZM11.6137 11.8855C10.4257 12.4446 9.09849 12.7573 7.69756 12.7573V13.2855C9.17785 13.2855 10.5817 12.955 11.8386 12.3635L11.6137 11.8855ZM7.69756 12.7573C6.28209 12.7573 4.9419 12.4381 3.7444 11.868L3.51736 12.3449C4.78428 12.9481 6.20189 13.2855 7.69756 13.2855V12.7573ZM12.2621 10.6711C12.3498 11.1697 12.0828 11.6648 11.6137 11.8855L11.8386 12.3635C12.5122 12.0465 12.9134 11.3248 12.7823 10.5796L12.2621 10.6711ZM2.58115 10.5595C2.44814 11.3033 2.84611 12.0254 3.51736 12.3449L3.7444 11.868C3.2769 11.6455 3.01213 11.1501 3.10112 10.6525L2.58115 10.5595Z" fill="black"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M4.64674 11.4442C4.18843 11.2575 3.91656 10.7699 4.07537 10.3012C4.56513 8.8558 5.99378 7.80981 7.67991 7.80981C9.36604 7.80981 10.7947 8.8558 11.2845 10.3012C11.4433 10.7699 11.1714 11.2575 10.7131 11.4442C9.777 11.8254 8.75299 12.0355 7.67991 12.0355C6.60684 12.0355 5.58282 11.8254 4.64674 11.4442Z" fill="black"/>
<ellipse cx="8.895" cy="10.0634" rx="0.880351" ry="0.704281" fill="white"/>
<ellipse cx="6.37474" cy="10.0639" rx="0.880351" ry="0.704281" fill="white"/>
<path d="M25.3078 11.6284L24.3574 9.04272L23.4489 11.6284H25.3078ZM23.1274 5.99577H25.6712L29.2213 15.3882L26.7195 15.6398L26.0346 13.6271H22.75L22.0931 15.5H19.5633L23.1274 5.99577ZM32.463 15.5H29.9193V5.78612L32.463 5.63238V15.5ZM35.1432 15.5H33.8573V5.78612L36.4011 5.63238V14.2281L35.1432 15.5ZM35.5765 11.3629L34.8637 9.72758C35.0314 9.52259 35.2457 9.32691 35.5066 9.14055C35.7768 8.94488 36.075 8.78647 36.4011 8.66534C36.7272 8.54421 37.0627 8.48364 37.4074 8.48364C38.0783 8.48364 38.6747 8.60943 39.1965 8.86102C39.7183 9.1126 40.1283 9.49929 40.4264 10.0211C40.7339 10.5429 40.8877 11.2091 40.8877 12.0198C40.8877 12.8211 40.7339 13.492 40.4264 14.0324C40.1283 14.5729 39.709 14.9782 39.1685 15.2484C38.6374 15.5186 38.0131 15.6537 37.2956 15.6537C37.0161 15.6537 36.7366 15.6118 36.457 15.528C36.1868 15.4441 35.9166 15.3136 35.6464 15.1366C35.3855 14.9502 35.1246 14.708 34.8637 14.4098L35.5765 12.9143C35.8467 13.1659 36.1123 13.3615 36.3732 13.5013C36.6341 13.6318 36.8856 13.697 37.1279 13.697C37.3422 13.697 37.5332 13.6318 37.701 13.5013C37.8687 13.3709 38.0038 13.1799 38.1063 12.9283C38.2088 12.6767 38.26 12.3785 38.26 12.0338C38.26 11.689 38.2088 11.4001 38.1063 11.1672C38.0131 10.9249 37.8733 10.7432 37.687 10.6221C37.5099 10.501 37.2863 10.4404 37.0161 10.4404C36.7925 10.4404 36.5642 10.5243 36.3312 10.692C36.0983 10.8597 35.8467 11.0833 35.5765 11.3629ZM43.4036 15.528L43.4595 15.3742L41.0275 9.14055L43.3757 8.46967L44.7594 12.5509L46.0592 8.72125H48.589L45.6119 16.2967C45.4722 16.6601 45.2439 16.9955 44.9271 17.303C44.6103 17.6105 44.2422 17.8714 43.8229 18.0857C43.4036 18.3 42.9703 18.4584 42.5231 18.5609L41.6705 16.5902C41.8941 16.497 42.1271 16.3945 42.3693 16.2827C42.6209 16.1709 42.8445 16.0498 43.0402 15.9193C43.2359 15.7889 43.357 15.6584 43.4036 15.528Z" fill="currentColor"/>
</svg>
`));
let Pc, M5 = (e) => e, Hc = class extends he()(ae) {
  render() {
    return W(Pc || (Pc = M5`<div>
      <bc-navbar class="flex w-full" heading="About"></bc-navbar>
      <div class="font-sans text-sm w-full">
        <div class="px-8">
          <div class="font-bold mb-1 ${0}">
            How does it work?
          </div>
          <p class="mb-2 ${0}">
            Bitcoin Connect is a way to connect to your lightning wallet from
            any browser.
          </p>
          <div class="flex flex-col gap-3 ${0}">
            <p>
              💾 Your connection is saved in local storage, so next time you
              visit the site will connect automatically.
            </p>
            <p>
              💸 Make sure to set budgets and permissions for sites you do not
              trust.
            </p>
          </div>
        </div>

        <div class="flex gap-4 w-full my-6 px-8">
          <a
            href="https://bitcoin-connect.com"
            target="_blank"
            class="${0} flex-1"
            aria-label="Learn more about Bitcoin Connect (opens in new tab)"
          >
            <bci-button tabindex="-1">
              <span class="${0}">Learn more</span>
              ${0}
            </bci-button>
          </a>
          <a
            href="https://github.com/getAlby/bitcoin-connect"
            target="_blank"
            class="${0} flex-1"
            aria-label="Use Bitcoin Connect on GitHub (opens in new tab)"
          >
            <bci-button tabindex="-1">
              <span class="${0}">Use it</span>
              ${0}
            </bci-button>
          </a>
        </div>
        ${0}
        <div
          class="flex w-full justify-center items-center mt-4 gap-1 font-sans"
        >
          <span class="block ${0}"
            >Made with love by</span
          >
          <span class="${0}"> ${0} </span>
        </div>
      </div>
    </div>`), be, re, re, Vo, be, Nc, Vo, be, Nc, P2(), Qe, rt, T5);
  }
};
Hc = F([oe("bc-help")], Hc);
let Dc, Zc, B5 = (e) => e, ho = class extends he()(ae) {
  constructor() {
    super(...arguments), this._nwcUrl = "";
  }
  render() {
    return W(Dc || (Dc = B5`<div class="w-full">
      <bc-navbar class="flex w-full" heading="Nostr Wallet Connect"></bc-navbar>
      <div class="font-sans text-sm w-full">
        <div class="px-8 pt-4 w-full">
          <div class="mb-1 ${0}">
            Enter your
            <a
              href="https://nwc.getalby.com/about"
              target="_blank"
              class="font-bold"
              >Connection Secret
            </a>
            below
          </div>

          <input
            value=${0}
            @change=${0}
            placeholder="nostr+walletconnect://..."
            type="password"
            class="w-full mb-8 rounded-lg p-2 border-1 bg-transparent ${0} ${0}"
          />
          <bci-button variant="primary" @click=${0}>
            Connect
          </bci-button>
        </div>
      </div>
    </div>`), re, this._nwcUrl, this.nwcUrlChanged, Ut, rt, this.onConnect);
  }
  nwcUrlChanged(e) {
    this._nwcUrl = e.target.value;
  }
  async onConnect() {
    this._nwcUrl ? await V.getState().connect({ nwcUrl: this._nwcUrl, connectorName: zi, connectorType: "nwc.generic" }) : V.getState().setError("Please enter a URL");
  }
};
F([se()], ho.prototype, "_nwcUrl", void 0), ho = F([oe("bc-nwc")], ho);
const R5 = de(Zc || (Zc = ((e) => e)`<svg width="25" height="24" viewBox="0 0 25 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M7.5 19C4.73858 19 2.5 16.7614 2.5 14C2.5 11.4673 4.38316 9.37436 6.82568 9.04508C7.63649 6.69118 9.87075 5 12.5 5C15.8137 5 18.5 7.68629 18.5 11C20.7091 11 22.5 12.7909 22.5 15C22.5 17.2091 20.7091 19 18.5 19H7.5Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`));
let Wc;
const N5 = de(Wc || (Wc = ((e) => e)`<svg xmlns="http://www.w3.org/2000/svg" width="25" height="24" fill="none"><path fill="currentColor" d="M18.048 15.842a4.588 4.588 0 0 0-1.202-4.359l-1.35-1.356c-.25-.251-.582-.39-.936-.39h-.003c-.352 0-.683.136-.932.383l-.534.529a.126.126 0 0 1-.178 0l-1.519-1.516a.834.834 0 0 0-1.42.588c0 .222.086.431.243.588l1.514 1.511c.05.05.05.13 0 .18l-.97.963a.127.127 0 0 1-.178 0l-1.52-1.517a.834.834 0 0 0-1.42.588c0 .222.086.431.244.588L9.4 14.134c.05.05.05.13 0 .18l-.442.437c-.251.25-.39.58-.391.933-.001.353.135.685.385.935l1.35 1.357a4.597 4.597 0 0 0 2.247 1.245 4.64 4.64 0 0 0 2.17-.031l2.266 2.262c.367.367.856.568 1.377.568.52 0 1.007-.2 1.373-.565l.59-.586c.369-.366.572-.855.572-1.374.001-.52-.201-1.008-.57-1.376l-2.28-2.277Zm-1.405.948 2.508 2.505a.279.279 0 0 1 0 .397l-.59.585a.283.283 0 0 1-.398 0l-2.495-2.492a1.109 1.109 0 0 0-.79-.326c-.123 0-.246.02-.365.06-.514.172-1.065.2-1.595.08a2.934 2.934 0 0 1-1.434-.794l-.885-.89a.316.316 0 0 1 .002-.448l.655-.65.42-.418 1.576-1.565.334-.334.745-.737a.316.316 0 0 1 .447.001l.886.891a2.93 2.93 0 0 1 .709 2.992c-.133.406-.03.844.27 1.143Z"/><path fill="currentColor" d="M14.96 21.397a.759.759 0 0 0-1.07-.001 1.829 1.829 0 0 1-2.584-.006L2.73 12.772a1.829 1.829 0 0 1 .006-2.583l6.295-6.271a1.814 1.814 0 0 1 1.288-.532h.004c.488 0 .946.192 1.29.538l7.538 7.544a.821.821 0 0 0 .585.242.827.827 0 0 0 .587-1.407l-7.658-7.72-.011-.011a3.51 3.51 0 0 0-2.432-.883 3.511 3.511 0 0 0-2.39 1.026L1.538 8.986A3.5 3.5 0 0 0 .5 11.476a3.501 3.501 0 0 0 1.026 2.493l8.576 8.618a3.502 3.502 0 0 0 2.49 1.038h.01c.938 0 1.82-.365 2.486-1.027a.752.752 0 0 0 .223-.535.752.752 0 0 0-.222-.537l-.13-.13Z"/><path fill="currentColor" d="m24.286 10.688-2.928-8.631-.006-.019-.023-.05A2.731 2.731 0 0 0 20.482.93a2.79 2.79 0 0 0-2.469-.442c-.44.132-.832.368-1.162.7l-1.224 1.23a.844.844 0 0 0-.248.593.844.844 0 0 0 .24.596c.16.165.375.256.605.258h.005a.843.843 0 0 0 .602-.25l1.224-1.23c.25-.252.595-.361.945-.298.345.061.627.276.777.59l2.912 8.588.003.01.004.01c.07.183.105.375.105.571 0 .427-.166.828-.469 1.13l-2.006 1.997a.843.843 0 0 0-.25.6.847.847 0 0 0 1.449.602l2.006-1.997a3.276 3.276 0 0 0 .969-2.332c0-.4-.072-.794-.214-1.168Z"/></svg>`));
let Fc;
const $5 = de(Fc || (Fc = ((e) => e)`<svg width="25" height="24" fill="none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 24"><path fill-rule="evenodd" clip-rule="evenodd" d="M12.432 0h.136c1.702 0 3.074 0 4.153.143 1.12.15 2.063.468 2.812 1.209.75.74 1.071 1.673 1.222 2.781.145 1.067.145 2.424.145 4.107v7.52c0 1.683 0 3.04-.145 4.107-.15 1.107-.473 2.04-1.222 2.781-.749.74-1.692 1.06-2.812 1.209-1.08.143-2.45.143-4.153.143h-.136c-1.702 0-3.074 0-4.153-.143-1.12-.15-2.063-.468-2.812-1.209-.75-.74-1.071-1.674-1.222-2.781C4.1 18.8 4.1 17.443 4.1 15.76V8.24c0-1.683 0-3.04.145-4.107.15-1.108.473-2.04 1.222-2.781C6.216.612 7.159.292 8.279.143 9.358 0 10.73 0 12.432 0ZM6.787 2.657c.344-.34.828-.562 1.74-.684.94-.125 2.187-.127 3.973-.127s3.032.002 3.972.127c.913.122 1.397.344 1.741.684.345.34.57.82.692 1.722.126.93.128 2.162.128 3.929v7.384c0 1.767-.002 3-.128 3.929-.123.903-.347 1.381-.692 1.722-.344.34-.828.562-1.74.684-.94.125-2.187.127-3.973.127s-3.032-.002-3.972-.127c-.913-.122-1.397-.344-1.741-.684-.345-.34-.57-.82-.692-1.722-.126-.93-.128-2.162-.128-3.929V8.308c0-1.767.002-3 .128-3.929.123-.903.347-1.381.692-1.722Z" fill="currentColor"/><path d="M9.078 19.361c0-.497.418-.9.933-.9h4.978c.515 0 .933.403.933.9s-.418.9-.933.9H10.01c-.515 0-.933-.403-.933-.9Z" fill="currentColor"/></svg>`));
let Vc, Gc, I5 = (e) => e, jc = class extends he()(ae) {
  render() {
    return W(Vc || (Vc = I5`<div class="w-full">
      <bc-navbar
        class="flex w-full"
        heading=${0}
      ></bc-navbar>
      <div class="font-sans text-sm w-full">
        <div
          class="px-8 pt-4 w-full flex flex-col items-center justify-center gap-4"
        >
          <div class="mb-2 ${0}">
            Choose how to connect
          </div>

          <bci-button @click=${0} class="w-full">
            ${0}
            <span class="${0}">Alby Cloud</span>
          </bci-button>

          <bci-button @click=${0} class="w-full">
            ${0}
            <span class="${0}">Alby Go</span>
          </bci-button>

          <bci-button @click=${0} class="w-full">
            ${0}
            <span class="${0}"
              >Connection Secret</span
            >
          </bci-button>
        </div>
      </div>
    </div>`), "Connect " + U2, re, this.onClickAlbyCloud, R5, be, this.onClickAlbyGo, $5, be, this.onClickConnectionSecret, N5, be);
  }
  async onClickAlbyCloud() {
    try {
      var e;
      const t = V.getState().bitcoinConnectConfig.providerConfig, n = await vt.fromAuthorizationUrl("https://my.albyhub.com/apps/new", qe({}, (t == null || (e = t.nwc) == null ? void 0 : e.authorizationUrlOptions) || {}, { name: this._appName }));
      n.close(), await V.getState().connect({ nwcUrl: n.nostrWalletConnectUrl, connectorName: "Alby Hub", connectorType: "nwc.albyhub" });
    } catch (t) {
      console.error(t), alert("" + t);
    }
  }
  async onClickConnectionSecret() {
    V.getState().pushRoute("/nwc");
  }
  async onClickAlbyGo() {
    V.getState().pushRoute("/alby-go");
  }
};
jc = F([oe("bc-alby-hub")], jc);
const Ki = de(Gc || (Gc = ((e) => e)`<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M11.4962 11.2367C11.7716 11.1782 12.0214 11.0339 12.2098 10.8247C12.424 10.5868 12.5206 10.2261 12.7139 9.50486L13.6802 5.89873C13.8734 5.17744 13.9701 4.81679 13.9035 4.50368C13.845 4.22827 13.7007 3.97845 13.4915 3.79004C13.2536 3.57585 12.893 3.47921 12.1717 3.28594L8.56554 2.31969C7.84425 2.12642 7.4836 2.02978 7.17049 2.09633C6.89507 2.15488 6.64525 2.29911 6.45684 2.50836C6.24265 2.74624 6.14602 3.10689 5.95275 3.82818L5.5 5.50024" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
<path d="M11.0135 10.1009L10.0473 6.49473C9.85398 5.77344 9.75735 5.41279 9.54316 5.17491C9.35475 4.96566 9.10493 4.82142 8.82951 4.76288C8.5164 4.69633 8.15576 4.79296 7.43447 4.98623L3.82834 5.95249C3.10705 6.14576 2.7464 6.2424 2.50852 6.45659C2.29927 6.645 2.15504 6.89481 2.0965 7.17023C2.02994 7.48334 2.12658 7.84399 2.31985 8.56528L3.28611 12.1714C3.47938 12.8927 3.57601 13.2533 3.7902 13.4912C3.97861 13.7005 4.22843 13.8447 4.50385 13.9032C4.81696 13.9698 5.1776 13.8732 5.89889 13.6799L9.50502 12.7136C10.2263 12.5204 10.587 12.4237 10.8248 12.2095C11.0341 12.0211 11.1783 11.7713 11.2369 11.4959C11.3034 11.1828 11.2068 10.8221 11.0135 10.1009Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>`));
let zc;
const Qi = de(zc || (zc = ((e) => e)`<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M5.33341 5.33341V4.80008C5.33341 4.05334 5.33341 3.67998 5.47874 3.39476C5.60657 3.14388 5.81054 2.9399 6.06143 2.81207C6.34664 2.66675 6.72001 2.66675 7.46675 2.66675H11.2001C11.9468 2.66675 12.3202 2.66675 12.6054 2.81207C12.8563 2.9399 13.0603 3.14388 13.1881 3.39476C13.3334 3.67998 13.3334 4.05334 13.3334 4.80008V8.53342C13.3334 9.28015 13.3334 9.65352 13.1881 9.93874C13.0603 10.1896 12.8563 10.3936 12.6054 10.5214C12.3202 10.6667 11.9468 10.6667 11.2001 10.6667H10.6667M10.6667 7.46675V11.2001C10.6667 11.9468 10.6667 12.3202 10.5214 12.6054C10.3936 12.8563 10.1896 13.0603 9.93874 13.1881C9.65352 13.3334 9.28015 13.3334 8.53342 13.3334H4.80008C4.05334 13.3334 3.67998 13.3334 3.39476 13.1881C3.14388 13.0603 2.9399 12.8563 2.81207 12.6054C2.66675 12.3202 2.66675 11.9468 2.66675 11.2001V7.46675C2.66675 6.72001 2.66675 6.34664 2.81207 6.06143C2.9399 5.81054 3.14388 5.60657 3.39476 5.47874C3.67998 5.33341 4.05334 5.33341 4.80008 5.33341H8.53342C9.28015 5.33341 9.65352 5.33341 9.93874 5.47874C10.1896 5.60657 10.3936 5.81054 10.5214 6.06143C10.6667 6.34664 10.6667 6.72001 10.6667 7.46675Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>`));
let qc, Kc, Qc = (e) => e, Zn = class extends he()(ae) {
  constructor() {
    super(), this._hasCopiedAuthString = !1, this.initAlbyGo();
  }
  disconnectedCallback() {
    var e;
    super.disconnectedCallback(), (e = this._unsub) == null || e.call(this);
  }
  render() {
    return W(qc || (qc = Qc`<div class="w-full">
      <bc-navbar class="flex w-full" heading="Connect Alby Hub with Alby Go"></bc-navbar>
      <div class="font-sans text-sm w-full">
        <div
          class="px-8 pt-4 w-full flex flex-col items-center justify-center gap-4"
        >
          <div class="mb-2 text-center ${0}">
            Scan with your camera, QR code scanner app, or from Alby Go -> Send
          </div>

          <div class="flex justify-center items-center">
            ${0}
            <p class="${0}">Waiting for connection</p>
          </div>

          ${0}
          
          <bci-button
            @click=${0}
            class="
flex gap-1 w-full
mt-4
${0} ${0} font-semibold text-xs"
          >
            ${0}
            ${0}
          </bci-button>
        </div>
        </div>
      </div>
    </div>`), re, Ot(`w-7 h-7 ${re}`), re, this.renderQR(), this._copyAuthString, be, Le, this._hasCopiedAuthString ? Ki : Qi, this._hasCopiedAuthString ? "Copied!" : "Copy");
  }
  renderQR() {
    if (!this._authString) return null;
    const e = this._authString;
    return setTimeout(() => {
      var t;
      const n = (t = this.shadowRoot) == null ? void 0 : t.getElementById("qr");
      if (!n) return void console.error("qr canvas not found");
      const r = n.getContext("2d");
      if (!r) return void console.error("could not get context for qr canvas");
      const o = Bi(0, "L");
      o.addData(e), o.make();
      const i = o.getModuleCount();
      n.width = 4 * i, n.height = 4 * i, o.renderTo2dContext(r, 4);
    }, 100), W(Kc || (Kc = Qc`
      <!-- add margin only on dark mode because on dark mode the qr has a white border -->
      <canvas id="qr" class="dark:bg-white dark:p-4"></canvas>
    `));
  }
  _copyAuthString() {
    this._authString && (navigator.clipboard.writeText(this._authString), this._hasCopiedAuthString = !0, setTimeout(() => {
      this._hasCopiedAuthString = !1;
    }, 2e3));
  }
  async initAlbyGo() {
    try {
      var e;
      const t = (e = V.getState().bitcoinConnectConfig.providerConfig) == null || (e = e.nwc) == null ? void 0 : e.authorizationUrlOptions, n = t?.expiresAt;
      let r = t?.requestMethods;
      r || (r = ["get_info", "get_balance", "get_budget", "pay_invoice", "list_transactions", "lookup_invoice", "make_invoice"]);
      const o = new s2({ name: this._appName, icon: this._appIcon, relayUrls: ["wss://relay.getalby.com/v1"], requestMethods: r, notificationTypes: t?.notificationTypes, maxAmount: t?.maxAmount, budgetRenewal: t?.budgetRenewal, expiresAt: n ? Math.floor(n.getTime() / 1e3) : void 0, isolated: t?.isolated, metadata: t?.metadata, returnTo: t?.returnTo });
      this._authString = o.getConnectionUri("alby"), window.location.href = this._authString;
      const { unsub: i } = await o.subscribe({ onSuccess: async function(s) {
        s.close(), V.getState().connect({ nwcUrl: s.nostrWalletConnectUrl, connectorName: "Alby Hub", connectorType: "nwc.albyhub" });
      } });
      this._unsub = i;
    } catch (t) {
      console.error(t), alert("" + t);
    }
  }
};
F([se()], Zn.prototype, "_authString", void 0), F([se()], Zn.prototype, "_hasCopiedAuthString", void 0), Zn = F([oe("bc-alby-go")], Zn);
let Jc, Yc, U5 = (e) => e, Wn = class extends he()(ae) {
  constructor() {
    super(...arguments), this._lnbitsAdminKey = "", this._lnbitsUrl = "";
  }
  render() {
    return W(Jc || (Jc = U5`<div class="w-full">
      <bc-navbar
        class="flex w-full"
        heading=${0}
      ></bc-navbar>
      <div class="font-sans text-sm w-full">
        <div class="px-8 pt-4 w-full">
          <div class="mb-4 ${0}">
            In LNbits, choose the wallet you want to connect, open it, click on
            API docs and copy the Admin Key. Paste it below:
          </div>

          <div class="mb-1 ${0}">
            LNbits Admin Key
          </div>
          <input
            value=${0}
            @change=${0}
            type="password"
            placeholder="Your 32 digit admin key"
            class="w-full mb-8 rounded-lg p-2 border-1 bg-transparent ${0} ${0}"
          />
          <div class="mb-1 ${0}">
            LNbits URL
          </div>

          <input
            value=${0}
            @change=${0}
            placeholder="https://legend.lnbits.com"
            class="w-full mb-8 rounded-lg p-2 border-1 bg-transparent ${0} ${0}"
          />
          <bci-button variant="primary" @click=${0}>
            Connect
          </bci-button>
        </div>
      </div>
    </div>`), jo, Sn, re, this._lnbitsAdminKey, this._lnbitsAdminKeyChanged, Ut, rt, re, this._lnbitsUrl, this._lnbitsUrlChanged, Ut, rt, this.onConnect);
  }
  _lnbitsAdminKeyChanged(e) {
    this._lnbitsAdminKey = e.target.value;
  }
  _lnbitsUrlChanged(e) {
    this._lnbitsUrl = e.target.value;
  }
  async onConnect() {
    if (!this._lnbitsAdminKey) return void V.getState().setError("Please enter your admin key");
    if (!this._lnbitsUrl) return void V.getState().setError("Please enter your LNbits instance URL");
    let e = this._lnbitsUrl;
    e.endsWith("/") && (e = e.substring(0, e.length - 1)), await V.getState().connect({ lnbitsAdminKey: this._lnbitsAdminKey, lnbitsInstanceUrl: e, connectorName: jo, connectorType: "lnbits" });
  }
};
F([se()], Wn.prototype, "_lnbitsAdminKey", void 0), F([se()], Wn.prototype, "_lnbitsUrl", void 0), Wn = F([oe("bc-lnbits")], Wn);
const H2 = de(Yc || (Yc = ((e) => e)`
<svg width="150" height="150" viewBox="0 0 150 150" version="1.1" xml:space="preserve"
	xmlns:xlink="http://www.w3.org/1999/xlink"
	xmlns="http://www.w3.org/2000/svg"
	xmlns:svg="http://www.w3.org/2000/svg"
  class="w-32 h-32 mt-4"
>
	<circle id="ring" cx="75" cy="75" r="48.5" fill="none" stroke="currentColor" stroke-width="5" transform="rotate(-90 75 75)" stroke-dasharray="400 400" stroke-dashoffset="400">
		<animate attributeName="stroke-dashoffset" begin="0.1s" dur="1.5s" values="500; 80; 0" fill="freeze" calcMode="spline" keyTimes="0; 0.99; 1" keySplines="0.28 0.4 0.38 1; 0 0 1 1"/>
		<animate attributeName="r" begin="1.8s" dur=".8s" values="47; 65" fill="freeze"/>
		<animate attributeName="stroke-width" begin="1.8s" dur=".8s" values="6; 0" fill="freeze"/>
	</circle>
	<circle id="circle" cx="75" cy="75" r="0" fill="currentColor" stroke="none">
		<animate attributeName="r" begin="1.4s" dur=".5s" fill="freeze" calcMode="spline" values="0; 60; 50" keyTimes="0; 0.75; 1" keySplines="0.25 0.1 0.25 1; 0.25 0.1 0.25 1"/>
	</circle>
	<path id="check" d="M 51.749354,79.542286 63.437424,91.567026 98.46891,58.494402" fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round" stroke-dasharray="65 65" stroke-dashoffset="65">
		<animate attributeName="stroke-dashoffset" begin="1.8s" dur=".5s" values="65; 0" fill="freeze" calcMode="spline" keyTimes="0; 1" keySplines="0.42 0 0.58 1"/>
	</path>
</svg>
`));
let Xc;
const O5 = de(Xc || (Xc = ((e) => e)`<svg width="25" height="24" viewBox="0 0 25 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M4.5 6.5V17C4.5 18.6569 5.84315 20 7.5 20H17.5C19.1569 20 20.5 18.6569 20.5 17V12C20.5 10.3431 19.1569 9 17.5 9H16.5M4.5 6.5C4.5 7.88071 5.61929 9 7 9H16.5M4.5 6.5C4.5 5.11929 5.61929 4 7 4H14.5C15.6046 4 16.5 4.89543 16.5 6V9" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="round"/>
<path d="M16 15.375C16.4832 15.375 16.875 14.9832 16.875 14.5C16.875 14.0168 16.4832 13.625 16 13.625C15.5168 13.625 15.125 14.0168 15.125 14.5C15.125 14.9832 15.5168 15.375 16 15.375Z" fill="white" stroke="currentColor" stroke-width="0.75"/>
</svg>`));
let e1;
const P5 = de(e1 || (e1 = ((e) => e)`<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path fill-rule="evenodd" clip-rule="evenodd" d="M3 6C3 4.34315 4.34315 3 6 3H8C9.65685 3 11 4.34315 11 6V8C11 9.65685 9.65685 11 8 11H6C4.34315 11 3 9.65685 3 8V6ZM6 5C5.44772 5 5 5.44772 5 6V8C5 8.55228 5.44772 9 6 9H8C8.55228 9 9 8.55228 9 8V6C9 5.44772 8.55228 5 8 5H6ZM13 6C13 4.34315 14.3431 3 16 3H18C19.6569 3 21 4.34315 21 6V8C21 9.65685 19.6569 11 18 11H16C14.3431 11 13 9.65685 13 8V6ZM16 5C15.4477 5 15 5.44772 15 6V8C15 8.55228 15.4477 9 16 9H18C18.5523 9 19 8.55228 19 8V6C19 5.44772 18.5523 5 18 5H16ZM3 16C3 14.3431 4.34315 13 6 13H8C9.65685 13 11 14.3431 11 16V18C11 19.6569 9.65685 21 8 21H6C4.34315 21 3 19.6569 3 18V16ZM6 15C5.44772 15 5 15.4477 5 16V18C5 18.5523 5.44772 19 6 19H8C8.55228 19 9 18.5523 9 18V16C9 15.4477 8.55228 15 8 15H6ZM14 13C14.5523 13 15 13.4477 15 14V15H16C16.5523 15 17 15.4477 17 16C17 16.5523 16.5523 17 16 17H14C13.4477 17 13 16.5523 13 16V14C13 13.4477 13.4477 13 14 13ZM17 14C17 13.4477 17.4477 13 18 13H20C20.5523 13 21 13.4477 21 14C21 14.5523 20.5523 15 20 15H18C17.4477 15 17 14.5523 17 14ZM17 18C17 17.4477 17.4477 17 18 17H20C20.5523 17 21 17.4477 21 18C21 18.5523 20.5523 19 20 19H19V20C19 20.5523 18.5523 21 18 21C17.4477 21 17 20.5523 17 20V18Z" fill="currentColor"/>
<path d="M15 20C15 20.5523 14.5523 21 14 21C13.4477 21 13 20.5523 13 20C13 19.4477 13.4477 19 14 19C14.5523 19 15 19.4477 15 20Z" fill="currentColor"/>
<path d="M8 17C8 17.5523 7.55228 18 7 18C6.44772 18 6 17.5523 6 17C6 16.4477 6.44772 16 7 16C7.55228 16 8 16.4477 8 17Z" fill="currentColor"/>
<path d="M8 7C8 7.55228 7.55228 8 7 8C6.44772 8 6 7.55228 6 7C6 6.44772 6.44772 6 7 6C7.55228 6 8 6.44772 8 7Z" fill="currentColor"/>
<path d="M18 7C18 7.55228 17.5523 8 17 8C16.4477 8 16 7.55228 16 7C16 6.44772 16.4477 6 17 6C17.5523 6 18 6.44772 18 7Z" fill="currentColor"/>
</svg>`));
let t1, n1, r1, o1, i1, s1, a1, c1, l1, d1, u1, h1, f1, p1, g1, w1, y1, b1, m1, xe = (e) => e, lt = class extends he()(ae) {
  constructor() {
    super(...arguments), this._hasCopiedInvoice = !1, this._isPaying = !1, this._showQR = !1, this.paymentMethods = "all";
  }
  updated(e) {
    super.updated(e), e.has("paid") && this.paid && setTimeout(() => {
      ji();
    }, 3e3);
  }
  renderHeading(e) {
    return W(t1 || (t1 = xe`
      <h2 class="text-2xl mb-6 ${0}">
        <span
          class="font-bold font-mono text-4xl align-bottom ${0}"
          >${0}</span
        >&nbsp;sats
      </h2>
    `), re, be, e.satoshi.toLocaleString(void 0, { useGrouping: !0 }));
  }
  renderPaidState() {
    return W(n1 || (n1 = xe`
      <div
        class="flex flex-col justify-center items-center ${0}"
      >
        <p class="font-bold">Paid!</p>
        ${0}
      </div>
    `), be, H2);
  }
  renderPayingState() {
    return W(r1 || (r1 = xe`
      <div class="flex flex-col justify-center items-center">
        <p class="${0} mb-5">Paying...</p>
        ${0}
      </div>
    `), re, Ot(`w-48 h-48 ${be}`));
  }
  renderPaymentConfirmation() {
    return W(o1 || (o1 = xe`
      <bci-button variant="primary" @click=${0}>
        <span class="-ml-0.5">${0}</span>
        Confirm Payment
      </bci-button>
      ${0}
    `), this._payInvoice, bn, qi(this._connectorName));
  }
  renderWaitingForPayment() {
    return W(i1 || (i1 = xe`
      <div class="flex justify-center items-center">
        ${0}
        <p class="${0}">Waiting for payment</p>
      </div>
    `), Ot(`w-7 h-7 ${be}`), re);
  }
  renderConnectWalletMobile() {
    let e = null, t = null, n = null;
    return this.paymentMethods !== "all" && this.paymentMethods !== "internal" || (e = W(s1 || (s1 = xe`
        <bci-button block @click=${0}>
          <span class="-ml-0.5">${0}</span>Connect Wallet
        </bci-button>
      `), this._onClickConnectWallet, bn)), this.paymentMethods !== "all" && this.paymentMethods !== "external" || (this._showQR || (t = W(a1 || (a1 = xe`
          <bci-button block @click=${0}>
            ${0} Copy & Display Invoice
          </bci-button>
        `), this._copyAndDisplayInvoice, P5)), this._showQR && (n = this.renderQR())), W(c1 || (c1 = xe`
      <div class="mt-8 w-full flex flex-col gap-4">
        ${0}
        ${0} ${0}
      </div>
      ${0}
    `), this.paymentMethods === "all" || this.paymentMethods === "external" ? W(l1 || (l1 = xe`<a href="lightning:${0}">
              <bci-button variant="primary" block>
                ${0} Open in a Bitcoin Wallet
              </bci-button>
            </a>`), this.invoice, O5) : null, e, t, n ? W(d1 || (d1 = xe`<div class="mt-4 flex flex-col items-center">${0}</div>`), n) : null);
  }
  renderConnectWalletDesktop() {
    let e = null;
    this.paymentMethods !== "all" && this.paymentMethods !== "internal" || (e = W(u1 || (u1 = xe`
        <div class="${0}">
          <bci-button variant="primary" @click=${0}>
            <span class="-ml-0.5">${0}</span>
            Connect Wallet to Pay
          </bci-button>
        </div>
      `), this.paymentMethods !== "internal" ? "mt-8" : "", this._onClickConnectWallet, bn));
    let t = null;
    this.paymentMethods === "all" && (t = W(h1 || (h1 = xe` <div class="w-full py-8">${0}</div> `), P2("or")));
    let n = null;
    return this.paymentMethods !== "all" && this.paymentMethods !== "external" || (n = W(f1 || (f1 = xe`
        <div
          class="flex flex-col items-center ${0}"
        >
          <p class="font-medium ${0}">
            Scan to Pay
          </p>
          ${0}
        </div>
      `), this.paymentMethods === "external" ? "mt-8" : "", re, this.renderQR())), W(p1 || (p1 = xe` ${0} ${0} ${0} `), e, t, n);
  }
  renderQR() {
    if (!this._showQR || !this.invoice) return null;
    const e = this.invoice;
    return setTimeout(() => {
      var t;
      const n = (t = this.shadowRoot) == null ? void 0 : t.getElementById("qr");
      if (!n) return void console.error("qr canvas not found");
      const r = n.getContext("2d");
      if (!r) return void console.error("could not get context for qr canvas");
      const o = Bi(0, "L");
      o.addData(e), o.make();
      const i = o.getModuleCount();
      n.width = 2 * i, n.height = 2 * i, o.renderTo2dContext(r, 2);
    }, 100), W(g1 || (g1 = xe`
      <!-- add margin only on dark mode because on dark mode the qr has a white border -->
      <a href="lightning:${0}" class="dark:mt-2">
        <canvas id="qr" class="dark:bg-white dark:p-4"></canvas>
      </a>
      <button
        @click=${0}
        class="
        flex gap-1
        mt-4
        ${0} ${0}"
        aria-label="${0}"
      >
        ${0}
        ${0}
      </button>
    `), this.invoice, this._copyInvoice, be, Le, this._hasCopiedInvoice ? "Invoice copied to clipboard" : "Copy invoice to clipboard", this._hasCopiedInvoice ? Ki : Qi, this._hasCopiedInvoice ? "Copied!" : "Copy Invoice");
  }
  renderMemo(e) {
    return e.description ? W(w1 || (w1 = xe`
      <p class="text-center mb-6 ${0}">
        ${0}
      </p>
    `), Qe, e.description) : null;
  }
  render() {
    if (!this.invoice) return null;
    let e;
    try {
      e = new n3({ pr: this.invoice });
    } catch (r) {
      return console.error(r), V.getState().setError(r.message), null;
    }
    const t = window.innerWidth < 600;
    let n;
    return t || (this._showQR = !0), n = this.paid ? this.renderPaidState() : this._isPaying ? this.renderPayingState() : this._connected ? this.renderPaymentConfirmation() : W(y1 || (y1 = xe`
        ${0}
        ${0}
      `), this.paymentMethods !== "internal" ? this.renderWaitingForPayment() : null, t ? this.renderConnectWalletMobile() : this.renderConnectWalletDesktop()), W(b1 || (b1 = xe`
      <div class="flex flex-col justify-center items-center font-sans w-full">
        ${0} ${0}
        ${0}
      </div>
    `), this.renderHeading(e), this.renderMemo(e), n);
  }
  _onClickConnectWallet() {
    this.dispatchEvent(new Event("onclickconnectwallet", { bubbles: !0, composed: !0 }));
  }
  _copyAndDisplayInvoice() {
    this._copyInvoice(), this._showQR = !0;
  }
  _copyInvoice() {
    this.invoice && (navigator.clipboard.writeText(this.invoice), this._hasCopiedInvoice = !0, setTimeout(() => {
      this._hasCopiedInvoice = !1;
    }, 2e3));
  }
  async _payInvoice() {
    this._isPaying = !0;
    try {
      const e = V.getState().provider;
      if (!e) throw new Error("No WebLN provider available");
      if (!this.invoice) throw new Error("No invoice to pay");
      const t = await e.sendPayment(this.invoice);
      if (!t.preimage) throw new Error("No preimage in result");
      this.dispatchEvent(new CustomEvent("bc:onpaid", { bubbles: !0, composed: !0, detail: t })), this.paid = !0;
    } catch (e) {
      console.error(e), V.getState().setError(e.message);
    }
    this._isPaying = !1;
  }
};
F([se()], lt.prototype, "_hasCopiedInvoice", void 0), F([se()], lt.prototype, "_isPaying", void 0), F([se()], lt.prototype, "_showQR", void 0), F([me({ type: String })], lt.prototype, "invoice", void 0), F([me({ type: Boolean })], lt.prototype, "paid", void 0), F([me({ type: String, attribute: "payment-methods" })], lt.prototype, "paymentMethods", void 0), lt = F([oe("bc-send-payment")], lt);
const H5 = de(m1 || (m1 = ((e) => e)`<svg class="w-full h-full" width="192" height="192" viewBox="0 0 192 192" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M177.882 96.0013C177.882 114.714 162.712 129.884 144 129.884C125.287 129.884 110.117 114.714 110.117 96.0013C110.117 77.2886 125.287 62.1189 144 62.1189C162.712 62.1189 177.882 77.2886 177.882 96.0013Z" fill="white"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M144 64.2353C126.457 64.2353 112.235 78.4568 112.235 96C112.235 113.543 126.457 127.765 144 127.765C161.543 127.765 175.765 113.543 175.765 96C175.765 78.4568 161.543 64.2353 144 64.2353ZM108 96C108 76.1177 124.118 60 144 60C163.882 60 180 76.1177 180 96C180 115.882 163.882 132 144 132C124.118 132 108 115.882 108 96Z" fill="black"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M144 118.589C156.475 118.589 166.588 108.476 166.588 96.0011C166.588 83.5259 156.475 73.4128 144 73.4128C131.524 73.4128 121.411 83.5259 121.411 96.0011C121.411 108.476 131.524 118.589 144 118.589ZM144 114.001C153.941 114.001 162 105.942 162 96.0011C162 86.06 153.941 78.0011 144 78.0011C134.058 78.0011 126 86.06 126 96.0011C126 105.942 134.058 114.001 144 114.001Z" fill="black"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M144 82.8984C136.765 82.8984 130.899 88.764 130.899 95.9996C130.899 103.235 136.765 109.101 144 109.101L144 82.8984Z" fill="black"/>
<path d="M55.7364 131.166C53.2442 131.712 50.6554 132 47.9994 132C40.7095 132 33.9257 129.833 28.2569 126.108C26.8497 124.095 26.2183 122.987 25.7577 122.179C25.5295 121.778 25.3433 121.452 25.1253 121.125C22.9779 117.671 21.8543 113.235 21.6093 108.023C20.8504 91.8729 30.6653 81.56 40.6919 79.8672C47.0478 78.7942 52.0988 79.8809 55.9729 81.9526C52.5479 81 48.465 80.9425 43.8103 82.275C32.5268 85.912 28.7654 96.9708 30.3776 109.217C33.1913 124.562 48.2372 130.062 55.7364 131.166Z" fill="url(#paint0_linear_1428_3405)"/>
<path d="M23.5983 122.469C21.4995 118.742 19.5989 113.182 19.3614 108.129C18.5557 90.9843 29.0332 79.5543 40.317 77.6493C55.698 75.0526 64.2491 84.1583 67.197 90.9166C67.3202 90.8336 67.3704 90.669 67.3053 90.5274C62.4584 79.9882 52.4338 72.7507 40.854 72.7507C27.7055 72.7507 15.9732 82.1827 12 96.2003C12.0564 106.587 16.512 115.933 23.5983 122.469Z" fill="url(#paint1_linear_1428_3405)"/>
<path d="M68.2493 125.768C65.6525 127.538 62.8124 128.977 59.7892 130.025C58.3376 129.772 56.7293 129.457 55.597 129.235C55.0604 129.13 54.6305 129.046 54.3751 128.999C47.5271 127.749 35.2831 123.336 32.6008 108.867C31.8428 103.049 32.3857 97.6932 34.3078 93.4449C36.2015 89.2598 39.4695 86.0514 44.4537 84.4316C50.2465 82.8534 55.0469 83.6356 58.6125 85.5507C57.7348 85.3655 56.8276 85.2684 55.8993 85.2684C48.1838 85.2684 41.9291 91.9698 41.9291 100.236C41.9291 103.537 42.9263 106.588 44.6156 109.063C44.6156 109.063 49.4514 118.198 62.6156 117.381C74.3533 116.653 80.4488 106.125 81.1752 102.236C81.5528 100.215 81.7502 98.1303 81.7502 95.9997C81.7502 77.3603 66.6399 62.25 48.0004 62.25C33.896 62.25 21.8122 70.9021 16.7672 83.1884C15.0631 85.4082 13.5958 87.8694 12.4135 90.5306C15.0482 73.244 29.9777 60 48.0004 60C67.8826 60 84.0001 76.1176 84.0001 95.9997C84.0001 108.374 77.7573 119.289 68.2493 125.768Z" fill="url(#paint2_linear_1428_3405)"/>
<defs>
<linearGradient id="paint0_linear_1428_3405" x1="34.4824" y1="89.8251" x2="34.4273" y2="121.82" gradientUnits="userSpaceOnUse">
<stop offset="0.0297309" stop-color="#FA3C3C"/>
<stop offset="1" stop-color="#BC1870"/>
</linearGradient>
<linearGradient id="paint1_linear_1428_3405" x1="29.5809" y1="74.6307" x2="27.7982" y2="106.635" gradientUnits="userSpaceOnUse">
<stop stop-color="#FF9F2F"/>
<stop offset="1" stop-color="#FA3C3C"/>
</linearGradient>
<linearGradient id="paint2_linear_1428_3405" x1="54.75" y1="131.25" x2="54.8489" y2="94.125" gradientUnits="userSpaceOnUse">
<stop stop-color="#5B09AD"/>
<stop offset="1" stop-color="#BC1870"/>
</linearGradient>
</defs>
</svg>`));
let v1, D5 = (e) => e, C1 = class extends he()(ae) {
  render() {
    return W(v1 || (v1 = D5`<div>
      <bc-navbar
        class="flex w-full"
        heading="Get a bitcoin lightning wallet"
      ></bc-navbar>

      <div class="flex flex-col gap-5 w-full my-6 px-8 font-sans text-sm">
        <div class="flex flex-row justify-center items-center space-x-4">
          <div class="w-20 h-20 flex items-center justify-center">
            <div
              class="p-2 bg-black drop-shadow rounded-xl flex items-center justify-center"
            >
              ${0}
            </div>
          </div>
          <p class="flex-1 text-sm ${0}">
            To get the best self-custodial bitcoin lightning wallet that can
            connect to apps, try
            <a
              href="https://albyhub.com"
              target="_blank"
              class="no-underline font-bold ${0} ${0}"
              >Alby Hub</a
            >.
          </p>
        </div>
        <div class="flex flex-row items-center space-x-4">
          <div class="w-20 h-20">${0}</div>
          <p class="flex-1 text-sm ${0}">
            For a quick setup of a custodial wallet, you can choose between
            <a
              href="https://rizful.com"
              target="_blank"
              class="no-underline font-bold ${0} ${0}"
              >Rizful</a
            >
            and
            <a
              href="https://coinos.io"
              target="_blank"
              class="no-underline font-bold ${0} ${0}"
              >Coinos</a
            >.
          </p>
        </div>
      </div>
    </div>`), I2, re, Le, be, H5, re, Le, be, Le, be);
  }
};
C1 = F([oe("bc-new-wallet")], C1);
let x1, Z5 = (e) => e, fo = class extends he()(ae) {
  constructor() {
    super(...arguments), this._nwcUrl = "";
  }
  render() {
    return W(x1 || (x1 = Z5`<div class="w-full">
      <bc-navbar class="flex w-full" heading="LN Link"> </bc-navbar>
      <div class="font-sans text-sm w-full">
        <div class="px-8 pt-4 w-full">
          <div class="mb-2 ${0}">
            1. Add a new
            <a
              href="https://github.com/lnfi-network/ln-node/tree/main/LNLink"
              target="_blank"
              class="font-bold"
              >Wallet Connection
            </a>
            from
            <span class="${0}"
              >LN Node => Generate NWC</span
            >
            and copy the Connection Secret.
          </div>
          <div class="mb-1 ${0}">
            2. Paste the Connection Secret below:
          </div>

          <input
            value=${0}
            @change=${0}
            placeholder="nostr+walletconnect://..."
            type="password"
            class="w-full mb-8 rounded-lg p-2 border-1 bg-transparent ${0} ${0}"
          />
          <bci-button variant="primary" @click=${0}>
            Connect
          </bci-button>
        </div>
      </div>
    </div>`), re, Qe, re, this._nwcUrl, this.nwcUrlChanged, Ut, rt, this.onConnect);
  }
  nwcUrlChanged(e) {
    this._nwcUrl = e.target.value;
  }
  async onConnect() {
    this._nwcUrl ? await V.getState().connect({ nwcUrl: this._nwcUrl, connectorName: zi, connectorType: "nwc.generic" }) : V.getState().setError("Please enter a URL");
  }
};
F([se()], fo.prototype, "_nwcUrl", void 0), fo = F([oe("bc-lnfi")], fo);
let E1, W5 = (e) => e, A1 = class extends he()(ae) {
  connectedCallback() {
    super.connectedCallback(), this._timeout = setTimeout(() => {
      ji(), V.setState({ route: "/start" });
    }, 3e3);
  }
  disconnectedCallback() {
    super.disconnectedCallback(), this._timeout && clearTimeout(this._timeout);
  }
  render() {
    return W(E1 || (E1 = W5`<div
      class="flex flex-col justify-center items-center w-full mt-8 ${0}"
    >
      <p class="font-bold">Connected!</p>
      ${0}
    </div>`), be, H2);
  }
};
A1 = F([oe("bc-connected")], A1);
let k1, _1, S1 = (e) => e, Fn = class extends he()(ae) {
  constructor() {
    super(), this._hasCopiedAuthString = !1, this.initAlbyGo();
  }
  disconnectedCallback() {
    var e;
    super.disconnectedCallback(), (e = this._unsub) == null || e.call(this);
  }
  render() {
    return W(k1 || (k1 = S1`<div class="w-full">
      <bc-navbar class="flex w-full" heading="Connect Flash Wallet"></bc-navbar>
      <div class="font-sans text-sm w-full">
        <div
          class="px-8 pt-4 w-full flex flex-col items-center justify-center gap-4"
        >
          <div class="mb-2 text-center ${0}">
            Scan with your camera, or by clicking "Send" in the Flash Wallet
          </div>

          <div class="flex justify-center items-center">
            ${0}
            <p class="${0}">Waiting for connection</p>
          </div>

 
            ${0}

          
          <bci-button
            @click=${0}
            class="
            flex gap-1 w-full
            mt-4
        ${0} ${0} font-semibold text-xs"
          >
            ${0}
            ${0}
          </bci-button>
        </div>

        <div class="flex flex-col items-center w-full font-sans text-sm">
          <h1 class="mt-8 ${0} text-center">
            Don't have the Flash Wallet app?
            <a
              class="no-underline font-bold ${0} ${0}" 
              href="https://paywithflash.com/wallet" target="_blank"
            >Download one here</a>
          </h1>
        </div>
        </div>
      </div>
    </div>`), re, Ot(`w-7 h-7 ${re}`), re, this.renderQR(), this._copyAuthString, be, Le, this._hasCopiedAuthString ? Ki : Qi, this._hasCopiedAuthString ? "Copied!" : "Copy", Sn, Le, be);
  }
  renderQR() {
    if (!this._authString) return null;
    const e = this._authString;
    return setTimeout(() => {
      var t;
      const n = (t = this.shadowRoot) == null ? void 0 : t.getElementById("qr");
      if (!n) return void console.error("qr canvas not found");
      const r = n.getContext("2d");
      if (!r) return void console.error("could not get context for qr canvas");
      const o = Bi(0, "L");
      o.addData(e), o.make();
      const i = o.getModuleCount();
      n.width = 4 * i, n.height = 4 * i, o.renderTo2dContext(r, 4);
    }, 100), W(_1 || (_1 = S1`
      <!-- add margin only on dark mode because on dark mode the qr has a white border -->
      <canvas id="qr" class="dark:bg-white dark:p-4"></canvas>
    `));
  }
  _copyAuthString() {
    this._authString && (navigator.clipboard.writeText(this._authString), this._hasCopiedAuthString = !0, setTimeout(() => {
      this._hasCopiedAuthString = !1;
    }, 2e3));
  }
  async initAlbyGo() {
    try {
      var e;
      const t = (e = V.getState().bitcoinConnectConfig.providerConfig) == null || (e = e.nwc) == null ? void 0 : e.authorizationUrlOptions, n = t?.expiresAt;
      let r = t?.requestMethods;
      r || (r = ["get_info", "get_balance", "get_budget", "pay_invoice", "list_transactions", "lookup_invoice", "make_invoice"]);
      const o = new s2({ name: this._appName, icon: this._appIcon, relayUrls: ["wss://nwclay.paywithflash.com"], requestMethods: r, notificationTypes: t?.notificationTypes, maxAmount: t?.maxAmount, budgetRenewal: t?.budgetRenewal, expiresAt: n ? Math.floor(n.getTime() / 1e3) : void 0, isolated: t?.isolated, metadata: t?.metadata, returnTo: t?.returnTo });
      this._authString = o.connectionUri, window.location.href = this._authString;
      const { unsub: i } = await o.subscribe({ onSuccess: async function(s) {
        s.close(), V.getState().connect({ nwcUrl: s.nostrWalletConnectUrl, connectorName: "Flash Wallet", connectorType: "nwc.flash" });
      } });
      this._unsub = i;
    } catch (t) {
      console.error(t), alert("" + t);
    }
  }
};
F([se()], Fn.prototype, "_authString", void 0), F([se()], Fn.prototype, "_hasCopiedAuthString", void 0), Fn = F([oe("bc-flash-wallet")], Fn);
let L1, T1, F5 = (e) => e, po = class extends he()(ae) {
  constructor() {
    super(...arguments), this._nwcUrl = "";
  }
  render() {
    return W(L1 || (L1 = F5`<div class="w-full">
      <bc-navbar
        class="flex w-full"
        heading=${0}
      ></bc-navbar>
      <div class="font-sans text-sm w-full">
        <div class="px-8 pt-4 w-full">
          <div class="mb-2 ${0}">
            1. In LNBits, go to Plugins and enable the NWC plugin.
          </div>
          <div class="mb-1 ${0}">
            2. Create a new connection and update the relay from "nostrclient"
            to <span class="font-semibold">wss://relay.getalby.com/v1</span>,
            then copy the connection secret.
          </div>
          <div class="mb-1 ${0}">
            3. Paste the Connection Secret below.
          </div>

          <div class="px-8 pt-4 w-full">
            <div class="mb-1 ${0}">
              Enter your
              <a
                href="https://nwc.getalby.com/about"
                target="_blank"
                class="font-bold"
                >Connection Secret
              </a>
              below
            </div>

            <input
              value=${0}
              @change=${0}
              placeholder="nostr+walletconnect://..."
              type="password"
              class="w-full mb-8 rounded-lg p-2 border-1 bg-transparent ${0} ${0}"
            />
            <bci-button variant="primary" @click=${0}>
              Connect
            </bci-button>
          </div>
        </div>
      </div>
    </div>`), zo, re, re, re, re, this._nwcUrl, this.nwcUrlChanged, Ut, rt, this.onConnect);
  }
  nwcUrlChanged(e) {
    this._nwcUrl = e.target.value;
  }
  async onConnect() {
    this._nwcUrl ? await V.getState().connect({ nwcUrl: this._nwcUrl, connectorName: zo, connectorType: "nwc.lnbits" }) : V.getState().setError("Please enter a URL");
  }
};
F([se()], po.prototype, "_nwcUrl", void 0), po = F([oe("bc-lnbits-nwc")], po);
const V5 = de(T1 || (T1 = ((e) => e)`<svg class="w-20 h-20" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
<rect width="17.2816" height="20" fill="url(#pattern0_6321_527)"/>
<defs>
<pattern id="pattern0_6321_527" patternContentUnits="objectBoundingBox" width="1" height="1">
<use xlink:href="#image0_6321_527" transform="matrix(0.00248348 0 0 0.00214592 0.1 0.05)"/>
</pattern>
<image id="image0_6321_527" width="404" height="404" xlink:href="data:image/png;base64,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"/>
</defs>
</svg>
`)), Ko = "Cashu.me";
let M1 = class extends Ve {
  constructor() {
    super("nwc.cashume", Ko, "#7f38ca", V5);
  }
  async _onClick() {
    V.getState().pushRoute("/cashu-me");
  }
};
M1 = F([oe("bc-cashu-me-connector")], M1);
let B1, G5 = (e) => e, go = class extends he()(ae) {
  constructor() {
    super(...arguments), this._nwcUrl = "";
  }
  render() {
    return W(B1 || (B1 = G5`<div class="w-full">
      <bc-navbar
        class="flex w-full"
        heading=${0}
      ></bc-navbar>
      <div class="font-sans text-sm w-full">
        <div class="px-8 pt-4 w-full">
          <div class="mb-2 ${0}">
            1. Open
            <a href="https://wallet.cashu.me" target="_blank" class="font-bold"
              >Cashu.me
            </a>
            , click on the <span class="font-semibold">hamburger menu</span> on
            the top left, then click
            <span class="font-semibold">Settings</span>. Scroll down to
            <span class="font-semibold">Nostr Wallet Connect</span>
            and enable NWC, and then press the copy button.
          </div>
          <div class="mb-1 ${0}">
            2. Keep the Cashu.me browser tab open while using Bitcoin Connect.
          </div>
          <div class="mb-1 ${0}">
            3. Paste the Connection Secret below:
          </div>

          <div class="px-8 pt-4 w-full">
            <div class="mb-1 ${0}">
              Enter your
              <a
                href="https://nwc.getalby.com/about"
                target="_blank"
                class="font-bold"
                >Connection Secret
              </a>
              below
            </div>

            <input
              value=${0}
              @change=${0}
              placeholder="nostr+walletconnect://..."
              type="password"
              class="w-full mb-8 rounded-lg p-2 border-1 bg-transparent ${0} ${0}"
            />
            <bci-button variant="primary" @click=${0}>
              Connect
            </bci-button>
          </div>
        </div>
      </div>
    </div>`), Ko, re, re, re, re, this._nwcUrl, this.nwcUrlChanged, Ut, rt, this.onConnect);
  }
  nwcUrlChanged(e) {
    this._nwcUrl = e.target.value;
  }
  async onConnect() {
    this._nwcUrl ? await V.getState().connect({ nwcUrl: this._nwcUrl, connectorName: Ko, connectorType: "nwc.cashume" }) : V.getState().setError("Please enter a URL");
  }
};
F([se()], go.prototype, "_nwcUrl", void 0), go = F([oe("bc-cashu-me")], go);
let R1, j5 = (e) => e, wo = class extends he()(ae) {
  constructor() {
    super(...arguments), this._nwcUrl = "";
  }
  render() {
    return W(R1 || (R1 = j5`<div class="w-full">
      <bc-navbar
        class="flex w-full"
        heading=${0}
      ></bc-navbar>
      <div class="font-sans text-sm w-full">
        <div class="px-8 pt-4 w-full">
          <div class="mb-2 ${0}">
            1. Open
            <a href="https://rizful.com/w" target="_blank" class="font-bold"
              >Rizful Wallet
            </a>
          </div>
          <div class="mb-2 ${0}">
            2. Click on
            <span class="semibold"
              >Hamburger Menu -> NWC -> Get NWC codes -> New Connection</span
            >. Then click <span class="semibold">Get Connection Code</span> and
            click
            <span class="semibold">Copy Connection Code</span>
          </div>

          <div class="mb-1 ${0}">
            3. Paste the Connection Secret below:
          </div>

          <div class="px-8 pt-4 w-full">
            <div class="mb-1 ${0}">
              Enter your
              <a
                href="https://nwc.getalby.com/about"
                target="_blank"
                class="font-bold"
                >Connection Secret
              </a>
              below
            </div>

            <input
              value=${0}
              @change=${0}
              placeholder="nostr+walletconnect://..."
              type="password"
              class="w-full mb-8 rounded-lg p-2 border-1 bg-transparent ${0} ${0}"
            />
            <bci-button variant="primary" @click=${0}>
              Connect
            </bci-button>
          </div>
        </div>
      </div>
    </div>`), qo, re, re, re, re, this._nwcUrl, this.nwcUrlChanged, Ut, rt, this.onConnect);
  }
  nwcUrlChanged(e) {
    this._nwcUrl = e.target.value;
  }
  async onConnect() {
    this._nwcUrl ? await V.getState().connect({ nwcUrl: this._nwcUrl, connectorName: qo, connectorType: "nwc.rizful" }) : V.getState().setError("Please enter a URL");
  }
};
F([se()], wo.prototype, "_nwcUrl", void 0), wo = F([oe("bc-rizful")], wo);
let N1, $1, I1, U1, O1, P1, H1, D1, Z1, W1, F1, V1, G1, Ie = (e) => e;
const z5 = { "/start": W(N1 || (N1 = Ie`<bc-start class="flex w-full"></bc-start>`)), "/help": W($1 || ($1 = Ie`<bc-help class="flex w-full"></bc-help>`)), "/nwc": W(I1 || (I1 = Ie`<bc-nwc class="flex w-full"></bc-nwc>`)), "/lnfi": W(U1 || (U1 = Ie`<bc-lnfi class="flex w-full"></bc-lnfi>`)), "/alby-hub": W(O1 || (O1 = Ie`<bc-alby-hub class="flex w-full"></bc-alby-hub>`)), "/alby-go": W(P1 || (P1 = Ie`<bc-alby-go class="flex w-full"></bc-alby-go>`)), "/lnbits": W(H1 || (H1 = Ie`<bc-lnbits class="flex w-full"></bc-lnbits>`)), "/lnbits-nwc": W(D1 || (D1 = Ie`<bc-lnbits-nwc class="flex w-full"></bc-lnbits-nwc>`)), "/flash-wallet": W(Z1 || (Z1 = Ie`<bc-flash-wallet
    class="flex w-full"
  ></bc-flash-wallet>`)), "/cashu-me": W(W1 || (W1 = Ie`<bc-cashu-me class="flex w-full"></bc-cashu-me>`)), "/rizful": W(F1 || (F1 = Ie`<bc-rizful class="flex w-full"></bc-rizful>`)), "/new-wallet": W(V1 || (V1 = Ie`<bc-new-wallet class="flex w-full"></bc-new-wallet>`)), "/connected": W(G1 || (G1 = Ie`<bc-connected class="flex w-full"></bc-connected>`)) };
let j1, z1, q5 = (e) => e, q1 = class extends he()(ae) {
  render() {
    return W(j1 || (j1 = q5`<div class="flex flex-col w-full">${0}</div>`), z5[this._route]);
  }
};
q1 = F([oe("bc-router-outlet")], q1);
const K5 = de(z1 || (z1 = ((e) => e)`<svg width="25" height="24" viewBox="0 0 25 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M7.6665 7.16699L12.4998 12.0003M12.4998 12.0003L17.3332 16.8337M12.4998 12.0003L17.3332 7.16699M12.4998 12.0003L7.6665 16.8337" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>`));
let K1;
const Q5 = de(K1 || (K1 = ((e) => e)`<svg width="25" height="24" viewBox="0 0 25 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M12.665 18.33C13.5404 18.3311 14.4074 18.1592 15.2162 17.8242C16.025 17.4892 16.7596 16.9977 17.3778 16.3778C17.9977 15.7596 18.4892 15.025 18.8242 14.2162C19.1592 13.4074 19.3311 12.5404 19.33 11.665C19.3311 10.7896 19.1592 9.92256 18.8242 9.11378C18.4892 8.305 17.9976 7.5704 17.3778 6.95218C16.7596 6.33235 16.025 5.84079 15.2162 5.50577C14.4074 5.17075 13.5404 4.99887 12.665 5.00001C11.7896 4.99889 10.9226 5.17078 10.1138 5.5058C9.305 5.84082 8.5704 6.33236 7.95218 6.95218C7.33236 7.5704 6.84082 8.305 6.5058 9.11378C6.17078 9.92256 5.99889 10.7896 6.00001 11.665C5.99887 12.5404 6.17075 13.4074 6.50577 14.2162C6.84079 15.025 7.33235 15.7596 7.95218 16.3778C8.5704 16.9976 9.305 17.4892 10.1138 17.8242C10.9226 18.1592 11.7896 18.3311 12.665 18.33Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
<path d="M12.6649 12.9149V11.9152C12.9615 11.9152 13.2515 11.8272 13.4981 11.6625C13.7447 11.4977 13.9369 11.2635 14.0504 10.9895C14.1639 10.7155 14.1936 10.4139 14.1357 10.123C14.0779 9.83215 13.935 9.56495 13.7253 9.35523C13.5156 9.14551 13.2484 9.00269 12.9575 8.94483C12.6666 8.88697 12.3651 8.91667 12.091 9.03017C11.817 9.14366 11.5828 9.33587 11.418 9.58247C11.2532 9.82908 11.1653 10.119 11.1653 10.4156" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M12.6653 15.7497C12.8642 15.7497 13.055 15.6707 13.1956 15.5301C13.3363 15.3895 13.4153 15.1987 13.4153 14.9999C13.4153 14.801 13.3363 14.6103 13.1956 14.4696C13.055 14.329 12.8642 14.25 12.6653 14.25C12.4664 14.25 12.2756 14.329 12.135 14.4696C11.9943 14.6103 11.9153 14.801 11.9153 14.9999C11.9153 15.1987 11.9943 15.3895 12.135 15.5301C12.2756 15.6707 12.4664 15.7497 12.6653 15.7497Z" fill="currentColor"/>
</svg>
`));
let Q1, J1, Y1, yo = (e) => e, Vn = class extends he()(ae) {
  render() {
    return W(Q1 || (Q1 = yo`<div
      class="flex justify-center items-center gap-2 w-full relative"
    >
      <div
        class="absolute right-0 h-full flex items-center justify-center gap-2"
      >
        ${0}
        ${0}
      </div>
      <div class="flex items-center justify-center">
        <slot></slot>
      </div>
    </div>`), this.showHelp ? W(J1 || (J1 = yo`<button
              class="${0} ${0}"
              aria-label="Show help"
              @click=${0}
            >
              ${0}
            </button>`), Le, Qe, () => V.getState().pushRoute("/help"), Q5) : null, this.closable ? W(Y1 || (Y1 = yo`<button
              class="${0} ${0}"
              aria-label="Close modal"
              @click=${0}
            >
              ${0}
            </button>`), Le, Qe, this._handleClose, K5) : null);
  }
  _handleClose() {
    this.dispatchEvent(new Event("onclose", { bubbles: !0, composed: !0 }));
  }
};
F([me({ type: Boolean })], Vn.prototype, "closable", void 0), F([me({ type: Boolean, attribute: "show-help" })], Vn.prototype, "showHelp", void 0), Vn = F([oe("bc-modal-header")], Vn);
let X1, J5 = (e) => e, el = class extends he()(ae) {
  constructor() {
    super(...arguments), this._handleClose = () => {
      ji();
    };
  }
  render() {
    return W(X1 || (X1 = J5` <div
      class="fixed top-0 left-0 w-full h-full flex justify-center items-end sm:items-center z-[21000]"
    >
      <div
        class="absolute top-0 left-0 w-full h-full -z-10 bg-black animate-darken"
        @click=${0}
      ></div>
      <div
        class="transition-all p-4 pt-6 pb-8 rounded-2xl shadow-2xl flex flex-col w-full bg-white dark:bg-black max-w-md max-sm:rounded-b-none
        animate-fade-in max-sm:animate-slide-up max-h-[90vh] overflow-y-auto"
      >
        <slot @onclose=${0}></slot>
      </div>
    </div>`), this._handleClose, this._handleClose);
  }
};
el = F([oe("bc-modal")], el);
let tl, nl, Y5 = (e) => e, rl = class extends he()(qt) {
  render() {
    return W(tl || (tl = Y5`
      <div class="flex flex-col items-center justify-center w-full">
        ${0}
        <p class="text-center font-sans ${0}">
          Connecting to wallet...
        </p>
        ${0}
      </div>
    `), Ot(`w-20 h-20 ${Qe} mb-4`), re, qi(void 0));
  }
};
rl = F([oe("bci-connecting")], rl);
const X5 = de(nl || (nl = ((e) => e)`<svg width="116" height="14" viewBox="0 0 116 14" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M6.88623 4.23009C7.4526 4.23009 7.94227 4.33038 8.35525 4.53097C8.76823 4.73156 9.11041 5.00295 9.3818 5.34513C9.65319 5.68732 9.85378 6.0885 9.98357 6.54867C10.1134 7.00885 10.1783 7.50443 10.1783 8.0354C10.1783 8.84956 10.0249 9.62242 9.71809 10.354C9.4231 11.0737 9.01602 11.705 8.49685 12.2478C7.97767 12.7788 7.3641 13.2035 6.65614 13.5221C5.94817 13.8289 5.18121 13.9823 4.35525 13.9823C4.24905 13.9823 4.06026 13.9764 3.78888 13.9646C3.52929 13.9646 3.2284 13.941 2.88622 13.8938C2.54404 13.8466 2.17826 13.7758 1.78888 13.6814C1.41129 13.587 1.05141 13.4572 0.709229 13.292L3.77118 0.424778L6.51454 0L5.4172 4.56637C5.65318 4.46018 5.88917 4.37758 6.12516 4.31858C6.36115 4.25959 6.61484 4.23009 6.88623 4.23009ZM4.58534 11.8053C4.99832 11.8053 5.3877 11.705 5.75348 11.5044C6.11926 11.3038 6.43195 11.0384 6.69153 10.708C6.96292 10.3658 7.17531 9.9823 7.3287 9.55752C7.4821 9.13274 7.55879 8.69027 7.55879 8.23009C7.55879 7.66372 7.4644 7.22124 7.27561 6.90266C7.08681 6.58407 6.73873 6.42478 6.23136 6.42478C6.06616 6.42478 5.84788 6.45428 5.57649 6.51328C5.3169 6.57227 5.08091 6.69617 4.86852 6.88496L3.70038 11.7345C3.77118 11.7463 3.83018 11.7581 3.87737 11.7699C3.93637 11.7817 3.99537 11.7935 4.05436 11.8053C4.11336 11.8053 4.18416 11.8053 4.26675 11.8053C4.34935 11.8053 4.45554 11.8053 4.58534 11.8053Z" fill="currentColor"/>
<path d="M13.1552 13.7345H10.5357L12.7481 4.42478H15.3853L13.1552 13.7345ZM14.4295 3.29204C14.0637 3.29204 13.7333 3.18584 13.4384 2.97345C13.1434 2.74926 12.9959 2.41298 12.9959 1.9646C12.9959 1.71681 13.0431 1.48673 13.1375 1.27434C13.2437 1.05015 13.3794 0.861357 13.5446 0.707964C13.7097 0.542772 13.8985 0.412979 14.1109 0.318584C14.3351 0.224189 14.5711 0.176991 14.8189 0.176991C15.1847 0.176991 15.5151 0.289086 15.81 0.513274C16.105 0.725664 16.2525 1.05605 16.2525 1.50442C16.2525 1.75221 16.1994 1.9882 16.0932 2.21239C15.9988 2.42478 15.869 2.61357 15.7038 2.77876C15.5387 2.93215 15.344 3.05605 15.1198 3.15044C14.9074 3.24484 14.6773 3.29204 14.4295 3.29204Z" fill="currentColor"/>
<path d="M17.7251 2.1062L20.4685 1.68142L19.7959 4.42478H22.734L22.203 6.58407H19.2827L18.5039 9.84071C18.4331 10.1121 18.3859 10.3658 18.3623 10.6018C18.3505 10.8378 18.38 11.0443 18.4508 11.2212C18.5334 11.3864 18.6691 11.5162 18.8579 11.6106C19.0467 11.705 19.3063 11.7522 19.6367 11.7522C19.9198 11.7522 20.1912 11.7286 20.4508 11.6814C20.7222 11.6224 20.9936 11.5457 21.265 11.4513L21.4597 13.469C21.1057 13.5988 20.7222 13.7109 20.3092 13.8053C19.8962 13.8997 19.4066 13.9469 18.8402 13.9469C18.026 13.9469 17.3948 13.8289 16.9464 13.5929C16.498 13.3451 16.1794 13.0148 15.9906 12.6018C15.8018 12.177 15.7192 11.6932 15.7428 11.1504C15.7664 10.6077 15.849 10.0354 15.9906 9.43363L17.7251 2.1062Z" fill="currentColor"/>
<path d="M22.475 10.0177C22.475 9.21534 22.6048 8.46018 22.8644 7.75221C23.124 7.04425 23.4957 6.42478 23.9794 5.89381C24.4632 5.36283 25.0473 4.94395 25.7316 4.63717C26.4278 4.33038 27.2007 4.17699 28.0502 4.17699C28.5812 4.17699 29.0532 4.23009 29.4662 4.33628C29.8909 4.43068 30.2744 4.56047 30.6166 4.72567L29.7139 6.77876C29.478 6.68437 29.2302 6.60177 28.9706 6.53097C28.7228 6.44838 28.416 6.40708 28.0502 6.40708C27.1653 6.40708 26.4691 6.70797 25.9617 7.30974C25.4544 7.89971 25.2007 8.70797 25.2007 9.73452C25.2007 10.3363 25.3305 10.826 25.5901 11.2035C25.8496 11.5693 26.3275 11.7522 27.0237 11.7522C27.3659 11.7522 27.6963 11.7168 28.0148 11.646C28.3334 11.5752 28.6166 11.4867 28.8644 11.3805L29.0591 13.4867C28.7287 13.6165 28.3629 13.7286 27.9617 13.823C27.5724 13.9292 27.0945 13.9823 26.5281 13.9823C25.7965 13.9823 25.1771 13.8761 24.6697 13.6637C24.1623 13.4513 23.7434 13.1681 23.4131 12.8142C23.0827 12.4484 22.8408 12.0236 22.6874 11.5398C22.5458 11.0561 22.475 10.5487 22.475 10.0177Z" fill="currentColor"/>
<path d="M33.8569 13.9823C33.2316 13.9823 32.6888 13.8879 32.2286 13.6991C31.7684 13.5103 31.385 13.2448 31.0782 12.9027C30.7832 12.5605 30.559 12.1593 30.4056 11.6991C30.2522 11.2271 30.1755 10.708 30.1755 10.1416C30.1755 9.43363 30.2876 8.72567 30.5118 8.0177C30.7478 7.30974 31.09 6.67257 31.5383 6.1062C31.9867 5.53982 32.5354 5.07965 33.1844 4.72567C33.8333 4.35988 34.5767 4.17699 35.4145 4.17699C36.028 4.17699 36.5649 4.27139 37.0251 4.46018C37.4971 4.64897 37.8805 4.91445 38.1755 5.25664C38.4823 5.59882 38.7124 6.0059 38.8658 6.47788C39.0192 6.93805 39.0959 7.45133 39.0959 8.0177C39.0959 8.72567 38.9838 9.43363 38.7596 10.1416C38.5354 10.8496 38.205 11.4867 37.7684 12.0531C37.3319 12.6195 36.7832 13.0855 36.1224 13.4513C35.4735 13.8053 34.7183 13.9823 33.8569 13.9823ZM35.1667 6.40708C34.7773 6.40708 34.4351 6.51918 34.1401 6.74336C33.8451 6.96755 33.5973 7.25074 33.3968 7.59292C33.1962 7.9351 33.0428 8.31269 32.9366 8.72567C32.8422 9.12685 32.795 9.51033 32.795 9.87611C32.795 10.4779 32.8894 10.944 33.0782 11.2743C33.267 11.5929 33.6091 11.7522 34.1047 11.7522C34.4941 11.7522 34.8363 11.6401 35.1313 11.4159C35.4263 11.1917 35.674 10.9086 35.8746 10.5664C36.0752 10.2242 36.2227 9.85251 36.3171 9.45133C36.4233 9.03835 36.4764 8.64897 36.4764 8.28319C36.4764 7.68142 36.382 7.22124 36.1932 6.90266C36.0044 6.57227 35.6622 6.40708 35.1667 6.40708Z" fill="currentColor"/>
<path d="M42.0732 13.7345H39.4537L41.6661 4.42478H44.3033L42.0732 13.7345ZM43.3475 3.29204C42.9818 3.29204 42.6514 3.18584 42.3564 2.97345C42.0614 2.74926 41.9139 2.41298 41.9139 1.9646C41.9139 1.71681 41.9611 1.48673 42.0555 1.27434C42.1617 1.05015 42.2974 0.861357 42.4626 0.707964C42.6278 0.542772 42.8166 0.412979 43.0289 0.318584C43.2531 0.224189 43.4891 0.176991 43.7369 0.176991C44.1027 0.176991 44.4331 0.289086 44.7281 0.513274C45.0231 0.725664 45.1705 1.05605 45.1705 1.50442C45.1705 1.75221 45.1174 1.9882 45.0113 2.21239C44.9169 2.42478 44.7871 2.61357 44.6219 2.77876C44.4567 2.93215 44.262 3.05605 44.0378 3.15044C43.8254 3.24484 43.5953 3.29204 43.3475 3.29204Z" fill="currentColor"/>
<path d="M46.2538 4.84956C46.4544 4.79056 46.6727 4.72566 46.9087 4.65487C47.1564 4.57227 47.4278 4.50148 47.7228 4.44248C48.0296 4.37168 48.3659 4.31859 48.7317 4.28319C49.1092 4.23599 49.534 4.21239 50.006 4.21239C51.3983 4.21239 52.3541 4.61357 52.8733 5.41593C53.3924 6.21829 53.4809 7.31564 53.1387 8.70797L51.9352 13.7345H49.298L50.4662 8.81416C50.537 8.50738 50.5901 8.21239 50.6255 7.92921C50.6727 7.63422 50.6727 7.38053 50.6255 7.16814C50.5783 6.94395 50.4662 6.76696 50.2892 6.63717C50.124 6.49558 49.8644 6.42478 49.5104 6.42478C49.1682 6.42478 48.8202 6.46018 48.4662 6.53097L46.7494 13.7345H44.1122L46.2538 4.84956Z" fill="currentColor"/>
<path d="M59.411 14C58.6441 14 57.9656 13.8879 57.3756 13.6637C56.7974 13.4395 56.3137 13.1209 55.9243 12.708C55.5349 12.295 55.2399 11.7994 55.0393 11.2212C54.8505 10.6313 54.7561 9.9705 54.7561 9.23894C54.7561 8.17699 54.9213 7.16224 55.2517 6.19469C55.5939 5.22714 56.0718 4.37168 56.6853 3.62832C57.3107 2.88496 58.06 2.29499 58.9331 1.85841C59.8063 1.41003 60.7798 1.18584 61.8535 1.18584C62.7739 1.18584 63.5054 1.28024 64.0482 1.46903C64.6028 1.65782 64.998 1.83481 65.234 2L64.5261 3.41593C64.2547 3.23894 63.883 3.07375 63.411 2.92035C62.9508 2.75516 62.4022 2.67257 61.765 2.67257C60.9508 2.67257 60.2193 2.86726 59.5703 3.25664C58.9213 3.63422 58.3727 4.1298 57.9243 4.74336C57.4759 5.34513 57.1337 6.0295 56.8977 6.79646C56.6617 7.55162 56.5438 8.30089 56.5438 9.04425C56.5438 11.3451 57.5408 12.4956 59.5349 12.4956C59.9597 12.4956 60.3373 12.4661 60.6677 12.4071C61.0098 12.3481 61.3107 12.2832 61.5703 12.2124C61.8299 12.1298 62.06 12.0413 62.2606 11.9469C62.4612 11.8525 62.6382 11.7699 62.7915 11.6991L63.0039 13.1858C62.8623 13.2684 62.6736 13.3569 62.4376 13.4513C62.2134 13.5457 61.9479 13.6342 61.6411 13.7168C61.3343 13.7994 60.9921 13.8643 60.6146 13.9115C60.237 13.9705 59.8358 14 59.411 14Z" fill="currentColor"/>
<path d="M67.2379 13.9646C66.2703 13.9646 65.5093 13.6814 64.9547 13.115C64.4119 12.5369 64.1406 11.7463 64.1406 10.7434C64.1406 10.059 64.235 9.33924 64.4237 8.58407C64.6243 7.82891 64.937 7.13274 65.3618 6.49558C65.7866 5.85841 66.3352 5.33333 67.0078 4.92035C67.6804 4.50737 68.4945 4.30089 69.4503 4.30089C70.4178 4.30089 71.173 4.58997 71.7158 5.16814C72.2704 5.73451 72.5476 6.51918 72.5476 7.52213C72.5476 8.20649 72.4473 8.92626 72.2468 9.68142C72.058 10.4366 71.7512 11.1327 71.3264 11.7699C70.9016 12.4071 70.353 12.9322 69.6804 13.3451C69.0078 13.7581 68.1937 13.9646 67.2379 13.9646ZM67.5211 12.5664C68.0521 12.5664 68.524 12.413 68.937 12.1062C69.3618 11.7994 69.7158 11.41 69.999 10.9381C70.294 10.4543 70.5181 9.92331 70.6715 9.34513C70.8249 8.76696 70.9016 8.20649 70.9016 7.66372C70.9016 7.06195 70.7718 6.58407 70.5122 6.23009C70.2527 5.87611 69.8043 5.69912 69.1671 5.69912C68.6361 5.69912 68.1583 5.85251 67.7335 6.15929C67.3205 6.46608 66.9665 6.86136 66.6715 7.34513C66.3883 7.81711 66.1701 8.34219 66.0167 8.92036C65.8633 9.49853 65.7866 10.059 65.7866 10.6018C65.7866 11.2035 65.9164 11.6814 66.176 12.0354C66.4355 12.3894 66.8839 12.5664 67.5211 12.5664Z" fill="currentColor"/>
<path d="M74.8253 13.7345H73.1793L75.3032 4.88496C75.8459 4.71977 76.43 4.58997 77.0554 4.49558C77.6926 4.38938 78.2589 4.33628 78.7545 4.33628C79.2855 4.33628 79.7398 4.41298 80.1173 4.56637C80.5067 4.70796 80.8194 4.90856 81.0554 5.16814C81.2914 5.41593 81.4625 5.72271 81.5687 6.0885C81.6867 6.44248 81.7457 6.83186 81.7457 7.25664C81.7457 7.52803 81.7221 7.81711 81.6749 8.1239C81.6277 8.41888 81.5687 8.71977 81.4979 9.02655L80.3651 13.7345H78.7191L79.7634 9.38053C79.8459 9.05015 79.9226 8.71387 79.9934 8.37168C80.076 8.0295 80.1173 7.70502 80.1173 7.39823C80.1173 6.92626 79.9875 6.53687 79.728 6.23009C79.4684 5.91151 78.9846 5.75221 78.2766 5.75221C77.9816 5.75221 77.6926 5.76991 77.4094 5.80531C77.1262 5.84071 76.8902 5.88791 76.7014 5.9469L74.8253 13.7345Z" fill="currentColor"/>
<path d="M84.2197 13.7345H82.5736L84.6975 4.88496C85.2403 4.71977 85.8244 4.58997 86.4498 4.49558C87.0869 4.38938 87.6533 4.33628 88.1489 4.33628C88.6798 4.33628 89.1341 4.41298 89.5117 4.56637C89.9011 4.70796 90.2138 4.90856 90.4498 5.16814C90.6857 5.41593 90.8568 5.72271 90.963 6.0885C91.081 6.44248 91.14 6.83186 91.14 7.25664C91.14 7.52803 91.1164 7.81711 91.0692 8.1239C91.022 8.41888 90.963 8.71977 90.8922 9.02655L89.7595 13.7345H88.1135L89.1577 9.38053C89.2403 9.05015 89.317 8.71387 89.3878 8.37168C89.4704 8.0295 89.5117 7.70502 89.5117 7.39823C89.5117 6.92626 89.3819 6.53687 89.1223 6.23009C88.8627 5.91151 88.379 5.75221 87.671 5.75221C87.376 5.75221 87.0869 5.76991 86.8037 5.80531C86.5206 5.84071 86.2846 5.88791 86.0958 5.9469L84.2197 13.7345Z" fill="currentColor"/>
<path d="M94.2335 8.90266C94.9179 8.87906 95.5432 8.83776 96.1096 8.77876C96.676 8.70797 97.1656 8.59587 97.5786 8.44248C97.9916 8.27729 98.3102 8.059 98.5344 7.78761C98.7704 7.51623 98.8884 7.16224 98.8884 6.72567C98.8884 6.61947 98.8648 6.50738 98.8176 6.38938C98.7822 6.27139 98.7114 6.16519 98.6052 6.0708C98.5108 5.9646 98.3751 5.88201 98.1981 5.82301C98.0211 5.75221 97.8028 5.71682 97.5432 5.71682C97.1302 5.71682 96.7409 5.80531 96.3751 5.9823C96.0211 6.15929 95.7025 6.39528 95.4193 6.69027C95.1361 6.97345 94.8943 7.30974 94.6937 7.69912C94.4931 8.0767 94.3397 8.47788 94.2335 8.90266ZM95.9149 13.9646C95.3131 13.9646 94.794 13.882 94.3574 13.7168C93.9208 13.5398 93.555 13.3038 93.26 13.0089C92.9651 12.7021 92.7468 12.3481 92.6052 11.9469C92.4636 11.5457 92.3928 11.1209 92.3928 10.6726C92.3928 9.84661 92.5167 9.05015 92.7645 8.28319C93.0123 7.51623 93.3662 6.83776 93.8264 6.24779C94.2866 5.65782 94.8471 5.19174 95.5078 4.84956C96.1686 4.49558 96.9179 4.31858 97.7556 4.31858C98.2394 4.31858 98.6524 4.38348 98.9946 4.51328C99.3485 4.63127 99.6317 4.79646 99.8441 5.00885C100.068 5.22124 100.234 5.46903 100.34 5.75221C100.446 6.0236 100.499 6.30679 100.499 6.60177C100.499 7.15634 100.399 7.62832 100.198 8.0177C99.9975 8.39528 99.732 8.71387 99.4016 8.97345C99.0713 9.23304 98.6819 9.43363 98.2335 9.57522C97.7969 9.71682 97.3367 9.82891 96.853 9.91151C96.381 9.9941 95.8972 10.0531 95.4016 10.0885C94.9179 10.1121 94.4577 10.1357 94.0211 10.1593C94.0093 10.2537 94.0034 10.3304 94.0034 10.3894C94.0034 10.4484 94.0034 10.4956 94.0034 10.531C94.0034 10.8024 94.0329 11.0619 94.0919 11.3097C94.1627 11.5457 94.2866 11.7581 94.4636 11.9469C94.6406 12.1239 94.8825 12.2655 95.1892 12.3717C95.5078 12.4779 95.9208 12.531 96.4282 12.531C96.6524 12.531 96.8825 12.5133 97.1185 12.4779C97.3662 12.4307 97.5963 12.3776 97.8087 12.3186C98.0329 12.2478 98.2276 12.1829 98.3928 12.1239C98.5698 12.0531 98.6937 11.9882 98.7645 11.9292L98.9061 13.3274C98.6701 13.4572 98.2866 13.5929 97.7556 13.7345C97.2364 13.8879 96.6229 13.9646 95.9149 13.9646Z" fill="currentColor"/>
<path d="M101.199 10.4425C101.199 9.64012 101.317 8.86726 101.553 8.1239C101.801 7.38053 102.161 6.72567 102.633 6.15929C103.105 5.59292 103.683 5.14454 104.368 4.81416C105.052 4.47198 105.837 4.30089 106.722 4.30089C107.111 4.30089 107.483 4.33038 107.837 4.38938C108.191 4.43658 108.527 4.53687 108.846 4.69027L108.226 6.0708C108.037 5.9646 107.813 5.88201 107.553 5.82301C107.306 5.76401 106.981 5.73451 106.58 5.73451C106.002 5.73451 105.483 5.86431 105.022 6.1239C104.562 6.37168 104.167 6.70797 103.837 7.13274C103.518 7.54572 103.27 8.0295 103.093 8.58407C102.928 9.12685 102.846 9.69322 102.846 10.2832C102.846 10.59 102.875 10.8791 102.934 11.1504C103.005 11.4218 103.123 11.6637 103.288 11.8761C103.453 12.0767 103.671 12.236 103.943 12.354C104.226 12.472 104.58 12.531 105.005 12.531C105.217 12.531 105.441 12.5133 105.677 12.4779C105.913 12.4307 106.132 12.3776 106.332 12.3186C106.533 12.2596 106.71 12.2006 106.863 12.1416C107.028 12.0708 107.146 12.0059 107.217 11.9469L107.359 13.3451C107.135 13.4867 106.787 13.6224 106.315 13.7522C105.843 13.8938 105.306 13.9646 104.704 13.9646C104.138 13.9646 103.636 13.882 103.199 13.7168C102.763 13.5398 102.397 13.2979 102.102 12.9912C101.807 12.6726 101.583 12.3009 101.43 11.8761C101.276 11.4395 101.199 10.9617 101.199 10.4425Z" fill="currentColor"/>
<path d="M111.557 13.9823C110.672 13.9823 110.023 13.7876 109.61 13.3982C109.197 13.0089 108.99 12.4425 108.99 11.6991C108.99 11.2153 109.073 10.5959 109.238 9.84071L111.132 1.9646L112.849 1.68142L112.158 4.53097H115.291L114.955 5.91151H111.822L110.849 9.9823C110.707 10.5369 110.636 11.0207 110.636 11.4336C110.636 11.823 110.742 12.1062 110.955 12.2832C111.167 12.4484 111.521 12.531 112.017 12.531C112.359 12.531 112.695 12.4779 113.026 12.3717C113.356 12.2537 113.61 12.1475 113.787 12.0531L113.91 13.4513C113.734 13.5575 113.433 13.6696 113.008 13.7876C112.583 13.9174 112.099 13.9823 111.557 13.9823Z" fill="currentColor"/>
</svg>

`));
let ol;
const e6 = de(ol || (ol = ((e) => e)`<svg width="15" height="14" viewBox="0 0 15 14" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M14.4996 8.6934C13.5646 12.4434 9.76602 14.7256 6.01514 13.7905C2.26579 12.8555 -0.0166852 9.05718 0.918793 5.30739C1.8534 1.55695 5.65197 -0.725474 9.40176 0.209458C13.1524 1.14439 15.4347 4.94318 14.4996 8.6934Z" fill="currentColor"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M9.52902 4.06707C10.5141 4.44605 11.2102 4.99957 11.0511 5.97269C10.9624 6.52101 10.7122 6.8585 10.3665 7.04603C10.236 7.1168 10.2072 7.33609 10.3231 7.42878C10.8196 7.82585 11.0179 8.38842 10.7056 9.24266C10.2505 10.4885 9.22882 10.6202 7.87222 10.3663C7.78904 10.3508 7.70726 10.4014 7.68566 10.4832L7.52414 11.0824C7.46306 11.3138 7.22603 11.4518 6.99467 11.3908C6.76319 11.3298 6.62506 11.0926 6.68618 10.8612L6.84101 10.2875C6.86324 10.2033 6.81295 10.1171 6.72884 10.0946C6.61038 10.0629 6.49041 10.0301 6.36863 9.99598C6.28341 9.9721 6.19494 10.0224 6.17237 10.108L6.01688 10.6851C5.95588 10.9163 5.71897 11.0543 5.48775 10.9932C5.25664 10.9322 5.11869 10.6955 5.17961 10.4643L5.33952 9.86967C5.36188 9.78479 5.31155 9.69775 5.22691 9.67449C5.1995 9.66696 5.17203 9.6594 5.1445 9.65182L5.1436 9.65157C5.02458 9.6188 4.90431 9.58569 4.78256 9.55341L4.50468 9.47686C4.19755 9.39585 4.03663 9.05848 4.16696 8.76881C4.27134 8.53681 4.52958 8.41694 4.77541 8.48242C4.77988 8.48361 4.7843 8.48479 4.78868 8.48595C4.84757 8.50157 4.84473 8.49023 4.90409 8.4765C5.02494 8.44855 5.08888 8.34885 5.11971 8.2752L5.69957 6.078L5.70108 6.07204L6.11095 4.51802C6.11349 4.5084 6.11518 4.49858 6.11565 4.48865C6.12282 4.33833 6.18991 4.18684 5.97081 4.08327C5.92336 4.06085 5.87669 4.03952 5.82597 4.02603C5.81758 4.0238 5.80892 4.02151 5.80003 4.01918C5.55193 3.954 5.40061 3.7018 5.46597 3.45375C5.53051 3.20887 5.78141 3.06273 6.02626 3.12741L6.51367 3.26409C6.63858 3.29693 6.76622 3.3287 6.89587 3.36037C6.97969 3.38084 7.06441 3.3303 7.08644 3.24687L7.22919 2.722C7.29025 2.49074 7.52721 2.35275 7.75848 2.41376C7.9898 2.47479 8.12784 2.71179 8.0668 2.94311L7.93196 3.43844C7.90985 3.52223 7.96087 3.6078 8.04506 3.62833C8.16859 3.65845 8.29203 3.6889 8.41417 3.72009C8.4966 3.74114 8.58086 3.69207 8.60256 3.60981L8.73588 3.11979C8.79692 2.88839 9.03398 2.75027 9.26539 2.81129C9.49683 2.87232 9.63496 3.10941 9.57392 3.34084L9.42905 3.87456C9.40794 3.95461 9.45175 4.03735 9.52902 4.06707ZM7.41985 5.36848L7.53445 4.93355C7.58781 4.73103 7.79524 4.61012 7.99776 4.66348C8.20028 4.71684 8.32119 4.92427 8.26783 5.12679L8.15323 5.56172L8.58812 5.67631C8.79064 5.72967 8.91155 5.9371 8.85819 6.13962C8.80483 6.34214 8.5974 6.46305 8.39488 6.40969L7.95999 6.2951L7.84539 6.73004C7.79203 6.93256 7.5846 7.05348 7.38208 7.00012C7.17956 6.94675 7.05865 6.73932 7.11201 6.53681L7.22661 6.10186L6.79163 5.98725C6.58911 5.93389 6.4682 5.72646 6.52156 5.52394C6.57492 5.32142 6.78235 5.20051 6.98487 5.25387L7.41985 5.36848ZM8.44291 7.37958L8.32831 7.81451L7.89332 7.6999C7.6908 7.64654 7.48337 7.76745 7.43001 7.96997C7.37665 8.17249 7.49757 8.37992 7.70008 8.43328L8.13507 8.54789L8.02046 8.98284C7.9671 9.18536 8.08802 9.39279 8.29054 9.44615C8.49305 9.49951 8.70048 9.37859 8.75385 9.17608L8.86845 8.74113L9.30334 8.85572C9.50585 8.90908 9.71328 8.78817 9.76665 8.58565C9.82001 8.38313 9.69909 8.1757 9.49658 8.12234L9.06169 8.00775L9.17629 7.57282C9.22965 7.3703 9.10873 7.16287 8.90621 7.10951C8.7037 7.05615 8.49627 7.17707 8.44291 7.37958Z" fill="white"/>
</svg>`));
let il, bo, sl, al, cl, ll, dl, hn = (e) => e, mo = (bo = class extends (il = he()(ae)) {
  render() {
    return W(sl || (sl = hn`<div class="w-full flex-col justify-center items-center">
      <bc-modal-header class="flex w-full" show-help ?closable=${0}>
        <div class="${0} mr-[2px]">
          ${0}
        </div>
        <div class="${0}">${0}</div>
      </bc-modal-header>
      <div class="flex w-full pt-8">
        ${0}
      </div>
      ${0}
    </div>`), this.closable, be, e6, rt, X5, W(this._connecting ? al || (al = hn`<bci-connecting class="flex w-full"></bci-connecting>`) : cl || (cl = hn` <bc-router-outlet class="flex w-full"></bc-router-outlet>`)), this._error ? W(ll || (ll = hn`<p class="mt-4 text-center font-sans text-red-500">
            ${0}
          </p>`), this._error) : null);
  }
}, bo.styles = [...il.styles, Lr(dl || (dl = hn`
      :host {
        display: flex;
        justify-content: center;
        width: 100%;
      }
    `))], bo);
F([me({ type: Boolean })], mo.prototype, "closable", void 0), mo = F([oe("bc-connect")], mo);
let ul, vo, hl, fl, pl, gl, Gn = (e) => e, _t = (vo = class extends (ul = he()(ae)) {
  constructor() {
    super(), this.paymentMethods = "all", this._showConnect = !1, V.subscribe((e, t) => {
      e.connected !== t.connected && e.connected && (this._showConnect = !1);
    });
  }
  render() {
    return this._showConnect && !this.paid ? W(hl || (hl = Gn` <bc-connect ?closable=${0}></bc-connect>`), !0) : W(fl || (fl = Gn`<div class="w-full flex-col justify-center items-center">
          <bc-modal-header class="flex w-full" ?closable=${0}>
            <p
              class="font-sans font-medium ${0}"
            >
              Payment Request
            </p>
          </bc-modal-header>
          <div class="flex flex-col justify-center items-center w-full pt-8">
            <bc-send-payment
              .invoice=${0}
              .paymentMethods=${0}
              ?paid=${0}
              @onclickconnectwallet=${0}
            ></bc-send-payment>
          </div>
          ${0}
        </div>`), this.closable, re, this.invoice, this.paymentMethods, this.paid, this._onClickConnectWallet, this._error ? W(pl || (pl = Gn`<p class="mt-4 text-center font-sans text-red-500">
                ${0}
              </p>`), this._error) : null);
  }
  _onClickConnectWallet() {
    this._showConnect = !0;
  }
}, vo.styles = [...ul.styles, Lr(gl || (gl = Gn`
      :host {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
      }
    `))], vo);
F([me({ type: Boolean })], _t.prototype, "closable", void 0), F([me({ type: String })], _t.prototype, "invoice", void 0), F([me({ type: String, attribute: "payment-methods" })], _t.prototype, "paymentMethods", void 0), F([me({ type: Boolean })], _t.prototype, "paid", void 0), F([se()], _t.prototype, "_showConnect", void 0), _t = F([oe("bc-payment")], _t);
const f6 = { NostrWebLNProvider: Ar, LNCWebLNProvider: d2, LnbitsWebLNProvider: u2 };
export {
  Za as AlbyHubConnector,
  Zt as Balance,
  Pn as Button,
  Ya as CoinosConnector,
  mo as ConnectFlow,
  ao as ConnectorList,
  Dn as CurrencySwitcher,
  Ha as ExtensionConnector,
  ec as FlashConnector,
  Fa as GenericNWCConnector,
  ja as LNBitsConnector,
  Ga as LNCConnector,
  qa as LNbitsNWCConnector,
  Qa as LnfiNWCConnector,
  el as Modal,
  ct as PayButton,
  tc as RizfulConnector,
  lt as SendPayment,
  _t as SendPaymentFlow,
  f6 as WebLNProviders,
  U2 as albyHubConnectorTitle,
  ji as closeModal,
  C5 as coinosConnectorTitle,
  l6 as connect,
  d6 as connectNWC,
  u6 as disconnect,
  E5 as flashConnectorTitle,
  zi as genericConnectorTitle,
  h6 as getConnectorConfig,
  a6 as init,
  s6 as isConnected,
  $2 as launchModal,
  l5 as launchPaymentModal,
  jo as lnbitsConnectorTitle,
  zo as lnbitsNWCConnectorTitle,
  m5 as lnfiConnectorTitle,
  c5 as onConnected,
  n6 as onConnecting,
  r6 as onDisconnected,
  N2 as onModalClosed,
  o6 as onModalOpened,
  c6 as refreshBalance,
  i6 as requestProvider,
  qo as rizfulConnectorTitle
};
