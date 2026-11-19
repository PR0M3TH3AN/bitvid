import { C as u, h as s, b as n, k as y, u as d, D as c } from "./bitlogin-shared-Cm1sH5zP.js";
function p(e) {
  return JSON.stringify([0, e.pubkey, e.created_at, e.kind, e.tags, e.content]);
}
function f(e) {
  return n(y(d(p(e))));
}
function l(e, t) {
  const r = f(e), i = n(c(s(r), t));
  return { ...e, id: r, sig: i };
}
function b(e) {
  if (typeof e != "object" || e === null || Array.isArray(e))
    return !1;
  const t = e;
  if (typeof t.id != "string" || typeof t.pubkey != "string" || typeof t.sig != "string" || typeof t.content != "string" || !Number.isSafeInteger(t.created_at) || t.created_at < 0 || !Number.isSafeInteger(t.kind) || t.kind < 0 || t.kind > 65535 || !Array.isArray(t.tags) || !t.tags.every((a) => Array.isArray(a) && a.every((o) => typeof o == "string")) || !/^[0-9a-f]{64}$/u.test(t.id) || !/^[0-9a-f]{64}$/u.test(t.pubkey) || !/^[0-9a-f]{128}$/u.test(t.sig))
    return !1;
  const r = t;
  if (f(r) !== r.id)
    return !1;
  try {
    return u(s(r.sig), s(r.id), s(r.pubkey));
  } catch {
    return !1;
  }
}
function k(e, t) {
  return e.created_at !== t.created_at ? e.created_at > t.created_at ? 1 : -1 : e.id === t.id ? 0 : e.id < t.id ? 1 : -1;
}
function m(e, t) {
  return e.tags.find((r) => r[0] === t)?.[1];
}
export {
  k as c,
  m as f,
  l as s,
  b as v
};
