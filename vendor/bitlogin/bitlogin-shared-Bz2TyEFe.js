import { v as k } from "./bitlogin-shared-Cj9s0_W_.js";
import { c as p } from "./bitlogin-shared-DsCziTXz.js";
function d(e) {
  const t = e.split(".");
  if (t.length !== 4 || t.some((s) => !/^\d{1,3}$/u.test(s)))
    return !1;
  const r = t.map(Number);
  return r.every((s) => s >= 0 && s <= 255) && r[0] === 127;
}
function A(e) {
  let t;
  try {
    t = new URL(e);
  } catch {
    return !1;
  }
  return t.username || t.password || t.hash ? !1 : t.protocol === "wss:" ? !0 : t.protocol !== "ws:" ? !1 : t.hostname === "localhost" || t.hostname === "[::1]" || d(t.hostname);
}
const b = (e) => typeof e == "string" && e.includes("*") ? l(e) : p(e), B = 30078, _ = "bitlogin:taken-back:v1", g = 10002, i = {
  /** No more sites than this are listed. */
  sites: 200,
  /** An entry older than the longest a grant can live ends nothing that is left, and may be dropped. In seconds. */
  entrySec: 744 * 3600,
  /** A grant is checked when its last check is older than this. In seconds. */
  checkEverySec: 24 * 3600,
  /** A grant that has gone this long without a check that succeeded is locked until one does. In seconds. */
  staleSec: 72 * 3600,
  /** How many of the user's own write relays are carried to a signer. */
  relays: 4,
  /** How far ahead of this clock a record may be dated and still be believed. In seconds. */
  skewSec: 600
}, N = { allBefore: 0, sites: [] }, h = (e) => typeof e == "number" && Number.isFinite(e) && e > 0 ? Math.floor(e) : 0;
function S(e) {
  if (!e || typeof e != "object" || Array.isArray(e)) return null;
  const t = e;
  if (t.v !== 1 || !Array.isArray(t.sites)) return null;
  const r = /* @__PURE__ */ new Map();
  for (const s of t.sites.slice(0, i.sites * 2)) {
    if (!s || typeof s != "object") continue;
    const n = s, o = b(n.site), a = h(n.before);
    !o || o !== n.site || !a || r.set(o, Math.max(r.get(o) ?? 0, a));
  }
  return { allBefore: h(t.all_before), sites: [...r].map(([s, n]) => ({ site: s, before: n })) };
}
const E = (e) => JSON.stringify({ v: 1, all_before: e.allBefore, sites: e.sites });
function m(e, t, r) {
  const s = Math.max(e.allBefore, t.allBefore), n = /* @__PURE__ */ new Map();
  for (const { site: a, before: c } of [...e.sites, ...t.sites]) n.set(a, Math.max(n.get(a) ?? 0, c));
  const o = [...n].map(([a, c]) => ({ site: a, before: c })).filter((a) => a.before > s && a.before + i.entrySec > r).sort((a, c) => c.before - a.before).slice(0, i.sites);
  return { allBefore: s, sites: o };
}
function I(e, t, r) {
  const s = Math.floor(r);
  if ("all" in t) return m(e, { allBefore: s, sites: [] }, s);
  const n = b(t.site);
  return n ? m(e, { allBefore: 0, sites: [{ site: n, before: s }] }, s) : e;
}
function K(e, t, r) {
  if (e.allBefore >= r) return !0;
  const s = l(t);
  return e.sites.some(
    (n) => n.before >= r && (n.site === t || (s ? y(n.site, s) : !!l(n.site) && y(t, n.site)))
  );
}
function R(e, t, r) {
  let s = null;
  for (const n of e)
    !k(n) || n.kind !== B || n.pubkey !== t || n.tags.some((o) => o[0] === "d" && o[1] === _) && (n.created_at > r + i.skewSec || (!s || n.created_at > s.created_at) && (s = n));
  return s;
}
function u(e) {
  const t = e.toLowerCase().replace(/\.$/u, "");
  if (!t.includes(".") || t.startsWith("[") || t.includes(":") || /^[0-9.]+$/u.test(t) || /^0x/u.test(t)) return !1;
  const r = t.split(".");
  return !r.every((s) => /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/u.test(s)) || /^[0-9]+$/u.test(r[r.length - 1]) ? !1 : !["localhost", "local", "internal", "lan", "home", "intranet", "private", "corp", "test", "invalid", "onion"].includes(r[r.length - 1]);
}
function v(e, t = i.relays) {
  if (!Array.isArray(e)) return [];
  const r = [];
  for (const s of e) {
    if (typeof s != "string" || s.length > 200 || !A(s)) continue;
    let n;
    try {
      n = new URL(s);
    } catch {
      continue;
    }
    if (n.protocol !== "wss:" || n.search || !u(n.hostname)) continue;
    const o = `${n.protocol}//${n.host}${n.pathname === "/" ? "" : n.pathname}`;
    if (r.includes(o) || r.push(o), r.length >= t) break;
  }
  return r;
}
function F(e, t, r = i.relays) {
  let s = null;
  for (const n of e)
    !k(n) || n.kind !== g || n.pubkey !== t || (!s || n.created_at > s.created_at) && (s = n);
  return s ? v(
    s.tags.filter((n) => n[0] === "r" && (n[2] === void 0 || n[2] === "write")).map((n) => n[1]),
    r
  ) : [];
}
function $(e) {
  return e.answered < Math.min(2, e.asked) || e.answered === 0 ? !1 : e.newestAt === null ? e.seenAt === 0 : e.readable && e.newestAt >= e.seenAt;
}
function x(e, t, r) {
  const s = Math.max(r, 0);
  return s && e - s < i.checkEverySec ? "fresh" : e - Math.max(s, t) >= i.staleSec ? "overdue" : "due";
}
const f = "https://*.", M = ["bitblocks.network"];
function l(e) {
  if (typeof e != "string" || e.length > 260 || !e.startsWith(f)) return "";
  const t = e.slice(f.length);
  return t !== t.toLowerCase() || t.endsWith(".") || !u(t) ? "" : e;
}
const w = (e) => l(e) ? e.slice(f.length) : "";
function y(e, t) {
  const r = w(t);
  if (!r || typeof e != "string") return !1;
  try {
    const s = new URL(e);
    return s.protocol !== "https:" || s.port || s.origin !== e || !u(s.hostname) ? !1 : s.hostname === r || s.hostname.endsWith(`.${r}`);
  } catch {
    return !1;
  }
}
const C = (e) => M.includes(w(e));
export {
  f as F,
  N,
  g as R,
  _ as T,
  u as a,
  A as b,
  v as c,
  x as d,
  B as e,
  w as f,
  K as g,
  $ as h,
  y as i,
  E as j,
  C as k,
  S as l,
  m,
  R as n,
  l as r,
  I as t,
  F as w
};
