const gt = typeof globalThis == "object" && "crypto" in globalThis ? globalThis.crypto : void 0;
/*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) */
function Dt(t) {
  return t instanceof Uint8Array || ArrayBuffer.isView(t) && t.constructor.name === "Uint8Array";
}
function Wt(t) {
  if (!Number.isSafeInteger(t) || t < 0)
    throw new Error("positive integer expected, got " + t);
}
function ut(t, ...e) {
  if (!Dt(t))
    throw new Error("Uint8Array expected");
  if (e.length > 0 && !e.includes(t.length))
    throw new Error("Uint8Array expected of length " + e + ", got length=" + t.length);
}
function Ue(t) {
  if (typeof t != "function" || typeof t.create != "function")
    throw new Error("Hash should be wrapped by utils.createHasher");
  Wt(t.outputLen), Wt(t.blockLen);
}
function Tt(t, e = !0) {
  if (t.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (e && t.finished)
    throw new Error("Hash#digest() has already been called");
}
function fn(t, e) {
  ut(t);
  const r = e.outputLen;
  if (t.length < r)
    throw new Error("digestInto() expects output buffer of length at least " + r);
}
function xt(...t) {
  for (let e = 0; e < t.length; e++)
    t[e].fill(0);
}
function $t(t) {
  return new DataView(t.buffer, t.byteOffset, t.byteLength);
}
function Q(t, e) {
  return t << 32 - e | t >>> e;
}
const Ne = /* @ts-ignore */ typeof Uint8Array.from([]).toHex == "function" && typeof Uint8Array.fromHex == "function", an = /* @__PURE__ */ Array.from({ length: 256 }, (t, e) => e.toString(16).padStart(2, "0"));
function mt(t) {
  if (ut(t), Ne)
    return t.toHex();
  let e = "";
  for (let r = 0; r < t.length; r++)
    e += an[t[r]];
  return e;
}
const et = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
function ge(t) {
  if (t >= et._0 && t <= et._9)
    return t - et._0;
  if (t >= et.A && t <= et.F)
    return t - (et.A - 10);
  if (t >= et.a && t <= et.f)
    return t - (et.a - 10);
}
function Ct(t) {
  if (typeof t != "string")
    throw new Error("hex string expected, got " + typeof t);
  if (Ne)
    return Uint8Array.fromHex(t);
  const e = t.length, r = e / 2;
  if (e % 2)
    throw new Error("hex string expected, got unpadded hex of length " + e);
  const n = new Uint8Array(r);
  for (let o = 0, s = 0; o < r; o++, s += 2) {
    const i = ge(t.charCodeAt(s)), c = ge(t.charCodeAt(s + 1));
    if (i === void 0 || c === void 0) {
      const f = t[s] + t[s + 1];
      throw new Error('hex string expected, got non-hex character "' + f + '" at index ' + s);
    }
    n[o] = i * 16 + c;
  }
  return n;
}
const un = async () => {
};
async function ur(t, e, r) {
  let n = Date.now();
  for (let o = 0; o < t; o++) {
    r(o);
    const s = Date.now() - n;
    s >= 0 && s < e || (await un(), n += s);
  }
}
function oe(t) {
  if (typeof t != "string")
    throw new Error("string expected");
  return new Uint8Array(new TextEncoder().encode(t));
}
function se(t) {
  return typeof t == "string" && (t = oe(t)), ut(t), t;
}
function lr(t) {
  return typeof t == "string" && (t = oe(t)), ut(t), t;
}
function J(...t) {
  let e = 0;
  for (let n = 0; n < t.length; n++) {
    const o = t[n];
    ut(o), e += o.length;
  }
  const r = new Uint8Array(e);
  for (let n = 0, o = 0; n < t.length; n++) {
    const s = t[n];
    r.set(s, o), o += s.length;
  }
  return r;
}
function dr(t, e) {
  if (e !== void 0 && {}.toString.call(e) !== "[object Object]")
    throw new Error("options should be object or undefined");
  return Object.assign(t, e);
}
class Re {
}
function Oe(t) {
  const e = (n) => t().update(se(n)).digest(), r = t();
  return e.outputLen = r.outputLen, e.blockLen = r.blockLen, e.create = () => t(), e;
}
function jt(t = 32) {
  if (gt && typeof gt.getRandomValues == "function")
    return gt.getRandomValues(new Uint8Array(t));
  if (gt && typeof gt.randomBytes == "function")
    return Uint8Array.from(gt.randomBytes(t));
  throw new Error("crypto.getRandomValues must be defined");
}
function ln(t, e, r, n) {
  if (typeof t.setBigUint64 == "function")
    return t.setBigUint64(e, r, n);
  const o = BigInt(32), s = BigInt(4294967295), i = Number(r >> o & s), c = Number(r & s), f = n ? 4 : 0, d = n ? 0 : 4;
  t.setUint32(e + f, i, n), t.setUint32(e + d, c, n);
}
function dn(t, e, r) {
  return t & e ^ ~t & r;
}
function hn(t, e, r) {
  return t & e ^ t & r ^ e & r;
}
class qe extends Re {
  constructor(e, r, n, o) {
    super(), this.finished = !1, this.length = 0, this.pos = 0, this.destroyed = !1, this.blockLen = e, this.outputLen = r, this.padOffset = n, this.isLE = o, this.buffer = new Uint8Array(e), this.view = $t(this.buffer);
  }
  update(e) {
    Tt(this), e = se(e), ut(e);
    const { view: r, buffer: n, blockLen: o } = this, s = e.length;
    for (let i = 0; i < s; ) {
      const c = Math.min(o - this.pos, s - i);
      if (c === o) {
        const f = $t(e);
        for (; o <= s - i; i += o)
          this.process(f, i);
        continue;
      }
      n.set(e.subarray(i, i + c), this.pos), this.pos += c, i += c, this.pos === o && (this.process(r, 0), this.pos = 0);
    }
    return this.length += e.length, this.roundClean(), this;
  }
  digestInto(e) {
    Tt(this), fn(e, this), this.finished = !0;
    const { buffer: r, view: n, blockLen: o, isLE: s } = this;
    let { pos: i } = this;
    r[i++] = 128, xt(this.buffer.subarray(i)), this.padOffset > o - i && (this.process(n, 0), i = 0);
    for (let g = i; g < o; g++)
      r[g] = 0;
    ln(n, o - 8, BigInt(this.length * 8), s), this.process(n, 0);
    const c = $t(e), f = this.outputLen;
    if (f % 4)
      throw new Error("_sha2: outputLen should be aligned to 32bit");
    const d = f / 4, w = this.get();
    if (d > w.length)
      throw new Error("_sha2: outputLen bigger than state");
    for (let g = 0; g < d; g++)
      c.setUint32(4 * g, w[g], s);
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
]), j = /* @__PURE__ */ Uint32Array.from([
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
]), Nt = /* @__PURE__ */ BigInt(2 ** 32 - 1), we = /* @__PURE__ */ BigInt(32);
function bn(t, e = !1) {
  return e ? { h: Number(t & Nt), l: Number(t >> we & Nt) } : { h: Number(t >> we & Nt) | 0, l: Number(t & Nt) | 0 };
}
function gn(t, e = !1) {
  const r = t.length;
  let n = new Uint32Array(r), o = new Uint32Array(r);
  for (let s = 0; s < r; s++) {
    const { h: i, l: c } = bn(t[s], e);
    [n[s], o[s]] = [i, c];
  }
  return [n, o];
}
const ye = (t, e, r) => t >>> r, me = (t, e, r) => t << 32 - r | e >>> r, wt = (t, e, r) => t >>> r | e << 32 - r, yt = (t, e, r) => t << 32 - r | e >>> r, Rt = (t, e, r) => t << 64 - r | e >>> r - 32, Ot = (t, e, r) => t >>> r - 32 | e << 64 - r;
function nt(t, e, r, n) {
  const o = (e >>> 0) + (n >>> 0);
  return { h: t + r + (o / 2 ** 32 | 0) | 0, l: o | 0 };
}
const wn = (t, e, r) => (t >>> 0) + (e >>> 0) + (r >>> 0), yn = (t, e, r, n) => e + r + n + (t / 2 ** 32 | 0) | 0, mn = (t, e, r, n) => (t >>> 0) + (e >>> 0) + (r >>> 0) + (n >>> 0), pn = (t, e, r, n, o) => e + r + n + o + (t / 2 ** 32 | 0) | 0, xn = (t, e, r, n, o) => (t >>> 0) + (e >>> 0) + (r >>> 0) + (n >>> 0) + (o >>> 0), En = (t, e, r, n, o, s) => e + r + n + o + s + (t / 2 ** 32 | 0) | 0, Bn = /* @__PURE__ */ Uint32Array.from([
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
class vn extends qe {
  constructor(e = 32) {
    super(64, e, 8, !1), this.A = it[0] | 0, this.B = it[1] | 0, this.C = it[2] | 0, this.D = it[3] | 0, this.E = it[4] | 0, this.F = it[5] | 0, this.G = it[6] | 0, this.H = it[7] | 0;
  }
  get() {
    const { A: e, B: r, C: n, D: o, E: s, F: i, G: c, H: f } = this;
    return [e, r, n, o, s, i, c, f];
  }
  // prettier-ignore
  set(e, r, n, o, s, i, c, f) {
    this.A = e | 0, this.B = r | 0, this.C = n | 0, this.D = o | 0, this.E = s | 0, this.F = i | 0, this.G = c | 0, this.H = f | 0;
  }
  process(e, r) {
    for (let g = 0; g < 16; g++, r += 4)
      ct[g] = e.getUint32(r, !1);
    for (let g = 16; g < 64; g++) {
      const a = ct[g - 15], u = ct[g - 2], m = Q(a, 7) ^ Q(a, 18) ^ a >>> 3, p = Q(u, 17) ^ Q(u, 19) ^ u >>> 10;
      ct[g] = p + ct[g - 7] + m + ct[g - 16] | 0;
    }
    let { A: n, B: o, C: s, D: i, E: c, F: f, G: d, H: w } = this;
    for (let g = 0; g < 64; g++) {
      const a = Q(c, 6) ^ Q(c, 11) ^ Q(c, 25), u = w + a + dn(c, f, d) + Bn[g] + ct[g] | 0, p = (Q(n, 2) ^ Q(n, 13) ^ Q(n, 22)) + hn(n, o, s) | 0;
      w = d, d = f, f = c, c = i + u | 0, i = s, s = o, o = n, n = u + p | 0;
    }
    n = n + this.A | 0, o = o + this.B | 0, s = s + this.C | 0, i = i + this.D | 0, c = c + this.E | 0, f = f + this.F | 0, d = d + this.G | 0, w = w + this.H | 0, this.set(n, o, s, i, c, f, d, w);
  }
  roundClean() {
    xt(ct);
  }
  destroy() {
    this.set(0, 0, 0, 0, 0, 0, 0, 0), xt(this.buffer);
  }
}
const Le = gn([
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
].map((t) => BigInt(t))), An = Le[0], Sn = Le[1], ft = /* @__PURE__ */ new Uint32Array(80), at = /* @__PURE__ */ new Uint32Array(80);
class In extends qe {
  constructor(e = 64) {
    super(128, e, 16, !1), this.Ah = j[0] | 0, this.Al = j[1] | 0, this.Bh = j[2] | 0, this.Bl = j[3] | 0, this.Ch = j[4] | 0, this.Cl = j[5] | 0, this.Dh = j[6] | 0, this.Dl = j[7] | 0, this.Eh = j[8] | 0, this.El = j[9] | 0, this.Fh = j[10] | 0, this.Fl = j[11] | 0, this.Gh = j[12] | 0, this.Gl = j[13] | 0, this.Hh = j[14] | 0, this.Hl = j[15] | 0;
  }
  // prettier-ignore
  get() {
    const { Ah: e, Al: r, Bh: n, Bl: o, Ch: s, Cl: i, Dh: c, Dl: f, Eh: d, El: w, Fh: g, Fl: a, Gh: u, Gl: m, Hh: p, Hl: _ } = this;
    return [e, r, n, o, s, i, c, f, d, w, g, a, u, m, p, _];
  }
  // prettier-ignore
  set(e, r, n, o, s, i, c, f, d, w, g, a, u, m, p, _) {
    this.Ah = e | 0, this.Al = r | 0, this.Bh = n | 0, this.Bl = o | 0, this.Ch = s | 0, this.Cl = i | 0, this.Dh = c | 0, this.Dl = f | 0, this.Eh = d | 0, this.El = w | 0, this.Fh = g | 0, this.Fl = a | 0, this.Gh = u | 0, this.Gl = m | 0, this.Hh = p | 0, this.Hl = _ | 0;
  }
  process(e, r) {
    for (let A = 0; A < 16; A++, r += 4)
      ft[A] = e.getUint32(r), at[A] = e.getUint32(r += 4);
    for (let A = 16; A < 80; A++) {
      const V = ft[A - 15] | 0, K = at[A - 15] | 0, W = wt(V, K, 1) ^ wt(V, K, 8) ^ ye(V, K, 7), st = yt(V, K, 1) ^ yt(V, K, 8) ^ me(V, K, 7), k = ft[A - 2] | 0, I = at[A - 2] | 0, tt = wt(k, I, 19) ^ Rt(k, I, 61) ^ ye(k, I, 6), P = yt(k, I, 19) ^ Ot(k, I, 61) ^ me(k, I, 6), U = mn(st, P, at[A - 7], at[A - 16]), b = pn(U, W, tt, ft[A - 7], ft[A - 16]);
      ft[A] = b | 0, at[A] = U | 0;
    }
    let { Ah: n, Al: o, Bh: s, Bl: i, Ch: c, Cl: f, Dh: d, Dl: w, Eh: g, El: a, Fh: u, Fl: m, Gh: p, Gl: _, Hh: R, Hl: F } = this;
    for (let A = 0; A < 80; A++) {
      const V = wt(g, a, 14) ^ wt(g, a, 18) ^ Rt(g, a, 41), K = yt(g, a, 14) ^ yt(g, a, 18) ^ Ot(g, a, 41), W = g & u ^ ~g & p, st = a & m ^ ~a & _, k = xn(F, K, st, Sn[A], at[A]), I = En(k, R, V, W, An[A], ft[A]), tt = k | 0, P = wt(n, o, 28) ^ Rt(n, o, 34) ^ Rt(n, o, 39), U = yt(n, o, 28) ^ Ot(n, o, 34) ^ Ot(n, o, 39), b = n & s ^ n & c ^ s & c, h = o & i ^ o & f ^ i & f;
      R = p | 0, F = _ | 0, p = u | 0, _ = m | 0, u = g | 0, m = a | 0, { h: g, l: a } = nt(d | 0, w | 0, I | 0, tt | 0), d = c | 0, w = f | 0, c = s | 0, f = i | 0, s = n | 0, i = o | 0;
      const l = wn(tt, U, h);
      n = yn(l, I, P, b), o = l | 0;
    }
    ({ h: n, l: o } = nt(this.Ah | 0, this.Al | 0, n | 0, o | 0)), { h: s, l: i } = nt(this.Bh | 0, this.Bl | 0, s | 0, i | 0), { h: c, l: f } = nt(this.Ch | 0, this.Cl | 0, c | 0, f | 0), { h: d, l: w } = nt(this.Dh | 0, this.Dl | 0, d | 0, w | 0), { h: g, l: a } = nt(this.Eh | 0, this.El | 0, g | 0, a | 0), { h: u, l: m } = nt(this.Fh | 0, this.Fl | 0, u | 0, m | 0), { h: p, l: _ } = nt(this.Gh | 0, this.Gl | 0, p | 0, _ | 0), { h: R, l: F } = nt(this.Hh | 0, this.Hl | 0, R | 0, F | 0), this.set(n, o, s, i, c, f, d, w, g, a, u, m, p, _, R, F);
  }
  roundClean() {
    xt(ft, at);
  }
  destroy() {
    xt(this.buffer), this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  }
}
const Qt = /* @__PURE__ */ Oe(() => new vn()), hr = /* @__PURE__ */ Oe(() => new In());
class Te extends Re {
  constructor(e, r) {
    super(), this.finished = !1, this.destroyed = !1, Ue(e);
    const n = se(r);
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
    this.oHash.update(s), xt(s);
  }
  update(e) {
    return Tt(this), this.iHash.update(e), this;
  }
  digestInto(e) {
    Tt(this), ut(e, this.outputLen), this.finished = !0, this.iHash.digestInto(e), this.oHash.update(e), this.oHash.digestInto(e), this.destroy();
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
const Ce = (t, e, r) => new Te(t, e).update(r).digest();
Ce.create = (t, e) => new Te(t, e);
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const ie = /* @__PURE__ */ BigInt(0), Jt = /* @__PURE__ */ BigInt(1);
function Zt(t, e = "") {
  if (typeof t != "boolean") {
    const r = e && `"${e}"`;
    throw new Error(r + "expected boolean, got type=" + typeof t);
  }
  return t;
}
function lt(t, e, r = "") {
  const n = Dt(t), o = t?.length, s = e !== void 0;
  if (!n || s && o !== e) {
    const i = r && `"${r}" `, c = s ? ` of length ${e}` : "", f = n ? `length=${o}` : `type=${typeof t}`;
    throw new Error(i + "expected Uint8Array" + c + ", got " + f);
  }
  return t;
}
function qt(t) {
  const e = t.toString(16);
  return e.length & 1 ? "0" + e : e;
}
function Ze(t) {
  if (typeof t != "string")
    throw new Error("hex string expected, got " + typeof t);
  return t === "" ? ie : BigInt("0x" + t);
}
function vt(t) {
  return Ze(mt(t));
}
function Ke(t) {
  return ut(t), Ze(mt(Uint8Array.from(t).reverse()));
}
function Mt(t, e) {
  return Ct(t.toString(16).padStart(e * 2, "0"));
}
function Ve(t, e) {
  return Mt(t, e).reverse();
}
function Z(t, e, r) {
  let n;
  if (typeof e == "string")
    try {
      n = Ct(e);
    } catch (s) {
      throw new Error(t + " must be hex string or Uint8Array, cause: " + s);
    }
  else if (Dt(e))
    n = Uint8Array.from(e);
  else
    throw new Error(t + " must be hex string or Uint8Array");
  const o = n.length;
  if (typeof r == "number" && o !== r)
    throw new Error(t + " of length " + r + " expected, got " + o);
  return n;
}
const zt = (t) => typeof t == "bigint" && ie <= t;
function te(t, e, r) {
  return zt(t) && zt(e) && zt(r) && e <= t && t < r;
}
function Hn(t, e, r, n) {
  if (!te(e, r, n))
    throw new Error("expected valid " + t + ": " + r + " <= n < " + n + ", got " + e);
}
function ke(t) {
  let e;
  for (e = 0; t > ie; t >>= Jt, e += 1)
    ;
  return e;
}
const It = (t) => (Jt << BigInt(t)) - Jt;
function _n(t, e, r) {
  if (typeof t != "number" || t < 2)
    throw new Error("hashLen must be a number");
  if (typeof e != "number" || e < 2)
    throw new Error("qByteLen must be a number");
  if (typeof r != "function")
    throw new Error("hmacFn must be a function");
  const n = (u) => new Uint8Array(u), o = (u) => Uint8Array.of(u);
  let s = n(t), i = n(t), c = 0;
  const f = () => {
    s.fill(1), i.fill(0), c = 0;
  }, d = (...u) => r(i, s, ...u), w = (u = n(0)) => {
    i = d(o(0), u), s = d(), u.length !== 0 && (i = d(o(1), u), s = d());
  }, g = () => {
    if (c++ >= 1e3)
      throw new Error("drbg: tried 1000 values");
    let u = 0;
    const m = [];
    for (; u < e; ) {
      s = d();
      const p = s.slice();
      m.push(p), u += s.length;
    }
    return J(...m);
  };
  return (u, m) => {
    f(), w(u);
    let p;
    for (; !(p = m(g())); )
      w();
    return f(), p;
  };
}
function ce(t, e, r = {}) {
  if (!t || typeof t != "object")
    throw new Error("expected valid options object");
  function n(o, s, i) {
    const c = t[o];
    if (i && c === void 0)
      return;
    const f = typeof c;
    if (f !== s || c === null)
      throw new Error(`param "${o}" is invalid: expected ${s}, got ${f}`);
  }
  Object.entries(e).forEach(([o, s]) => n(o, s, !1)), Object.entries(r).forEach(([o, s]) => n(o, s, !0));
}
function pe(t) {
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
const z = BigInt(0), M = BigInt(1), dt = /* @__PURE__ */ BigInt(2), De = /* @__PURE__ */ BigInt(3), je = /* @__PURE__ */ BigInt(4), Me = /* @__PURE__ */ BigInt(5), Un = /* @__PURE__ */ BigInt(7), $e = /* @__PURE__ */ BigInt(8), Nn = /* @__PURE__ */ BigInt(9), ze = /* @__PURE__ */ BigInt(16);
function Y(t, e) {
  const r = t % e;
  return r >= z ? r : e + r;
}
function G(t, e, r) {
  let n = t;
  for (; e-- > z; )
    n *= n, n %= r;
  return n;
}
function xe(t, e) {
  if (t === z)
    throw new Error("invert: expected non-zero number");
  if (e <= z)
    throw new Error("invert: expected positive modulus, got " + e);
  let r = Y(t, e), n = e, o = z, s = M;
  for (; r !== z; ) {
    const c = n / r, f = n % r, d = o - s * c;
    n = r, r = f, o = s, s = d;
  }
  if (n !== M)
    throw new Error("invert: does not exist");
  return Y(o, e);
}
function fe(t, e, r) {
  if (!t.eql(t.sqr(e), r))
    throw new Error("Cannot find square root");
}
function Ge(t, e) {
  const r = (t.ORDER + M) / je, n = t.pow(e, r);
  return fe(t, n, e), n;
}
function Rn(t, e) {
  const r = (t.ORDER - Me) / $e, n = t.mul(e, dt), o = t.pow(n, r), s = t.mul(e, o), i = t.mul(t.mul(s, dt), o), c = t.mul(s, t.sub(i, t.ONE));
  return fe(t, c, e), c;
}
function On(t) {
  const e = Ht(t), r = Ye(t), n = r(e, e.neg(e.ONE)), o = r(e, n), s = r(e, e.neg(n)), i = (t + Un) / ze;
  return (c, f) => {
    let d = c.pow(f, i), w = c.mul(d, n);
    const g = c.mul(d, o), a = c.mul(d, s), u = c.eql(c.sqr(w), f), m = c.eql(c.sqr(g), f);
    d = c.cmov(d, w, u), w = c.cmov(a, g, m);
    const p = c.eql(c.sqr(w), f), _ = c.cmov(d, w, p);
    return fe(c, _, f), _;
  };
}
function Ye(t) {
  if (t < De)
    throw new Error("sqrt is not defined for small field");
  let e = t - M, r = 0;
  for (; e % dt === z; )
    e /= dt, r++;
  let n = dt;
  const o = Ht(t);
  for (; Ee(o, n) === 1; )
    if (n++ > 1e3)
      throw new Error("Cannot find square root: probably non-prime P");
  if (r === 1)
    return Ge;
  let s = o.pow(n, e);
  const i = (e + M) / dt;
  return function(f, d) {
    if (f.is0(d))
      return d;
    if (Ee(f, d) !== 1)
      throw new Error("Cannot find square root");
    let w = r, g = f.mul(f.ONE, s), a = f.pow(d, e), u = f.pow(d, i);
    for (; !f.eql(a, f.ONE); ) {
      if (f.is0(a))
        return f.ZERO;
      let m = 1, p = f.sqr(a);
      for (; !f.eql(p, f.ONE); )
        if (m++, p = f.sqr(p), m === w)
          throw new Error("Cannot find square root");
      const _ = M << BigInt(w - m - 1), R = f.pow(g, _);
      w = m, g = f.sqr(R), a = f.mul(a, g), u = f.mul(u, R);
    }
    return u;
  };
}
function qn(t) {
  return t % je === De ? Ge : t % $e === Me ? Rn : t % ze === Nn ? On(t) : Ye(t);
}
const Ln = [
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
function Tn(t) {
  const e = {
    ORDER: "bigint",
    MASK: "bigint",
    BYTES: "number",
    BITS: "number"
  }, r = Ln.reduce((n, o) => (n[o] = "function", n), e);
  return ce(t, r), t;
}
function Cn(t, e, r) {
  if (r < z)
    throw new Error("invalid exponent, negatives unsupported");
  if (r === z)
    return t.ONE;
  if (r === M)
    return e;
  let n = t.ONE, o = e;
  for (; r > z; )
    r & M && (n = t.mul(n, o)), o = t.sqr(o), r >>= M;
  return n;
}
function Fe(t, e, r = !1) {
  const n = new Array(e.length).fill(r ? t.ZERO : void 0), o = e.reduce((i, c, f) => t.is0(c) ? i : (n[f] = i, t.mul(i, c)), t.ONE), s = t.inv(o);
  return e.reduceRight((i, c, f) => t.is0(c) ? i : (n[f] = t.mul(i, n[f]), t.mul(i, c)), s), n;
}
function Ee(t, e) {
  const r = (t.ORDER - M) / dt, n = t.pow(e, r), o = t.eql(n, t.ONE), s = t.eql(n, t.ZERO), i = t.eql(n, t.neg(t.ONE));
  if (!o && !s && !i)
    throw new Error("invalid Legendre symbol result");
  return o ? 1 : s ? 0 : -1;
}
function Pe(t, e) {
  e !== void 0 && Wt(e);
  const r = e !== void 0 ? e : t.toString(2).length, n = Math.ceil(r / 8);
  return { nBitLength: r, nByteLength: n };
}
function Ht(t, e, r = !1, n = {}) {
  if (t <= z)
    throw new Error("invalid field: expected ORDER > 0, got " + t);
  let o, s, i = !1, c;
  if (typeof e == "object" && e != null) {
    if (n.sqrt || r)
      throw new Error("cannot specify opts in two arguments");
    const a = e;
    a.BITS && (o = a.BITS), a.sqrt && (s = a.sqrt), typeof a.isLE == "boolean" && (r = a.isLE), typeof a.modFromBytes == "boolean" && (i = a.modFromBytes), c = a.allowedLengths;
  } else
    typeof e == "number" && (o = e), n.sqrt && (s = n.sqrt);
  const { nBitLength: f, nByteLength: d } = Pe(t, o);
  if (d > 2048)
    throw new Error("invalid field: expected ORDER of <= 2048 bytes");
  let w;
  const g = Object.freeze({
    ORDER: t,
    isLE: r,
    BITS: f,
    BYTES: d,
    MASK: It(f),
    ZERO: z,
    ONE: M,
    allowedLengths: c,
    create: (a) => Y(a, t),
    isValid: (a) => {
      if (typeof a != "bigint")
        throw new Error("invalid field element: expected bigint, got " + typeof a);
      return z <= a && a < t;
    },
    is0: (a) => a === z,
    // is valid and invertible
    isValidNot0: (a) => !g.is0(a) && g.isValid(a),
    isOdd: (a) => (a & M) === M,
    neg: (a) => Y(-a, t),
    eql: (a, u) => a === u,
    sqr: (a) => Y(a * a, t),
    add: (a, u) => Y(a + u, t),
    sub: (a, u) => Y(a - u, t),
    mul: (a, u) => Y(a * u, t),
    pow: (a, u) => Cn(g, a, u),
    div: (a, u) => Y(a * xe(u, t), t),
    // Same as above, but doesn't normalize
    sqrN: (a) => a * a,
    addN: (a, u) => a + u,
    subN: (a, u) => a - u,
    mulN: (a, u) => a * u,
    inv: (a) => xe(a, t),
    sqrt: s || ((a) => (w || (w = qn(t)), w(g, a))),
    toBytes: (a) => r ? Ve(a, d) : Mt(a, d),
    fromBytes: (a, u = !0) => {
      if (c) {
        if (!c.includes(a.length) || a.length > d)
          throw new Error("Field.fromBytes: expected " + c + " bytes, got " + a.length);
        const p = new Uint8Array(d);
        p.set(a, r ? 0 : p.length - a.length), a = p;
      }
      if (a.length !== d)
        throw new Error("Field.fromBytes: expected " + d + " bytes, got " + a.length);
      let m = r ? Ke(a) : vt(a);
      if (i && (m = Y(m, t)), !u && !g.isValid(m))
        throw new Error("invalid field element: outside of range 0..ORDER");
      return m;
    },
    // TODO: we don't need it here, move out to separate fn
    invertBatch: (a) => Fe(g, a),
    // We can't move this out because Fp6, Fp12 implement it
    // and it's unclear what to return in there.
    cmov: (a, u, m) => m ? u : a
  });
  return Object.freeze(g);
}
function Xe(t) {
  if (typeof t != "bigint")
    throw new Error("field order must be bigint");
  const e = t.toString(2).length;
  return Math.ceil(e / 8);
}
function We(t) {
  const e = Xe(t);
  return e + Math.ceil(e / 2);
}
function Qe(t, e, r = !1) {
  const n = t.length, o = Xe(e), s = We(e);
  if (n < 16 || n < s || n > 1024)
    throw new Error("expected " + s + "-1024 bytes of input, got " + n);
  const i = r ? Ke(t) : vt(t), c = Y(i, e - M) + M;
  return r ? Ve(c, o) : Mt(c, o);
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const Et = BigInt(0), ht = BigInt(1);
function Kt(t, e) {
  const r = e.negate();
  return t ? r : e;
}
function Gt(t, e) {
  const r = Fe(t.Fp, e.map((n) => n.Z));
  return e.map((n, o) => t.fromAffine(n.toAffine(r[o])));
}
function Je(t, e) {
  if (!Number.isSafeInteger(t) || t <= 0 || t > e)
    throw new Error("invalid window size, expected [1.." + e + "], got W=" + t);
}
function Yt(t, e) {
  Je(t, e);
  const r = Math.ceil(e / t) + 1, n = 2 ** (t - 1), o = 2 ** t, s = It(t), i = BigInt(t);
  return { windows: r, windowSize: n, mask: s, maxNumber: o, shiftBy: i };
}
function Be(t, e, r) {
  const { windowSize: n, mask: o, maxNumber: s, shiftBy: i } = r;
  let c = Number(t & o), f = t >> i;
  c > n && (c -= s, f += ht);
  const d = e * n, w = d + Math.abs(c) - 1, g = c === 0, a = c < 0, u = e % 2 !== 0;
  return { nextN: f, offset: w, isZero: g, isNeg: a, isNegF: u, offsetF: d };
}
function Zn(t, e) {
  if (!Array.isArray(t))
    throw new Error("array expected");
  t.forEach((r, n) => {
    if (!(r instanceof e))
      throw new Error("invalid point at index " + n);
  });
}
function Kn(t, e) {
  if (!Array.isArray(t))
    throw new Error("array of scalars expected");
  t.forEach((r, n) => {
    if (!e.isValid(r))
      throw new Error("invalid scalar at index " + n);
  });
}
const Ft = /* @__PURE__ */ new WeakMap(), tn = /* @__PURE__ */ new WeakMap();
function Pt(t) {
  return tn.get(t) || 1;
}
function ve(t) {
  if (t !== Et)
    throw new Error("invalid wNAF");
}
class Vn {
  // Parametrized with a given Point class (not individual point)
  constructor(e, r) {
    this.BASE = e.BASE, this.ZERO = e.ZERO, this.Fn = e.Fn, this.bits = r;
  }
  // non-const time multiplication ladder
  _unsafeLadder(e, r, n = this.ZERO) {
    let o = e;
    for (; r > Et; )
      r & ht && (n = n.add(o)), o = o.double(), r >>= ht;
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
    const { windows: n, windowSize: o } = Yt(r, this.bits), s = [];
    let i = e, c = i;
    for (let f = 0; f < n; f++) {
      c = i, s.push(c);
      for (let d = 1; d < o; d++)
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
    const i = Yt(e, this.bits);
    for (let c = 0; c < i.windows; c++) {
      const { nextN: f, offset: d, isZero: w, isNeg: g, isNegF: a, offsetF: u } = Be(n, c, i);
      n = f, w ? s = s.add(Kt(a, r[u])) : o = o.add(Kt(g, r[d]));
    }
    return ve(n), { p: o, f: s };
  }
  /**
   * Implements ec unsafe (non const-time) multiplication using precomputed tables and w-ary non-adjacent form.
   * @param acc accumulator point to add result of multiplication
   * @returns point
   */
  wNAFUnsafe(e, r, n, o = this.ZERO) {
    const s = Yt(e, this.bits);
    for (let i = 0; i < s.windows && n !== Et; i++) {
      const { nextN: c, offset: f, isZero: d, isNeg: w } = Be(n, i, s);
      if (n = c, !d) {
        const g = r[f];
        o = o.add(w ? g.negate() : g);
      }
    }
    return ve(n), o;
  }
  getPrecomputes(e, r, n) {
    let o = Ft.get(r);
    return o || (o = this.precomputeWindow(r, e), e !== 1 && (typeof n == "function" && (o = n(o)), Ft.set(r, o))), o;
  }
  cached(e, r, n) {
    const o = Pt(e);
    return this.wNAF(o, this.getPrecomputes(o, e, n), r);
  }
  unsafe(e, r, n, o) {
    const s = Pt(e);
    return s === 1 ? this._unsafeLadder(e, r, o) : this.wNAFUnsafe(s, this.getPrecomputes(s, e, n), r, o);
  }
  // We calculate precomputes for elliptic curve point multiplication
  // using windowed method. This specifies window size and
  // stores precomputed values. Usually only base point would be precomputed.
  createCache(e, r) {
    Je(r, this.bits), tn.set(e, r), Ft.delete(e);
  }
  hasCache(e) {
    return Pt(e) !== 1;
  }
}
function kn(t, e, r, n) {
  let o = e, s = t.ZERO, i = t.ZERO;
  for (; r > Et || n > Et; )
    r & ht && (s = s.add(o)), n & ht && (i = i.add(o)), o = o.double(), r >>= ht, n >>= ht;
  return { p1: s, p2: i };
}
function Dn(t, e, r, n) {
  Zn(r, t), Kn(n, e);
  const o = r.length, s = n.length;
  if (o !== s)
    throw new Error("arrays of points and scalars must have equal length");
  const i = t.ZERO, c = ke(BigInt(o));
  let f = 1;
  c > 12 ? f = c - 3 : c > 4 ? f = c - 2 : c > 0 && (f = 2);
  const d = It(f), w = new Array(Number(d) + 1).fill(i), g = Math.floor((e.BITS - 1) / f) * f;
  let a = i;
  for (let u = g; u >= 0; u -= f) {
    w.fill(i);
    for (let p = 0; p < s; p++) {
      const _ = n[p], R = Number(_ >> BigInt(u) & d);
      w[R] = w[R].add(r[p]);
    }
    let m = i;
    for (let p = w.length - 1, _ = i; p > 0; p--)
      _ = _.add(w[p]), m = m.add(_);
    if (a = a.add(m), u !== 0)
      for (let p = 0; p < f; p++)
        a = a.double();
  }
  return a;
}
function Ae(t, e, r) {
  if (e) {
    if (e.ORDER !== t)
      throw new Error("Field.ORDER must match order: Fp == p, Fn == n");
    return Tn(e), e;
  } else
    return Ht(t, { isLE: r });
}
function jn(t, e, r = {}, n) {
  if (n === void 0 && (n = t === "edwards"), !e || typeof e != "object")
    throw new Error(`expected valid ${t} CURVE object`);
  for (const f of ["p", "n", "h"]) {
    const d = e[f];
    if (!(typeof d == "bigint" && d > Et))
      throw new Error(`CURVE.${f} must be positive bigint`);
  }
  const o = Ae(e.p, r.Fp, n), s = Ae(e.n, r.Fn, n), c = ["Gx", "Gy", "a", "b"];
  for (const f of c)
    if (!o.isValid(e[f]))
      throw new Error(`CURVE.${f} must be valid field element of CURVE.Fp`);
  return e = Object.freeze(Object.assign({}, e)), { CURVE: e, Fp: o, Fn: s };
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const Se = (t, e) => (t + (t >= 0 ? e : -e) / en) / e;
function Mn(t, e, r) {
  const [[n, o], [s, i]] = e, c = Se(i * t, r), f = Se(-o * t, r);
  let d = t - c * n - f * s, w = -c * o - f * i;
  const g = d < ot, a = w < ot;
  g && (d = -d), a && (w = -w);
  const u = It(Math.ceil(ke(r) / 2)) + pt;
  if (d < ot || d >= u || w < ot || w >= u)
    throw new Error("splitScalar (endomorphism): failed, k=" + t);
  return { k1neg: g, k1: d, k2neg: a, k2: w };
}
function ee(t) {
  if (!["compact", "recovered", "der"].includes(t))
    throw new Error('Signature format must be "compact", "recovered", or "der"');
  return t;
}
function Xt(t, e) {
  const r = {};
  for (let n of Object.keys(e))
    r[n] = t[n] === void 0 ? e[n] : t[n];
  return Zt(r.lowS, "lowS"), Zt(r.prehash, "prehash"), r.format !== void 0 && ee(r.format), r;
}
class $n extends Error {
  constructor(e = "") {
    super(e);
  }
}
const rt = {
  // asn.1 DER encoding utils
  Err: $n,
  // Basic building block is TLV (Tag-Length-Value)
  _tlv: {
    encode: (t, e) => {
      const { Err: r } = rt;
      if (t < 0 || t > 256)
        throw new r("tlv.encode: wrong tag");
      if (e.length & 1)
        throw new r("tlv.encode: unpadded data");
      const n = e.length / 2, o = qt(n);
      if (o.length / 2 & 128)
        throw new r("tlv.encode: long form length too big");
      const s = n > 127 ? qt(o.length / 2 | 128) : "";
      return qt(t) + s + o + e;
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
        const f = o & 127;
        if (!f)
          throw new r("tlv.decode(long): indefinite length not supported");
        if (f > 4)
          throw new r("tlv.decode(long): byte length is too big");
        const d = e.subarray(n, n + f);
        if (d.length !== f)
          throw new r("tlv.decode: length bytes not complete");
        if (d[0] === 0)
          throw new r("tlv.decode(long): zero leftmost byte");
        for (const w of d)
          i = i << 8 | w;
        if (n += f, i < 128)
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
      let r = qt(t);
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
      return vt(t);
    }
  },
  toSig(t) {
    const { Err: e, _int: r, _tlv: n } = rt, o = Z("signature", t), { v: s, l: i } = n.decode(48, o);
    if (i.length)
      throw new e("invalid signature: left bytes after parsing");
    const { v: c, l: f } = n.decode(2, s), { v: d, l: w } = n.decode(2, f);
    if (w.length)
      throw new e("invalid signature: left bytes after parsing");
    return { r: r.decode(c), s: r.decode(d) };
  },
  hexFromSig(t) {
    const { _tlv: e, _int: r } = rt, n = e.encode(2, r.encode(t.r)), o = e.encode(2, r.encode(t.s)), s = n + o;
    return e.encode(48, s);
  }
}, ot = BigInt(0), pt = BigInt(1), en = BigInt(2), Lt = BigInt(3), zn = BigInt(4);
function bt(t, e) {
  const { BYTES: r } = t;
  let n;
  if (typeof e == "bigint")
    n = e;
  else {
    let o = Z("private key", e);
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
function Gn(t, e = {}) {
  const r = jn("weierstrass", t, e), { Fp: n, Fn: o } = r;
  let s = r.CURVE;
  const { h: i, n: c } = s;
  ce(e, {}, {
    allowInfinityPoint: "boolean",
    clearCofactor: "function",
    isTorsionFree: "function",
    fromBytes: "function",
    toBytes: "function",
    endo: "object",
    wrapPrivateKey: "boolean"
  });
  const { endo: f } = e;
  if (f && (!n.is0(s.a) || typeof f.beta != "bigint" || !Array.isArray(f.basises)))
    throw new Error('invalid endo: expected "beta": bigint and "basises": array');
  const d = rn(n, o);
  function w() {
    if (!n.isOdd)
      throw new Error("compression is not supported: Field does not have .isOdd()");
  }
  function g(U, b, h) {
    const { x: l, y } = b.toAffine(), x = n.toBytes(l);
    if (Zt(h, "isCompressed"), h) {
      w();
      const v = !n.isOdd(y);
      return J(nn(v), x);
    } else
      return J(Uint8Array.of(4), x, n.toBytes(y));
  }
  function a(U) {
    lt(U, void 0, "Point");
    const { publicKey: b, publicKeyUncompressed: h } = d, l = U.length, y = U[0], x = U.subarray(1);
    if (l === b && (y === 2 || y === 3)) {
      const v = n.fromBytes(x);
      if (!n.isValid(v))
        throw new Error("bad point: is not on curve, wrong x");
      const B = p(v);
      let E;
      try {
        E = n.sqrt(B);
      } catch (T) {
        const O = T instanceof Error ? ": " + T.message : "";
        throw new Error("bad point: is not on curve, sqrt error" + O);
      }
      w();
      const S = n.isOdd(E);
      return (y & 1) === 1 !== S && (E = n.neg(E)), { x: v, y: E };
    } else if (l === h && y === 4) {
      const v = n.BYTES, B = n.fromBytes(x.subarray(0, v)), E = n.fromBytes(x.subarray(v, v * 2));
      if (!_(B, E))
        throw new Error("bad point: is not on curve");
      return { x: B, y: E };
    } else
      throw new Error(`bad point: got length ${l}, expected compressed=${b} or uncompressed=${h}`);
  }
  const u = e.toBytes || g, m = e.fromBytes || a;
  function p(U) {
    const b = n.sqr(U), h = n.mul(b, U);
    return n.add(n.add(h, n.mul(U, s.a)), s.b);
  }
  function _(U, b) {
    const h = n.sqr(b), l = p(U);
    return n.eql(h, l);
  }
  if (!_(s.Gx, s.Gy))
    throw new Error("bad curve params: generator point");
  const R = n.mul(n.pow(s.a, Lt), zn), F = n.mul(n.sqr(s.b), BigInt(27));
  if (n.is0(n.add(R, F)))
    throw new Error("bad curve params: a or b");
  function A(U, b, h = !1) {
    if (!n.isValid(b) || h && n.is0(b))
      throw new Error(`bad point coordinate ${U}`);
    return b;
  }
  function V(U) {
    if (!(U instanceof I))
      throw new Error("ProjectivePoint expected");
  }
  function K(U) {
    if (!f || !f.basises)
      throw new Error("no endo");
    return Mn(U, f.basises, o.ORDER);
  }
  const W = pe((U, b) => {
    const { X: h, Y: l, Z: y } = U;
    if (n.eql(y, n.ONE))
      return { x: h, y: l };
    const x = U.is0();
    b == null && (b = x ? n.ONE : n.inv(y));
    const v = n.mul(h, b), B = n.mul(l, b), E = n.mul(y, b);
    if (x)
      return { x: n.ZERO, y: n.ZERO };
    if (!n.eql(E, n.ONE))
      throw new Error("invZ was invalid");
    return { x: v, y: B };
  }), st = pe((U) => {
    if (U.is0()) {
      if (e.allowInfinityPoint && !n.is0(U.Y))
        return;
      throw new Error("bad point: ZERO");
    }
    const { x: b, y: h } = U.toAffine();
    if (!n.isValid(b) || !n.isValid(h))
      throw new Error("bad point: x or y not field elements");
    if (!_(b, h))
      throw new Error("bad point: equation left != right");
    if (!U.isTorsionFree())
      throw new Error("bad point: not in prime-order subgroup");
    return !0;
  });
  function k(U, b, h, l, y) {
    return h = new I(n.mul(h.X, U), h.Y, h.Z), b = Kt(l, b), h = Kt(y, h), b.add(h);
  }
  class I {
    /** Does NOT validate if the point is valid. Use `.assertValidity()`. */
    constructor(b, h, l) {
      this.X = A("x", b), this.Y = A("y", h, !0), this.Z = A("z", l), Object.freeze(this);
    }
    static CURVE() {
      return s;
    }
    /** Does NOT validate if the point is valid. Use `.assertValidity()`. */
    static fromAffine(b) {
      const { x: h, y: l } = b || {};
      if (!b || !n.isValid(h) || !n.isValid(l))
        throw new Error("invalid affine point");
      if (b instanceof I)
        throw new Error("projective point not allowed");
      return n.is0(h) && n.is0(l) ? I.ZERO : new I(h, l, n.ONE);
    }
    static fromBytes(b) {
      const h = I.fromAffine(m(lt(b, void 0, "point")));
      return h.assertValidity(), h;
    }
    static fromHex(b) {
      return I.fromBytes(Z("pointHex", b));
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
    precompute(b = 8, h = !0) {
      return P.createCache(this, b), h || this.multiply(Lt), this;
    }
    // TODO: return `this`
    /** A point on curve is valid if it conforms to equation. */
    assertValidity() {
      st(this);
    }
    hasEvenY() {
      const { y: b } = this.toAffine();
      if (!n.isOdd)
        throw new Error("Field doesn't support isOdd");
      return !n.isOdd(b);
    }
    /** Compare one point to another. */
    equals(b) {
      V(b);
      const { X: h, Y: l, Z: y } = this, { X: x, Y: v, Z: B } = b, E = n.eql(n.mul(h, B), n.mul(x, y)), S = n.eql(n.mul(l, B), n.mul(v, y));
      return E && S;
    }
    /** Flips point to one corresponding to (x, -y) in Affine coordinates. */
    negate() {
      return new I(this.X, n.neg(this.Y), this.Z);
    }
    // Renes-Costello-Batina exception-free doubling formula.
    // There is 30% faster Jacobian formula, but it is not complete.
    // https://eprint.iacr.org/2015/1060, algorithm 3
    // Cost: 8M + 3S + 3*a + 2*b3 + 15add.
    double() {
      const { a: b, b: h } = s, l = n.mul(h, Lt), { X: y, Y: x, Z: v } = this;
      let B = n.ZERO, E = n.ZERO, S = n.ZERO, H = n.mul(y, y), T = n.mul(x, x), O = n.mul(v, v), N = n.mul(y, x);
      return N = n.add(N, N), S = n.mul(y, v), S = n.add(S, S), B = n.mul(b, S), E = n.mul(l, O), E = n.add(B, E), B = n.sub(T, E), E = n.add(T, E), E = n.mul(B, E), B = n.mul(N, B), S = n.mul(l, S), O = n.mul(b, O), N = n.sub(H, O), N = n.mul(b, N), N = n.add(N, S), S = n.add(H, H), H = n.add(S, H), H = n.add(H, O), H = n.mul(H, N), E = n.add(E, H), O = n.mul(x, v), O = n.add(O, O), H = n.mul(O, N), B = n.sub(B, H), S = n.mul(O, T), S = n.add(S, S), S = n.add(S, S), new I(B, E, S);
    }
    // Renes-Costello-Batina exception-free addition formula.
    // There is 30% faster Jacobian formula, but it is not complete.
    // https://eprint.iacr.org/2015/1060, algorithm 1
    // Cost: 12M + 0S + 3*a + 3*b3 + 23add.
    add(b) {
      V(b);
      const { X: h, Y: l, Z: y } = this, { X: x, Y: v, Z: B } = b;
      let E = n.ZERO, S = n.ZERO, H = n.ZERO;
      const T = s.a, O = n.mul(s.b, Lt);
      let N = n.mul(h, x), q = n.mul(l, v), C = n.mul(y, B), $ = n.add(h, l), L = n.add(x, v);
      $ = n.mul($, L), L = n.add(N, q), $ = n.sub($, L), L = n.add(h, y);
      let D = n.add(x, B);
      return L = n.mul(L, D), D = n.add(N, C), L = n.sub(L, D), D = n.add(l, y), E = n.add(v, B), D = n.mul(D, E), E = n.add(q, C), D = n.sub(D, E), H = n.mul(T, L), E = n.mul(O, C), H = n.add(E, H), E = n.sub(q, H), H = n.add(q, H), S = n.mul(E, H), q = n.add(N, N), q = n.add(q, N), C = n.mul(T, C), L = n.mul(O, L), q = n.add(q, C), C = n.sub(N, C), C = n.mul(T, C), L = n.add(L, C), N = n.mul(q, L), S = n.add(S, N), N = n.mul(D, L), E = n.mul($, E), E = n.sub(E, N), N = n.mul($, q), H = n.mul(D, H), H = n.add(H, N), new I(E, S, H);
    }
    subtract(b) {
      return this.add(b.negate());
    }
    is0() {
      return this.equals(I.ZERO);
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
    multiply(b) {
      const { endo: h } = e;
      if (!o.isValidNot0(b))
        throw new Error("invalid scalar: out of range");
      let l, y;
      const x = (v) => P.cached(this, v, (B) => Gt(I, B));
      if (h) {
        const { k1neg: v, k1: B, k2neg: E, k2: S } = K(b), { p: H, f: T } = x(B), { p: O, f: N } = x(S);
        y = T.add(N), l = k(h.beta, H, O, v, E);
      } else {
        const { p: v, f: B } = x(b);
        l = v, y = B;
      }
      return Gt(I, [l, y])[0];
    }
    /**
     * Non-constant-time multiplication. Uses double-and-add algorithm.
     * It's faster, but should only be used when you don't care about
     * an exposed secret key e.g. sig verification, which works over *public* keys.
     */
    multiplyUnsafe(b) {
      const { endo: h } = e, l = this;
      if (!o.isValid(b))
        throw new Error("invalid scalar: out of range");
      if (b === ot || l.is0())
        return I.ZERO;
      if (b === pt)
        return l;
      if (P.hasCache(this))
        return this.multiply(b);
      if (h) {
        const { k1neg: y, k1: x, k2neg: v, k2: B } = K(b), { p1: E, p2: S } = kn(I, l, x, B);
        return k(h.beta, E, S, y, v);
      } else
        return P.unsafe(l, b);
    }
    multiplyAndAddUnsafe(b, h, l) {
      const y = this.multiplyUnsafe(h).add(b.multiplyUnsafe(l));
      return y.is0() ? void 0 : y;
    }
    /**
     * Converts Projective point to affine (x, y) coordinates.
     * @param invertedZ Z^-1 (inverted zero) - optional, precomputation is useful for invertBatch
     */
    toAffine(b) {
      return W(this, b);
    }
    /**
     * Checks whether Point is free of torsion elements (is in prime subgroup).
     * Always torsion-free for cofactor=1 curves.
     */
    isTorsionFree() {
      const { isTorsionFree: b } = e;
      return i === pt ? !0 : b ? b(I, this) : P.unsafe(this, c).is0();
    }
    clearCofactor() {
      const { clearCofactor: b } = e;
      return i === pt ? this : b ? b(I, this) : this.multiplyUnsafe(i);
    }
    isSmallOrder() {
      return this.multiplyUnsafe(i).is0();
    }
    toBytes(b = !0) {
      return Zt(b, "isCompressed"), this.assertValidity(), u(I, this, b);
    }
    toHex(b = !0) {
      return mt(this.toBytes(b));
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
    toRawBytes(b = !0) {
      return this.toBytes(b);
    }
    _setWindowSize(b) {
      this.precompute(b);
    }
    static normalizeZ(b) {
      return Gt(I, b);
    }
    static msm(b, h) {
      return Dn(I, o, b, h);
    }
    static fromPrivateKey(b) {
      return I.BASE.multiply(bt(o, b));
    }
  }
  I.BASE = new I(s.Gx, s.Gy, n.ONE), I.ZERO = new I(n.ZERO, n.ONE, n.ZERO), I.Fp = n, I.Fn = o;
  const tt = o.BITS, P = new Vn(I, e.endo ? Math.ceil(tt / 2) : tt);
  return I.BASE.precompute(8), I;
}
function nn(t) {
  return Uint8Array.of(t ? 2 : 3);
}
function rn(t, e) {
  return {
    secretKey: e.BYTES,
    publicKey: 1 + t.BYTES,
    publicKeyUncompressed: 1 + 2 * t.BYTES,
    publicKeyHasPrefix: !0,
    signature: 2 * e.BYTES
  };
}
function Yn(t, e = {}) {
  const { Fn: r } = t, n = e.randomBytes || jt, o = Object.assign(rn(t.Fp, r), { seed: We(r.ORDER) });
  function s(u) {
    try {
      return !!bt(r, u);
    } catch {
      return !1;
    }
  }
  function i(u, m) {
    const { publicKey: p, publicKeyUncompressed: _ } = o;
    try {
      const R = u.length;
      return m === !0 && R !== p || m === !1 && R !== _ ? !1 : !!t.fromBytes(u);
    } catch {
      return !1;
    }
  }
  function c(u = n(o.seed)) {
    return Qe(lt(u, o.seed, "seed"), r.ORDER);
  }
  function f(u, m = !0) {
    return t.BASE.multiply(bt(r, u)).toBytes(m);
  }
  function d(u) {
    const m = c(u);
    return { secretKey: m, publicKey: f(m) };
  }
  function w(u) {
    if (typeof u == "bigint")
      return !1;
    if (u instanceof t)
      return !0;
    const { secretKey: m, publicKey: p, publicKeyUncompressed: _ } = o;
    if (r.allowedLengths || m === p)
      return;
    const R = Z("key", u).length;
    return R === p || R === _;
  }
  function g(u, m, p = !0) {
    if (w(u) === !0)
      throw new Error("first arg must be private key");
    if (w(m) === !1)
      throw new Error("second arg must be public key");
    const _ = bt(r, u);
    return t.fromHex(m).multiply(_).toBytes(p);
  }
  return Object.freeze({ getPublicKey: f, getSharedSecret: g, keygen: d, Point: t, utils: {
    isValidSecretKey: s,
    isValidPublicKey: i,
    randomSecretKey: c,
    // TODO: remove
    isValidPrivateKey: s,
    randomPrivateKey: c,
    normPrivateKeyToScalar: (u) => bt(r, u),
    precompute(u = 8, m = t.BASE) {
      return m.precompute(u, !1);
    }
  }, lengths: o });
}
function Fn(t, e, r = {}) {
  Ue(e), ce(r, {}, {
    hmac: "function",
    lowS: "boolean",
    randomBytes: "function",
    bits2int: "function",
    bits2int_modN: "function"
  });
  const n = r.randomBytes || jt, o = r.hmac || ((h, ...l) => Ce(e, h, J(...l))), { Fp: s, Fn: i } = t, { ORDER: c, BITS: f } = i, { keygen: d, getPublicKey: w, getSharedSecret: g, utils: a, lengths: u } = Yn(t, r), m = {
    prehash: !1,
    lowS: typeof r.lowS == "boolean" ? r.lowS : !1,
    format: void 0,
    //'compact' as ECDSASigFormat,
    extraEntropy: !1
  }, p = "compact";
  function _(h) {
    const l = c >> pt;
    return h > l;
  }
  function R(h, l) {
    if (!i.isValidNot0(l))
      throw new Error(`invalid signature ${h}: out of range 1..Point.Fn.ORDER`);
    return l;
  }
  function F(h, l) {
    ee(l);
    const y = u.signature, x = l === "compact" ? y : l === "recovered" ? y + 1 : void 0;
    return lt(h, x, `${l} signature`);
  }
  class A {
    constructor(l, y, x) {
      this.r = R("r", l), this.s = R("s", y), x != null && (this.recovery = x), Object.freeze(this);
    }
    static fromBytes(l, y = p) {
      F(l, y);
      let x;
      if (y === "der") {
        const { r: S, s: H } = rt.toSig(lt(l));
        return new A(S, H);
      }
      y === "recovered" && (x = l[0], y = "compact", l = l.subarray(1));
      const v = i.BYTES, B = l.subarray(0, v), E = l.subarray(v, v * 2);
      return new A(i.fromBytes(B), i.fromBytes(E), x);
    }
    static fromHex(l, y) {
      return this.fromBytes(Ct(l), y);
    }
    addRecoveryBit(l) {
      return new A(this.r, this.s, l);
    }
    recoverPublicKey(l) {
      const y = s.ORDER, { r: x, s: v, recovery: B } = this;
      if (B == null || ![0, 1, 2, 3].includes(B))
        throw new Error("recovery id invalid");
      if (c * en < y && B > 1)
        throw new Error("recovery id is ambiguous for h>1 curve");
      const S = B === 2 || B === 3 ? x + c : x;
      if (!s.isValid(S))
        throw new Error("recovery id 2 or 3 invalid");
      const H = s.toBytes(S), T = t.fromBytes(J(nn((B & 1) === 0), H)), O = i.inv(S), N = K(Z("msgHash", l)), q = i.create(-N * O), C = i.create(v * O), $ = t.BASE.multiplyUnsafe(q).add(T.multiplyUnsafe(C));
      if ($.is0())
        throw new Error("point at infinify");
      return $.assertValidity(), $;
    }
    // Signatures should be low-s, to prevent malleability.
    hasHighS() {
      return _(this.s);
    }
    toBytes(l = p) {
      if (ee(l), l === "der")
        return Ct(rt.hexFromSig(this));
      const y = i.toBytes(this.r), x = i.toBytes(this.s);
      if (l === "recovered") {
        if (this.recovery == null)
          throw new Error("recovery bit must be present");
        return J(Uint8Array.of(this.recovery), y, x);
      }
      return J(y, x);
    }
    toHex(l) {
      return mt(this.toBytes(l));
    }
    // TODO: remove
    assertValidity() {
    }
    static fromCompact(l) {
      return A.fromBytes(Z("sig", l), "compact");
    }
    static fromDER(l) {
      return A.fromBytes(Z("sig", l), "der");
    }
    normalizeS() {
      return this.hasHighS() ? new A(this.r, i.neg(this.s), this.recovery) : this;
    }
    toDERRawBytes() {
      return this.toBytes("der");
    }
    toDERHex() {
      return mt(this.toBytes("der"));
    }
    toCompactRawBytes() {
      return this.toBytes("compact");
    }
    toCompactHex() {
      return mt(this.toBytes("compact"));
    }
  }
  const V = r.bits2int || function(l) {
    if (l.length > 8192)
      throw new Error("input is too large");
    const y = vt(l), x = l.length * 8 - f;
    return x > 0 ? y >> BigInt(x) : y;
  }, K = r.bits2int_modN || function(l) {
    return i.create(V(l));
  }, W = It(f);
  function st(h) {
    return Hn("num < 2^" + f, h, ot, W), i.toBytes(h);
  }
  function k(h, l) {
    return lt(h, void 0, "message"), l ? lt(e(h), void 0, "prehashed message") : h;
  }
  function I(h, l, y) {
    if (["recovered", "canonical"].some((q) => q in y))
      throw new Error("sign() legacy options not supported");
    const { lowS: x, prehash: v, extraEntropy: B } = Xt(y, m);
    h = k(h, v);
    const E = K(h), S = bt(i, l), H = [st(S), st(E)];
    if (B != null && B !== !1) {
      const q = B === !0 ? n(u.secretKey) : B;
      H.push(Z("extraEntropy", q));
    }
    const T = J(...H), O = E;
    function N(q) {
      const C = V(q);
      if (!i.isValidNot0(C))
        return;
      const $ = i.inv(C), L = t.BASE.multiply(C).toAffine(), D = i.create(L.x);
      if (D === ot)
        return;
      const Ut = i.create($ * i.create(O + D * S));
      if (Ut === ot)
        return;
      let he = (L.x === D ? 0 : 2) | Number(L.y & pt), be = Ut;
      return x && _(Ut) && (be = i.neg(Ut), he ^= 1), new A(D, be, he);
    }
    return { seed: T, k2sig: N };
  }
  function tt(h, l, y = {}) {
    h = Z("message", h);
    const { seed: x, k2sig: v } = I(h, l, y);
    return _n(e.outputLen, i.BYTES, o)(x, v);
  }
  function P(h) {
    let l;
    const y = typeof h == "string" || Dt(h), x = !y && h !== null && typeof h == "object" && typeof h.r == "bigint" && typeof h.s == "bigint";
    if (!y && !x)
      throw new Error("invalid signature, expected Uint8Array, hex string or Signature instance");
    if (x)
      l = new A(h.r, h.s);
    else if (y) {
      try {
        l = A.fromBytes(Z("sig", h), "der");
      } catch (v) {
        if (!(v instanceof rt.Err))
          throw v;
      }
      if (!l)
        try {
          l = A.fromBytes(Z("sig", h), "compact");
        } catch {
          return !1;
        }
    }
    return l || !1;
  }
  function U(h, l, y, x = {}) {
    const { lowS: v, prehash: B, format: E } = Xt(x, m);
    if (y = Z("publicKey", y), l = k(Z("message", l), B), "strict" in x)
      throw new Error("options.strict was renamed to lowS");
    const S = E === void 0 ? P(h) : A.fromBytes(Z("sig", h), E);
    if (S === !1)
      return !1;
    try {
      const H = t.fromBytes(y);
      if (v && S.hasHighS())
        return !1;
      const { r: T, s: O } = S, N = K(l), q = i.inv(O), C = i.create(N * q), $ = i.create(T * q), L = t.BASE.multiplyUnsafe(C).add(H.multiplyUnsafe($));
      return L.is0() ? !1 : i.create(L.x) === T;
    } catch {
      return !1;
    }
  }
  function b(h, l, y = {}) {
    const { prehash: x } = Xt(y, m);
    return l = k(l, x), A.fromBytes(h, "recovered").recoverPublicKey(l).toBytes();
  }
  return Object.freeze({
    keygen: d,
    getPublicKey: w,
    getSharedSecret: g,
    utils: a,
    lengths: u,
    Point: t,
    sign: tt,
    verify: U,
    recoverPublicKey: b,
    Signature: A,
    hash: e
  });
}
function Pn(t) {
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
  const o = Ht(e.n, {
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
function Xn(t) {
  const { CURVE: e, curveOpts: r } = Pn(t), n = {
    hmac: t.hmac,
    randomBytes: t.randomBytes,
    lowS: t.lowS,
    bits2int: t.bits2int,
    bits2int_modN: t.bits2int_modN
  };
  return { CURVE: e, curveOpts: r, hash: t.hash, ecdsaOpts: n };
}
function Wn(t, e) {
  const r = e.Point;
  return Object.assign({}, e, {
    ProjectivePoint: r,
    CURVE: Object.assign({}, t, Pe(r.Fn.ORDER, r.Fn.BITS))
  });
}
function Qn(t) {
  const { CURVE: e, curveOpts: r, hash: n, ecdsaOpts: o } = Xn(t), s = Gn(e, r), i = Fn(s, n, o);
  return Wn(t, i);
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
function Jn(t, e) {
  const r = (n) => Qn({ ...t, hash: n });
  return { ...r(e), create: r };
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const Bt = {
  p: BigInt("0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f"),
  n: BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141"),
  h: BigInt(1),
  a: BigInt(0),
  b: BigInt(7),
  Gx: BigInt("0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"),
  Gy: BigInt("0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8")
}, tr = {
  beta: BigInt("0x7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee"),
  basises: [
    [BigInt("0x3086d221a7d46bcde86c90e49284eb15"), -BigInt("0xe4437ed6010e88286f547fa90abfe4c3")],
    [BigInt("0x114ca50f7a8e2f3f657c1108d9d44cfd8"), BigInt("0x3086d221a7d46bcde86c90e49284eb15")]
  ]
}, er = /* @__PURE__ */ BigInt(0), Ie = /* @__PURE__ */ BigInt(1), ne = /* @__PURE__ */ BigInt(2);
function nr(t) {
  const e = Bt.p, r = BigInt(3), n = BigInt(6), o = BigInt(11), s = BigInt(22), i = BigInt(23), c = BigInt(44), f = BigInt(88), d = t * t * t % e, w = d * d * t % e, g = G(w, r, e) * w % e, a = G(g, r, e) * w % e, u = G(a, ne, e) * d % e, m = G(u, o, e) * u % e, p = G(m, s, e) * m % e, _ = G(p, c, e) * p % e, R = G(_, f, e) * _ % e, F = G(R, c, e) * p % e, A = G(F, r, e) * w % e, V = G(A, i, e) * m % e, K = G(V, n, e) * d % e, W = G(K, ne, e);
  if (!Vt.eql(Vt.sqr(W), t))
    throw new Error("Cannot find square root");
  return W;
}
const Vt = Ht(Bt.p, { sqrt: nr }), ae = Jn({ ...Bt, Fp: Vt, lowS: !0, endo: tr }, Qt), He = {};
function kt(t, ...e) {
  let r = He[t];
  if (r === void 0) {
    const n = Qt(oe(t));
    r = J(n, n), He[t] = r;
  }
  return Qt(J(r, ...e));
}
const ue = (t) => t.toBytes(!0).slice(1), At = ae.Point, le = (t) => t % ne === er;
function re(t) {
  const { Fn: e, BASE: r } = At, n = bt(e, t), o = r.multiply(n);
  return { scalar: le(o.y) ? n : e.neg(n), bytes: ue(o) };
}
function on(t) {
  const e = Vt;
  if (!e.isValidNot0(t))
    throw new Error("invalid x: Fail if x ≥ p");
  const r = e.create(t * t), n = e.create(r * t + BigInt(7));
  let o = e.sqrt(n);
  le(o) || (o = e.neg(o));
  const s = At.fromAffine({ x: t, y: o });
  return s.assertValidity(), s;
}
const St = vt;
function sn(...t) {
  return At.Fn.create(St(kt("BIP0340/challenge", ...t)));
}
function _e(t) {
  return re(t).bytes;
}
function rr(t, e, r = jt(32)) {
  const { Fn: n } = At, o = Z("message", t), { bytes: s, scalar: i } = re(e), c = Z("auxRand", r, 32), f = n.toBytes(i ^ St(kt("BIP0340/aux", c))), d = kt("BIP0340/nonce", f, s, o), { bytes: w, scalar: g } = re(d), a = sn(w, s, o), u = new Uint8Array(64);
  if (u.set(w, 0), u.set(n.toBytes(n.create(g + a * i)), 32), !cn(u, o, s))
    throw new Error("sign: Invalid signature produced");
  return u;
}
function cn(t, e, r) {
  const { Fn: n, BASE: o } = At, s = Z("signature", t, 64), i = Z("message", e), c = Z("publicKey", r, 32);
  try {
    const f = on(St(c)), d = St(s.subarray(0, 32));
    if (!te(d, Ie, Bt.p))
      return !1;
    const w = St(s.subarray(32, 64));
    if (!te(w, Ie, Bt.n))
      return !1;
    const g = sn(n.toBytes(d), ue(f), i), a = o.multiplyUnsafe(w).add(f.multiplyUnsafe(n.neg(g))), { x: u, y: m } = a.toAffine();
    return !(a.is0() || !le(m) || u !== d);
  } catch {
    return !1;
  }
}
const de = /* @__PURE__ */ (() => {
  const r = (o = jt(48)) => Qe(o, Bt.n);
  ae.utils.randomSecretKey;
  function n(o) {
    const s = r(o);
    return { secretKey: s, publicKey: _e(s) };
  }
  return {
    keygen: n,
    getPublicKey: _e,
    sign: rr,
    verify: cn,
    Point: At,
    utils: {
      randomSecretKey: r,
      randomPrivateKey: r,
      taggedHash: kt,
      // TODO: remove
      lift_x: on,
      pointToBytes: ue,
      numberToBytesBE: Mt,
      bytesToNumberBE: vt,
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
function or() {
  const t = globalThis.crypto;
  if (!t || typeof t.getRandomValues != "function")
    throw new Error("No cryptographically secure random source available in this environment.");
  return t;
}
function _t(t) {
  const e = new Uint8Array(t);
  return or().getRandomValues(e), e;
}
function br() {
  return _t(16);
}
function gr() {
  return _t(12);
}
function wr() {
  return _t(16);
}
function yr(t) {
  if (!Number.isInteger(t) || t <= 0 || t > 4294967296)
    throw new Error("randomUniformInt: maxExclusive must be an integer in (0, 2^32].");
  const e = t <= 256 ? 1 : t <= 65536 ? 2 : 4, r = 256 ** e, n = r - r % t;
  for (; ; ) {
    const o = _t(e);
    let s = 0;
    for (const i of o)
      s = s * 256 + i;
    if (s < n)
      return s % t;
  }
}
function sr(t) {
  let e = "";
  for (const r of t)
    e += r.toString(16).padStart(2, "0");
  return e;
}
function mr(t) {
  if (t.length % 2 !== 0)
    throw new Error("Invalid hex string length.");
  const e = new Uint8Array(t.length / 2);
  for (let r = 0; r < e.length; r++)
    e[r] = parseInt(t.slice(r * 2, r * 2 + 2), 16);
  return e;
}
const X = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
function pr(t) {
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
const ir = (() => {
  const t = {};
  for (let e = 0; e < X.length; e++)
    t[X[e]] = e;
  return t;
})();
function xr(t) {
  const e = t.replace(/=+$/u, ""), r = [];
  let n = 0, o = 0;
  for (const s of e) {
    const i = ir[s];
    if (i === void 0)
      throw new Error("Invalid base64url character.");
    n = n << 6 | i, o += 6, o >= 8 && (o -= 8, r.push(n >> o & 255));
  }
  return new Uint8Array(r);
}
function Er(t) {
  return new TextEncoder().encode(t);
}
function Br(t) {
  return new TextDecoder("utf-8", { fatal: !0 }).decode(t);
}
function vr(...t) {
  const e = t.reduce((o, s) => o + s.length, 0), r = new Uint8Array(e);
  let n = 0;
  for (const o of t)
    r.set(o, n), n += o.length;
  return r;
}
function Ar(t, e) {
  if (t.length !== e.length)
    return !1;
  let r = 0;
  for (let n = 0; n < t.length; n++)
    r |= t[n] ^ e[n];
  return r === 0;
}
const cr = ae.CURVE.n;
function fr(t) {
  if (t.length !== 32)
    return !1;
  let e = 0n;
  for (const r of t)
    e = e << 8n | BigInt(r);
  return e >= 1n && e < cr;
}
function Sr() {
  for (; ; ) {
    const t = _t(32);
    if (fr(t))
      return t;
  }
}
function ar(t) {
  return de.getPublicKey(t);
}
function Ir(t) {
  return sr(ar(t));
}
function Hr(t, e) {
  return de.sign(t, e);
}
function _r(t, e, r) {
  try {
    return de.verify(t, e, r);
  } catch {
    return !1;
  }
}
export {
  wr as A,
  Sr as B,
  _r as C,
  Hr as D,
  se as E,
  _t as a,
  sr as b,
  pr as c,
  xr as d,
  vr as e,
  Ar as f,
  Ir as g,
  mr as h,
  Br as i,
  Ce as j,
  Qt as k,
  gr as l,
  $t as m,
  ur as n,
  Ue as o,
  dr as p,
  Wt as q,
  yr as r,
  ae as s,
  lr as t,
  Er as u,
  xt as v,
  hr as w,
  ut as x,
  fr as y,
  br as z
};
