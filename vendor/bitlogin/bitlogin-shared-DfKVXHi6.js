import { o as h, j as A, E as m, q as U, v as B, u as y, k as p, s as $, e as x } from "./bitlogin-shared-Cm1sH5zP.js";
function C(t, n, r) {
  return h(t), r === void 0 && (r = new Uint8Array(t.outputLen)), A(t, m(r), m(n));
}
const l = /* @__PURE__ */ Uint8Array.from([0]), E = /* @__PURE__ */ Uint8Array.of();
function N(t, n, r, e = 32) {
  h(t), U(e);
  const o = t.outputLen;
  if (e > 255 * o)
    throw new Error("Length should be <= 255*HashLen");
  const a = Math.ceil(e / o);
  r === void 0 && (r = E);
  const s = new Uint8Array(a * o), u = A.create(t, n), c = u._cloneInto(), f = new Uint8Array(u.outputLen);
  for (let i = 0; i < a; i++)
    l[0] = i + 1, c.update(i === 0 ? E : f).update(r).update(l).digestInto(f), s.set(f, o * i), u._cloneInto(c);
  return u.destroy(), c.destroy(), B(f, l), s.slice(0, e);
}
function z(t, n) {
  return C(p, n, t);
}
function v(t, n, r) {
  const e = typeof n == "string" ? y(n) : n;
  return N(p, t, e, r);
}
function F(t) {
  return p(y(t));
}
const O = $.CURVE.n;
function g(t) {
  let n = 0n;
  for (const r of t)
    n = n << 8n | BigInt(r);
  return n;
}
function k(t) {
  const n = new Uint8Array(32);
  let r = t;
  for (let e = 31; e >= 0; e--)
    n[e] = Number(r & 0xffn), r >>= 8n;
  return n;
}
function L(t, n) {
  const r = y(n);
  for (let e = 0; e <= 255; e++) {
    const o = x(r, new Uint8Array([0, e])), a = v(t, o, 32), s = g(a);
    if (s >= 1n && s < O)
      return { scalar: k(s), counter: e };
  }
  throw new Error("ScalarExpand: exhausted 256 counters without a valid scalar (should not happen in practice).");
}
function I(t) {
  return t && t.__esModule && Object.prototype.hasOwnProperty.call(t, "default") ? t.default : t;
}
var d, w;
function R() {
  return w || (w = 1, d = function t(n) {
    if (typeof n == "number" && isNaN(n))
      throw new Error("NaN is not allowed");
    if (typeof n == "number" && !isFinite(n))
      throw new Error("Infinity is not allowed");
    return n === null || typeof n != "object" ? JSON.stringify(n) : n.toJSON instanceof Function ? t(n.toJSON()) : Array.isArray(n) ? `[${n.reduce((o, a, s) => `${o}${s === 0 ? "" : ","}${t(a === void 0 || typeof a == "symbol" ? null : a)}`, "")}]` : `{${Object.keys(n).sort().reduce((e, o) => {
      if (n[o] === void 0 || typeof n[o] == "symbol")
        return e;
      const a = e.length === 0 ? "" : ",";
      return `${e}${a}${t(o)}:${t(n[o])}`;
    }, "")}}`;
  }), d;
}
var T = R();
const M = /* @__PURE__ */ I(T);
export {
  v as a,
  M as c,
  I as g,
  z as h,
  F as l,
  L as s
};
