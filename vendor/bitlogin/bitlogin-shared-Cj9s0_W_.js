const pt = typeof globalThis == "object" && "crypto" in globalThis ? globalThis.crypto : void 0;
/*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) */
function ee(t) {
  return t instanceof Uint8Array || ArrayBuffer.isView(t) && t.constructor.name === "Uint8Array";
}
function zt(t) {
  if (!Number.isSafeInteger(t) || t < 0)
    throw new Error("positive integer expected, got " + t);
}
function lt(t, ...e) {
  if (!ee(t))
    throw new Error("Uint8Array expected");
  if (e.length > 0 && !e.includes(t.length))
    throw new Error("Uint8Array expected of length " + e + ", got length=" + t.length);
}
function ne(t) {
  if (typeof t != "function" || typeof t.create != "function")
    throw new Error("Hash should be wrapped by utils.createHasher");
  zt(t.outputLen), zt(t.blockLen);
}
function Ft(t, e = !0) {
  if (t.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (e && t.finished)
    throw new Error("Hash#digest() has already been called");
}
function Vn(t, e) {
  lt(t);
  const r = e.outputLen;
  if (t.length < r)
    throw new Error("digestInto() expects output buffer of length at least " + r);
}
function bt(...t) {
  for (let e = 0; e < t.length; e++)
    t[e].fill(0);
}
function ce(t) {
  return new DataView(t.buffer, t.byteOffset, t.byteLength);
}
function J(t, e) {
  return t << 32 - e | t >>> e;
}
const rn = /* @ts-ignore */ typeof Uint8Array.from([]).toHex == "function" && typeof Uint8Array.fromHex == "function", Kn = /* @__PURE__ */ Array.from({ length: 256 }, (t, e) => e.toString(16).padStart(2, "0"));
function Et(t) {
  if (lt(t), rn)
    return t.toHex();
  let e = "";
  for (let r = 0; r < t.length; r++)
    e += Kn[t[r]];
  return e;
}
const et = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
function qe(t) {
  if (t >= et._0 && t <= et._9)
    return t - et._0;
  if (t >= et.A && t <= et.F)
    return t - (et.A - 10);
  if (t >= et.a && t <= et.f)
    return t - (et.a - 10);
}
function jt(t) {
  if (typeof t != "string")
    throw new Error("hex string expected, got " + typeof t);
  if (rn)
    return Uint8Array.fromHex(t);
  const e = t.length, r = e / 2;
  if (e % 2)
    throw new Error("hex string expected, got unpadded hex of length " + e);
  const n = new Uint8Array(r);
  for (let o = 0, s = 0; o < r; o++, s += 2) {
    const i = qe(t.charCodeAt(s)), c = qe(t.charCodeAt(s + 1));
    if (i === void 0 || c === void 0) {
      const a = t[s] + t[s + 1];
      throw new Error('hex string expected, got non-hex character "' + a + '" at index ' + s);
    }
    n[o] = i * 16 + c;
  }
  return n;
}
const Zn = async () => {
};
async function so(t, e, r) {
  let n = Date.now();
  for (let o = 0; o < t; o++) {
    r(o);
    const s = Date.now() - n;
    s >= 0 && s < e || (await Zn(), n += s);
  }
}
function ve(t) {
  if (typeof t != "string")
    throw new Error("string expected");
  return new Uint8Array(new TextEncoder().encode(t));
}
function Rt(t) {
  return typeof t == "string" && (t = ve(t)), lt(t), t;
}
function io(t) {
  return typeof t == "string" && (t = ve(t)), lt(t), t;
}
function Q(...t) {
  let e = 0;
  for (let n = 0; n < t.length; n++) {
    const o = t[n];
    lt(o), e += o.length;
  }
  const r = new Uint8Array(e);
  for (let n = 0, o = 0; n < t.length; n++) {
    const s = t[n];
    r.set(s, o), o += s.length;
  }
  return r;
}
function co(t, e) {
  if (e !== void 0 && {}.toString.call(e) !== "[object Object]")
    throw new Error("options should be object or undefined");
  return Object.assign(t, e);
}
class on {
}
function sn(t) {
  const e = (n) => t().update(Rt(n)).digest(), r = t();
  return e.outputLen = r.outputLen, e.blockLen = r.blockLen, e.create = () => t(), e;
}
function re(t = 32) {
  if (pt && typeof pt.getRandomValues == "function")
    return pt.getRandomValues(new Uint8Array(t));
  if (pt && typeof pt.randomBytes == "function")
    return Uint8Array.from(pt.randomBytes(t));
  throw new Error("crypto.getRandomValues must be defined");
}
function Mn(t, e, r, n) {
  if (typeof t.setBigUint64 == "function")
    return t.setBigUint64(e, r, n);
  const o = BigInt(32), s = BigInt(4294967295), i = Number(r >> o & s), c = Number(r & s), a = n ? 4 : 0, l = n ? 0 : 4;
  t.setUint32(e + a, i, n), t.setUint32(e + l, c, n);
}
function Dn(t, e, r) {
  return t & e ^ ~t & r;
}
function zn(t, e, r) {
  return t & e ^ t & r ^ e & r;
}
class cn extends on {
  constructor(e, r, n, o) {
    super(), this.finished = !1, this.length = 0, this.pos = 0, this.destroyed = !1, this.blockLen = e, this.outputLen = r, this.padOffset = n, this.isLE = o, this.buffer = new Uint8Array(e), this.view = ce(this.buffer);
  }
  update(e) {
    Ft(this), e = Rt(e), lt(e);
    const { view: r, buffer: n, blockLen: o } = this, s = e.length;
    for (let i = 0; i < s; ) {
      const c = Math.min(o - this.pos, s - i);
      if (c === o) {
        const a = ce(e);
        for (; o <= s - i; i += o)
          this.process(a, i);
        continue;
      }
      n.set(e.subarray(i, i + c), this.pos), this.pos += c, i += c, this.pos === o && (this.process(r, 0), this.pos = 0);
    }
    return this.length += e.length, this.roundClean(), this;
  }
  digestInto(e) {
    Ft(this), Vn(e, this), this.finished = !0;
    const { buffer: r, view: n, blockLen: o, isLE: s } = this;
    let { pos: i } = this;
    r[i++] = 128, bt(this.buffer.subarray(i)), this.padOffset > o - i && (this.process(n, 0), i = 0);
    for (let h = i; h < o; h++)
      r[h] = 0;
    Mn(n, o - 8, BigInt(this.length * 8), s), this.process(n, 0);
    const c = ce(e), a = this.outputLen;
    if (a % 4)
      throw new Error("_sha2: outputLen should be aligned to 32bit");
    const l = a / 4, b = this.get();
    if (l > b.length)
      throw new Error("_sha2: outputLen bigger than state");
    for (let h = 0; h < l; h++)
      c.setUint32(4 * h, b[h], s);
  }
  digest() {
    const { buffer: e, outputLen: r } = this;
    this.digestInto(e);
    const n = e.slice(0, r);
    return this.destroy(), n;
  }
  _cloneInto(e) {
    e || (e = new this.constructor()), e.set(...this.get());
    const { blockLen: r, buffer: n, length: o, finished: s, destroyed: i, pos: c } = this;
    return e.destroyed = i, e.finished = s, e.length = o, e.pos = c, o % r && e.buffer.set(n), e;
  }
  clone() {
    return this._cloneInto();
  }
}
const it = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]), M = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  4089235720,
  3144134277,
  2227873595,
  1013904242,
  4271175723,
  2773480762,
  1595750129,
  1359893119,
  2917565137,
  2600822924,
  725511199,
  528734635,
  4215389547,
  1541459225,
  327033209
]), Tt = /* @__PURE__ */ BigInt(2 ** 32 - 1), Ve = /* @__PURE__ */ BigInt(32);
function Fn(t, e = !1) {
  return e ? { h: Number(t & Tt), l: Number(t >> Ve & Tt) } : { h: Number(t >> Ve & Tt) | 0, l: Number(t & Tt) | 0 };
}
function jn(t, e = !1) {
  const r = t.length;
  let n = new Uint32Array(r), o = new Uint32Array(r);
  for (let s = 0; s < r; s++) {
    const { h: i, l: c } = Fn(t[s], e);
    [n[s], o[s]] = [i, c];
  }
  return [n, o];
}
const Ke = (t, e, r) => t >>> r, Ze = (t, e, r) => t << 32 - r | e >>> r, mt = (t, e, r) => t >>> r | e << 32 - r, xt = (t, e, r) => t << 32 - r | e >>> r, qt = (t, e, r) => t << 64 - r | e >>> r - 32, Vt = (t, e, r) => t >>> r - 32 | e << 64 - r;
function nt(t, e, r, n) {
  const o = (e >>> 0) + (n >>> 0);
  return { h: t + r + (o / 2 ** 32 | 0) | 0, l: o | 0 };
}
const Gn = (t, e, r) => (t >>> 0) + (e >>> 0) + (r >>> 0), Yn = (t, e, r, n) => e + r + n + (t / 2 ** 32 | 0) | 0, Pn = (t, e, r, n) => (t >>> 0) + (e >>> 0) + (r >>> 0) + (n >>> 0), Xn = (t, e, r, n, o) => e + r + n + o + (t / 2 ** 32 | 0) | 0, Wn = (t, e, r, n, o) => (t >>> 0) + (e >>> 0) + (r >>> 0) + (n >>> 0) + (o >>> 0), Jn = (t, e, r, n, o, s) => e + r + n + o + s + (t / 2 ** 32 | 0) | 0, Qn = /* @__PURE__ */ Uint32Array.from([
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
]), ct = /* @__PURE__ */ new Uint32Array(64);
class tr extends cn {
  constructor(e = 32) {
    super(64, e, 8, !1), this.A = it[0] | 0, this.B = it[1] | 0, this.C = it[2] | 0, this.D = it[3] | 0, this.E = it[4] | 0, this.F = it[5] | 0, this.G = it[6] | 0, this.H = it[7] | 0;
  }
  get() {
    const { A: e, B: r, C: n, D: o, E: s, F: i, G: c, H: a } = this;
    return [e, r, n, o, s, i, c, a];
  }
  // prettier-ignore
  set(e, r, n, o, s, i, c, a) {
    this.A = e | 0, this.B = r | 0, this.C = n | 0, this.D = o | 0, this.E = s | 0, this.F = i | 0, this.G = c | 0, this.H = a | 0;
  }
  process(e, r) {
    for (let h = 0; h < 16; h++, r += 4)
      ct[h] = e.getUint32(r, !1);
    for (let h = 16; h < 64; h++) {
      const f = ct[h - 15], u = ct[h - 2], y = J(f, 7) ^ J(f, 18) ^ f >>> 3, m = J(u, 17) ^ J(u, 19) ^ u >>> 10;
      ct[h] = m + ct[h - 7] + y + ct[h - 16] | 0;
    }
    let { A: n, B: o, C: s, D: i, E: c, F: a, G: l, H: b } = this;
    for (let h = 0; h < 64; h++) {
      const f = J(c, 6) ^ J(c, 11) ^ J(c, 25), u = b + f + Dn(c, a, l) + Qn[h] + ct[h] | 0, m = (J(n, 2) ^ J(n, 13) ^ J(n, 22)) + zn(n, o, s) | 0;
      b = l, l = a, a = c, c = i + u | 0, i = s, s = o, o = n, n = u + m | 0;
    }
    n = n + this.A | 0, o = o + this.B | 0, s = s + this.C | 0, i = i + this.D | 0, c = c + this.E | 0, a = a + this.F | 0, l = l + this.G | 0, b = b + this.H | 0, this.set(n, o, s, i, c, a, l, b);
  }
  roundClean() {
    bt(ct);
  }
  destroy() {
    this.set(0, 0, 0, 0, 0, 0, 0, 0), bt(this.buffer);
  }
}
const fn = jn([
  "0x428a2f98d728ae22",
  "0x7137449123ef65cd",
  "0xb5c0fbcfec4d3b2f",
  "0xe9b5dba58189dbbc",
  "0x3956c25bf348b538",
  "0x59f111f1b605d019",
  "0x923f82a4af194f9b",
  "0xab1c5ed5da6d8118",
  "0xd807aa98a3030242",
  "0x12835b0145706fbe",
  "0x243185be4ee4b28c",
  "0x550c7dc3d5ffb4e2",
  "0x72be5d74f27b896f",
  "0x80deb1fe3b1696b1",
  "0x9bdc06a725c71235",
  "0xc19bf174cf692694",
  "0xe49b69c19ef14ad2",
  "0xefbe4786384f25e3",
  "0x0fc19dc68b8cd5b5",
  "0x240ca1cc77ac9c65",
  "0x2de92c6f592b0275",
  "0x4a7484aa6ea6e483",
  "0x5cb0a9dcbd41fbd4",
  "0x76f988da831153b5",
  "0x983e5152ee66dfab",
  "0xa831c66d2db43210",
  "0xb00327c898fb213f",
  "0xbf597fc7beef0ee4",
  "0xc6e00bf33da88fc2",
  "0xd5a79147930aa725",
  "0x06ca6351e003826f",
  "0x142929670a0e6e70",
  "0x27b70a8546d22ffc",
  "0x2e1b21385c26c926",
  "0x4d2c6dfc5ac42aed",
  "0x53380d139d95b3df",
  "0x650a73548baf63de",
  "0x766a0abb3c77b2a8",
  "0x81c2c92e47edaee6",
  "0x92722c851482353b",
  "0xa2bfe8a14cf10364",
  "0xa81a664bbc423001",
  "0xc24b8b70d0f89791",
  "0xc76c51a30654be30",
  "0xd192e819d6ef5218",
  "0xd69906245565a910",
  "0xf40e35855771202a",
  "0x106aa07032bbd1b8",
  "0x19a4c116b8d2d0c8",
  "0x1e376c085141ab53",
  "0x2748774cdf8eeb99",
  "0x34b0bcb5e19b48a8",
  "0x391c0cb3c5c95a63",
  "0x4ed8aa4ae3418acb",
  "0x5b9cca4f7763e373",
  "0x682e6ff3d6b2b8a3",
  "0x748f82ee5defb2fc",
  "0x78a5636f43172f60",
  "0x84c87814a1f0ab72",
  "0x8cc702081a6439ec",
  "0x90befffa23631e28",
  "0xa4506cebde82bde9",
  "0xbef9a3f7b2c67915",
  "0xc67178f2e372532b",
  "0xca273eceea26619c",
  "0xd186b8c721c0c207",
  "0xeada7dd6cde0eb1e",
  "0xf57d4f7fee6ed178",
  "0x06f067aa72176fba",
  "0x0a637dc5a2c898a6",
  "0x113f9804bef90dae",
  "0x1b710b35131c471b",
  "0x28db77f523047d84",
  "0x32caab7b40c72493",
  "0x3c9ebe0a15c9bebc",
  "0x431d67c49c100d4c",
  "0x4cc5d4becb3e42b6",
  "0x597f299cfc657e2a",
  "0x5fcb6fab3ad6faec",
  "0x6c44198c4a475817"
].map((t) => BigInt(t))), er = fn[0], nr = fn[1], ft = /* @__PURE__ */ new Uint32Array(80), at = /* @__PURE__ */ new Uint32Array(80);
class rr extends cn {
  constructor(e = 64) {
    super(128, e, 16, !1), this.Ah = M[0] | 0, this.Al = M[1] | 0, this.Bh = M[2] | 0, this.Bl = M[3] | 0, this.Ch = M[4] | 0, this.Cl = M[5] | 0, this.Dh = M[6] | 0, this.Dl = M[7] | 0, this.Eh = M[8] | 0, this.El = M[9] | 0, this.Fh = M[10] | 0, this.Fl = M[11] | 0, this.Gh = M[12] | 0, this.Gl = M[13] | 0, this.Hh = M[14] | 0, this.Hl = M[15] | 0;
  }
  // prettier-ignore
  get() {
    const { Ah: e, Al: r, Bh: n, Bl: o, Ch: s, Cl: i, Dh: c, Dl: a, Eh: l, El: b, Fh: h, Fl: f, Gh: u, Gl: y, Hh: m, Hl: I } = this;
    return [e, r, n, o, s, i, c, a, l, b, h, f, u, y, m, I];
  }
  // prettier-ignore
  set(e, r, n, o, s, i, c, a, l, b, h, f, u, y, m, I) {
    this.Ah = e | 0, this.Al = r | 0, this.Bh = n | 0, this.Bl = o | 0, this.Ch = s | 0, this.Cl = i | 0, this.Dh = c | 0, this.Dl = a | 0, this.Eh = l | 0, this.El = b | 0, this.Fh = h | 0, this.Fl = f | 0, this.Gh = u | 0, this.Gl = y | 0, this.Hh = m | 0, this.Hl = I | 0;
  }
  process(e, r) {
    for (let B = 0; B < 16; B++, r += 4)
      ft[B] = e.getUint32(r), at[B] = e.getUint32(r += 4);
    for (let B = 16; B < 80; B++) {
      const V = ft[B - 15] | 0, q = at[B - 15] | 0, W = mt(V, q, 1) ^ mt(V, q, 8) ^ Ke(V, q, 7), st = xt(V, q, 1) ^ xt(V, q, 8) ^ Ze(V, q, 7), K = ft[B - 2] | 0, U = at[B - 2] | 0, tt = mt(K, U, 19) ^ qt(K, U, 61) ^ Ke(K, U, 6), P = xt(K, U, 19) ^ Vt(K, U, 61) ^ Ze(K, U, 6), H = Pn(st, P, at[B - 7], at[B - 16]), g = Xn(H, W, tt, ft[B - 7], ft[B - 16]);
      ft[B] = g | 0, at[B] = H | 0;
    }
    let { Ah: n, Al: o, Bh: s, Bl: i, Ch: c, Cl: a, Dh: l, Dl: b, Eh: h, El: f, Fh: u, Fl: y, Gh: m, Gl: I, Hh: N, Hl: z } = this;
    for (let B = 0; B < 80; B++) {
      const V = mt(h, f, 14) ^ mt(h, f, 18) ^ qt(h, f, 41), q = xt(h, f, 14) ^ xt(h, f, 18) ^ Vt(h, f, 41), W = h & u ^ ~h & m, st = f & y ^ ~f & I, K = Wn(z, q, st, nr[B], at[B]), U = Jn(K, N, V, W, er[B], ft[B]), tt = K | 0, P = mt(n, o, 28) ^ qt(n, o, 34) ^ qt(n, o, 39), H = xt(n, o, 28) ^ Vt(n, o, 34) ^ Vt(n, o, 39), g = n & s ^ n & c ^ s & c, w = o & i ^ o & a ^ i & a;
      N = m | 0, z = I | 0, m = u | 0, I = y | 0, u = h | 0, y = f | 0, { h, l: f } = nt(l | 0, b | 0, U | 0, tt | 0), l = c | 0, b = a | 0, c = s | 0, a = i | 0, s = n | 0, i = o | 0;
      const d = Gn(tt, H, w);
      n = Yn(d, U, P, g), o = d | 0;
    }
    ({ h: n, l: o } = nt(this.Ah | 0, this.Al | 0, n | 0, o | 0)), { h: s, l: i } = nt(this.Bh | 0, this.Bl | 0, s | 0, i | 0), { h: c, l: a } = nt(this.Ch | 0, this.Cl | 0, c | 0, a | 0), { h: l, l: b } = nt(this.Dh | 0, this.Dl | 0, l | 0, b | 0), { h, l: f } = nt(this.Eh | 0, this.El | 0, h | 0, f | 0), { h: u, l: y } = nt(this.Fh | 0, this.Fl | 0, u | 0, y | 0), { h: m, l: I } = nt(this.Gh | 0, this.Gl | 0, m | 0, I | 0), { h: N, l: z } = nt(this.Hh | 0, this.Hl | 0, N | 0, z | 0), this.set(n, o, s, i, c, a, l, b, h, f, u, y, m, I, N, z);
  }
  roundClean() {
    bt(ft, at);
  }
  destroy() {
    bt(this.buffer), this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  }
}
const ut = /* @__PURE__ */ sn(() => new tr()), fo = /* @__PURE__ */ sn(() => new rr());
class an extends on {
  constructor(e, r) {
    super(), this.finished = !1, this.destroyed = !1, ne(e);
    const n = Rt(r);
    if (this.iHash = e.create(), typeof this.iHash.update != "function")
      throw new Error("Expected instance of class which extends utils.Hash");
    this.blockLen = this.iHash.blockLen, this.outputLen = this.iHash.outputLen;
    const o = this.blockLen, s = new Uint8Array(o);
    s.set(n.length > o ? e.create().update(n).digest() : n);
    for (let i = 0; i < s.length; i++)
      s[i] ^= 54;
    this.iHash.update(s), this.oHash = e.create();
    for (let i = 0; i < s.length; i++)
      s[i] ^= 106;
    this.oHash.update(s), bt(s);
  }
  update(e) {
    return Ft(this), this.iHash.update(e), this;
  }
  digestInto(e) {
    Ft(this), lt(e, this.outputLen), this.finished = !0, this.iHash.digestInto(e), this.oHash.update(e), this.oHash.digestInto(e), this.destroy();
  }
  digest() {
    const e = new Uint8Array(this.oHash.outputLen);
    return this.digestInto(e), e;
  }
  _cloneInto(e) {
    e || (e = Object.create(Object.getPrototypeOf(this), {}));
    const { oHash: r, iHash: n, finished: o, destroyed: s, blockLen: i, outputLen: c } = this;
    return e = e, e.finished = o, e.destroyed = s, e.blockLen = i, e.outputLen = c, e.oHash = r._cloneInto(e.oHash), e.iHash = n._cloneInto(e.iHash), e;
  }
  clone() {
    return this._cloneInto();
  }
  destroy() {
    this.destroyed = !0, this.oHash.destroy(), this.iHash.destroy();
  }
}
const Ot = (t, e, r) => new an(t, e).update(r).digest();
Ot.create = (t, e) => new an(t, e);
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const Ae = /* @__PURE__ */ BigInt(0), be = /* @__PURE__ */ BigInt(1);
function Gt(t, e = "") {
  if (typeof t != "boolean") {
    const r = e && `"${e}"`;
    throw new Error(r + "expected boolean, got type=" + typeof t);
  }
  return t;
}
function dt(t, e, r = "") {
  const n = ee(t), o = t?.length, s = e !== void 0;
  if (!n || s && o !== e) {
    const i = r && `"${r}" `, c = s ? ` of length ${e}` : "", a = n ? `length=${o}` : `type=${typeof t}`;
    throw new Error(i + "expected Uint8Array" + c + ", got " + a);
  }
  return t;
}
function Kt(t) {
  const e = t.toString(16);
  return e.length & 1 ? "0" + e : e;
}
function un(t) {
  if (typeof t != "string")
    throw new Error("hex string expected, got " + typeof t);
  return t === "" ? Ae : BigInt("0x" + t);
}
function It(t) {
  return un(Et(t));
}
function ln(t) {
  return lt(t), un(Et(Uint8Array.from(t).reverse()));
}
function oe(t, e) {
  return jt(t.toString(16).padStart(e * 2, "0"));
}
function dn(t, e) {
  return oe(t, e).reverse();
}
function T(t, e, r) {
  let n;
  if (typeof e == "string")
    try {
      n = jt(e);
    } catch (s) {
      throw new Error(t + " must be hex string or Uint8Array, cause: " + s);
    }
  else if (ee(e))
    n = Uint8Array.from(e);
  else
    throw new Error(t + " must be hex string or Uint8Array");
  const o = n.length;
  if (typeof r == "number" && o !== r)
    throw new Error(t + " of length " + r + " expected, got " + o);
  return n;
}
const fe = (t) => typeof t == "bigint" && Ae <= t;
function ye(t, e, r) {
  return fe(t) && fe(e) && fe(r) && e <= t && t < r;
}
function or(t, e, r, n) {
  if (!ye(e, r, n))
    throw new Error("expected valid " + t + ": " + r + " <= n < " + n + ", got " + e);
}
function hn(t) {
  let e;
  for (e = 0; t > Ae; t >>= be, e += 1)
    ;
  return e;
}
const $t = (t) => (be << BigInt(t)) - be;
function sr(t, e, r) {
  if (typeof t != "number" || t < 2)
    throw new Error("hashLen must be a number");
  if (typeof e != "number" || e < 2)
    throw new Error("qByteLen must be a number");
  if (typeof r != "function")
    throw new Error("hmacFn must be a function");
  const n = (u) => new Uint8Array(u), o = (u) => Uint8Array.of(u);
  let s = n(t), i = n(t), c = 0;
  const a = () => {
    s.fill(1), i.fill(0), c = 0;
  }, l = (...u) => r(i, s, ...u), b = (u = n(0)) => {
    i = l(o(0), u), s = l(), u.length !== 0 && (i = l(o(1), u), s = l());
  }, h = () => {
    if (c++ >= 1e3)
      throw new Error("drbg: tried 1000 values");
    let u = 0;
    const y = [];
    for (; u < e; ) {
      s = l();
      const m = s.slice();
      y.push(m), u += s.length;
    }
    return Q(...y);
  };
  return (u, y) => {
    a(), b(u);
    let m;
    for (; !(m = y(h())); )
      b();
    return a(), m;
  };
}
function Se(t, e, r = {}) {
  if (!t || typeof t != "object")
    throw new Error("expected valid options object");
  function n(o, s, i) {
    const c = t[o];
    if (i && c === void 0)
      return;
    const a = typeof c;
    if (a !== s || c === null)
      throw new Error(`param "${o}" is invalid: expected ${s}, got ${a}`);
  }
  Object.entries(e).forEach(([o, s]) => n(o, s, !1)), Object.entries(r).forEach(([o, s]) => n(o, s, !0));
}
function Me(t) {
  const e = /* @__PURE__ */ new WeakMap();
  return (r, ...n) => {
    const o = e.get(r);
    if (o !== void 0)
      return o;
    const s = t(r, ...n);
    return e.set(r, s), s;
  };
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const j = BigInt(0), D = BigInt(1), ht = /* @__PURE__ */ BigInt(2), wn = /* @__PURE__ */ BigInt(3), gn = /* @__PURE__ */ BigInt(4), bn = /* @__PURE__ */ BigInt(5), ir = /* @__PURE__ */ BigInt(7), yn = /* @__PURE__ */ BigInt(8), cr = /* @__PURE__ */ BigInt(9), pn = /* @__PURE__ */ BigInt(16);
function Y(t, e) {
  const r = t % e;
  return r >= j ? r : e + r;
}
function G(t, e, r) {
  let n = t;
  for (; e-- > j; )
    n *= n, n %= r;
  return n;
}
function De(t, e) {
  if (t === j)
    throw new Error("invert: expected non-zero number");
  if (e <= j)
    throw new Error("invert: expected positive modulus, got " + e);
  let r = Y(t, e), n = e, o = j, s = D;
  for (; r !== j; ) {
    const c = n / r, a = n % r, l = o - s * c;
    n = r, r = a, o = s, s = l;
  }
  if (n !== D)
    throw new Error("invert: does not exist");
  return Y(o, e);
}
function Ie(t, e, r) {
  if (!t.eql(t.sqr(e), r))
    throw new Error("Cannot find square root");
}
function mn(t, e) {
  const r = (t.ORDER + D) / gn, n = t.pow(e, r);
  return Ie(t, n, e), n;
}
function fr(t, e) {
  const r = (t.ORDER - bn) / yn, n = t.mul(e, ht), o = t.pow(n, r), s = t.mul(e, o), i = t.mul(t.mul(s, ht), o), c = t.mul(s, t.sub(i, t.ONE));
  return Ie(t, c, e), c;
}
function ar(t) {
  const e = Lt(t), r = xn(t), n = r(e, e.neg(e.ONE)), o = r(e, n), s = r(e, e.neg(n)), i = (t + ir) / pn;
  return (c, a) => {
    let l = c.pow(a, i), b = c.mul(l, n);
    const h = c.mul(l, o), f = c.mul(l, s), u = c.eql(c.sqr(b), a), y = c.eql(c.sqr(h), a);
    l = c.cmov(l, b, u), b = c.cmov(f, h, y);
    const m = c.eql(c.sqr(b), a), I = c.cmov(l, b, m);
    return Ie(c, I, a), I;
  };
}
function xn(t) {
  if (t < wn)
    throw new Error("sqrt is not defined for small field");
  let e = t - D, r = 0;
  for (; e % ht === j; )
    e /= ht, r++;
  let n = ht;
  const o = Lt(t);
  for (; ze(o, n) === 1; )
    if (n++ > 1e3)
      throw new Error("Cannot find square root: probably non-prime P");
  if (r === 1)
    return mn;
  let s = o.pow(n, e);
  const i = (e + D) / ht;
  return function(a, l) {
    if (a.is0(l))
      return l;
    if (ze(a, l) !== 1)
      throw new Error("Cannot find square root");
    let b = r, h = a.mul(a.ONE, s), f = a.pow(l, e), u = a.pow(l, i);
    for (; !a.eql(f, a.ONE); ) {
      if (a.is0(f))
        return a.ZERO;
      let y = 1, m = a.sqr(f);
      for (; !a.eql(m, a.ONE); )
        if (y++, m = a.sqr(m), y === b)
          throw new Error("Cannot find square root");
      const I = D << BigInt(b - y - 1), N = a.pow(h, I);
      b = y, h = a.sqr(N), f = a.mul(f, h), u = a.mul(u, N);
    }
    return u;
  };
}
function ur(t) {
  return t % gn === wn ? mn : t % yn === bn ? fr : t % pn === cr ? ar(t) : xn(t);
}
const lr = [
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
function dr(t) {
  const e = {
    ORDER: "bigint",
    MASK: "bigint",
    BYTES: "number",
    BITS: "number"
  }, r = lr.reduce((n, o) => (n[o] = "function", n), e);
  return Se(t, r), t;
}
function hr(t, e, r) {
  if (r < j)
    throw new Error("invalid exponent, negatives unsupported");
  if (r === j)
    return t.ONE;
  if (r === D)
    return e;
  let n = t.ONE, o = e;
  for (; r > j; )
    r & D && (n = t.mul(n, o)), o = t.sqr(o), r >>= D;
  return n;
}
function En(t, e, r = !1) {
  const n = new Array(e.length).fill(r ? t.ZERO : void 0), o = e.reduce((i, c, a) => t.is0(c) ? i : (n[a] = i, t.mul(i, c)), t.ONE), s = t.inv(o);
  return e.reduceRight((i, c, a) => t.is0(c) ? i : (n[a] = t.mul(i, n[a]), t.mul(i, c)), s), n;
}
function ze(t, e) {
  const r = (t.ORDER - D) / ht, n = t.pow(e, r), o = t.eql(n, t.ONE), s = t.eql(n, t.ZERO), i = t.eql(n, t.neg(t.ONE));
  if (!o && !s && !i)
    throw new Error("invalid Legendre symbol result");
  return o ? 1 : s ? 0 : -1;
}
function Bn(t, e) {
  e !== void 0 && zt(e);
  const r = e !== void 0 ? e : t.toString(2).length, n = Math.ceil(r / 8);
  return { nBitLength: r, nByteLength: n };
}
function Lt(t, e, r = !1, n = {}) {
  if (t <= j)
    throw new Error("invalid field: expected ORDER > 0, got " + t);
  let o, s, i = !1, c;
  if (typeof e == "object" && e != null) {
    if (n.sqrt || r)
      throw new Error("cannot specify opts in two arguments");
    const f = e;
    f.BITS && (o = f.BITS), f.sqrt && (s = f.sqrt), typeof f.isLE == "boolean" && (r = f.isLE), typeof f.modFromBytes == "boolean" && (i = f.modFromBytes), c = f.allowedLengths;
  } else
    typeof e == "number" && (o = e), n.sqrt && (s = n.sqrt);
  const { nBitLength: a, nByteLength: l } = Bn(t, o);
  if (l > 2048)
    throw new Error("invalid field: expected ORDER of <= 2048 bytes");
  let b;
  const h = Object.freeze({
    ORDER: t,
    isLE: r,
    BITS: a,
    BYTES: l,
    MASK: $t(a),
    ZERO: j,
    ONE: D,
    allowedLengths: c,
    create: (f) => Y(f, t),
    isValid: (f) => {
      if (typeof f != "bigint")
        throw new Error("invalid field element: expected bigint, got " + typeof f);
      return j <= f && f < t;
    },
    is0: (f) => f === j,
    // is valid and invertible
    isValidNot0: (f) => !h.is0(f) && h.isValid(f),
    isOdd: (f) => (f & D) === D,
    neg: (f) => Y(-f, t),
    eql: (f, u) => f === u,
    sqr: (f) => Y(f * f, t),
    add: (f, u) => Y(f + u, t),
    sub: (f, u) => Y(f - u, t),
    mul: (f, u) => Y(f * u, t),
    pow: (f, u) => hr(h, f, u),
    div: (f, u) => Y(f * De(u, t), t),
    // Same as above, but doesn't normalize
    sqrN: (f) => f * f,
    addN: (f, u) => f + u,
    subN: (f, u) => f - u,
    mulN: (f, u) => f * u,
    inv: (f) => De(f, t),
    sqrt: s || ((f) => (b || (b = ur(t)), b(h, f))),
    toBytes: (f) => r ? dn(f, l) : oe(f, l),
    fromBytes: (f, u = !0) => {
      if (c) {
        if (!c.includes(f.length) || f.length > l)
          throw new Error("Field.fromBytes: expected " + c + " bytes, got " + f.length);
        const m = new Uint8Array(l);
        m.set(f, r ? 0 : m.length - f.length), f = m;
      }
      if (f.length !== l)
        throw new Error("Field.fromBytes: expected " + l + " bytes, got " + f.length);
      let y = r ? ln(f) : It(f);
      if (i && (y = Y(y, t)), !u && !h.isValid(y))
        throw new Error("invalid field element: outside of range 0..ORDER");
      return y;
    },
    // TODO: we don't need it here, move out to separate fn
    invertBatch: (f) => En(h, f),
    // We can't move this out because Fp6, Fp12 implement it
    // and it's unclear what to return in there.
    cmov: (f, u, y) => y ? u : f
  });
  return Object.freeze(h);
}
function vn(t) {
  if (typeof t != "bigint")
    throw new Error("field order must be bigint");
  const e = t.toString(2).length;
  return Math.ceil(e / 8);
}
function An(t) {
  const e = vn(t);
  return e + Math.ceil(e / 2);
}
function Sn(t, e, r = !1) {
  const n = t.length, o = vn(e), s = An(e);
  if (n < 16 || n < s || n > 1024)
    throw new Error("expected " + s + "-1024 bytes of input, got " + n);
  const i = r ? ln(t) : It(t), c = Y(i, e - D) + D;
  return r ? dn(c, o) : oe(c, o);
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const vt = BigInt(0), wt = BigInt(1);
function Yt(t, e) {
  const r = e.negate();
  return t ? r : e;
}
function ae(t, e) {
  const r = En(t.Fp, e.map((n) => n.Z));
  return e.map((n, o) => t.fromAffine(n.toAffine(r[o])));
}
function In(t, e) {
  if (!Number.isSafeInteger(t) || t <= 0 || t > e)
    throw new Error("invalid window size, expected [1.." + e + "], got W=" + t);
}
function ue(t, e) {
  In(t, e);
  const r = Math.ceil(e / t) + 1, n = 2 ** (t - 1), o = 2 ** t, s = $t(t), i = BigInt(t);
  return { windows: r, windowSize: n, mask: s, maxNumber: o, shiftBy: i };
}
function Fe(t, e, r) {
  const { windowSize: n, mask: o, maxNumber: s, shiftBy: i } = r;
  let c = Number(t & o), a = t >> i;
  c > n && (c -= s, a += wt);
  const l = e * n, b = l + Math.abs(c) - 1, h = c === 0, f = c < 0, u = e % 2 !== 0;
  return { nextN: a, offset: b, isZero: h, isNeg: f, isNegF: u, offsetF: l };
}
function wr(t, e) {
  if (!Array.isArray(t))
    throw new Error("array expected");
  t.forEach((r, n) => {
    if (!(r instanceof e))
      throw new Error("invalid point at index " + n);
  });
}
function gr(t, e) {
  if (!Array.isArray(t))
    throw new Error("array of scalars expected");
  t.forEach((r, n) => {
    if (!e.isValid(r))
      throw new Error("invalid scalar at index " + n);
  });
}
const le = /* @__PURE__ */ new WeakMap(), Un = /* @__PURE__ */ new WeakMap();
function de(t) {
  return Un.get(t) || 1;
}
function je(t) {
  if (t !== vt)
    throw new Error("invalid wNAF");
}
class br {
  // Parametrized with a given Point class (not individual point)
  constructor(e, r) {
    this.BASE = e.BASE, this.ZERO = e.ZERO, this.Fn = e.Fn, this.bits = r;
  }
  // non-const time multiplication ladder
  _unsafeLadder(e, r, n = this.ZERO) {
    let o = e;
    for (; r > vt; )
      r & wt && (n = n.add(o)), o = o.double(), r >>= wt;
    return n;
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
  precomputeWindow(e, r) {
    const { windows: n, windowSize: o } = ue(r, this.bits), s = [];
    let i = e, c = i;
    for (let a = 0; a < n; a++) {
      c = i, s.push(c);
      for (let l = 1; l < o; l++)
        c = c.add(i), s.push(c);
      i = c.double();
    }
    return s;
  }
  /**
   * Implements ec multiplication using precomputed tables and w-ary non-adjacent form.
   * More compact implementation:
   * https://github.com/paulmillr/noble-secp256k1/blob/47cb1669b6e506ad66b35fe7d76132ae97465da2/index.ts#L502-L541
   * @returns real and fake (for const-time) points
   */
  wNAF(e, r, n) {
    if (!this.Fn.isValid(n))
      throw new Error("invalid scalar");
    let o = this.ZERO, s = this.BASE;
    const i = ue(e, this.bits);
    for (let c = 0; c < i.windows; c++) {
      const { nextN: a, offset: l, isZero: b, isNeg: h, isNegF: f, offsetF: u } = Fe(n, c, i);
      n = a, b ? s = s.add(Yt(f, r[u])) : o = o.add(Yt(h, r[l]));
    }
    return je(n), { p: o, f: s };
  }
  /**
   * Implements ec unsafe (non const-time) multiplication using precomputed tables and w-ary non-adjacent form.
   * @param acc accumulator point to add result of multiplication
   * @returns point
   */
  wNAFUnsafe(e, r, n, o = this.ZERO) {
    const s = ue(e, this.bits);
    for (let i = 0; i < s.windows && n !== vt; i++) {
      const { nextN: c, offset: a, isZero: l, isNeg: b } = Fe(n, i, s);
      if (n = c, !l) {
        const h = r[a];
        o = o.add(b ? h.negate() : h);
      }
    }
    return je(n), o;
  }
  getPrecomputes(e, r, n) {
    let o = le.get(r);
    return o || (o = this.precomputeWindow(r, e), e !== 1 && (typeof n == "function" && (o = n(o)), le.set(r, o))), o;
  }
  cached(e, r, n) {
    const o = de(e);
    return this.wNAF(o, this.getPrecomputes(o, e, n), r);
  }
  unsafe(e, r, n, o) {
    const s = de(e);
    return s === 1 ? this._unsafeLadder(e, r, o) : this.wNAFUnsafe(s, this.getPrecomputes(s, e, n), r, o);
  }
  // We calculate precomputes for elliptic curve point multiplication
  // using windowed method. This specifies window size and
  // stores precomputed values. Usually only base point would be precomputed.
  createCache(e, r) {
    In(r, this.bits), Un.set(e, r), le.delete(e);
  }
  hasCache(e) {
    return de(e) !== 1;
  }
}
function yr(t, e, r, n) {
  let o = e, s = t.ZERO, i = t.ZERO;
  for (; r > vt || n > vt; )
    r & wt && (s = s.add(o)), n & wt && (i = i.add(o)), o = o.double(), r >>= wt, n >>= wt;
  return { p1: s, p2: i };
}
function pr(t, e, r, n) {
  wr(r, t), gr(n, e);
  const o = r.length, s = n.length;
  if (o !== s)
    throw new Error("arrays of points and scalars must have equal length");
  const i = t.ZERO, c = hn(BigInt(o));
  let a = 1;
  c > 12 ? a = c - 3 : c > 4 ? a = c - 2 : c > 0 && (a = 2);
  const l = $t(a), b = new Array(Number(l) + 1).fill(i), h = Math.floor((e.BITS - 1) / a) * a;
  let f = i;
  for (let u = h; u >= 0; u -= a) {
    b.fill(i);
    for (let m = 0; m < s; m++) {
      const I = n[m], N = Number(I >> BigInt(u) & l);
      b[N] = b[N].add(r[m]);
    }
    let y = i;
    for (let m = b.length - 1, I = i; m > 0; m--)
      I = I.add(b[m]), y = y.add(I);
    if (f = f.add(y), u !== 0)
      for (let m = 0; m < a; m++)
        f = f.double();
  }
  return f;
}
function Ge(t, e, r) {
  if (e) {
    if (e.ORDER !== t)
      throw new Error("Field.ORDER must match order: Fp == p, Fn == n");
    return dr(e), e;
  } else
    return Lt(t, { isLE: r });
}
function mr(t, e, r = {}, n) {
  if (n === void 0 && (n = t === "edwards"), !e || typeof e != "object")
    throw new Error(`expected valid ${t} CURVE object`);
  for (const a of ["p", "n", "h"]) {
    const l = e[a];
    if (!(typeof l == "bigint" && l > vt))
      throw new Error(`CURVE.${a} must be positive bigint`);
  }
  const o = Ge(e.p, r.Fp, n), s = Ge(e.n, r.Fn, n), c = ["Gx", "Gy", "a", "b"];
  for (const a of c)
    if (!o.isValid(e[a]))
      throw new Error(`CURVE.${a} must be valid field element of CURVE.Fp`);
  return e = Object.freeze(Object.assign({}, e)), { CURVE: e, Fp: o, Fn: s };
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const Ye = (t, e) => (t + (t >= 0 ? e : -e) / _n) / e;
function xr(t, e, r) {
  const [[n, o], [s, i]] = e, c = Ye(i * t, r), a = Ye(-o * t, r);
  let l = t - c * n - a * s, b = -c * o - a * i;
  const h = l < ot, f = b < ot;
  h && (l = -l), f && (b = -b);
  const u = $t(Math.ceil(hn(r) / 2)) + Bt;
  if (l < ot || l >= u || b < ot || b >= u)
    throw new Error("splitScalar (endomorphism): failed, k=" + t);
  return { k1neg: h, k1: l, k2neg: f, k2: b };
}
function pe(t) {
  if (!["compact", "recovered", "der"].includes(t))
    throw new Error('Signature format must be "compact", "recovered", or "der"');
  return t;
}
function he(t, e) {
  const r = {};
  for (let n of Object.keys(e))
    r[n] = t[n] === void 0 ? e[n] : t[n];
  return Gt(r.lowS, "lowS"), Gt(r.prehash, "prehash"), r.format !== void 0 && pe(r.format), r;
}
class Er extends Error {
  constructor(e = "") {
    super(e);
  }
}
const rt = {
  // asn.1 DER encoding utils
  Err: Er,
  // Basic building block is TLV (Tag-Length-Value)
  _tlv: {
    encode: (t, e) => {
      const { Err: r } = rt;
      if (t < 0 || t > 256)
        throw new r("tlv.encode: wrong tag");
      if (e.length & 1)
        throw new r("tlv.encode: unpadded data");
      const n = e.length / 2, o = Kt(n);
      if (o.length / 2 & 128)
        throw new r("tlv.encode: long form length too big");
      const s = n > 127 ? Kt(o.length / 2 | 128) : "";
      return Kt(t) + s + o + e;
    },
    // v - value, l - left bytes (unparsed)
    decode(t, e) {
      const { Err: r } = rt;
      let n = 0;
      if (t < 0 || t > 256)
        throw new r("tlv.encode: wrong tag");
      if (e.length < 2 || e[n++] !== t)
        throw new r("tlv.decode: wrong tlv");
      const o = e[n++], s = !!(o & 128);
      let i = 0;
      if (!s)
        i = o;
      else {
        const a = o & 127;
        if (!a)
          throw new r("tlv.decode(long): indefinite length not supported");
        if (a > 4)
          throw new r("tlv.decode(long): byte length is too big");
        const l = e.subarray(n, n + a);
        if (l.length !== a)
          throw new r("tlv.decode: length bytes not complete");
        if (l[0] === 0)
          throw new r("tlv.decode(long): zero leftmost byte");
        for (const b of l)
          i = i << 8 | b;
        if (n += a, i < 128)
          throw new r("tlv.decode(long): not minimal encoding");
      }
      const c = e.subarray(n, n + i);
      if (c.length !== i)
        throw new r("tlv.decode: wrong value length");
      return { v: c, l: e.subarray(n + i) };
    }
  },
  // https://crypto.stackexchange.com/a/57734 Leftmost bit of first byte is 'negative' flag,
  // since we always use positive integers here. It must always be empty:
  // - add zero byte if exists
  // - if next byte doesn't have a flag, leading zero is not allowed (minimal encoding)
  _int: {
    encode(t) {
      const { Err: e } = rt;
      if (t < ot)
        throw new e("integer: negative integers are not allowed");
      let r = Kt(t);
      if (Number.parseInt(r[0], 16) & 8 && (r = "00" + r), r.length & 1)
        throw new e("unexpected DER parsing assertion: unpadded hex");
      return r;
    },
    decode(t) {
      const { Err: e } = rt;
      if (t[0] & 128)
        throw new e("invalid signature integer: negative");
      if (t[0] === 0 && !(t[1] & 128))
        throw new e("invalid signature integer: unnecessary leading zero");
      return It(t);
    }
  },
  toSig(t) {
    const { Err: e, _int: r, _tlv: n } = rt, o = T("signature", t), { v: s, l: i } = n.decode(48, o);
    if (i.length)
      throw new e("invalid signature: left bytes after parsing");
    const { v: c, l: a } = n.decode(2, s), { v: l, l: b } = n.decode(2, a);
    if (b.length)
      throw new e("invalid signature: left bytes after parsing");
    return { r: r.decode(c), s: r.decode(l) };
  },
  hexFromSig(t) {
    const { _tlv: e, _int: r } = rt, n = e.encode(2, r.encode(t.r)), o = e.encode(2, r.encode(t.s)), s = n + o;
    return e.encode(48, s);
  }
}, ot = BigInt(0), Bt = BigInt(1), _n = BigInt(2), Zt = BigInt(3), Br = BigInt(4);
function gt(t, e) {
  const { BYTES: r } = t;
  let n;
  if (typeof e == "bigint")
    n = e;
  else {
    let o = T("private key", e);
    try {
      n = t.fromBytes(o);
    } catch {
      throw new Error(`invalid private key: expected ui8a of size ${r}, got ${typeof e}`);
    }
  }
  if (!t.isValidNot0(n))
    throw new Error("invalid private key: out of range [1..N-1]");
  return n;
}
function vr(t, e = {}) {
  const r = mr("weierstrass", t, e), { Fp: n, Fn: o } = r;
  let s = r.CURVE;
  const { h: i, n: c } = s;
  Se(e, {}, {
    allowInfinityPoint: "boolean",
    clearCofactor: "function",
    isTorsionFree: "function",
    fromBytes: "function",
    toBytes: "function",
    endo: "object",
    wrapPrivateKey: "boolean"
  });
  const { endo: a } = e;
  if (a && (!n.is0(s.a) || typeof a.beta != "bigint" || !Array.isArray(a.basises)))
    throw new Error('invalid endo: expected "beta": bigint and "basises": array');
  const l = Nn(n, o);
  function b() {
    if (!n.isOdd)
      throw new Error("compression is not supported: Field does not have .isOdd()");
  }
  function h(H, g, w) {
    const { x: d, y: p } = g.toAffine(), x = n.toBytes(d);
    if (Gt(w, "isCompressed"), w) {
      b();
      const A = !n.isOdd(p);
      return Q(Hn(A), x);
    } else
      return Q(Uint8Array.of(4), x, n.toBytes(p));
  }
  function f(H) {
    dt(H, void 0, "Point");
    const { publicKey: g, publicKeyUncompressed: w } = l, d = H.length, p = H[0], x = H.subarray(1);
    if (d === g && (p === 2 || p === 3)) {
      const A = n.fromBytes(x);
      if (!n.isValid(A))
        throw new Error("bad point: is not on curve, wrong x");
      const v = m(A);
      let E;
      try {
        E = n.sqrt(v);
      } catch (C) {
        const O = C instanceof Error ? ": " + C.message : "";
        throw new Error("bad point: is not on curve, sqrt error" + O);
      }
      b();
      const S = n.isOdd(E);
      return (p & 1) === 1 !== S && (E = n.neg(E)), { x: A, y: E };
    } else if (d === w && p === 4) {
      const A = n.BYTES, v = n.fromBytes(x.subarray(0, A)), E = n.fromBytes(x.subarray(A, A * 2));
      if (!I(v, E))
        throw new Error("bad point: is not on curve");
      return { x: v, y: E };
    } else
      throw new Error(`bad point: got length ${d}, expected compressed=${g} or uncompressed=${w}`);
  }
  const u = e.toBytes || h, y = e.fromBytes || f;
  function m(H) {
    const g = n.sqr(H), w = n.mul(g, H);
    return n.add(n.add(w, n.mul(H, s.a)), s.b);
  }
  function I(H, g) {
    const w = n.sqr(g), d = m(H);
    return n.eql(w, d);
  }
  if (!I(s.Gx, s.Gy))
    throw new Error("bad curve params: generator point");
  const N = n.mul(n.pow(s.a, Zt), Br), z = n.mul(n.sqr(s.b), BigInt(27));
  if (n.is0(n.add(N, z)))
    throw new Error("bad curve params: a or b");
  function B(H, g, w = !1) {
    if (!n.isValid(g) || w && n.is0(g))
      throw new Error(`bad point coordinate ${H}`);
    return g;
  }
  function V(H) {
    if (!(H instanceof U))
      throw new Error("ProjectivePoint expected");
  }
  function q(H) {
    if (!a || !a.basises)
      throw new Error("no endo");
    return xr(H, a.basises, o.ORDER);
  }
  const W = Me((H, g) => {
    const { X: w, Y: d, Z: p } = H;
    if (n.eql(p, n.ONE))
      return { x: w, y: d };
    const x = H.is0();
    g == null && (g = x ? n.ONE : n.inv(p));
    const A = n.mul(w, g), v = n.mul(d, g), E = n.mul(p, g);
    if (x)
      return { x: n.ZERO, y: n.ZERO };
    if (!n.eql(E, n.ONE))
      throw new Error("invZ was invalid");
    return { x: A, y: v };
  }), st = Me((H) => {
    if (H.is0()) {
      if (e.allowInfinityPoint && !n.is0(H.Y))
        return;
      throw new Error("bad point: ZERO");
    }
    const { x: g, y: w } = H.toAffine();
    if (!n.isValid(g) || !n.isValid(w))
      throw new Error("bad point: x or y not field elements");
    if (!I(g, w))
      throw new Error("bad point: equation left != right");
    if (!H.isTorsionFree())
      throw new Error("bad point: not in prime-order subgroup");
    return !0;
  });
  function K(H, g, w, d, p) {
    return w = new U(n.mul(w.X, H), w.Y, w.Z), g = Yt(d, g), w = Yt(p, w), g.add(w);
  }
  class U {
    /** Does NOT validate if the point is valid. Use `.assertValidity()`. */
    constructor(g, w, d) {
      this.X = B("x", g), this.Y = B("y", w, !0), this.Z = B("z", d), Object.freeze(this);
    }
    static CURVE() {
      return s;
    }
    /** Does NOT validate if the point is valid. Use `.assertValidity()`. */
    static fromAffine(g) {
      const { x: w, y: d } = g || {};
      if (!g || !n.isValid(w) || !n.isValid(d))
        throw new Error("invalid affine point");
      if (g instanceof U)
        throw new Error("projective point not allowed");
      return n.is0(w) && n.is0(d) ? U.ZERO : new U(w, d, n.ONE);
    }
    static fromBytes(g) {
      const w = U.fromAffine(y(dt(g, void 0, "point")));
      return w.assertValidity(), w;
    }
    static fromHex(g) {
      return U.fromBytes(T("pointHex", g));
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
    precompute(g = 8, w = !0) {
      return P.createCache(this, g), w || this.multiply(Zt), this;
    }
    // TODO: return `this`
    /** A point on curve is valid if it conforms to equation. */
    assertValidity() {
      st(this);
    }
    hasEvenY() {
      const { y: g } = this.toAffine();
      if (!n.isOdd)
        throw new Error("Field doesn't support isOdd");
      return !n.isOdd(g);
    }
    /** Compare one point to another. */
    equals(g) {
      V(g);
      const { X: w, Y: d, Z: p } = this, { X: x, Y: A, Z: v } = g, E = n.eql(n.mul(w, v), n.mul(x, p)), S = n.eql(n.mul(d, v), n.mul(A, p));
      return E && S;
    }
    /** Flips point to one corresponding to (x, -y) in Affine coordinates. */
    negate() {
      return new U(this.X, n.neg(this.Y), this.Z);
    }
    // Renes-Costello-Batina exception-free doubling formula.
    // There is 30% faster Jacobian formula, but it is not complete.
    // https://eprint.iacr.org/2015/1060, algorithm 3
    // Cost: 8M + 3S + 3*a + 2*b3 + 15add.
    double() {
      const { a: g, b: w } = s, d = n.mul(w, Zt), { X: p, Y: x, Z: A } = this;
      let v = n.ZERO, E = n.ZERO, S = n.ZERO, _ = n.mul(p, p), C = n.mul(x, x), O = n.mul(A, A), R = n.mul(p, x);
      return R = n.add(R, R), S = n.mul(p, A), S = n.add(S, S), v = n.mul(g, S), E = n.mul(d, O), E = n.add(v, E), v = n.sub(C, E), E = n.add(C, E), E = n.mul(v, E), v = n.mul(R, v), S = n.mul(d, S), O = n.mul(g, O), R = n.sub(_, O), R = n.mul(g, R), R = n.add(R, S), S = n.add(_, _), _ = n.add(S, _), _ = n.add(_, O), _ = n.mul(_, R), E = n.add(E, _), O = n.mul(x, A), O = n.add(O, O), _ = n.mul(O, R), v = n.sub(v, _), S = n.mul(O, C), S = n.add(S, S), S = n.add(S, S), new U(v, E, S);
    }
    // Renes-Costello-Batina exception-free addition formula.
    // There is 30% faster Jacobian formula, but it is not complete.
    // https://eprint.iacr.org/2015/1060, algorithm 1
    // Cost: 12M + 0S + 3*a + 3*b3 + 23add.
    add(g) {
      V(g);
      const { X: w, Y: d, Z: p } = this, { X: x, Y: A, Z: v } = g;
      let E = n.ZERO, S = n.ZERO, _ = n.ZERO;
      const C = s.a, O = n.mul(s.b, Zt);
      let R = n.mul(w, x), $ = n.mul(d, A), k = n.mul(p, v), F = n.add(w, d), L = n.add(x, A);
      F = n.mul(F, L), L = n.add(R, $), F = n.sub(F, L), L = n.add(w, p);
      let Z = n.add(x, v);
      return L = n.mul(L, Z), Z = n.add(R, k), L = n.sub(L, Z), Z = n.add(d, p), E = n.add(A, v), Z = n.mul(Z, E), E = n.add($, k), Z = n.sub(Z, E), _ = n.mul(C, L), E = n.mul(O, k), _ = n.add(E, _), E = n.sub($, _), _ = n.add($, _), S = n.mul(E, _), $ = n.add(R, R), $ = n.add($, R), k = n.mul(C, k), L = n.mul(O, L), $ = n.add($, k), k = n.sub(R, k), k = n.mul(C, k), L = n.add(L, k), R = n.mul($, L), S = n.add(S, R), R = n.mul(Z, L), E = n.mul(F, E), E = n.sub(E, R), R = n.mul(F, $), _ = n.mul(Z, _), _ = n.add(_, R), new U(E, S, _);
    }
    subtract(g) {
      return this.add(g.negate());
    }
    is0() {
      return this.equals(U.ZERO);
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
    multiply(g) {
      const { endo: w } = e;
      if (!o.isValidNot0(g))
        throw new Error("invalid scalar: out of range");
      let d, p;
      const x = (A) => P.cached(this, A, (v) => ae(U, v));
      if (w) {
        const { k1neg: A, k1: v, k2neg: E, k2: S } = q(g), { p: _, f: C } = x(v), { p: O, f: R } = x(S);
        p = C.add(R), d = K(w.beta, _, O, A, E);
      } else {
        const { p: A, f: v } = x(g);
        d = A, p = v;
      }
      return ae(U, [d, p])[0];
    }
    /**
     * Non-constant-time multiplication. Uses double-and-add algorithm.
     * It's faster, but should only be used when you don't care about
     * an exposed secret key e.g. sig verification, which works over *public* keys.
     */
    multiplyUnsafe(g) {
      const { endo: w } = e, d = this;
      if (!o.isValid(g))
        throw new Error("invalid scalar: out of range");
      if (g === ot || d.is0())
        return U.ZERO;
      if (g === Bt)
        return d;
      if (P.hasCache(this))
        return this.multiply(g);
      if (w) {
        const { k1neg: p, k1: x, k2neg: A, k2: v } = q(g), { p1: E, p2: S } = yr(U, d, x, v);
        return K(w.beta, E, S, p, A);
      } else
        return P.unsafe(d, g);
    }
    multiplyAndAddUnsafe(g, w, d) {
      const p = this.multiplyUnsafe(w).add(g.multiplyUnsafe(d));
      return p.is0() ? void 0 : p;
    }
    /**
     * Converts Projective point to affine (x, y) coordinates.
     * @param invertedZ Z^-1 (inverted zero) - optional, precomputation is useful for invertBatch
     */
    toAffine(g) {
      return W(this, g);
    }
    /**
     * Checks whether Point is free of torsion elements (is in prime subgroup).
     * Always torsion-free for cofactor=1 curves.
     */
    isTorsionFree() {
      const { isTorsionFree: g } = e;
      return i === Bt ? !0 : g ? g(U, this) : P.unsafe(this, c).is0();
    }
    clearCofactor() {
      const { clearCofactor: g } = e;
      return i === Bt ? this : g ? g(U, this) : this.multiplyUnsafe(i);
    }
    isSmallOrder() {
      return this.multiplyUnsafe(i).is0();
    }
    toBytes(g = !0) {
      return Gt(g, "isCompressed"), this.assertValidity(), u(U, this, g);
    }
    toHex(g = !0) {
      return Et(this.toBytes(g));
    }
    toString() {
      return `<Point ${this.is0() ? "ZERO" : this.toHex()}>`;
    }
    // TODO: remove
    get px() {
      return this.X;
    }
    get py() {
      return this.X;
    }
    get pz() {
      return this.Z;
    }
    toRawBytes(g = !0) {
      return this.toBytes(g);
    }
    _setWindowSize(g) {
      this.precompute(g);
    }
    static normalizeZ(g) {
      return ae(U, g);
    }
    static msm(g, w) {
      return pr(U, o, g, w);
    }
    static fromPrivateKey(g) {
      return U.BASE.multiply(gt(o, g));
    }
  }
  U.BASE = new U(s.Gx, s.Gy, n.ONE), U.ZERO = new U(n.ZERO, n.ONE, n.ZERO), U.Fp = n, U.Fn = o;
  const tt = o.BITS, P = new br(U, e.endo ? Math.ceil(tt / 2) : tt);
  return U.BASE.precompute(8), U;
}
function Hn(t) {
  return Uint8Array.of(t ? 2 : 3);
}
function Nn(t, e) {
  return {
    secretKey: e.BYTES,
    publicKey: 1 + t.BYTES,
    publicKeyUncompressed: 1 + 2 * t.BYTES,
    publicKeyHasPrefix: !0,
    signature: 2 * e.BYTES
  };
}
function Ar(t, e = {}) {
  const { Fn: r } = t, n = e.randomBytes || re, o = Object.assign(Nn(t.Fp, r), { seed: An(r.ORDER) });
  function s(u) {
    try {
      return !!gt(r, u);
    } catch {
      return !1;
    }
  }
  function i(u, y) {
    const { publicKey: m, publicKeyUncompressed: I } = o;
    try {
      const N = u.length;
      return y === !0 && N !== m || y === !1 && N !== I ? !1 : !!t.fromBytes(u);
    } catch {
      return !1;
    }
  }
  function c(u = n(o.seed)) {
    return Sn(dt(u, o.seed, "seed"), r.ORDER);
  }
  function a(u, y = !0) {
    return t.BASE.multiply(gt(r, u)).toBytes(y);
  }
  function l(u) {
    const y = c(u);
    return { secretKey: y, publicKey: a(y) };
  }
  function b(u) {
    if (typeof u == "bigint")
      return !1;
    if (u instanceof t)
      return !0;
    const { secretKey: y, publicKey: m, publicKeyUncompressed: I } = o;
    if (r.allowedLengths || y === m)
      return;
    const N = T("key", u).length;
    return N === m || N === I;
  }
  function h(u, y, m = !0) {
    if (b(u) === !0)
      throw new Error("first arg must be private key");
    if (b(y) === !1)
      throw new Error("second arg must be public key");
    const I = gt(r, u);
    return t.fromHex(y).multiply(I).toBytes(m);
  }
  return Object.freeze({ getPublicKey: a, getSharedSecret: h, keygen: l, Point: t, utils: {
    isValidSecretKey: s,
    isValidPublicKey: i,
    randomSecretKey: c,
    // TODO: remove
    isValidPrivateKey: s,
    randomPrivateKey: c,
    normPrivateKeyToScalar: (u) => gt(r, u),
    precompute(u = 8, y = t.BASE) {
      return y.precompute(u, !1);
    }
  }, lengths: o });
}
function Sr(t, e, r = {}) {
  ne(e), Se(r, {}, {
    hmac: "function",
    lowS: "boolean",
    randomBytes: "function",
    bits2int: "function",
    bits2int_modN: "function"
  });
  const n = r.randomBytes || re, o = r.hmac || ((w, ...d) => Ot(e, w, Q(...d))), { Fp: s, Fn: i } = t, { ORDER: c, BITS: a } = i, { keygen: l, getPublicKey: b, getSharedSecret: h, utils: f, lengths: u } = Ar(t, r), y = {
    prehash: !1,
    lowS: typeof r.lowS == "boolean" ? r.lowS : !1,
    format: void 0,
    //'compact' as ECDSASigFormat,
    extraEntropy: !1
  }, m = "compact";
  function I(w) {
    const d = c >> Bt;
    return w > d;
  }
  function N(w, d) {
    if (!i.isValidNot0(d))
      throw new Error(`invalid signature ${w}: out of range 1..Point.Fn.ORDER`);
    return d;
  }
  function z(w, d) {
    pe(d);
    const p = u.signature, x = d === "compact" ? p : d === "recovered" ? p + 1 : void 0;
    return dt(w, x, `${d} signature`);
  }
  class B {
    constructor(d, p, x) {
      this.r = N("r", d), this.s = N("s", p), x != null && (this.recovery = x), Object.freeze(this);
    }
    static fromBytes(d, p = m) {
      z(d, p);
      let x;
      if (p === "der") {
        const { r: S, s: _ } = rt.toSig(dt(d));
        return new B(S, _);
      }
      p === "recovered" && (x = d[0], p = "compact", d = d.subarray(1));
      const A = i.BYTES, v = d.subarray(0, A), E = d.subarray(A, A * 2);
      return new B(i.fromBytes(v), i.fromBytes(E), x);
    }
    static fromHex(d, p) {
      return this.fromBytes(jt(d), p);
    }
    addRecoveryBit(d) {
      return new B(this.r, this.s, d);
    }
    recoverPublicKey(d) {
      const p = s.ORDER, { r: x, s: A, recovery: v } = this;
      if (v == null || ![0, 1, 2, 3].includes(v))
        throw new Error("recovery id invalid");
      if (c * _n < p && v > 1)
        throw new Error("recovery id is ambiguous for h>1 curve");
      const S = v === 2 || v === 3 ? x + c : x;
      if (!s.isValid(S))
        throw new Error("recovery id 2 or 3 invalid");
      const _ = s.toBytes(S), C = t.fromBytes(Q(Hn((v & 1) === 0), _)), O = i.inv(S), R = q(T("msgHash", d)), $ = i.create(-R * O), k = i.create(A * O), F = t.BASE.multiplyUnsafe($).add(C.multiplyUnsafe(k));
      if (F.is0())
        throw new Error("point at infinify");
      return F.assertValidity(), F;
    }
    // Signatures should be low-s, to prevent malleability.
    hasHighS() {
      return I(this.s);
    }
    toBytes(d = m) {
      if (pe(d), d === "der")
        return jt(rt.hexFromSig(this));
      const p = i.toBytes(this.r), x = i.toBytes(this.s);
      if (d === "recovered") {
        if (this.recovery == null)
          throw new Error("recovery bit must be present");
        return Q(Uint8Array.of(this.recovery), p, x);
      }
      return Q(p, x);
    }
    toHex(d) {
      return Et(this.toBytes(d));
    }
    // TODO: remove
    assertValidity() {
    }
    static fromCompact(d) {
      return B.fromBytes(T("sig", d), "compact");
    }
    static fromDER(d) {
      return B.fromBytes(T("sig", d), "der");
    }
    normalizeS() {
      return this.hasHighS() ? new B(this.r, i.neg(this.s), this.recovery) : this;
    }
    toDERRawBytes() {
      return this.toBytes("der");
    }
    toDERHex() {
      return Et(this.toBytes("der"));
    }
    toCompactRawBytes() {
      return this.toBytes("compact");
    }
    toCompactHex() {
      return Et(this.toBytes("compact"));
    }
  }
  const V = r.bits2int || function(d) {
    if (d.length > 8192)
      throw new Error("input is too large");
    const p = It(d), x = d.length * 8 - a;
    return x > 0 ? p >> BigInt(x) : p;
  }, q = r.bits2int_modN || function(d) {
    return i.create(V(d));
  }, W = $t(a);
  function st(w) {
    return or("num < 2^" + a, w, ot, W), i.toBytes(w);
  }
  function K(w, d) {
    return dt(w, void 0, "message"), d ? dt(e(w), void 0, "prehashed message") : w;
  }
  function U(w, d, p) {
    if (["recovered", "canonical"].some(($) => $ in p))
      throw new Error("sign() legacy options not supported");
    const { lowS: x, prehash: A, extraEntropy: v } = he(p, y);
    w = K(w, A);
    const E = q(w), S = gt(i, d), _ = [st(S), st(E)];
    if (v != null && v !== !1) {
      const $ = v === !0 ? n(u.secretKey) : v;
      _.push(T("extraEntropy", $));
    }
    const C = Q(..._), O = E;
    function R($) {
      const k = V($);
      if (!i.isValidNot0(k))
        return;
      const F = i.inv(k), L = t.BASE.multiply(k).toAffine(), Z = i.create(L.x);
      if (Z === ot)
        return;
      const kt = i.create(F * i.create(O + Z * S));
      if (kt === ot)
        return;
      let ke = (L.x === Z ? 0 : 2) | Number(L.y & Bt), Te = kt;
      return x && I(kt) && (Te = i.neg(kt), ke ^= 1), new B(Z, Te, ke);
    }
    return { seed: C, k2sig: R };
  }
  function tt(w, d, p = {}) {
    w = T("message", w);
    const { seed: x, k2sig: A } = U(w, d, p);
    return sr(e.outputLen, i.BYTES, o)(x, A);
  }
  function P(w) {
    let d;
    const p = typeof w == "string" || ee(w), x = !p && w !== null && typeof w == "object" && typeof w.r == "bigint" && typeof w.s == "bigint";
    if (!p && !x)
      throw new Error("invalid signature, expected Uint8Array, hex string or Signature instance");
    if (x)
      d = new B(w.r, w.s);
    else if (p) {
      try {
        d = B.fromBytes(T("sig", w), "der");
      } catch (A) {
        if (!(A instanceof rt.Err))
          throw A;
      }
      if (!d)
        try {
          d = B.fromBytes(T("sig", w), "compact");
        } catch {
          return !1;
        }
    }
    return d || !1;
  }
  function H(w, d, p, x = {}) {
    const { lowS: A, prehash: v, format: E } = he(x, y);
    if (p = T("publicKey", p), d = K(T("message", d), v), "strict" in x)
      throw new Error("options.strict was renamed to lowS");
    const S = E === void 0 ? P(w) : B.fromBytes(T("sig", w), E);
    if (S === !1)
      return !1;
    try {
      const _ = t.fromBytes(p);
      if (A && S.hasHighS())
        return !1;
      const { r: C, s: O } = S, R = q(d), $ = i.inv(O), k = i.create(R * $), F = i.create(C * $), L = t.BASE.multiplyUnsafe(k).add(_.multiplyUnsafe(F));
      return L.is0() ? !1 : i.create(L.x) === C;
    } catch {
      return !1;
    }
  }
  function g(w, d, p = {}) {
    const { prehash: x } = he(p, y);
    return d = K(d, x), B.fromBytes(w, "recovered").recoverPublicKey(d).toBytes();
  }
  return Object.freeze({
    keygen: l,
    getPublicKey: b,
    getSharedSecret: h,
    utils: f,
    lengths: u,
    Point: t,
    sign: tt,
    verify: H,
    recoverPublicKey: g,
    Signature: B,
    hash: e
  });
}
function Ir(t) {
  const e = {
    a: t.a,
    b: t.b,
    p: t.Fp.ORDER,
    n: t.n,
    h: t.h,
    Gx: t.Gx,
    Gy: t.Gy
  }, r = t.Fp;
  let n = t.allowedPrivateKeyLengths ? Array.from(new Set(t.allowedPrivateKeyLengths.map((i) => Math.ceil(i / 2)))) : void 0;
  const o = Lt(e.n, {
    BITS: t.nBitLength,
    allowedLengths: n,
    modFromBytes: t.wrapPrivateKey
  }), s = {
    Fp: r,
    Fn: o,
    allowInfinityPoint: t.allowInfinityPoint,
    endo: t.endo,
    isTorsionFree: t.isTorsionFree,
    clearCofactor: t.clearCofactor,
    fromBytes: t.fromBytes,
    toBytes: t.toBytes
  };
  return { CURVE: e, curveOpts: s };
}
function Ur(t) {
  const { CURVE: e, curveOpts: r } = Ir(t), n = {
    hmac: t.hmac,
    randomBytes: t.randomBytes,
    lowS: t.lowS,
    bits2int: t.bits2int,
    bits2int_modN: t.bits2int_modN
  };
  return { CURVE: e, curveOpts: r, hash: t.hash, ecdsaOpts: n };
}
function _r(t, e) {
  const r = e.Point;
  return Object.assign({}, e, {
    ProjectivePoint: r,
    CURVE: Object.assign({}, t, Bn(r.Fn.ORDER, r.Fn.BITS))
  });
}
function Hr(t) {
  const { CURVE: e, curveOpts: r, hash: n, ecdsaOpts: o } = Ur(t), s = vr(e, r), i = Sr(s, n, o);
  return _r(t, i);
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
function Nr(t, e) {
  const r = (n) => Hr({ ...t, hash: n });
  return { ...r(e), create: r };
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const At = {
  p: BigInt("0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f"),
  n: BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141"),
  h: BigInt(1),
  a: BigInt(0),
  b: BigInt(7),
  Gx: BigInt("0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"),
  Gy: BigInt("0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8")
}, Rr = {
  beta: BigInt("0x7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee"),
  basises: [
    [BigInt("0x3086d221a7d46bcde86c90e49284eb15"), -BigInt("0xe4437ed6010e88286f547fa90abfe4c3")],
    [BigInt("0x114ca50f7a8e2f3f657c1108d9d44cfd8"), BigInt("0x3086d221a7d46bcde86c90e49284eb15")]
  ]
}, Or = /* @__PURE__ */ BigInt(0), Pe = /* @__PURE__ */ BigInt(1), me = /* @__PURE__ */ BigInt(2);
function $r(t) {
  const e = At.p, r = BigInt(3), n = BigInt(6), o = BigInt(11), s = BigInt(22), i = BigInt(23), c = BigInt(44), a = BigInt(88), l = t * t * t % e, b = l * l * t % e, h = G(b, r, e) * b % e, f = G(h, r, e) * b % e, u = G(f, me, e) * l % e, y = G(u, o, e) * u % e, m = G(y, s, e) * y % e, I = G(m, c, e) * m % e, N = G(I, a, e) * I % e, z = G(N, c, e) * m % e, B = G(z, r, e) * b % e, V = G(B, i, e) * y % e, q = G(V, n, e) * l % e, W = G(q, me, e);
  if (!Pt.eql(Pt.sqr(W), t))
    throw new Error("Cannot find square root");
  return W;
}
const Pt = Lt(At.p, { sqrt: $r }), se = Nr({ ...At, Fp: Pt, lowS: !0, endo: Rr }, ut), Xe = {};
function Xt(t, ...e) {
  let r = Xe[t];
  if (r === void 0) {
    const n = ut(ve(t));
    r = Q(n, n), Xe[t] = r;
  }
  return ut(Q(r, ...e));
}
const Ue = (t) => t.toBytes(!0).slice(1), Ut = se.Point, _e = (t) => t % me === Or;
function xe(t) {
  const { Fn: e, BASE: r } = Ut, n = gt(e, t), o = r.multiply(n);
  return { scalar: _e(o.y) ? n : e.neg(n), bytes: Ue(o) };
}
function Rn(t) {
  const e = Pt;
  if (!e.isValidNot0(t))
    throw new Error("invalid x: Fail if x ≥ p");
  const r = e.create(t * t), n = e.create(r * t + BigInt(7));
  let o = e.sqrt(n);
  _e(o) || (o = e.neg(o));
  const s = Ut.fromAffine({ x: t, y: o });
  return s.assertValidity(), s;
}
const Nt = It;
function On(...t) {
  return Ut.Fn.create(Nt(Xt("BIP0340/challenge", ...t)));
}
function We(t) {
  return xe(t).bytes;
}
function Lr(t, e, r = re(32)) {
  const { Fn: n } = Ut, o = T("message", t), { bytes: s, scalar: i } = xe(e), c = T("auxRand", r, 32), a = n.toBytes(i ^ Nt(Xt("BIP0340/aux", c))), l = Xt("BIP0340/nonce", a, s, o), { bytes: b, scalar: h } = xe(l), f = On(b, s, o), u = new Uint8Array(64);
  if (u.set(b, 0), u.set(n.toBytes(n.create(h + f * i)), 32), !$n(u, o, s))
    throw new Error("sign: Invalid signature produced");
  return u;
}
function $n(t, e, r) {
  const { Fn: n, BASE: o } = Ut, s = T("signature", t, 64), i = T("message", e), c = T("publicKey", r, 32);
  try {
    const a = Rn(Nt(c)), l = Nt(s.subarray(0, 32));
    if (!ye(l, Pe, At.p))
      return !1;
    const b = Nt(s.subarray(32, 64));
    if (!ye(b, Pe, At.n))
      return !1;
    const h = On(n.toBytes(l), Ue(a), i), f = o.multiplyUnsafe(b).add(a.multiplyUnsafe(n.neg(h))), { x: u, y } = f.toAffine();
    return !(f.is0() || !_e(y) || u !== l);
  } catch {
    return !1;
  }
}
const He = /* @__PURE__ */ (() => {
  const r = (o = re(48)) => Sn(o, At.n);
  se.utils.randomSecretKey;
  function n(o) {
    const s = r(o);
    return { secretKey: s, publicKey: We(s) };
  }
  return {
    keygen: n,
    getPublicKey: We,
    sign: Lr,
    verify: $n,
    Point: Ut,
    utils: {
      randomSecretKey: r,
      randomPrivateKey: r,
      taggedHash: Xt,
      // TODO: remove
      lift_x: Rn,
      pointToBytes: Ue,
      numberToBytesBE: oe,
      bytesToNumberBE: It,
      mod: Y
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
function Cr() {
  const t = globalThis.crypto;
  if (!t || typeof t.getRandomValues != "function")
    throw new Error("No cryptographically secure random source available in this environment.");
  return t;
}
function Ct(t) {
  const e = new Uint8Array(t);
  return Cr().getRandomValues(e), e;
}
function ao() {
  return Ct(16);
}
function uo() {
  return Ct(12);
}
function lo() {
  return Ct(16);
}
function ho(t) {
  if (!Number.isInteger(t) || t <= 0 || t > 4294967296)
    throw new Error("randomUniformInt: maxExclusive must be an integer in (0, 2^32].");
  const e = t <= 256 ? 1 : t <= 65536 ? 2 : 4, r = 256 ** e, n = r - r % t;
  for (; ; ) {
    const o = Ct(e);
    let s = 0;
    for (const i of o)
      s = s * 256 + i;
    if (s < n)
      return s % t;
  }
}
function Ne(t) {
  let e = "";
  for (const r of t)
    e += r.toString(16).padStart(2, "0");
  return e;
}
function Mt(t) {
  if (t.length % 2 !== 0)
    throw new Error("Invalid hex string length.");
  const e = new Uint8Array(t.length / 2);
  for (let r = 0; r < e.length; r++)
    e[r] = parseInt(t.slice(r * 2, r * 2 + 2), 16);
  return e;
}
const X = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
function wo(t) {
  let e = "", r = 0;
  for (; r + 2 < t.length; r += 3) {
    const o = t[r], s = t[r + 1], i = t[r + 2];
    e += X[o >> 2], e += X[(o & 3) << 4 | s >> 4], e += X[(s & 15) << 2 | i >> 6], e += X[i & 63];
  }
  const n = t.length - r;
  if (n === 1) {
    const o = t[r];
    e += X[o >> 2], e += X[(o & 3) << 4];
  } else if (n === 2) {
    const o = t[r], s = t[r + 1];
    e += X[o >> 2], e += X[(o & 3) << 4 | s >> 4], e += X[(s & 15) << 2];
  }
  return e;
}
const kr = (() => {
  const t = {};
  for (let e = 0; e < X.length; e++)
    t[X[e]] = e;
  return t;
})();
function go(t) {
  const e = t.replace(/=+$/u, ""), r = [];
  let n = 0, o = 0;
  for (const s of e) {
    const i = kr[s];
    if (i === void 0)
      throw new Error("Invalid base64url character.");
    n = n << 6 | i, o += 6, o >= 8 && (o -= 8, r.push(n >> o & 255));
  }
  return new Uint8Array(r);
}
function ie(t) {
  return new TextEncoder().encode(t);
}
function bo(t) {
  return new TextDecoder("utf-8", { fatal: !0 }).decode(t);
}
function Tr(...t) {
  const e = t.reduce((o, s) => o + s.length, 0), r = new Uint8Array(e);
  let n = 0;
  for (const o of t)
    r.set(o, n), n += o.length;
  return r;
}
function yo(t, e) {
  if (t.length !== e.length)
    return !1;
  let r = 0;
  for (let n = 0; n < t.length; n++)
    r |= t[n] ^ e[n];
  return r === 0;
}
const qr = se.CURVE.n;
function Vr(t) {
  if (t.length !== 32)
    return !1;
  let e = 0n;
  for (const r of t)
    e = e << 8n | BigInt(r);
  return e >= 1n && e < qr;
}
function po() {
  for (; ; ) {
    const t = Ct(32);
    if (Vr(t))
      return t;
  }
}
function Kr(t) {
  return He.getPublicKey(t);
}
function mo(t) {
  return Ne(Kr(t));
}
function Zr(t, e) {
  return He.sign(t, e);
}
function Mr(t, e, r) {
  try {
    return He.verify(t, e, r);
  } catch {
    return !1;
  }
}
function Dr(t) {
  return JSON.stringify([0, t.pubkey, t.created_at, t.kind, t.tags, t.content]);
}
function Ln(t) {
  return Ne(ut(ie(Dr(t))));
}
function xo(t, e) {
  const r = Ln(t), n = Ne(Zr(Mt(r), e));
  return { ...t, id: r, sig: n };
}
function Eo(t) {
  if (typeof t != "object" || t === null || Array.isArray(t))
    return !1;
  const e = t;
  if (typeof e.id != "string" || typeof e.pubkey != "string" || typeof e.sig != "string" || typeof e.content != "string" || !Number.isSafeInteger(e.created_at) || e.created_at < 0 || !Number.isSafeInteger(e.kind) || e.kind < 0 || e.kind > 65535 || !Array.isArray(e.tags) || !e.tags.every((o) => Array.isArray(o) && o.every((s) => typeof s == "string")) || !/^[0-9a-f]{64}$/u.test(e.id) || !/^[0-9a-f]{64}$/u.test(e.pubkey) || !/^[0-9a-f]{128}$/u.test(e.sig))
    return !1;
  const r = e;
  if (Ln(r) !== r.id)
    return !1;
  try {
    return Mr(Mt(r.sig), Mt(r.id), Mt(r.pubkey));
  } catch {
    return !1;
  }
}
function Bo(t, e) {
  return t.created_at !== e.created_at ? t.created_at > e.created_at ? 1 : -1 : t.id === e.id ? 0 : t.id < e.id ? 1 : -1;
}
function vo(t, e) {
  return t.tags.find((r) => r[0] === e)?.[1];
}
/*! scure-base - MIT License (c) 2022 Paul Miller (paulmillr.com) */
function St(t) {
  return t instanceof Uint8Array || ArrayBuffer.isView(t) && t.constructor.name === "Uint8Array";
}
function zr(t, ...e) {
  if (!St(t))
    throw new Error("Uint8Array expected");
  if (e.length > 0 && !e.includes(t.length))
    throw new Error("Uint8Array expected of length " + e + ", got length=" + t.length);
}
function Cn(t, e) {
  return Array.isArray(e) ? e.length === 0 ? !0 : t ? e.every((r) => typeof r == "string") : e.every((r) => Number.isSafeInteger(r)) : !1;
}
function kn(t) {
  if (typeof t != "function")
    throw new Error("function expected");
  return !0;
}
function yt(t, e) {
  if (typeof e != "string")
    throw new Error(`${t}: string expected`);
  return !0;
}
function _t(t) {
  if (!Number.isSafeInteger(t))
    throw new Error(`invalid integer: ${t}`);
}
function Wt(t) {
  if (!Array.isArray(t))
    throw new Error("array expected");
}
function Jt(t, e) {
  if (!Cn(!0, e))
    throw new Error(`${t}: array of strings expected`);
}
function Re(t, e) {
  if (!Cn(!1, e))
    throw new Error(`${t}: array of numbers expected`);
}
// @__NO_SIDE_EFFECTS__
function Oe(...t) {
  const e = (s) => s, r = (s, i) => (c) => s(i(c)), n = t.map((s) => s.encode).reduceRight(r, e), o = t.map((s) => s.decode).reduce(r, e);
  return { encode: n, decode: o };
}
// @__NO_SIDE_EFFECTS__
function $e(t) {
  const e = typeof t == "string" ? t.split("") : t, r = e.length;
  Jt("alphabet", e);
  const n = new Map(e.map((o, s) => [o, s]));
  return {
    encode: (o) => (Wt(o), o.map((s) => {
      if (!Number.isSafeInteger(s) || s < 0 || s >= r)
        throw new Error(`alphabet.encode: digit index outside alphabet "${s}". Allowed: ${t}`);
      return e[s];
    })),
    decode: (o) => (Wt(o), o.map((s) => {
      yt("alphabet.decode", s);
      const i = n.get(s);
      if (i === void 0)
        throw new Error(`Unknown letter: "${s}". Allowed: ${t}`);
      return i;
    }))
  };
}
// @__NO_SIDE_EFFECTS__
function Le(t = "") {
  return yt("join", t), {
    encode: (e) => (Jt("join.decode", e), e.join(t)),
    decode: (e) => (yt("join.decode", e), e.split(t))
  };
}
// @__NO_SIDE_EFFECTS__
function Tn(t, e = "=") {
  return _t(t), yt("padding", e), {
    encode(r) {
      for (Jt("padding.encode", r); r.length * t % 8; )
        r.push(e);
      return r;
    },
    decode(r) {
      Jt("padding.decode", r);
      let n = r.length;
      if (n * t % 8)
        throw new Error("padding: invalid, string should have whole number of bytes");
      for (; n > 0 && r[n - 1] === e; n--)
        if ((n - 1) * t % 8 === 0)
          throw new Error("padding: invalid, string has too much padding");
      return r.slice(0, n);
    }
  };
}
function Ee(t, e, r) {
  if (e < 2)
    throw new Error(`convertRadix: invalid from=${e}, base cannot be less than 2`);
  if (r < 2)
    throw new Error(`convertRadix: invalid to=${r}, base cannot be less than 2`);
  if (Wt(t), !t.length)
    return [];
  let n = 0;
  const o = [], s = Array.from(t, (c) => {
    if (_t(c), c < 0 || c >= e)
      throw new Error(`invalid integer: ${c}`);
    return c;
  }), i = s.length;
  for (; ; ) {
    let c = 0, a = !0;
    for (let l = n; l < i; l++) {
      const b = s[l], h = e * c, f = h + b;
      if (!Number.isSafeInteger(f) || h / e !== c || f - b !== h)
        throw new Error("convertRadix: carry overflow");
      const u = f / r;
      c = f % r;
      const y = Math.floor(u);
      if (s[l] = y, !Number.isSafeInteger(y) || y * r + c !== f)
        throw new Error("convertRadix: carry overflow");
      if (a)
        y ? a = !1 : n = l;
      else continue;
    }
    if (o.push(c), a)
      break;
  }
  for (let c = 0; c < t.length - 1 && t[c] === 0; c++)
    o.push(0);
  return o.reverse();
}
const qn = (t, e) => e === 0 ? t : qn(e, t % e), Qt = /* @__NO_SIDE_EFFECTS__ */ (t, e) => t + (e - qn(t, e)), Dt = /* @__PURE__ */ (() => {
  let t = [];
  for (let e = 0; e < 40; e++)
    t.push(2 ** e);
  return t;
})();
function te(t, e, r, n) {
  if (Wt(t), e <= 0 || e > 32)
    throw new Error(`convertRadix2: wrong from=${e}`);
  if (r <= 0 || r > 32)
    throw new Error(`convertRadix2: wrong to=${r}`);
  if (/* @__PURE__ */ Qt(e, r) > 32)
    throw new Error(`convertRadix2: carry overflow from=${e} to=${r} carryBits=${/* @__PURE__ */ Qt(e, r)}`);
  let o = 0, s = 0;
  const i = Dt[e], c = Dt[r] - 1, a = [];
  for (const l of t) {
    if (_t(l), l >= i)
      throw new Error(`convertRadix2: invalid data word=${l} from=${e}`);
    if (o = o << e | l, s + e > 32)
      throw new Error(`convertRadix2: carry overflow pos=${s} from=${e}`);
    for (s += e; s >= r; s -= r)
      a.push((o >> s - r & c) >>> 0);
    const b = Dt[s];
    if (b === void 0)
      throw new Error("invalid carry");
    o &= b - 1;
  }
  if (o = o << r - s & c, !n && s >= e)
    throw new Error("Excess padding");
  if (!n && o > 0)
    throw new Error(`Non-zero padding: ${o}`);
  return n && s > 0 && a.push(o >>> 0), a;
}
// @__NO_SIDE_EFFECTS__
function Fr(t) {
  _t(t);
  const e = 2 ** 8;
  return {
    encode: (r) => {
      if (!St(r))
        throw new Error("radix.encode input should be Uint8Array");
      return Ee(Array.from(r), e, t);
    },
    decode: (r) => (Re("radix.decode", r), Uint8Array.from(Ee(r, t, e)))
  };
}
// @__NO_SIDE_EFFECTS__
function Ce(t, e = !1) {
  if (_t(t), t <= 0 || t > 32)
    throw new Error("radix2: bits should be in (0..32]");
  if (/* @__PURE__ */ Qt(8, t) > 32 || /* @__PURE__ */ Qt(t, 8) > 32)
    throw new Error("radix2: carry overflow");
  return {
    encode: (r) => {
      if (!St(r))
        throw new Error("radix2.encode input should be Uint8Array");
      return te(Array.from(r), 8, t, !e);
    },
    decode: (r) => (Re("radix2.decode", r), Uint8Array.from(te(r, t, 8, e)))
  };
}
function Je(t) {
  return kn(t), function(...e) {
    try {
      return t.apply(null, e);
    } catch {
    }
  };
}
function jr(t, e) {
  return _t(t), kn(e), {
    encode(r) {
      if (!St(r))
        throw new Error("checksum.encode: input should be Uint8Array");
      const n = e(r).slice(0, t), o = new Uint8Array(r.length + t);
      return o.set(r), o.set(n, r.length), o;
    },
    decode(r) {
      if (!St(r))
        throw new Error("checksum.decode: input should be Uint8Array");
      const n = r.slice(0, -t), o = r.slice(-t), s = e(n).slice(0, t);
      for (let i = 0; i < t; i++)
        if (s[i] !== o[i])
          throw new Error("Invalid checksum");
      return n;
    }
  };
}
const Ao = {
  alphabet: $e,
  chain: Oe,
  checksum: jr,
  convertRadix: Ee,
  convertRadix2: te,
  radix: Fr,
  radix2: Ce,
  join: Le,
  padding: Tn
}, Gr = typeof Uint8Array.from([]).toBase64 == "function" && typeof Uint8Array.fromBase64 == "function", Yr = (t, e) => {
  yt("base64", t);
  const r = /^[A-Za-z0-9=+/]+$/, n = "base64";
  if (t.length > 0 && !r.test(t))
    throw new Error("invalid base64");
  return Uint8Array.fromBase64(t, { alphabet: n, lastChunkHandling: "strict" });
}, So = Gr ? {
  encode(t) {
    return zr(t), t.toBase64();
  },
  decode(t) {
    return Yr(t);
  }
} : /* @__PURE__ */ Oe(/* @__PURE__ */ Ce(6), /* @__PURE__ */ $e("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"), /* @__PURE__ */ Tn(6), /* @__PURE__ */ Le("")), Be = /* @__PURE__ */ Oe(/* @__PURE__ */ $e("qpzry9x8gf2tvdw0s3jn54khce6mua7l"), /* @__PURE__ */ Le("")), Qe = [996825010, 642813549, 513874426, 1027748829, 705979059];
function Ht(t) {
  const e = t >> 25;
  let r = (t & 33554431) << 5;
  for (let n = 0; n < Qe.length; n++)
    (e >> n & 1) === 1 && (r ^= Qe[n]);
  return r;
}
function tn(t, e, r = 1) {
  const n = t.length;
  let o = 1;
  for (let s = 0; s < n; s++) {
    const i = t.charCodeAt(s);
    if (i < 33 || i > 126)
      throw new Error(`Invalid prefix (${t})`);
    o = Ht(o) ^ i >> 5;
  }
  o = Ht(o);
  for (let s = 0; s < n; s++)
    o = Ht(o) ^ t.charCodeAt(s) & 31;
  for (let s of e)
    o = Ht(o) ^ s;
  for (let s = 0; s < 6; s++)
    o = Ht(o);
  return o ^= r, Be.encode(te([o % Dt[30]], 30, 5, !1));
}
// @__NO_SIDE_EFFECTS__
function Pr(t) {
  const e = t === "bech32" ? 1 : 734539939, r = /* @__PURE__ */ Ce(5), n = r.decode, o = r.encode, s = Je(n);
  function i(h, f, u = 90) {
    yt("bech32.encode prefix", h), St(f) && (f = Array.from(f)), Re("bech32.encode", f);
    const y = h.length;
    if (y === 0)
      throw new TypeError(`Invalid prefix length ${y}`);
    const m = y + 7 + f.length;
    if (u !== !1 && m > u)
      throw new TypeError(`Length ${m} exceeds limit ${u}`);
    const I = h.toLowerCase(), N = tn(I, f, e);
    return `${I}1${Be.encode(f)}${N}`;
  }
  function c(h, f = 90) {
    yt("bech32.decode input", h);
    const u = h.length;
    if (u < 8 || f !== !1 && u > f)
      throw new TypeError(`invalid string length: ${u} (${h}). Expected (8..${f})`);
    const y = h.toLowerCase();
    if (h !== y && h !== h.toUpperCase())
      throw new Error("String must be lowercase or uppercase");
    const m = y.lastIndexOf("1");
    if (m === 0 || m === -1)
      throw new Error('Letter "1" must be present between prefix and data only');
    const I = y.slice(0, m), N = y.slice(m + 1);
    if (N.length < 6)
      throw new Error("Data must be at least 6 characters long");
    const z = Be.decode(N).slice(0, -6), B = tn(I, z, e);
    if (!N.endsWith(B))
      throw new Error(`Invalid checksum in ${h}: expected "${B}"`);
    return { prefix: I, words: z };
  }
  const a = Je(c);
  function l(h) {
    const { prefix: f, words: u } = c(h, !1);
    return { prefix: f, words: u, bytes: n(u) };
  }
  function b(h, f) {
    return i(h, o(f));
  }
  return {
    encode: i,
    decode: c,
    encodeFromBytes: b,
    decodeToBytes: l,
    decodeUnsafe: a,
    fromWords: n,
    fromWordsUnsafe: s,
    toWords: o
  };
}
const Io = /* @__PURE__ */ Pr("bech32");
function Xr(t, e, r) {
  return ne(t), r === void 0 && (r = new Uint8Array(t.outputLen)), Ot(t, Rt(r), Rt(e));
}
const we = /* @__PURE__ */ Uint8Array.from([0]), en = /* @__PURE__ */ Uint8Array.of();
function Wr(t, e, r, n = 32) {
  ne(t), zt(n);
  const o = t.outputLen;
  if (n > 255 * o)
    throw new Error("Length should be <= 255*HashLen");
  const s = Math.ceil(n / o);
  r === void 0 && (r = en);
  const i = new Uint8Array(s * o), c = Ot.create(t, e), a = c._cloneInto(), l = new Uint8Array(c.outputLen);
  for (let b = 0; b < s; b++)
    we[0] = b + 1, a.update(b === 0 ? en : l).update(r).update(we).digestInto(l), i.set(l, o * b), c._cloneInto(a);
  return c.destroy(), a.destroy(), bt(l, we), i.slice(0, n);
}
function Uo(t, e) {
  return Xr(ut, e, t);
}
function Jr(t, e, r) {
  const n = typeof e == "string" ? ie(e) : e;
  return Wr(ut, t, n, r);
}
function _o(t) {
  return ut(ie(t));
}
function Ho(t, e) {
  return Ot(ut, t, e);
}
const Qr = se.CURVE.n;
function to(t) {
  let e = 0n;
  for (const r of t)
    e = e << 8n | BigInt(r);
  return e;
}
function eo(t) {
  const e = new Uint8Array(32);
  let r = t;
  for (let n = 31; n >= 0; n--)
    e[n] = Number(r & 0xffn), r >>= 8n;
  return e;
}
function No(t, e) {
  const r = ie(e);
  for (let n = 0; n <= 255; n++) {
    const o = Tr(r, new Uint8Array([0, n])), s = Jr(t, o, 32), i = to(s);
    if (i >= 1n && i < Qr)
      return { scalar: eo(i), counter: n };
  }
  throw new Error("ScalarExpand: exhausted 256 counters without a valid scalar (should not happen in practice).");
}
function no(t) {
  return t && t.__esModule && Object.prototype.hasOwnProperty.call(t, "default") ? t.default : t;
}
var ge, nn;
function ro() {
  return nn || (nn = 1, ge = function t(e) {
    if (typeof e == "number" && isNaN(e))
      throw new Error("NaN is not allowed");
    if (typeof e == "number" && !isFinite(e))
      throw new Error("Infinity is not allowed");
    return e === null || typeof e != "object" ? JSON.stringify(e) : e.toJSON instanceof Function ? t(e.toJSON()) : Array.isArray(e) ? `[${e.reduce((o, s, i) => `${o}${i === 0 ? "" : ","}${t(s === void 0 || typeof s == "symbol" ? null : s)}`, "")}]` : `{${Object.keys(e).sort().reduce((n, o) => {
      if (e[o] === void 0 || typeof e[o] == "symbol")
        return n;
      const s = n.length === 0 ? "" : ",";
      return `${n}${s}${t(o)}:${t(e[o])}`;
    }, "")}}`;
  }), ge;
}
var oo = ro();
const Ro = /* @__PURE__ */ no(oo);
export {
  So as A,
  bo as B,
  Tr as C,
  Mt as D,
  se as E,
  Vr as F,
  ao as G,
  lo as H,
  _o as I,
  No as J,
  Bo as K,
  po as L,
  yo as M,
  Ho as N,
  Ln as O,
  Io as P,
  no as Q,
  Ct as a,
  Ne as b,
  Jr as c,
  wo as d,
  go as e,
  vo as f,
  mo as g,
  Uo as h,
  uo as i,
  ce as j,
  so as k,
  ne as l,
  co as m,
  zt as n,
  io as o,
  Ot as p,
  bt as q,
  ho as r,
  xo as s,
  fo as t,
  ie as u,
  Eo as v,
  lt as w,
  Ao as x,
  ut as y,
  Ro as z
};
