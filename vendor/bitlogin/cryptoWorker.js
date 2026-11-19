import { K as ni, b as ri, c as z, D as Pr, d as $e, f as kt, w as E, u as vt, g as Nt, h as ct, j as vn, S as Dt, k as Ot, l as He, m as pt, B as oi, n as ii, o as Ut, q as lt, r as wn, s as gn, t as Kr, v as si, a as Et, x as ai } from "./bitlogin-shared-QRwXh_V6.js";
import { g as _, b as ut, a as G, e as Je, h as bn, s as Ar, u as H, f as ci, i as Vt, j as mn, k as kn, l as li, m as ui, n as yi, o as di, p as fi, q as jt, t as zn, v as pi, w as hi, x as vi, c as I, d as V, y as En, z as wi, A as Rr, B as wt } from "./bitlogin-shared-Cm1sH5zP.js";
import { h as Bt, a as Ye, c as gi, l as Sr, s as bi } from "./bitlogin-shared-DfKVXHi6.js";
import { s as oe, v as M, f as Xe, c as tn } from "./bitlogin-shared-C0qJoVBo.js";
import { c as _n, i as Nr, r as Pn, m as Kn, A as Ct, k as mi, p as ki, j as Ei, n as _i, o as Pi, M as Ki, q as Ai } from "./bitlogin-shared-C4PaJAtm.js";
function Cr(e) {
  const t = _(e.privateKey);
  return oe({
    pubkey: t,
    created_at: e.createdAt,
    kind: ni,
    tags: [
      ["e", e.eventIdToDelete],
      ["k", String(e.deletedEventKind)]
    ],
    content: e.reason ?? ""
  }, e.privateKey);
}
function Ri(e) {
  const t = e.split(".");
  if (t.length !== 4 || t.some((r) => !/^\d{1,3}$/u.test(r)))
    return !1;
  const n = t.map(Number);
  return n.every((r) => r >= 0 && r <= 255) && n[0] === 127;
}
function Qe(e) {
  let t;
  try {
    t = new URL(e);
  } catch {
    return !1;
  }
  return t.username || t.password || t.hash ? !1 : t.protocol === "wss:" ? !0 : t.protocol !== "ws:" ? !1 : t.hostname === "localhost" || t.hostname === "[::1]" || Ri(t.hostname);
}
function Si() {
  const e = globalThis.WebSocket;
  if (!e)
    throw new Error("No global WebSocket implementation is available in this environment.");
  return e;
}
const xt = 1e3, Ni = 262144;
function Ci(e) {
  const t = Math.min(e.limit ?? xt, xt);
  return Math.max(50, t * 3);
}
const xi = 2048, Ti = 1e4, Ii = 100;
function Mi(e, t) {
  if (e.size >= xi) {
    const n = e.values().next().value;
    n !== void 0 && e.delete(n);
  }
  e.add(t);
}
class An {
  url;
  ws = null;
  connectPromise = null;
  subs = /* @__PURE__ */ new Map();
  pendingPublishes = /* @__PURE__ */ new Map();
  authPrivateKey;
  connectTimeoutMs;
  authenticated = !1;
  constructor(t, n = {}) {
    if (!Qe(t))
      throw new Error("Relay URL must use secure WebSockets, except for an explicit loopback development endpoint.");
    this.url = t, this.authPrivateKey = n.authPrivateKey, this.connectTimeoutMs = n.connectTimeoutMs ?? 8e3;
  }
  async connect() {
    return this.connectPromise ? this.connectPromise : (this.connectPromise = new Promise((t, n) => {
      const r = Si(), o = new r(this.url);
      this.ws = o;
      const i = setTimeout(() => {
        n(new Error(`Timed out connecting to relay ${this.url}`));
      }, this.connectTimeoutMs);
      o.addEventListener("open", () => {
        clearTimeout(i);
        for (const [s, a] of this.subs)
          o.send(JSON.stringify(["REQ", s, a.filter]));
        t();
      }), o.addEventListener("error", () => {
        clearTimeout(i), n(new Error(`WebSocket error connecting to relay ${this.url}`));
      }), o.addEventListener("close", () => {
        this.connectPromise = null;
      }), o.addEventListener("message", (s) => {
        this.handleMessage(String(s.data));
      });
    }), this.connectPromise);
  }
  close() {
    this.ws?.close(), this.ws = null, this.connectPromise = null, this.subs.clear(), this.pendingPublishes.clear();
  }
  send(t) {
    if (!this.ws)
      throw new Error("Not connected to relay.");
    this.ws.send(JSON.stringify(t));
  }
  handleMessage(t) {
    if (t.length > Ni)
      return;
    let n;
    try {
      n = JSON.parse(t);
    } catch {
      return;
    }
    if (!Array.isArray(n) || typeof n[0] != "string")
      return;
    const [r, ...o] = n;
    if (r === "EVENT") {
      const [i, s] = o;
      if (typeof i != "string")
        return;
      const a = this.subs.get(i);
      if (!a)
        return;
      const c = s?.id;
      if (typeof c != "string" || a.seenIds.has(c))
        return;
      if (a.onEvent) {
        const y = Date.now();
        if (y - a.liveWindowStart >= Ti && (a.liveWindowStart = y, a.liveVerifies = 0), a.liveVerifies >= Ii || (a.liveVerifies++, !M(s) || !Hn(s, a.filter)))
          return;
        Mi(a.seenIds, s.id), a.onEvent(s);
        return;
      }
      const u = Math.min(a.filter.limit ?? xt, xt);
      if (a.events.length >= u || a.verifyBudget <= 0 || (a.verifyBudget--, !M(s) || !Hn(s, a.filter)))
        return;
      a.seenIds.add(s.id), a.events.push(s);
      return;
    }
    if (r === "EOSE") {
      const [i] = o;
      if (typeof i != "string")
        return;
      this.subs.get(i)?.onEose();
      return;
    }
    if (r === "OK") {
      const [i, s, a] = o;
      if (typeof i != "string" || typeof s != "boolean" || a !== void 0 && typeof a != "string")
        return;
      this.pendingPublishes.get(i)?.({ ok: s, message: a ?? "" }), this.pendingPublishes.delete(i);
      return;
    }
    if (r === "AUTH") {
      const [i] = o;
      if (typeof i != "string")
        return;
      this.respondToAuthChallenge(i);
      return;
    }
  }
  async respondToAuthChallenge(t) {
    if (!this.authPrivateKey)
      return;
    const n = _(this.authPrivateKey), r = oe({
      pubkey: n,
      created_at: Math.floor(Date.now() / 1e3),
      kind: ri,
      tags: [
        ["relay", this.url],
        ["challenge", t]
      ],
      content: ""
    }, this.authPrivateKey);
    this.authenticated = !0, this.send(["AUTH", r]);
  }
  isAuthenticated() {
    return this.authenticated;
  }
  async publish(t, n = 8e3) {
    return await this.connect(), new Promise((r) => {
      const o = setTimeout(() => {
        this.pendingPublishes.delete(t.id), r({ ok: !1, message: "timeout: no OK received from relay" });
      }, n);
      this.pendingPublishes.set(t.id, (i) => {
        clearTimeout(o), r(i);
      }), this.send(["EVENT", t]);
    });
  }
  /**
   * Opens a subscription that stays live past EOSE: every verified,
   * filter-matching event is delivered to `onEvent` as it arrives, until the
   * returned handle is closed. Survives socket drops -- connect() re-issues
   * REQ for all open subscriptions on reopen -- though events published while
   * the socket was down are only seen if the relay replays them on the new REQ.
   */
  async subscribeLive(t, n) {
    await this.connect();
    const r = ut(G(8));
    return this.subs.set(r, {
      events: [],
      seenIds: /* @__PURE__ */ new Set(),
      verifyBudget: Number.POSITIVE_INFINITY,
      liveWindowStart: Date.now(),
      liveVerifies: 0,
      filter: t,
      onEose: () => {
      },
      onEvent: n
    }), this.send(["REQ", r, t]), {
      close: () => {
        if (this.subs.delete(r))
          try {
            this.send(["CLOSE", r]);
          } catch {
          }
      }
    };
  }
  async queryOnce(t, n = 8e3) {
    await this.connect();
    const r = ut(G(8));
    return new Promise((o, i) => {
      const s = [], a = (u) => {
        clearTimeout(c), this.subs.delete(r);
        try {
          this.send(["CLOSE", r]);
        } catch {
        }
        u ? i(u) : o(s);
      }, c = setTimeout(() => a(new Error("relay did not answer the subscription before the timeout")), n);
      this.subs.set(r, {
        events: s,
        seenIds: /* @__PURE__ */ new Set(),
        verifyBudget: Ci(t),
        liveWindowStart: 0,
        liveVerifies: 0,
        filter: t,
        onEose: () => a()
      }), this.send(["REQ", r, t]);
    });
  }
}
function Hn(e, t) {
  if (t.ids && !t.ids.some((n) => e.id.startsWith(n)) || t.authors && !t.authors.some((n) => e.pubkey.startsWith(n)) || t.kinds && !t.kinds.includes(e.kind) || t.since !== void 0 && e.created_at < t.since || t.until !== void 0 && e.created_at > t.until)
    return !1;
  for (const [n, r] of Object.entries(t)) {
    if (!n.startsWith("#") || !Array.isArray(r))
      continue;
    const o = n.slice(1), i = r;
    if (!e.tags.some((s) => s[0] === o && i.some((a) => a === (s[1] ?? ""))))
      return !1;
  }
  return !0;
}
class K {
  connections = /* @__PURE__ */ new Map();
  constructor(t, n = {}) {
    for (const r of new Set(t))
      this.connections.set(r, new An(r, n));
  }
  get relayUrls() {
    return [...this.connections.keys()];
  }
  /** Queries every configured relay and waits for a quorum of responses (or all timeouts) before returning (§16.2). */
  async queryQuorum(t, n = 8e3) {
    const r = [...this.connections.entries()], o = await Promise.all(r.map(async ([a, c]) => {
      try {
        const u = await c.queryOnce(t, n);
        return { relayUrl: a, events: u, responded: !0 };
      } catch (u) {
        return { relayUrl: a, events: [], responded: !1, error: u.message };
      }
    })), i = o.filter((a) => a.responded).length, s = o.length;
    return {
      outcomes: o,
      quorumMet: i >= Math.ceil(s / 2),
      respondedCount: i,
      totalCount: s
    };
  }
  /** Publishes an event to every configured relay, best-effort (§15.6, §24.4). */
  async publishAll(t, n = 8e3) {
    const r = [...this.connections.entries()];
    return Promise.all(r.map(async ([o, i]) => {
      try {
        const s = await i.publish(t, n);
        return { relayUrl: o, result: s };
      } catch (s) {
        return { relayUrl: o, result: { ok: !1, message: s.message } };
      }
    }));
  }
  closeAll() {
    for (const t of this.connections.values())
      t.close();
  }
}
function Se(e) {
  return e.filter((t) => t.result.ok).length;
}
const ht = null, xr = [
  "wss://nos.lol",
  "wss://offchain.pub",
  "wss://nostr.bitcoiner.social",
  "wss://relay.mostr.pub",
  "wss://nostr-pub.wellorder.net",
  "wss://relay.primal.net",
  "wss://relay.snort.social",
  "wss://relay.damus.io",
  // Added 2026-11-18 after `scripts/relay-probe.mjs` measured the eight above
  // from one machine: nos.lol, relay.primal.net and relay.snort.social stored
  // everything; relay.mostr.pub and nostr-pub.wellorder.net never connected;
  // relay.damus.io connected about one time in eight; nostr.bitcoiner.social
  // intermittently refused capsule keys ("pubkey is not in our web of
  // trust"); and offchain.pub acknowledged and returned capsules, then held
  // only half of them minutes later. That is about four dependable relays,
  // and an account whose owner lost it to exactly this.
  //
  // NOTHING ABOVE IS REMOVED. Existing accounts live on those relays, and a
  // client that stopped asking them could no longer find those accounts.
  // These five each stored 8 of 8 capsule-shaped test events from throwaway
  // keys and still held all 8 on two later re-reads. That is minutes of
  // evidence, not months: re-run the probe before trusting any of them more.
  "wss://nostr.mom",
  "wss://relay.nostr.net",
  "wss://nostr-01.yakihonne.com",
  "wss://relay.nostr.wirednet.jp",
  "wss://nostr.sathoarder.com"
], Tr = [
  "wss://purplepag.es",
  "wss://relay.nostr.band",
  "wss://nostr-pub.wellorder.net",
  "wss://relay.primal.net",
  // Added 2026-11-18: relay.nostr.band timed out and nostr-pub.wellorder.net
  // never connected in the same measurement, leaving two working lookups.
  "wss://nos.lol"
], Li = [], Di = /^[0-9a-f]{64}$/u, Oi = 64;
function Ft(e) {
  return Array.isArray(e) && e.length <= Oi && e.every((t) => typeof t == "string" && Qe(t)) && new Set(e).size === e.length;
}
function qt(e, t = ht, n = -1) {
  if (!t || !Di.test(t) || /^0{64}$/u.test(t) || !M(e) || e.pubkey !== t || e.kind !== z || Xe(e, "d") !== Pr)
    return null;
  try {
    const r = JSON.parse(e.content);
    if (typeof r != "object" || r === null || Array.isArray(r))
      return null;
    const o = r;
    return !Number.isSafeInteger(o.version) || o.version < 1 || o.version <= n || !Ft(o.vaultRelays) || !Ft(o.discoveryRelays) || o.deprecated !== void 0 && !Ft(o.deprecated) ? null : {
      version: o.version,
      vaultRelays: o.vaultRelays,
      discoveryRelays: o.discoveryRelays,
      ...o.deprecated === void 0 ? {} : { deprecated: o.deprecated }
    };
  } catch {
    return null;
  }
}
function Ui(e) {
  return Math.max(0, e - 1);
}
function Jn(e, t, n) {
  const r = t ? n === "vault" ? t.vaultRelays : t.discoveryRelays : [], o = new Set(t?.deprecated ?? []), i = new Set(e), s = [...new Set(r)].filter((a) => !o.has(a) && !i.has(a)).slice(0, Ui(e.length));
  return [...e, ...s];
}
async function Vi(e, t = ht, n = -1, r = 6e3) {
  if (!t || e.length === 0)
    return null;
  const o = new K([...e]);
  let i;
  try {
    i = (await o.queryQuorum({ kinds: [z], authors: [t], "#d": [Pr], limit: 3 }, r)).outcomes.flatMap((c) => c.events);
  } finally {
    o.closeAll();
  }
  let s = null;
  for (const a of i) {
    const c = qt(a, t, n);
    c && (!s || c.version > s.list.version) && (s = { event: a, list: c });
  }
  return s;
}
const Ir = "bitlogin:bootstrap-relays:v1";
async function Mr(e, t = ht) {
  if (!t)
    return null;
  try {
    const n = await e.get(Ir);
    return n ? qt(JSON.parse(n), t) : null;
  } catch {
    return null;
  }
}
function _t(e) {
  return {
    vaultRelays: Jn(xr, e, "vault"),
    discoveryRelays: Jn(Tr, e, "discovery"),
    listVersion: e?.version ?? null
  };
}
async function Bi(e, t = {}) {
  const n = t.maintainerPubkeyHex === void 0 ? ht : t.maintainerPubkeyHex, r = await Mr(e, n);
  if (!n)
    return _t(null);
  const o = _t(r), i = r?.version ?? -1;
  try {
    let s = await Vi(t.queryRelayUrls ?? [.../* @__PURE__ */ new Set([...o.vaultRelays, ...o.discoveryRelays])], n, i, t.timeoutMs);
    if (!s) {
      const a = await qi(t.httpsFallbackUrls ?? Li, n, i), c = a ? qt(a, n, i) : null;
      a && c && (s = { event: a, list: c });
    }
    return s ? (await e.set(Ir, JSON.stringify(s.event)), _t(s.list)) : o;
  } catch {
    return o;
  }
}
async function qi(e, t = ht, n = -1) {
  if (!t)
    return null;
  for (const r of e)
    try {
      if (new URL(r).protocol !== "https:")
        continue;
      const o = await fetch(r);
      if (!o.ok || Number(o.headers.get("content-length") ?? 0) > 1e6)
        continue;
      const s = await o.text();
      if (s.length > 1e6)
        continue;
      const a = JSON.parse(s);
      if (M(a) && qt(a, t, n))
        return a;
    } catch {
    }
  return null;
}
/*! noble-ciphers - MIT License (c) 2023 Paul Miller (paulmillr.com) */
function $i(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in e && e.BYTES_PER_ELEMENT === 1;
}
function Yn(e) {
  if (typeof e != "boolean")
    throw new TypeError(`boolean expected, not ${e}`);
}
function Wt(e) {
  if (typeof e != "number")
    throw new TypeError("number expected, got " + typeof e);
  if (!Number.isSafeInteger(e) || e < 0)
    throw new RangeError("positive integer expected, got " + e);
}
function F(e, t, n = "") {
  const r = $i(e), o = e?.length, i = t !== void 0;
  if (!r || i && o !== t) {
    const s = n && `"${n}" `, a = i ? ` of length ${t}` : "", c = r ? `length=${o}` : `type=${typeof e}`, u = s + "expected Uint8Array" + a + ", got " + c;
    throw r ? new RangeError(u) : new TypeError(u);
  }
  return e;
}
function U(e) {
  return new Uint32Array(e.buffer, e.byteOffset, Math.floor(e.byteLength / 4));
}
function xe(...e) {
  for (let t = 0; t < e.length; t++)
    e[t].fill(0);
}
const ie = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68, ji = (e) => e << 24 & 4278190080 | e << 8 & 16711680 | e >>> 8 & 65280 | e >>> 24 & 255, Fi = (e) => {
  for (let t = 0; t < e.length; t++)
    e[t] = ji(e[t]);
  return e;
}, W = ie ? (e) => e : Fi;
function Wi(e, t) {
  return !e.byteLength || !t.byteLength ? !1 : e.buffer === t.buffer && // best we can do, may fail with an obscure Proxy
  e.byteOffset < t.byteOffset + t.byteLength && // a starts before b end
  t.byteOffset < e.byteOffset + e.byteLength;
}
function Lr(e, t) {
  if (Wi(e, t) && e.byteOffset < t.byteOffset)
    throw new Error("complex overlap of input and output is not supported");
}
function Gi(e, t) {
  if (t == null || typeof t != "object")
    throw new Error("options must be defined");
  return Object.assign(e, t);
}
const zi = /* @__NO_SIDE_EFFECTS__ */ (e, t) => {
  function n(r, ...o) {
    if (F(r, void 0, "key"), e.nonceLength !== void 0) {
      const y = o[0];
      F(y, e.varSizeNonce ? void 0 : e.nonceLength, "nonce");
    }
    const i = e.tagLength;
    i && o[1] !== void 0 && F(o[1], void 0, "AAD");
    const s = t(r, ...o), a = (y, d) => {
      if (d !== void 0) {
        if (y !== 2)
          throw new Error("cipher output not supported");
        F(d, void 0, "output");
      }
    };
    let c = !1;
    return {
      encrypt(y, d) {
        if (c)
          throw new Error("cannot encrypt() twice with same key + nonce");
        return c = !0, F(y), a(s.encrypt.length, d), s.encrypt(y, d);
      },
      decrypt(y, d) {
        if (F(y), i && y.length < i)
          throw new Error('"ciphertext" expected length bigger than tagLength=' + i);
        return a(s.decrypt.length, d), s.decrypt(y, d);
      }
    };
  }
  return Object.assign(n, e), n;
};
function Rn(e, t, n = !0) {
  if (t === void 0)
    return new Uint8Array(e);
  if (F(t, void 0, "output"), t.length !== e)
    throw new Error('"output" expected Uint8Array of length ' + e + ", got: " + t.length);
  if (n && !le(t))
    throw new Error("invalid output, must be aligned");
  return t;
}
function le(e) {
  return e.byteOffset % 4 === 0;
}
function Ne(e) {
  return Uint8Array.from(F(e));
}
const Dr = (e) => Uint8Array.from(e.split(""), (t) => t.charCodeAt(0)), Hi = W(U(Dr("expand 16-byte k"))), Ji = W(U(Dr("expand 32-byte k")));
function P(e, t) {
  return e << t | e >>> 32 - t;
}
const et = 64, Yi = 16, nn = 2 ** 32 - 1, Xn = /* @__PURE__ */ Uint32Array.of();
function Xi(e, t, n, r, o, i, s, a) {
  const c = o.length, u = new Uint8Array(et), y = U(u), d = ie && le(o) && le(i), p = d ? U(o) : Xn, f = d ? U(i) : Xn;
  if (!ie) {
    for (let g = 0; g < c; s++) {
      if (e(t, n, r, y, s, a), W(y), s >= nn)
        throw new Error("arx: counter overflow");
      const v = Math.min(et, c - g);
      for (let w = 0, h; w < v; w++)
        h = g + w, i[h] = o[h] ^ u[w];
      g += v;
    }
    return;
  }
  for (let g = 0; g < c; s++) {
    if (e(t, n, r, y, s, a), s >= nn)
      throw new Error("arx: counter overflow");
    const v = Math.min(et, c - g);
    if (d && v === et) {
      const w = g / 4;
      if (g % 4 !== 0)
        throw new Error("arx: invalid block position");
      for (let h = 0, b; h < Yi; h++)
        b = w + h, f[b] = p[b] ^ y[h];
      g += et;
      continue;
    }
    for (let w = 0, h; w < v; w++)
      h = g + w, i[h] = o[h] ^ u[w];
    g += v;
  }
}
function Qi(e, t) {
  const { allowShortKeys: n, extendNonceFn: r, counterLength: o, counterRight: i, rounds: s } = Gi({ allowShortKeys: !1, counterLength: 8, counterRight: !1, rounds: 20 }, t);
  if (typeof e != "function")
    throw new Error("core must be a function");
  return Wt(o), Wt(s), Yn(i), Yn(n), (a, c, u, y, d = 0) => {
    F(a, void 0, "key"), F(c, void 0, "nonce"), F(u, void 0, "data");
    const p = u.length;
    if (y = Rn(p, y, !1), Wt(d), d < 0 || d >= nn)
      throw new Error("arx: counter overflow");
    const f = [];
    let g = a.length, v, w;
    if (g === 32)
      f.push(v = Ne(a)), w = Ji;
    else if (g === 16 && n)
      v = new Uint8Array(32), v.set(a), v.set(a, 16), w = Hi, f.push(v);
    else
      throw F(a, 32, "arx key"), new Error("invalid key size");
    (!ie || !le(c)) && f.push(c = Ne(c));
    let h = U(v);
    if (r) {
      if (c.length !== 24)
        throw new Error("arx: extended nonce must be 24 bytes");
      const R = c.subarray(0, 16);
      if (ie)
        r(w, h, U(R), h);
      else {
        const B = W(Uint32Array.from(w));
        r(B, h, U(R), h), xe(B), W(h);
      }
      c = c.subarray(16);
    } else ie || W(h);
    const b = 16 - o;
    if (b !== c.length)
      throw new Error(`arx: nonce must be ${b} or 16 bytes`);
    if (b !== 12) {
      const R = new Uint8Array(12);
      R.set(c, i ? 0 : 12 - c.length), c = R, f.push(c);
    }
    const k = W(U(c));
    try {
      return Xi(e, w, h, k, u, y, d, s), y;
    } finally {
      xe(...f);
    }
  };
}
function Zi(e, t, n, r, o, i = 20) {
  let s = e[0], a = e[1], c = e[2], u = e[3], y = t[0], d = t[1], p = t[2], f = t[3], g = t[4], v = t[5], w = t[6], h = t[7], b = o, k = n[0], R = n[1], B = n[2], N = s, L = a, T = c, D = u, q = y, $ = d, O = p, J = f, Y = g, X = v, Q = w, Z = h, ee = b, te = k, ne = R, re = B;
  for (let Gn = 0; Gn < i; Gn += 2)
    N = N + q | 0, ee = P(ee ^ N, 16), Y = Y + ee | 0, q = P(q ^ Y, 12), N = N + q | 0, ee = P(ee ^ N, 8), Y = Y + ee | 0, q = P(q ^ Y, 7), L = L + $ | 0, te = P(te ^ L, 16), X = X + te | 0, $ = P($ ^ X, 12), L = L + $ | 0, te = P(te ^ L, 8), X = X + te | 0, $ = P($ ^ X, 7), T = T + O | 0, ne = P(ne ^ T, 16), Q = Q + ne | 0, O = P(O ^ Q, 12), T = T + O | 0, ne = P(ne ^ T, 8), Q = Q + ne | 0, O = P(O ^ Q, 7), D = D + J | 0, re = P(re ^ D, 16), Z = Z + re | 0, J = P(J ^ Z, 12), D = D + J | 0, re = P(re ^ D, 8), Z = Z + re | 0, J = P(J ^ Z, 7), N = N + $ | 0, re = P(re ^ N, 16), Q = Q + re | 0, $ = P($ ^ Q, 12), N = N + $ | 0, re = P(re ^ N, 8), Q = Q + re | 0, $ = P($ ^ Q, 7), L = L + O | 0, ee = P(ee ^ L, 16), Z = Z + ee | 0, O = P(O ^ Z, 12), L = L + O | 0, ee = P(ee ^ L, 8), Z = Z + ee | 0, O = P(O ^ Z, 7), T = T + J | 0, te = P(te ^ T, 16), Y = Y + te | 0, J = P(J ^ Y, 12), T = T + J | 0, te = P(te ^ T, 8), Y = Y + te | 0, J = P(J ^ Y, 7), D = D + q | 0, ne = P(ne ^ D, 16), X = X + ne | 0, q = P(q ^ X, 12), D = D + q | 0, ne = P(ne ^ D, 8), X = X + ne | 0, q = P(q ^ X, 7);
  let j = 0;
  r[j++] = s + N | 0, r[j++] = a + L | 0, r[j++] = c + T | 0, r[j++] = u + D | 0, r[j++] = y + q | 0, r[j++] = d + $ | 0, r[j++] = p + O | 0, r[j++] = f + J | 0, r[j++] = g + Y | 0, r[j++] = v + X | 0, r[j++] = w + Q | 0, r[j++] = h + Z | 0, r[j++] = b + ee | 0, r[j++] = k + te | 0, r[j++] = R + ne | 0, r[j++] = B + re | 0;
}
const Or = /* @__PURE__ */ Qi(Zi, {
  counterRight: !1,
  counterLength: 4,
  allowShortKeys: !1
}), Ur = 2, rn = 1, Vr = 65536, es = 4294967295, ts = 132, ns = 99, on = 1024 * 1024;
function Tt(e, t) {
  const n = Je(new Uint8Array([2]), bn(t)), o = Ar.getSharedSecret(e, n, !0).slice(1, 33);
  return Bt(H("nip44-v2"), o);
}
function Br(e, t) {
  if (e.length !== 32)
    throw new Error("NIP-44 conversation key must be exactly 32 bytes.");
  if (t.length !== 32)
    throw new Error("NIP-44 nonce must be exactly 32 bytes.");
  const n = Ye(e, t, 76);
  return {
    chachaKey: n.slice(0, 32),
    chachaNonce: n.slice(32, 44),
    hmacKey: n.slice(44, 76)
  };
}
function Sn(e) {
  if (e <= 32)
    return 32;
  const t = 2 ** Math.floor(Math.log2(e - 1) + 1), n = t <= 256 ? 32 : t / 8;
  return n * (Math.floor((e - 1) / n) + 1);
}
const qr = 39 + Sn(on) + 32, rs = Math.ceil(qr / 3) * 4;
function os(e) {
  if (e < Vr) {
    const n = new Uint8Array(2);
    return new DataView(n.buffer).setUint16(0, e, !1), n;
  }
  const t = new Uint8Array(6);
  return new DataView(t.buffer).setUint32(2, e, !1), t;
}
function is(e) {
  const t = e.length;
  if (t < rn || t > on)
    throw new Error(`NIP-44 plaintext length must be between ${rn} and ${on} bytes on this platform.`);
  const n = os(t), r = Sn(t), o = new Uint8Array(n.length + r);
  return o.set(n, 0), o.set(e, n.length), o;
}
function ss(e) {
  const t = new DataView(e.buffer, e.byteOffset, e.byteLength), n = t.getUint16(0, !1);
  let r, o;
  if (n === 0) {
    if (r = t.getUint32(2, !1), o = 6, r < Vr)
      throw new Error("NIP-44 payload has inconsistent padding.");
  } else
    r = n, o = 2;
  if (r < rn || r > es || e.length !== o + Sn(r))
    throw new Error("NIP-44 payload has inconsistent padding.");
  return e.slice(o, o + r);
}
function $r(e, t, n) {
  return mn(kn, e, Je(t, n));
}
function sn(e, t) {
  return as(e, t, G(32));
}
function as(e, t, n) {
  if (n.length !== 32)
    throw new Error("NIP-44 nonce must be exactly 32 bytes.");
  const { chachaKey: r, chachaNonce: o, hmacKey: i } = Br(e, n), s = is(H(t)), a = Or(r, o, s), c = $r(i, n, a);
  return $e.encode(Je(new Uint8Array([Ur]), n, a, c));
}
function Nn(e, t) {
  if (t.startsWith("#"))
    throw new Error("Unsupported NIP-44 non-base64 encoding.");
  if (t.length < ts || t.length > rs)
    throw new Error("NIP-44 payload size is outside this platform's supported range.");
  const n = $e.decode(t);
  if (n.length < ns || n.length > qr)
    throw new Error("NIP-44 decoded payload size is outside this platform's supported range.");
  if (n[0] !== Ur)
    throw new Error(`Unsupported NIP-44 version: ${n[0]}`);
  const r = n.slice(1, 33);
  if (r.length !== 32)
    throw new Error("NIP-44 nonce must be exactly 32 bytes.");
  const o = n.slice(n.length - 32), i = n.slice(33, n.length - 32), { chachaKey: s, chachaNonce: a, hmacKey: c } = Br(e, r), u = $r(c, r, i);
  if (!ci(o, u))
    throw new Error("NIP-44 MAC verification failed: payload is corrupted, tampered, or uses the wrong key.");
  const y = Or(s, a, i);
  return Vt(ss(y));
}
const Cn = /^[0-9a-f]{64}$/u, cs = 8, ls = 4096, us = 256, ys = 512;
class De extends Error {
  name = "BunkerUriParseError";
}
class ds extends Error {
  name = "Nip46RequestTimeoutError";
  constructor(t, n) {
    super(`The remote signer did not answer ${t} within ${Math.round(n / 1e3)}s. It may be offline, or waiting for your approval on another device -- check your signer and try again.`);
  }
}
class fs extends Error {
  name = "Nip46ErrorResponse";
}
function ps(e) {
  let t;
  try {
    t = new URL(e.trim());
  } catch {
    return null;
  }
  const n = t.hostname === "localhost" || t.hostname === "127.0.0.1";
  return t.protocol === "https:" || t.protocol === "http:" && n ? t.toString() : null;
}
function hs(e) {
  if (e.length > ls)
    throw new De("That bunker URI is unreasonably long.");
  let t;
  try {
    t = new URL(e.trim());
  } catch {
    throw new De("That doesn't look like a valid URI.");
  }
  if (t.protocol !== "bunker:")
    throw new De("A remote-signer URI must start with bunker://");
  const n = (t.host || t.pathname.replace(/^\/+/u, "")).toLowerCase();
  if (!Cn.test(n))
    throw new De("The bunker URI does not name a valid signer public key.");
  const r = [
    ...new Set(t.searchParams.getAll("relay").map((i) => i.trim()).filter((i) => i.length > 0 && i.length <= ys))
  ].slice(0, cs);
  if (r.length === 0)
    throw new De("The bunker URI names no relays -- without at least one relay= parameter there is no way to reach the signer.");
  const o = t.searchParams.get("secret") ?? void 0;
  if (o && o.length > us)
    throw new De("The bunker URI's secret is unreasonably long.");
  return { signerPubkey: n, relayUrls: r, secret: o || void 0 };
}
function vs(e) {
  if (!Cn.test(e.clientPubkey))
    throw new Error("Client public key must be 64 hex characters.");
  if (e.relayUrls.length === 0)
    throw new Error("At least one relay is required.");
  if (!e.secret)
    throw new Error("A nostrconnect secret is required.");
  const t = new URLSearchParams();
  for (const n of e.relayUrls)
    t.append("relay", n);
  return t.set("secret", e.secret), e.name && t.set("name", e.name), e.perms?.length && t.set("perms", e.perms.join(",")), `nostrconnect://${e.clientPubkey}?${t.toString()}`;
}
const ws = 12e4;
class Qn {
  clientSecretKey;
  clientPubkey;
  pointer;
  conversationKey;
  conns;
  onAuthUrl;
  requestTimeoutMs;
  pending = /* @__PURE__ */ new Map();
  subs = [];
  startPromise = null;
  userPubkeyKnown = null;
  closed = !1;
  constructor(t) {
    this.clientSecretKey = t.clientSecretKey, this.clientPubkey = _(t.clientSecretKey), this.pointer = t.pointer, this.conversationKey = Tt(t.clientSecretKey, t.pointer.signerPubkey), this.onAuthUrl = t.onAuthUrl, this.requestTimeoutMs = t.requestTimeoutMs ?? ws, this.conns = t.pointer.relayUrls.map((n) => new An(n, { authPrivateKey: t.clientSecretKey }));
  }
  /** The user pubkey this session signs for, once get_public_key has answered. */
  get userPublicKey() {
    return this.userPubkeyKnown;
  }
  async start() {
    if (this.closed)
      throw new Error("This signer connection is closed.");
    return this.startPromise || (this.startPromise = (async () => {
      const t = {
        kinds: [kt],
        authors: [this.pointer.signerPubkey],
        "#p": [this.clientPubkey]
      }, n = await Promise.allSettled(this.conns.map((r) => r.subscribeLive(t, (o) => this.handleResponse(o))));
      if (this.subs = n.filter((r) => r.status === "fulfilled").map((r) => r.value), this.subs.length === 0)
        throw this.startPromise = null, new Error("Could not reach any of the signer's relays.");
    })()), this.startPromise;
  }
  handleResponse(t) {
    if (t.pubkey !== this.pointer.signerPubkey)
      return;
    let n;
    try {
      n = JSON.parse(Nn(this.conversationKey, t.content));
    } catch {
      return;
    }
    if (typeof n.id != "string")
      return;
    const r = this.pending.get(n.id);
    if (r) {
      if (n.result === "auth_url") {
        if (!r.authUrlSeen && typeof n.error == "string" && n.error) {
          const o = ps(n.error);
          o && (r.authUrlSeen = !0, this.onAuthUrl?.(o));
        }
        return;
      }
      if (this.pending.delete(n.id), clearTimeout(r.timer), typeof n.error == "string" && n.error) {
        r.reject(new fs(n.error));
        return;
      }
      if (typeof n.result != "string") {
        r.reject(new Error("The signer returned a malformed response."));
        return;
      }
      r.resolve(n.result);
    }
  }
  async rpc(t, n) {
    await this.start();
    const r = ut(G(8)), o = sn(this.conversationKey, JSON.stringify({ id: r, method: t, params: n })), i = [["p", this.pointer.signerPubkey]], s = oe({
      pubkey: this.clientPubkey,
      created_at: Math.floor(Date.now() / 1e3),
      kind: kt,
      tags: i,
      content: o
    }, this.clientSecretKey), a = new Promise((y, d) => {
      const p = setTimeout(() => {
        this.pending.delete(r), d(new ds(t, this.requestTimeoutMs));
      }, this.requestTimeoutMs);
      this.pending.set(r, { resolve: y, reject: d, timer: p, authUrlSeen: !1 });
    });
    if (a.catch(() => {
    }), !(await Promise.allSettled(this.conns.map((y) => y.publish(s)))).some((y) => y.status === "fulfilled" && y.value.ok)) {
      const y = this.pending.get(r);
      throw y && (this.pending.delete(r), clearTimeout(y.timer)), new Error("No relay accepted the request to the signer.");
    }
    return a;
  }
  /** bunker:// flow: announce ourselves; any non-error answer is acceptance. */
  async connect() {
    await this.rpc("connect", [this.pointer.signerPubkey, this.pointer.secret ?? ""]);
  }
  async getUserPublicKey() {
    const t = (await this.rpc("get_public_key", [])).trim().toLowerCase();
    if (!Cn.test(t))
      throw new Error("The signer returned an invalid public key.");
    return this.userPubkeyKnown = t, t;
  }
  async signEvent(t) {
    const n = this.userPubkeyKnown ? { ...t, pubkey: this.userPubkeyKnown } : t, r = await this.rpc("sign_event", [JSON.stringify(n)]);
    let o;
    try {
      o = JSON.parse(r);
    } catch {
      throw new Error("The signer returned a malformed signed event.");
    }
    if (!M(o))
      throw new Error("The signer returned an event that does not verify.");
    if (this.userPubkeyKnown && o.pubkey !== this.userPubkeyKnown)
      throw new Error("The signer returned an event signed by a different identity.");
    if (o.kind !== t.kind || o.content !== t.content || o.created_at !== t.created_at || JSON.stringify(o.tags) !== JSON.stringify(t.tags))
      throw new Error("The signer returned a different event than the one requested.");
    return o;
  }
  async nip44Encrypt(t, n) {
    return this.rpc("nip44_encrypt", [t, n]);
  }
  async nip44Decrypt(t, n) {
    return this.rpc("nip44_decrypt", [t, n]);
  }
  async nip04Encrypt(t, n) {
    return this.rpc("nip04_encrypt", [t, n]);
  }
  async nip04Decrypt(t, n) {
    return this.rpc("nip04_decrypt", [t, n]);
  }
  /**
   * Pre-signs the courtesy protocol logout event (current NIP-46 defines
   * logout as exactly that -- a courtesy, never a security boundary). Must
   * run BEFORE close(), while the keys still exist; the caller then closes
   * IMMEDIATELY (local revocation must not wait on the network, BL-26) and
   * delivers the pre-signed event afterward via publishCourtesy().
   */
  buildLogoutEvent() {
    if (this.closed)
      return null;
    try {
      const t = ut(G(8)), n = sn(this.conversationKey, JSON.stringify({ id: t, method: "logout", params: [] }));
      return oe({
        pubkey: this.clientPubkey,
        created_at: Math.floor(Date.now() / 1e3),
        kind: kt,
        tags: [["p", this.pointer.signerPubkey]],
        content: n
      }, this.clientSecretKey);
    } catch {
      return null;
    }
  }
  /**
   * Best-effort, bounded delivery of a pre-signed event. Safe (and intended)
   * to run AFTER close(): it needs no key material, and RelayConnection
   * reconnects transiently to publish. Never throws.
   */
  async publishCourtesy(t, n = 2e3) {
    try {
      await Promise.race([
        Promise.allSettled(this.conns.map((r) => r.publish(t))),
        new Promise((r) => setTimeout(r, n))
      ]);
    } catch {
    } finally {
      for (const r of this.conns)
        r.close();
    }
  }
  close() {
    this.closed = !0;
    for (const t of this.subs)
      t.close();
    this.subs = [];
    for (const t of this.conns)
      t.close();
    for (const [, t] of this.pending)
      clearTimeout(t.timer), t.reject(new Error("The signer connection was closed."));
    this.pending.clear(), E(this.clientSecretKey), E(this.conversationKey);
  }
}
async function gs(e) {
  const t = _(e.clientSecretKey), n = e.timeoutMs, r = e.relayUrls.map((i) => new An(i, { authPrivateKey: e.clientSecretKey })), o = () => {
    for (const i of r)
      i.close();
  };
  return new Promise((i, s) => {
    let a = !1;
    const c = () => u(new Error("The signer-connection attempt was cancelled.")), u = (f) => {
      a || (a = !0, clearTimeout(y), e.signal?.removeEventListener("abort", c), o(), f instanceof Error ? s(f) : i(f));
    }, y = setTimeout(() => u(new Error(`No signer connected within ${Math.round(n / 1e3)}s. Scan or paste the connection code in your signer app, then try again.`)), n);
    if (e.signal?.aborted) {
      c();
      return;
    }
    e.signal?.addEventListener("abort", c, { once: !0 });
    const d = { kinds: [kt], "#p": [t] }, p = (f) => {
      let g, v = null;
      try {
        v = Tt(e.clientSecretKey, f.pubkey), g = JSON.parse(Nn(v, f.content));
      } catch {
        return;
      } finally {
        v && E(v);
      }
      g.result === e.secret && u({ signerPubkey: f.pubkey });
    };
    Promise.allSettled(r.map((f) => f.subscribeLive(d, p))).then((f) => {
      f.some((g) => g.status === "fulfilled") || u(new Error("Could not reach any relay to listen for the signer."));
    });
  });
}
function xn() {
  const e = globalThis.crypto;
  if (!e || !e.subtle)
    throw new Error("WebCrypto SubtleCrypto is not available in this environment.");
  return e;
}
async function jr(e) {
  if (e.length !== 32)
    throw new Error("AES-256-GCM key must be exactly 32 bytes.");
  return xn().subtle.importKey("raw", e, "AES-GCM", !1, ["encrypt", "decrypt"]);
}
async function Fr(e, t, n) {
  const r = li(), o = await jr(e), i = await xn().subtle.encrypt({ name: "AES-GCM", iv: r, additionalData: n, tagLength: 128 }, o, t);
  return { nonce: r, ciphertext: new Uint8Array(i) };
}
async function Wr(e, t, n, r) {
  const o = await jr(e);
  try {
    const i = await xn().subtle.decrypt({ name: "AES-GCM", iv: t, additionalData: r, tagLength: 128 }, o, n);
    return new Uint8Array(i);
  } catch {
    throw new Error("AES-256-GCM authentication failed: capsule is corrupted, tampered, or the wrong key was used.");
  }
}
const Gr = `abandon
ability
able
about
above
absent
absorb
abstract
absurd
abuse
access
accident
account
accuse
achieve
acid
acoustic
acquire
across
act
action
actor
actress
actual
adapt
add
addict
address
adjust
admit
adult
advance
advice
aerobic
affair
afford
afraid
again
age
agent
agree
ahead
aim
air
airport
aisle
alarm
album
alcohol
alert
alien
all
alley
allow
almost
alone
alpha
already
also
alter
always
amateur
amazing
among
amount
amused
analyst
anchor
ancient
anger
angle
angry
animal
ankle
announce
annual
another
answer
antenna
antique
anxiety
any
apart
apology
appear
apple
approve
april
arch
arctic
area
arena
argue
arm
armed
armor
army
around
arrange
arrest
arrive
arrow
art
artefact
artist
artwork
ask
aspect
assault
asset
assist
assume
asthma
athlete
atom
attack
attend
attitude
attract
auction
audit
august
aunt
author
auto
autumn
average
avocado
avoid
awake
aware
away
awesome
awful
awkward
axis
baby
bachelor
bacon
badge
bag
balance
balcony
ball
bamboo
banana
banner
bar
barely
bargain
barrel
base
basic
basket
battle
beach
bean
beauty
because
become
beef
before
begin
behave
behind
believe
below
belt
bench
benefit
best
betray
better
between
beyond
bicycle
bid
bike
bind
biology
bird
birth
bitter
black
blade
blame
blanket
blast
bleak
bless
blind
blood
blossom
blouse
blue
blur
blush
board
boat
body
boil
bomb
bone
bonus
book
boost
border
boring
borrow
boss
bottom
bounce
box
boy
bracket
brain
brand
brass
brave
bread
breeze
brick
bridge
brief
bright
bring
brisk
broccoli
broken
bronze
broom
brother
brown
brush
bubble
buddy
budget
buffalo
build
bulb
bulk
bullet
bundle
bunker
burden
burger
burst
bus
business
busy
butter
buyer
buzz
cabbage
cabin
cable
cactus
cage
cake
call
calm
camera
camp
can
canal
cancel
candy
cannon
canoe
canvas
canyon
capable
capital
captain
car
carbon
card
cargo
carpet
carry
cart
case
cash
casino
castle
casual
cat
catalog
catch
category
cattle
caught
cause
caution
cave
ceiling
celery
cement
census
century
cereal
certain
chair
chalk
champion
change
chaos
chapter
charge
chase
chat
cheap
check
cheese
chef
cherry
chest
chicken
chief
child
chimney
choice
choose
chronic
chuckle
chunk
churn
cigar
cinnamon
circle
citizen
city
civil
claim
clap
clarify
claw
clay
clean
clerk
clever
click
client
cliff
climb
clinic
clip
clock
clog
close
cloth
cloud
clown
club
clump
cluster
clutch
coach
coast
coconut
code
coffee
coil
coin
collect
color
column
combine
come
comfort
comic
common
company
concert
conduct
confirm
congress
connect
consider
control
convince
cook
cool
copper
copy
coral
core
corn
correct
cost
cotton
couch
country
couple
course
cousin
cover
coyote
crack
cradle
craft
cram
crane
crash
crater
crawl
crazy
cream
credit
creek
crew
cricket
crime
crisp
critic
crop
cross
crouch
crowd
crucial
cruel
cruise
crumble
crunch
crush
cry
crystal
cube
culture
cup
cupboard
curious
current
curtain
curve
cushion
custom
cute
cycle
dad
damage
damp
dance
danger
daring
dash
daughter
dawn
day
deal
debate
debris
decade
december
decide
decline
decorate
decrease
deer
defense
define
defy
degree
delay
deliver
demand
demise
denial
dentist
deny
depart
depend
deposit
depth
deputy
derive
describe
desert
design
desk
despair
destroy
detail
detect
develop
device
devote
diagram
dial
diamond
diary
dice
diesel
diet
differ
digital
dignity
dilemma
dinner
dinosaur
direct
dirt
disagree
discover
disease
dish
dismiss
disorder
display
distance
divert
divide
divorce
dizzy
doctor
document
dog
doll
dolphin
domain
donate
donkey
donor
door
dose
double
dove
draft
dragon
drama
drastic
draw
dream
dress
drift
drill
drink
drip
drive
drop
drum
dry
duck
dumb
dune
during
dust
dutch
duty
dwarf
dynamic
eager
eagle
early
earn
earth
easily
east
easy
echo
ecology
economy
edge
edit
educate
effort
egg
eight
either
elbow
elder
electric
elegant
element
elephant
elevator
elite
else
embark
embody
embrace
emerge
emotion
employ
empower
empty
enable
enact
end
endless
endorse
enemy
energy
enforce
engage
engine
enhance
enjoy
enlist
enough
enrich
enroll
ensure
enter
entire
entry
envelope
episode
equal
equip
era
erase
erode
erosion
error
erupt
escape
essay
essence
estate
eternal
ethics
evidence
evil
evoke
evolve
exact
example
excess
exchange
excite
exclude
excuse
execute
exercise
exhaust
exhibit
exile
exist
exit
exotic
expand
expect
expire
explain
expose
express
extend
extra
eye
eyebrow
fabric
face
faculty
fade
faint
faith
fall
false
fame
family
famous
fan
fancy
fantasy
farm
fashion
fat
fatal
father
fatigue
fault
favorite
feature
february
federal
fee
feed
feel
female
fence
festival
fetch
fever
few
fiber
fiction
field
figure
file
film
filter
final
find
fine
finger
finish
fire
firm
first
fiscal
fish
fit
fitness
fix
flag
flame
flash
flat
flavor
flee
flight
flip
float
flock
floor
flower
fluid
flush
fly
foam
focus
fog
foil
fold
follow
food
foot
force
forest
forget
fork
fortune
forum
forward
fossil
foster
found
fox
fragile
frame
frequent
fresh
friend
fringe
frog
front
frost
frown
frozen
fruit
fuel
fun
funny
furnace
fury
future
gadget
gain
galaxy
gallery
game
gap
garage
garbage
garden
garlic
garment
gas
gasp
gate
gather
gauge
gaze
general
genius
genre
gentle
genuine
gesture
ghost
giant
gift
giggle
ginger
giraffe
girl
give
glad
glance
glare
glass
glide
glimpse
globe
gloom
glory
glove
glow
glue
goat
goddess
gold
good
goose
gorilla
gospel
gossip
govern
gown
grab
grace
grain
grant
grape
grass
gravity
great
green
grid
grief
grit
grocery
group
grow
grunt
guard
guess
guide
guilt
guitar
gun
gym
habit
hair
half
hammer
hamster
hand
happy
harbor
hard
harsh
harvest
hat
have
hawk
hazard
head
health
heart
heavy
hedgehog
height
hello
helmet
help
hen
hero
hidden
high
hill
hint
hip
hire
history
hobby
hockey
hold
hole
holiday
hollow
home
honey
hood
hope
horn
horror
horse
hospital
host
hotel
hour
hover
hub
huge
human
humble
humor
hundred
hungry
hunt
hurdle
hurry
hurt
husband
hybrid
ice
icon
idea
identify
idle
ignore
ill
illegal
illness
image
imitate
immense
immune
impact
impose
improve
impulse
inch
include
income
increase
index
indicate
indoor
industry
infant
inflict
inform
inhale
inherit
initial
inject
injury
inmate
inner
innocent
input
inquiry
insane
insect
inside
inspire
install
intact
interest
into
invest
invite
involve
iron
island
isolate
issue
item
ivory
jacket
jaguar
jar
jazz
jealous
jeans
jelly
jewel
job
join
joke
journey
joy
judge
juice
jump
jungle
junior
junk
just
kangaroo
keen
keep
ketchup
key
kick
kid
kidney
kind
kingdom
kiss
kit
kitchen
kite
kitten
kiwi
knee
knife
knock
know
lab
label
labor
ladder
lady
lake
lamp
language
laptop
large
later
latin
laugh
laundry
lava
law
lawn
lawsuit
layer
lazy
leader
leaf
learn
leave
lecture
left
leg
legal
legend
leisure
lemon
lend
length
lens
leopard
lesson
letter
level
liar
liberty
library
license
life
lift
light
like
limb
limit
link
lion
liquid
list
little
live
lizard
load
loan
lobster
local
lock
logic
lonely
long
loop
lottery
loud
lounge
love
loyal
lucky
luggage
lumber
lunar
lunch
luxury
lyrics
machine
mad
magic
magnet
maid
mail
main
major
make
mammal
man
manage
mandate
mango
mansion
manual
maple
marble
march
margin
marine
market
marriage
mask
mass
master
match
material
math
matrix
matter
maximum
maze
meadow
mean
measure
meat
mechanic
medal
media
melody
melt
member
memory
mention
menu
mercy
merge
merit
merry
mesh
message
metal
method
middle
midnight
milk
million
mimic
mind
minimum
minor
minute
miracle
mirror
misery
miss
mistake
mix
mixed
mixture
mobile
model
modify
mom
moment
monitor
monkey
monster
month
moon
moral
more
morning
mosquito
mother
motion
motor
mountain
mouse
move
movie
much
muffin
mule
multiply
muscle
museum
mushroom
music
must
mutual
myself
mystery
myth
naive
name
napkin
narrow
nasty
nation
nature
near
neck
need
negative
neglect
neither
nephew
nerve
nest
net
network
neutral
never
news
next
nice
night
noble
noise
nominee
noodle
normal
north
nose
notable
note
nothing
notice
novel
now
nuclear
number
nurse
nut
oak
obey
object
oblige
obscure
observe
obtain
obvious
occur
ocean
october
odor
off
offer
office
often
oil
okay
old
olive
olympic
omit
once
one
onion
online
only
open
opera
opinion
oppose
option
orange
orbit
orchard
order
ordinary
organ
orient
original
orphan
ostrich
other
outdoor
outer
output
outside
oval
oven
over
own
owner
oxygen
oyster
ozone
pact
paddle
page
pair
palace
palm
panda
panel
panic
panther
paper
parade
parent
park
parrot
party
pass
patch
path
patient
patrol
pattern
pause
pave
payment
peace
peanut
pear
peasant
pelican
pen
penalty
pencil
people
pepper
perfect
permit
person
pet
phone
photo
phrase
physical
piano
picnic
picture
piece
pig
pigeon
pill
pilot
pink
pioneer
pipe
pistol
pitch
pizza
place
planet
plastic
plate
play
please
pledge
pluck
plug
plunge
poem
poet
point
polar
pole
police
pond
pony
pool
popular
portion
position
possible
post
potato
pottery
poverty
powder
power
practice
praise
predict
prefer
prepare
present
pretty
prevent
price
pride
primary
print
priority
prison
private
prize
problem
process
produce
profit
program
project
promote
proof
property
prosper
protect
proud
provide
public
pudding
pull
pulp
pulse
pumpkin
punch
pupil
puppy
purchase
purity
purpose
purse
push
put
puzzle
pyramid
quality
quantum
quarter
question
quick
quit
quiz
quote
rabbit
raccoon
race
rack
radar
radio
rail
rain
raise
rally
ramp
ranch
random
range
rapid
rare
rate
rather
raven
raw
razor
ready
real
reason
rebel
rebuild
recall
receive
recipe
record
recycle
reduce
reflect
reform
refuse
region
regret
regular
reject
relax
release
relief
rely
remain
remember
remind
remove
render
renew
rent
reopen
repair
repeat
replace
report
require
rescue
resemble
resist
resource
response
result
retire
retreat
return
reunion
reveal
review
reward
rhythm
rib
ribbon
rice
rich
ride
ridge
rifle
right
rigid
ring
riot
ripple
risk
ritual
rival
river
road
roast
robot
robust
rocket
romance
roof
rookie
room
rose
rotate
rough
round
route
royal
rubber
rude
rug
rule
run
runway
rural
sad
saddle
sadness
safe
sail
salad
salmon
salon
salt
salute
same
sample
sand
satisfy
satoshi
sauce
sausage
save
say
scale
scan
scare
scatter
scene
scheme
school
science
scissors
scorpion
scout
scrap
screen
script
scrub
sea
search
season
seat
second
secret
section
security
seed
seek
segment
select
sell
seminar
senior
sense
sentence
series
service
session
settle
setup
seven
shadow
shaft
shallow
share
shed
shell
sheriff
shield
shift
shine
ship
shiver
shock
shoe
shoot
shop
short
shoulder
shove
shrimp
shrug
shuffle
shy
sibling
sick
side
siege
sight
sign
silent
silk
silly
silver
similar
simple
since
sing
siren
sister
situate
six
size
skate
sketch
ski
skill
skin
skirt
skull
slab
slam
sleep
slender
slice
slide
slight
slim
slogan
slot
slow
slush
small
smart
smile
smoke
smooth
snack
snake
snap
sniff
snow
soap
soccer
social
sock
soda
soft
solar
soldier
solid
solution
solve
someone
song
soon
sorry
sort
soul
sound
soup
source
south
space
spare
spatial
spawn
speak
special
speed
spell
spend
sphere
spice
spider
spike
spin
spirit
split
spoil
sponsor
spoon
sport
spot
spray
spread
spring
spy
square
squeeze
squirrel
stable
stadium
staff
stage
stairs
stamp
stand
start
state
stay
steak
steel
stem
step
stereo
stick
still
sting
stock
stomach
stone
stool
story
stove
strategy
street
strike
strong
struggle
student
stuff
stumble
style
subject
submit
subway
success
such
sudden
suffer
sugar
suggest
suit
summer
sun
sunny
sunset
super
supply
supreme
sure
surface
surge
surprise
surround
survey
suspect
sustain
swallow
swamp
swap
swarm
swear
sweet
swift
swim
swing
switch
sword
symbol
symptom
syrup
system
table
tackle
tag
tail
talent
talk
tank
tape
target
task
taste
tattoo
taxi
teach
team
tell
ten
tenant
tennis
tent
term
test
text
thank
that
theme
then
theory
there
they
thing
this
thought
three
thrive
throw
thumb
thunder
ticket
tide
tiger
tilt
timber
time
tiny
tip
tired
tissue
title
toast
tobacco
today
toddler
toe
together
toilet
token
tomato
tomorrow
tone
tongue
tonight
tool
tooth
top
topic
topple
torch
tornado
tortoise
toss
total
tourist
toward
tower
town
toy
track
trade
traffic
tragic
train
transfer
trap
trash
travel
tray
treat
tree
trend
trial
tribe
trick
trigger
trim
trip
trophy
trouble
truck
true
truly
trumpet
trust
truth
try
tube
tuition
tumble
tuna
tunnel
turkey
turn
turtle
twelve
twenty
twice
twin
twist
two
type
typical
ugly
umbrella
unable
unaware
uncle
uncover
under
undo
unfair
unfold
unhappy
uniform
unique
unit
universe
unknown
unlock
until
unusual
unveil
update
upgrade
uphold
upon
upper
upset
urban
urge
usage
use
used
useful
useless
usual
utility
vacant
vacuum
vague
valid
valley
valve
van
vanish
vapor
various
vast
vault
vehicle
velvet
vendor
venture
venue
verb
verify
version
very
vessel
veteran
viable
vibrant
vicious
victory
video
view
village
vintage
violin
virtual
virus
visa
visit
visual
vital
vivid
vocal
voice
void
volcano
volume
vote
voyage
wage
wagon
wait
walk
wall
walnut
want
warfare
warm
warrior
wash
wasp
waste
water
wave
way
wealth
weapon
wear
weasel
weather
web
wedding
weekend
weird
welcome
west
wet
whale
what
wheat
wheel
when
where
whip
whisper
wide
width
wife
wild
will
win
window
wine
wing
wink
winner
winter
wire
wisdom
wise
wish
witness
wolf
woman
wonder
wood
wool
word
work
world
worry
worth
wrap
wreck
wrestle
wrist
write
wrong
yard
year
yellow
you
young
youth
zebra
zero
zone
zoo`.split(`
`);
function bs(e, t, n, r) {
  di(e);
  const o = fi({ dkLen: 32, asyncTick: 10 }, r), { c: i, dkLen: s, asyncTick: a } = o;
  if (jt(i), jt(s), jt(a), i < 1)
    throw new Error("iterations (c) should be >= 1");
  const c = zn(t), u = zn(n), y = new Uint8Array(s), d = mn.create(e, c), p = d._cloneInto().update(u);
  return { c: i, dkLen: s, asyncTick: a, DK: y, PRF: d, PRFSalt: p };
}
function ms(e, t, n, r, o) {
  return e.destroy(), t.destroy(), r && r.destroy(), pi(o), n;
}
async function ks(e, t, n, r) {
  const { c: o, dkLen: i, asyncTick: s, DK: a, PRF: c, PRFSalt: u } = bs(e, t, n, r);
  let y;
  const d = new Uint8Array(4), p = ui(d), f = new Uint8Array(c.outputLen);
  for (let g = 1, v = 0; v < i; g++, v += c.outputLen) {
    const w = a.subarray(v, v + c.outputLen);
    p.setInt32(0, g, !1), (y = u._cloneInto(y)).update(d).digestInto(f), w.set(f.subarray(0, w.length)), await yi(o - 1, s, () => {
      c._cloneInto(y).update(f).digestInto(f);
      for (let h = 0; h < w.length; h++)
        w[h] ^= f[h];
    });
  }
  return ms(c, u, a, y, f);
}
/*! scure-bip39 - MIT License (c) 2022 Patricio Palladino, Paul Miller (paulmillr.com) */
const Es = (e) => e[0] === "あいこくしん";
function zr(e) {
  if (typeof e != "string")
    throw new TypeError("invalid mnemonic type: " + typeof e);
  return e.normalize("NFKD");
}
function Hr(e) {
  const t = zr(e), n = t.split(" ");
  if (![12, 15, 18, 21, 24].includes(n.length))
    throw new Error("Invalid mnemonic");
  return { nfkd: t, words: n };
}
function Jr(e) {
  vi(e, 16, 20, 24, 28, 32);
}
const _s = (e) => {
  const t = 8 - e.length / 4;
  return new Uint8Array([kn(e)[0] >> t << t]);
};
function Yr(e) {
  if (!Array.isArray(e) || e.length !== 2048 || typeof e[0] != "string")
    throw new Error("Wordlist: expected array of 2048 strings");
  return e.forEach((t) => {
    if (typeof t != "string")
      throw new Error("wordlist: non-string element: " + t);
  }), vt.chain(vt.checksum(1, _s), vt.radix2(11, !0), vt.alphabet(e));
}
function Ps(e, t) {
  const { words: n } = Hr(e), r = Yr(t).decode(n);
  return Jr(r), r;
}
function Ks(e, t) {
  return Jr(e), Yr(t).encode(e).join(Es(t) ? "　" : " ");
}
function As(e, t) {
  try {
    Ps(e, t);
  } catch {
    return !1;
  }
  return !0;
}
const Rs = (e) => zr("mnemonic" + e);
function Ss(e, t = "") {
  return ks(hi, Hr(e).nfkd, Rs(t), { c: 2048, dkLen: 64 });
}
function Ns(e) {
  if (e.length !== 16)
    throw new Error("Recovery phrase entropy must be exactly 128 bits (16 bytes).");
  return Ks(e, Gr);
}
function Xr(e) {
  try {
    return As(Qr(e), Gr);
  } catch {
    return !1;
  }
}
function Qr(e) {
  return e.trim().normalize("NFKD").split(/\s+/u).join(" ");
}
async function Tn(e) {
  return Ss(Qr(e), "");
}
const Pt = [1024, 2048, 4096], Re = 4;
function Cs(e) {
  const t = Re + e.length, n = Pt.find((i) => i >= t);
  if (n === void 0)
    throw new Error(`Payload of ${e.length} bytes exceeds the largest padding bucket (${Pt[Pt.length - 1]} bytes minus ${Re}-byte length prefix).`);
  const r = new Uint8Array(n);
  return new DataView(r.buffer).setUint32(0, e.length, !1), r.set(e, Re), r;
}
function xs(e) {
  if (!Pt.includes(e.length))
    throw new Error(`Padded plaintext length ${e.length} does not match a known bucket.`);
  const n = new DataView(e.buffer, e.byteOffset, e.byteLength).getUint32(0, !1);
  if (n > e.length - Re)
    throw new Error("Declared payload length exceeds the padded bucket size.");
  const r = e.slice(Re, Re + n), o = e.slice(Re + n);
  for (const i of o)
    if (i !== 0)
      throw new Error("Padding bytes are not all zero; capsule plaintext is malformed.");
  return r;
}
function Ts(e) {
  const t = gi(e);
  if (t === void 0)
    throw new Error("Value is not JSON-serializable for canonicalization.");
  return t;
}
function Is(e) {
  return H(Ts(e));
}
const _e = 16, Ms = 283;
function Ls(e) {
  if (![16, 24, 32].includes(e.length))
    throw new Error('"aes key" expected Uint8Array of length 16/24/32, got length=' + e.length);
}
function In(e) {
  return e << 1 ^ Ms & -(e >> 7);
}
function Be(e, t) {
  let n = 0;
  for (; t > 0; t >>= 1)
    n ^= e & -(t & 1), e = In(e);
  return n;
}
const an = /* @__PURE__ */ (() => {
  const e = new Uint8Array(256);
  for (let n = 0, r = 1; n < 256; n++, r ^= In(r))
    e[n] = r;
  const t = new Uint8Array(256);
  t[0] = 99;
  for (let n = 0; n < 255; n++) {
    let r = e[255 - n];
    r |= r << 8, t[e[n]] = (r ^ r >> 4 ^ r >> 5 ^ r >> 6 ^ r >> 7 ^ 99) & 255;
  }
  return xe(e), t;
})(), Ds = /* @__PURE__ */ an.map((e, t) => an.indexOf(t)), Os = (e) => e << 24 | e >>> 8, Gt = (e) => e << 8 | e >>> 24;
function Zr(e, t) {
  if (e.length !== 256)
    throw new Error("Wrong sbox length");
  const n = new Uint32Array(256).map((u, y) => t(e[y])), r = n.map(Gt), o = r.map(Gt), i = o.map(Gt), s = new Uint32Array(256 * 256), a = new Uint32Array(256 * 256), c = new Uint16Array(256 * 256);
  for (let u = 0; u < 256; u++)
    for (let y = 0; y < 256; y++) {
      const d = u * 256 + y;
      s[d] = n[u] ^ r[y], a[d] = o[u] ^ i[y], c[d] = e[u] << 8 | e[y];
    }
  return { sbox: e, sbox2: c, T0: n, T1: r, T2: o, T3: i, T01: s, T23: a };
}
const Mn = /* @__PURE__ */ Zr(an, (e) => Be(e, 3) << 24 | e << 16 | e << 8 | Be(e, 2)), eo = /* @__PURE__ */ Zr(Ds, (e) => Be(e, 11) << 24 | Be(e, 13) << 16 | Be(e, 9) << 8 | Be(e, 14)), Us = /* @__PURE__ */ (() => {
  const e = new Uint8Array(16);
  for (let t = 0, n = 1; t < 16; t++, n = In(n))
    e[t] = n;
  return e;
})();
function to(e) {
  F(e);
  const t = e.length;
  Ls(e);
  const { sbox2: n } = Mn, r = [];
  (!ie || !le(e)) && r.push(e = Ne(e));
  const o = W(U(e)), i = o.length, s = (c) => ae(n, c, c, c, c), a = new Uint32Array(t + 28);
  a.set(o);
  for (let c = i; c < a.length; c++) {
    let u = a[c - 1];
    c % i === 0 ? u = s(Os(u)) ^ Us[c / i - 1] : i > 6 && c % i === 4 && (u = s(u)), a[c] = a[c - i] ^ u;
  }
  return xe(...r), a;
}
function Vs(e) {
  const t = to(e), n = t.slice(), r = t.length, { sbox2: o } = Mn, { T0: i, T1: s, T2: a, T3: c } = eo;
  for (let u = 0; u < r; u += 4)
    for (let y = 0; y < 4; y++)
      n[u + y] = t[r - u - 4 + y];
  xe(t);
  for (let u = 4; u < r - 4; u++) {
    const y = n[u], d = ae(o, y, y, y, y);
    n[u] = i[d & 255] ^ s[d >>> 8 & 255] ^ a[d >>> 16 & 255] ^ c[d >>> 24];
  }
  return n;
}
function ve(e, t, n, r, o, i) {
  return e[n << 8 & 65280 | r >>> 8 & 255] ^ t[o >>> 8 & 65280 | i >>> 24 & 255];
}
function ae(e, t, n, r, o) {
  return e[t & 255 | n & 65280] | e[r >>> 16 & 255 | o >>> 16 & 65280] << 16;
}
function Zn(e, t, n, r, o) {
  const { sbox2: i, T01: s, T23: a } = Mn;
  let c = 0;
  t ^= e[c++], n ^= e[c++], r ^= e[c++], o ^= e[c++];
  const u = e.length / 4 - 2;
  for (let g = 0; g < u; g++) {
    const v = e[c++] ^ ve(s, a, t, n, r, o), w = e[c++] ^ ve(s, a, n, r, o, t), h = e[c++] ^ ve(s, a, r, o, t, n), b = e[c++] ^ ve(s, a, o, t, n, r);
    t = v, n = w, r = h, o = b;
  }
  const y = e[c++] ^ ae(i, t, n, r, o), d = e[c++] ^ ae(i, n, r, o, t), p = e[c++] ^ ae(i, r, o, t, n), f = e[c++] ^ ae(i, o, t, n, r);
  return { s0: y, s1: d, s2: p, s3: f };
}
function Bs(e, t, n, r, o) {
  const { sbox2: i, T01: s, T23: a } = eo;
  let c = 0;
  t ^= e[c++], n ^= e[c++], r ^= e[c++], o ^= e[c++];
  const u = e.length / 4 - 2;
  for (let g = 0; g < u; g++) {
    const v = e[c++] ^ ve(s, a, t, o, r, n), w = e[c++] ^ ve(s, a, n, t, o, r), h = e[c++] ^ ve(s, a, r, n, t, o), b = e[c++] ^ ve(s, a, o, r, n, t);
    t = v, n = w, r = h, o = b;
  }
  const y = e[c++] ^ ae(i, t, o, r, n), d = e[c++] ^ ae(i, n, t, o, r), p = e[c++] ^ ae(i, r, n, t, o), f = e[c++] ^ ae(i, o, r, n, t);
  return { s0: y, s1: d, s2: p, s3: f };
}
function qs(e) {
  if (F(e), e.length % _e !== 0)
    throw new Error("aes-(cbc/ecb).decrypt ciphertext should consist of blocks with size " + _e);
}
function $s(e, t, n) {
  F(e);
  let r = e.length;
  const o = r % _e;
  if (!t && o !== 0)
    throw new Error("aec/(cbc-ecb): unpadded plaintext with disabled padding");
  if (t) {
    let a = _e - o;
    a || (a = _e), r = r + a;
  }
  n = Rn(r, n), Lr(e, n), (!ie || !le(e)) && (e = Ne(e));
  const i = U(e);
  W(i);
  const s = U(n);
  return { b: i, o: s, out: n };
}
function js(e, t) {
  if (!t)
    return e;
  const n = e.length;
  if (n === 0)
    throw new Error("aes/pkcs7: empty ciphertext not allowed");
  const r = e[n - 1];
  let o = 1;
  o &= r - 1 >>> 31 ^ 1, o &= 16 - r >>> 31 ^ 1;
  for (let i = 0; i < 16; i++) {
    const s = i - r >>> 31, a = (e[n - 1 - i] ^ r) === 0 ? 1 : 0;
    o &= a | s ^ 1;
  }
  if (!o)
    throw new Error("aes/pkcs7: wrong padding");
  return e.subarray(0, n - r);
}
function Fs(e) {
  const t = new Uint8Array(16), n = U(t);
  t.set(e);
  const r = _e - e.length;
  for (let o = _e - r; o < _e; o++)
    t[o] = r;
  return n;
}
const no = /* @__PURE__ */ zi({ blockSize: 16, nonceLength: 16 }, function(t, n, r = {}) {
  const o = !r.disablePadding;
  return {
    encrypt(i, s) {
      const a = to(t), { b: c, o: u, out: y } = $s(i, o, s);
      let d = n;
      const p = [a];
      (!ie || !le(d)) && p.push(d = Ne(d));
      const f = U(d);
      W(f);
      let g = f[0], v = f[1], w = f[2], h = f[3], b = 0;
      for (; b + 4 <= c.length; )
        g ^= c[b + 0], v ^= c[b + 1], w ^= c[b + 2], h ^= c[b + 3], { s0: g, s1: v, s2: w, s3: h } = Zn(a, g, v, w, h), u[b++] = g, u[b++] = v, u[b++] = w, u[b++] = h;
      if (o) {
        const k = Fs(i.subarray(b * 4));
        W(k), g ^= k[0], v ^= k[1], w ^= k[2], h ^= k[3], { s0: g, s1: v, s2: w, s3: h } = Zn(a, g, v, w, h), u[b++] = g, u[b++] = v, u[b++] = w, u[b++] = h;
      }
      return W(u), xe(...p), y;
    },
    decrypt(i, s) {
      qs(i);
      const a = Vs(t);
      let c = n;
      const u = [a];
      (!ie || !le(c)) && u.push(c = Ne(c));
      const y = U(c);
      W(y), s = Rn(i.length, s), Lr(i, s), (!ie || !le(i)) && u.push(i = Ne(i));
      const d = U(i), p = U(s);
      W(d);
      let f = y[0], g = y[1], v = y[2], w = y[3];
      for (let h = 0; h + 4 <= d.length; ) {
        const b = f, k = g, R = v, B = w;
        f = d[h + 0], g = d[h + 1], v = d[h + 2], w = d[h + 3];
        const { s0: N, s1: L, s2: T, s3: D } = Bs(a, f, g, v, w);
        p[h++] = N ^ b, p[h++] = L ^ k, p[h++] = T ^ R, p[h++] = D ^ B;
      }
      return W(p), xe(...u), js(s, o);
    }
  };
});
function ro(e, t) {
  const n = Je(new Uint8Array([2]), bn(t));
  return Ar.getSharedSecret(e, n, !0).slice(1, 33);
}
function Ws(e, t, n) {
  return Gs(e, t, n, G(16));
}
function Gs(e, t, n, r) {
  if (r.length !== 16)
    throw new Error("NIP-04 iv must be exactly 16 bytes.");
  const o = ro(e, t), i = no(o, r).encrypt(H(n));
  return `${$e.encode(i)}?iv=${$e.encode(r)}`;
}
function zs(e, t, n) {
  const r = n.indexOf("?iv=");
  if (r === -1)
    throw new Error('NIP-04 payload is missing its "?iv=" suffix.');
  const o = $e.decode(n.slice(0, r)), i = $e.decode(n.slice(r + 4)), s = ro(e, t), a = no(s, i).decrypt(o);
  return Vt(a);
}
class Te extends Error {
  reason;
  constructor(t) {
    super("Account not found or credentials incorrect."), this.name = "AccountNotFoundError", this.reason = t;
  }
}
class we extends Error {
  constructor(t) {
    super(t), this.name = "RegistrationFailedError";
  }
}
class oo extends Error {
  constructor(t = "An account already exists with this login name and password. Sign in instead, or choose different credentials.") {
    super(t), this.name = "AccountAlreadyExistsError";
  }
}
class ge extends Error {
  constructor(t) {
    super(t), this.name = "RecoveryFailedError";
  }
}
class io extends Error {
  seenGeneration;
  capsuleGeneration;
  constructor(t, n) {
    super(`This credential capsule reports generation ${n}, but this device has already seen generation ${t}. Refusing to log in with older, possibly-revoked credentials.`), this.name = "RollbackDetectedError", this.seenGeneration = t, this.capsuleGeneration = n;
  }
}
function yt(e, t) {
  const n = t ?? Math.floor(Date.now() / 1e3);
  return e == null ? n : Math.max(n, e + 1);
}
const Hs = { generation: -1, recoveryGeneration: -1 };
function Ln(e) {
  return `bitlogin:hwm:${e}`;
}
async function Dn(e, t) {
  const n = await e.get(Ln(t));
  return n ? JSON.parse(n) : Hs;
}
async function so(e, t, n) {
  const r = await Dn(e, t), o = {
    generation: Math.max(r.generation, n.generation ?? -1),
    recoveryGeneration: Math.max(r.recoveryGeneration, n.recoveryGeneration ?? -1)
  };
  return await e.set(Ln(t), JSON.stringify(o)), o;
}
async function Js(e, t, n = { generation: 0, recoveryGeneration: -1 }) {
  await e.set(Ln(t), JSON.stringify(n));
}
function Ys(e, t, n) {
  return oe({ pubkey: _(e), created_at: n, kind: Nt, tags: [], content: JSON.stringify(t) }, e);
}
function Xs(e, t, n) {
  const r = t.map((o) => {
    const i = ["r", o.url];
    return o.read && !o.write && i.push("read"), o.write && !o.read && i.push("write"), i;
  });
  return oe({ pubkey: _(e), created_at: n, kind: ct, tags: r, content: "" }, e);
}
function Qs(e, t, n) {
  return oe({
    pubkey: _(e),
    created_at: n,
    kind: vn,
    tags: t.map((r) => ["relay", r]),
    content: ""
  }, e);
}
function Zs(e) {
  return e.tags.filter((t) => t[0] === "r" && t[1]).map((t) => t[1]);
}
function ea(e) {
  return e.tags.filter((t) => t[0] === "relay" && t[1]).map((t) => t[1]);
}
async function ta(e) {
  const t = _(e.everydayPrivateKey), n = Math.floor(Date.now() / 1e3), r = [.../* @__PURE__ */ new Set([...e.generalRelays, ...e.dmRelays, ...e.discoveryRelays])], o = new K(r), [i, s, a] = await Promise.all([
    o.queryQuorum({ authors: [t], kinds: [Nt] }),
    o.queryQuorum({ authors: [t], kinds: [ct] }),
    o.queryQuorum({ authors: [t], kinds: [vn] })
  ]);
  o.closeAll();
  const c = i.outcomes.some((w) => w.events.length > 0), u = s.outcomes.some((w) => w.events.length > 0), y = a.outcomes.some((w) => w.events.length > 0), d = new K(r);
  let p = null, f = null, g = null;
  const v = [];
  if (!c && (e.name || e.about || e.picture)) {
    const w = Ys(e.everydayPrivateKey, { name: e.name, about: e.about, picture: e.picture }, n);
    v.push(d.publishAll(w).then((h) => void (p = h)));
  }
  if (!u) {
    const w = Xs(e.everydayPrivateKey, e.generalRelays.map((h) => ({ url: h, read: !0, write: !0 })), n);
    v.push(d.publishAll(w).then((h) => void (f = h)));
  }
  if (!y) {
    const w = Qs(e.everydayPrivateKey, e.dmRelays, n);
    v.push(d.publishAll(w).then((h) => void (g = h)));
  }
  return await Promise.all(v), d.closeAll(), {
    profilePublished: p !== null && Se(p) > 0,
    relayListAcknowledgedCount: f !== null ? Se(f) : 0,
    dmRelayListAcknowledgedCount: g !== null ? Se(g) : 0,
    profileSkippedExisting: c,
    relayListSkippedExisting: u,
    dmRelayListSkippedExisting: y
  };
}
async function Ie(e, t, n) {
  const r = n.minAcks ?? 2, o = n.minReadbacks ?? 2, i = await e.publishAll(t, n.timeoutMs), s = Se(i), c = (await e.queryQuorum({ kinds: [z], authors: [t.pubkey], "#d": [n.dTag], limit: 5 }, n.timeoutMs)).outcomes.filter((u) => u.events.some((y) => y.id === t.id)).length;
  return {
    acknowledgedCount: s,
    readbackVerifiedCount: c,
    success: s >= r && c >= o
  };
}
function ao(e) {
  return H(`bitlogin|password-capsule|v1|${e}|30078|bitlogin:password:v1`);
}
function co(e) {
  return H(`bitlogin|recovery-capsule|v1|${e}|30078|bitlogin:recovery:v1`);
}
async function On(e, t, n) {
  const r = Is(e), o = Cs(r), i = await Fr(t, o, n);
  return {
    version: 1,
    algorithm: "aes-256-gcm",
    nonce: I(i.nonce),
    ciphertext: I(i.ciphertext)
  };
}
async function Un(e, t, n) {
  if (e.version !== 1 || e.algorithm !== "aes-256-gcm")
    throw new Error(`Unsupported capsule envelope version/algorithm: ${e.version}/${e.algorithm}`);
  const r = V(e.nonce), o = V(e.ciphertext), i = await Wr(t, r, o, n), s = xs(i);
  return JSON.parse(Vt(s));
}
class Vn extends Error {
  constructor(t) {
    super(t), this.name = "CapsuleValidationError";
  }
}
const na = 1e6, ra = /^[0-9a-f]{64}$/u;
function x(e, t) {
  if (!e)
    throw new Vn(t);
}
function It(e) {
  return typeof e == "string" && ra.test(e);
}
function lo(e) {
  x(Array.isArray(e), "vault_relay_hints must be an array (§12.4.7).");
  for (const t of e)
    x(typeof t == "string", "Each relay hint must be a string (§12.4.7)."), x(Qe(t), `Relay URL must use secure WebSockets, except for an explicit loopback development endpoint (§12.4.7): ${t}`);
}
function uo(e) {
  x(typeof e == "string", "account_id must be a string (§12.4.2).");
  let t;
  try {
    t = V(e);
  } catch {
    throw new Vn("account_id is not valid base64url (§12.4.2).");
  }
  x(t.length === 16, "account_id must decode to exactly 128 bits (§12.4.2).");
}
function yo(e, t) {
  x(typeof e == "string", "operational_private_key must be a string (§12.4.3).");
  const n = V(e);
  x(n.length === 32, "operational_private_key must be exactly 32 bytes (§12.4.3)."), x(En(n), "operational_private_key is not a valid secp256k1 scalar (§12.4.3)."), x(It(t), "operational_public_key must be lowercase 64-char hex (§12.4.4).");
  const r = _(n);
  x(r === t, "operational_public_key does not match the derived public key (§12.4.4).");
}
function Mt(e, t) {
  x(typeof t == "string", `${e} must be a string (§CV5.2).`);
  let n;
  try {
    n = V(t);
  } catch {
    throw new Vn(`${e} is not valid base64url (§CV5.2).`);
  }
  x(n.length === 32, `${e} must decode to exactly 32 bytes (§CV5.2).`);
}
function oa(e) {
  const t = e.connection_vault_root, n = e.vault_sudo_key;
  t === void 0 && n === void 0 || (x(t !== void 0 && n !== void 0, "connection_vault_root and vault_sudo_key must appear together (§CV5.2)."), Mt("connection_vault_root", t), Mt("vault_sudo_key", n));
}
function ia(e) {
  const t = e.connection_vault_root, n = e.vault_sudo_key;
  t === void 0 && n === void 0 || (x(t !== void 0, "vault_sudo_key cannot appear without connection_vault_root (§CV5.2)."), Mt("connection_vault_root", t), n !== void 0 && Mt("vault_sudo_key", n));
}
function fo(e, t) {
  x(Number.isInteger(e) && e >= 0 && e <= na, `${t} is out of supported bounds (§12.4.8).`);
}
function sa(e) {
  x(e.schema === Ot, `Unsupported or unknown schema: ${String(e.schema)} (§12.4.1)`), uo(e.account_id), fo(e.generation, "generation"), yo(e.operational_private_key, e.operational_public_key), x(It(e.recovery_public_key), "recovery_public_key must be lowercase 64-char hex (§12.4.5)."), lo(e.vault_relay_hints), ia(e);
  const t = e.recovery_capsule_event;
  x(!!t && typeof t == "object", "recovery_capsule_event must be present (§12.4.6)."), x(M(t), "Embedded recovery_capsule_event has an invalid event id or signature (§12.4.6)."), x(t.pubkey === e.recovery_public_key, "Embedded recovery_capsule_event author does not match recovery_public_key (§12.4.5).");
}
function aa(e) {
  x(e.schema === Dt, `Unsupported or unknown schema: ${String(e.schema)} (§12.4.1)`), uo(e.account_id), fo(e.recovery_generation, "recovery_generation"), x(e.previous_recovery_event_id === null || It(e.previous_recovery_event_id), "previous_recovery_event_id must be null or lowercase 64-char hex (§12.3)."), yo(e.operational_private_key, e.operational_public_key), x(It(e.recovery_public_key), "recovery_public_key must be lowercase 64-char hex."), lo(e.vault_relay_hints), oa(e);
}
function ca(e) {
  const t = /* @__PURE__ */ new Map();
  for (const r of e) {
    const o = t.get(r.recoveryGeneration);
    if (o && o.eventId !== r.eventId)
      return {
        consistent: !1,
        warning: `Two different recovery capsules both claim generation ${r.recoveryGeneration}: possible fork, replay, or relay misbehavior.`
      };
    t.set(r.recoveryGeneration, r);
  }
  const n = [...e].sort((r, o) => r.recoveryGeneration - o.recoveryGeneration);
  for (let r = 1; r < n.length; r++) {
    const o = n[r];
    if (o.previousRecoveryEventId === null)
      return {
        consistent: !1,
        warning: `Generation ${o.recoveryGeneration} has a null previous-event link but is not the first generation.`
      };
    const i = t.get(o.recoveryGeneration - 1);
    if (!i)
      return {
        consistent: !1,
        warning: `Recovery generation ${o.recoveryGeneration - 1} is missing, so the chain up to generation ${o.recoveryGeneration} cannot be verified.`
      };
    if (o.previousRecoveryEventId !== i.eventId)
      return {
        consistent: !1,
        warning: `Recovery generation chain is broken between generation ${o.recoveryGeneration - 1} and ${o.recoveryGeneration}: possible replay or relay misbehavior.`
      };
  }
  return { consistent: !0 };
}
async function Bn(e) {
  const t = _(e.locatorPrivateKey), n = await On(e.payload, e.capsuleKey, ao(t));
  return oe({
    pubkey: t,
    created_at: e.payload.created_at,
    kind: z,
    tags: [["d", He]],
    content: JSON.stringify(n)
  }, e.locatorPrivateKey);
}
function la(e) {
  const t = _(e.oldLocatorPrivateKey);
  return oe({
    pubkey: t,
    created_at: e.createdAt,
    kind: z,
    tags: [["d", He]],
    content: ""
  }, e.oldLocatorPrivateKey);
}
async function ua(e, t) {
  if (!M(e))
    throw new Error("Credential capsule event has an invalid id or signature.");
  const n = JSON.parse(e.content), r = await Un(n, t, ao(e.pubkey));
  return sa(r), r;
}
async function qn(e) {
  const t = _(e.recoveryPrivateKey), n = await On(e.payload, e.capsuleKey, co(t));
  return oe({
    pubkey: t,
    created_at: e.payload.created_at,
    kind: z,
    tags: [["d", pt]],
    content: JSON.stringify(n)
  }, e.recoveryPrivateKey);
}
async function po(e, t) {
  if (!M(e))
    throw new Error("Recovery capsule event has an invalid id or signature.");
  const n = JSON.parse(e.content), r = await Un(n, t, co(e.pubkey));
  return aa(r), r;
}
function er(e, t, n) {
  const r = /* @__PURE__ */ new Map();
  for (const o of e)
    o.pubkey === t && o.kind === z && Xe(o, "d") === n && M(o) && r.set(o.id, o);
  return [...r.values()].sort((o, i) => i.created_at - o.created_at);
}
async function ho(e, t, n, r, o) {
  const i = await e.queryQuorum({ kinds: [z], authors: [t], "#d": [n], limit: 5 }, o), s = i.outcomes.flatMap((p) => p.events), a = er(s, t, n), c = [];
  for (const p of a)
    try {
      const f = await r(p);
      c.push({ event: p, payload: f });
    } catch (f) {
      c.push({ event: p, payload: null, error: f.message });
    }
  const u = c.find((p) => p.payload !== null) ?? null, y = i.outcomes.map((p) => ({
    responded: p.responded,
    events: er(p.events, t, n)
  })).filter((p) => p.responded && p.events.length > 0).map((p) => p.events[0].id), d = new Set(y).size > 1;
  return {
    quorumMet: i.quorumMet,
    respondedCount: i.respondedCount,
    totalCount: i.totalCount,
    candidates: c,
    best: u,
    relayDisagreement: d
  };
}
async function dt(e, t, n, r = 8e3) {
  return ho(e, t, He, (o) => ua(o, n), r);
}
async function vo(e, t, n, r = 8e3) {
  return ho(e, t, pt, (o) => po(o, n), r);
}
function ya(e) {
  const t = e.filter((n) => n.payload !== null);
  return t.length < 2 ? { consistent: !0 } : ca(t.map((n) => ({
    eventId: n.event.id,
    recoveryGeneration: n.payload.recovery_generation,
    previousRecoveryEventId: n.payload.previous_recovery_event_id
  })));
}
async function tr(e) {
  const t = [...new Set(e.relayUrls)], n = async (a) => {
    const c = new K(t);
    try {
      const u = await c.publishAll(a, e.timeoutMs);
      return new Map(u.map((y) => [
        y.relayUrl,
        { ok: y.result.ok, message: y.result.message ?? "" }
      ]));
    } finally {
      c.closeAll();
    }
  }, [r, o] = await Promise.all([
    n(e.credentialEvent),
    n(e.recoveryEvent)
  ]), i = { ok: !1, message: "no reply" }, s = t.map((a) => ({
    relayUrl: a,
    credential: r.get(a) ?? i,
    recovery: o.get(a) ?? i
  }));
  return {
    credentialAcknowledgedCount: s.filter((a) => a.credential.ok).length,
    recoveryAcknowledgedCount: s.filter((a) => a.recovery.ok).length,
    relaysTried: s.length,
    relays: s
  };
}
function da(e) {
  const t = Xe(e, "d");
  if (e.kind !== z || t === void 0 || !M(e))
    throw new Error("This session's capsule event is not a valid capsule.");
  return { pubkey: e.pubkey, dTag: t };
}
function fa(e, t, n) {
  const r = e.filter((i) => i.pubkey === n.pubkey && i.kind === z && Xe(i, "d") === n.dTag && M(i));
  return r.some((i) => i.id === t.id) ? "current" : r.length === 0 ? "missing" : Math.max(...r.map((i) => i.created_at)) >= t.created_at ? "newer" : "older";
}
async function nr(e, t, n) {
  const r = da(t), o = new K(e);
  try {
    const i = await o.queryQuorum({
      kinds: [z],
      authors: [r.pubkey],
      "#d": [r.dTag],
      limit: 5
    }, n);
    return new Map(i.outcomes.map((s) => [
      s.relayUrl,
      s.responded ? { status: fa(s.events, t, r) } : { status: "unreachable", error: s.error }
    ]));
  } finally {
    o.closeAll();
  }
}
async function pa(e) {
  const t = [...new Set(e.relayUrls)], [n, r] = await Promise.all([
    nr(t, e.credentialEvent, e.timeoutMs),
    nr(t, e.recoveryEvent, e.timeoutMs)
  ]), o = t.map((i) => {
    const s = n.get(i) ?? { status: "unreachable" }, a = r.get(i) ?? { status: "unreachable" }, c = s.error ?? a.error;
    return {
      relayUrl: i,
      credential: s.status,
      recovery: a.status,
      ...c ? { error: c } : {}
    };
  });
  return {
    relays: o,
    totalCount: o.length,
    reachableCount: o.filter((i) => i.credential !== "unreachable" && i.recovery !== "unreachable").length,
    credentialCurrentCount: o.filter((i) => i.credential === "current").length,
    recoveryCurrentCount: o.filter((i) => i.recovery === "current").length,
    checkedAt: e.now ?? Math.floor(Date.now() / 1e3)
  };
}
const $n = oi.id, je = "aes-256-gcm-v1", Fe = "bitlogin-bip39-hkdf-v1", wo = "bitlogin-recovery-hkdf-v1", ha = 4, va = 64;
function We(e) {
  return [...new Set(e)].filter((t) => t.length <= va).slice(0, ha);
}
function Ge(e) {
  return e ? { everyday_derivation: wo } : {};
}
function go(e) {
  return e.protocol?.everyday_derivation === wo;
}
async function bo(e) {
  const t = Ut(e.loginName), n = e.now ?? Math.floor(Date.now() / 1e3), { locatorPrivateKey: r, capsuleKey: o } = await lt(e.password, t);
  try {
    const i = _(r), s = new K(e.vaultRelayUrls, {
      authPrivateKey: r
    });
    let a;
    try {
      a = await dt(s, i, o, e.timeoutMs);
    } finally {
      s.closeAll();
    }
    if (!a.quorumMet)
      throw new we("Couldn't verify this login name and password aren't already registered. Please retry, or add more vault relays.");
    if (a.candidates.length > 0)
      throw new oo();
    const c = e.everydayPrivateKey !== void 0;
    if (c && !En(e.everydayPrivateKey))
      throw new we("The provided key is not a valid secp256k1 private key.");
    const u = Ns(wi()), y = await Tn(u);
    let d, p, f;
    try {
      ({ recoveryPrivateKey: d, capsuleKey: p } = wn(y)), f = c ? e.everydayPrivateKey : gn(y);
    } finally {
      E(y);
    }
    const g = !c, v = G(32), w = G(32);
    let h = !1;
    try {
      const b = _(d), k = _(f), R = I(Rr()), B = {
        schema: Dt,
        account_id: R,
        recovery_generation: 0,
        previous_recovery_event_id: null,
        operational_private_key: I(f),
        operational_public_key: k,
        recovery_public_key: b,
        connection_vault_root: I(v),
        vault_sudo_key: I(w),
        created_at: n,
        vault_relay_hints: We(e.vaultRelayUrls),
        protocol: {
          capsule_encryption: je,
          recovery_derivation: Fe,
          ...Ge(g)
        }
      }, N = await qn({
        recoveryPrivateKey: d,
        capsuleKey: p,
        payload: B
      }), L = new K(e.vaultRelayUrls, {
        authPrivateKey: d
      });
      let T;
      try {
        T = await Ie(L, N, {
          dTag: pt,
          minAcks: e.minAcknowledgements,
          timeoutMs: e.timeoutMs
        });
      } finally {
        L.closeAll();
      }
      if (!T.success)
        throw new we("The recovery capsule did not reach the required relay acknowledgement and readback quorum. No login credential was published. Please retry, or add more vault relays.");
      const D = {
        schema: Ot,
        account_id: R,
        generation: 0,
        operational_private_key: I(f),
        operational_public_key: k,
        recovery_public_key: b,
        recovery_capsule_event: N,
        connection_vault_root: I(v),
        created_at: n,
        vault_relay_hints: We(e.vaultRelayUrls),
        protocol: {
          password_kdf: $n,
          capsule_encryption: je,
          recovery_derivation: Fe,
          ...Ge(g)
        }
      }, q = await Bn({
        locatorPrivateKey: r,
        capsuleKey: o,
        payload: D
      }), $ = new K(e.vaultRelayUrls, {
        authPrivateKey: r
      });
      let O;
      try {
        O = await Ie($, q, {
          dTag: He,
          minAcks: e.minAcknowledgements,
          timeoutMs: e.timeoutMs
        });
      } finally {
        $.closeAll();
      }
      if (!O.success)
        throw new we("Registration did not reach the required credential acknowledgement and readback quorum. Please retry, or add more vault relays.");
      return h = !0, {
        normalizedLoginName: t,
        recoveryPhrase: u,
        everydayPrivateKey: f,
        everydayPublicKey: k,
        recoveryPublicKey: b,
        locatorPublicKey: i,
        accountId: R,
        imported: c,
        everydayKeyDerived: g,
        connectionVaultRoot: v,
        vaultSudoKey: w,
        credentialEvent: q,
        recoveryEvent: N,
        credentialPublish: O,
        recoveryPublish: T
      };
    } finally {
      E(d, p), h || (c || E(f), E(v, w));
    }
  } finally {
    E(r, o);
  }
}
async function wa(e) {
  const { nsecOrHex: t, ...n } = e, r = mo(t);
  return bo({ ...n, everydayPrivateKey: r });
}
function mo(e) {
  const t = e.trim();
  let n;
  if (t.startsWith("nsec1"))
    n = ii(t);
  else if (/^[0-9a-fA-F]{64}$/u.test(t))
    n = bn(t.toLowerCase());
  else
    throw new we("Enter a valid nsec (nsec1…) or a 64-character hex private key.");
  if (!En(n))
    throw new we("The provided key is not a valid secp256k1 private key.");
  return n;
}
class ko {
  map = /* @__PURE__ */ new Map();
  async get(t) {
    return this.map.get(t);
  }
  async set(t, n) {
    this.map.set(t, n);
  }
  async delete(t) {
    this.map.delete(t);
  }
}
async function ga(e) {
  const t = Ut(e.loginName), { locatorPrivateKey: n, capsuleKey: r } = await lt(e.password, t), o = _(n), i = new K(e.vaultRelayUrls, {
    authPrivateKey: n
  });
  try {
    const s = await dt(i, o, r, e.timeoutMs);
    if (!s.quorumMet)
      throw new Te("quorum-not-met");
    if (!s.best)
      throw new Te(s.candidates.length > 0 ? "no-valid-candidate" : "no-matching-event");
    const a = s.best.payload, c = e.store ?? new ko(), u = await Dn(c, a.operational_public_key), y = a.generation < u.generation;
    if (y && !e.acknowledgeRollback)
      throw new io(u.generation, a.generation);
    const d = y ? `This device previously saw credential generation ${u.generation}, but the accepted capsule is generation ${a.generation}. Relays may be serving stale data, or an old capsule is being replayed.` : void 0;
    await so(c, a.operational_public_key, {
      generation: a.generation
    });
    const p = s.relayDisagreement ? 'Configured relays returned different credential capsules as "latest" for this account. Some relays may be stale, censored, or malicious.' : void 0;
    return {
      everydayPrivateKey: V(a.operational_private_key),
      everydayPublicKey: a.operational_public_key,
      recoveryPublicKey: a.recovery_public_key,
      accountId: a.account_id,
      generation: a.generation,
      everydayKeyDerived: go(a),
      credentialEvent: s.best.event,
      recoveryCapsuleEvent: a.recovery_capsule_event,
      connectionVaultRoot: a.connection_vault_root ? V(a.connection_vault_root) : void 0,
      rollbackWarning: d,
      relayDisagreementWarning: p
    };
  } finally {
    i.closeAll();
  }
}
function rr(e) {
  return e.filter((t) => M(t)).sort((t, n) => n.created_at - t.created_at)[0];
}
async function ba(e) {
  if (!Xr(e.phrase))
    throw new ge("This does not look like a valid 12-word BitLogin recovery phrase.");
  const t = await Tn(e.phrase), { recoveryPrivateKey: n, capsuleKey: r } = wn(t), o = gn(t), i = _(o);
  E(t, o);
  const s = _(n), a = new K(e.vaultRelayUrls, {
    authPrivateKey: n
  });
  let c;
  try {
    c = await vo(a, s, r, e.timeoutMs);
  } finally {
    a.closeAll();
  }
  if (e.offlineRecoveryCapsuleEvents?.length) {
    const v = [];
    for (const k of e.offlineRecoveryCapsuleEvents)
      if (M(k))
        try {
          v.push({
            event: k,
            payload: await po(k, r)
          });
        } catch (R) {
          v.push({
            event: k,
            payload: null,
            error: R.message
          });
        }
    const w = /* @__PURE__ */ new Map();
    for (const k of [...c.candidates, ...v])
      w.set(k.event.id, k);
    const h = [...w.values()].sort((k, R) => R.event.created_at - k.event.created_at), b = h.find((k) => k.payload !== null) ?? null;
    c = {
      ...c,
      candidates: h,
      best: b,
      quorumMet: c.quorumMet || b !== null
    };
  }
  if (!c.quorumMet)
    throw new Te("quorum-not-met");
  if (!c.best)
    throw new Te(c.candidates.length > 0 ? "no-valid-candidate" : "no-matching-event");
  const u = c.best.payload, y = ya(c.candidates), d = V(u.operational_private_key), p = u.operational_public_key, { generalRelays: f, dmRelays: g } = await Eo(p, [...e.discoveryRelayUrls, ...u.vault_relay_hints], e.timeoutMs);
  return {
    everydayPrivateKey: d,
    everydayPublicKey: p,
    recoveryPrivateKey: n,
    recoveryPublicKey: s,
    recoveryCapsuleKey: r,
    accountId: u.account_id,
    currentRecoveryEvent: c.best.event,
    currentRecoveryPayload: u,
    generalRelays: f,
    dmRelays: g,
    chainWarning: y.consistent ? void 0 : y.warning,
    everydayKeyDerived: p === i
  };
}
async function Eo(e, t, n) {
  const r = new K([...new Set(t)]);
  let o = [], i = [];
  try {
    const s = await r.queryQuorum({ kinds: [ct], authors: [e], limit: 5 }, n), a = rr(s.outcomes.flatMap((y) => y.events));
    a && (o = Zs(a));
    const c = await r.queryQuorum({ kinds: [vn], authors: [e], limit: 5 }, n), u = rr(c.outcomes.flatMap((y) => y.events));
    u && (i = ea(u));
  } finally {
    r.closeAll();
  }
  return { generalRelays: o, dmRelays: i };
}
async function _o(e) {
  if (!Xr(e))
    throw new ge("This does not look like a valid 12-word BitLogin recovery phrase.");
  const t = await Tn(e);
  try {
    const { recoveryPrivateKey: n, capsuleKey: r } = wn(t), o = gn(t);
    return {
      recoveryPrivateKey: n,
      recoveryPublicKey: _(n),
      capsuleKey: r,
      everydayPrivateKey: o,
      everydayPublicKey: _(o)
    };
  } finally {
    E(t);
  }
}
async function Po(e, t, n) {
  const r = new K(t, {
    authPrivateKey: e.recoveryPrivateKey
  });
  let o;
  try {
    o = await vo(r, e.recoveryPublicKey, e.capsuleKey, n);
  } finally {
    r.closeAll();
  }
  if (!o.quorumMet)
    throw new Te("quorum-not-met");
  if (o.best)
    throw new ge("This account's recovery capsule is still on the relays. Use normal recovery instead of a rebuild.");
  return o.candidates.length > 0 ? Math.max(...o.candidates.map((i) => i.event.created_at)) : null;
}
async function ma(e) {
  const t = await _o(e.phrase);
  try {
    await Po(t, e.vaultRelayUrls, e.timeoutMs);
    const n = new K([
      .../* @__PURE__ */ new Set([...e.discoveryRelayUrls, ...e.vaultRelayUrls])
    ]);
    try {
      const o = (await n.queryQuorum({
        kinds: [Nt, ct],
        authors: [t.everydayPublicKey],
        limit: 10
      }, e.timeoutMs)).outcomes.flatMap((i) => i.events).filter((i) => i.pubkey === t.everydayPublicKey && M(i));
      return {
        everydayPublicKey: t.everydayPublicKey,
        profileFound: o.some((i) => i.kind === Nt),
        relayListFound: o.some((i) => i.kind === ct)
      };
    } finally {
      n.closeAll();
    }
  } finally {
    E(t.recoveryPrivateKey, t.capsuleKey, t.everydayPrivateKey);
  }
}
async function ka(e) {
  const t = e.now ?? Math.floor(Date.now() / 1e3), n = await _o(e.phrase);
  let r = !1;
  try {
    const o = await Po(n, e.vaultRelayUrls, e.timeoutMs), i = {
      schema: Dt,
      account_id: I(Rr()),
      recovery_generation: 0,
      previous_recovery_event_id: null,
      operational_private_key: I(n.everydayPrivateKey),
      operational_public_key: n.everydayPublicKey,
      recovery_public_key: n.recoveryPublicKey,
      connection_vault_root: I(G(32)),
      vault_sudo_key: I(G(32)),
      created_at: o === null ? t : yt(o, t),
      vault_relay_hints: We(e.vaultRelayUrls),
      protocol: {
        capsule_encryption: je,
        recovery_derivation: Fe,
        ...Ge(!0)
      }
    }, s = await qn({
      recoveryPrivateKey: n.recoveryPrivateKey,
      capsuleKey: n.capsuleKey,
      payload: i
    }), a = new K(e.vaultRelayUrls, {
      authPrivateKey: n.recoveryPrivateKey
    });
    let c;
    try {
      c = await Ie(a, s, {
        dTag: pt,
        minAcks: e.minAcknowledgements,
        timeoutMs: e.timeoutMs
      });
    } finally {
      a.closeAll();
    }
    if (!c.success)
      throw new ge("Could not publish the rebuilt recovery capsule to enough relays. Nothing else was changed; please retry.");
    const { generalRelays: u, dmRelays: y } = await Eo(n.everydayPublicKey, [...e.discoveryRelayUrls, ...e.vaultRelayUrls], e.timeoutMs);
    return r = !0, {
      everydayPrivateKey: n.everydayPrivateKey,
      everydayPublicKey: n.everydayPublicKey,
      recoveryPrivateKey: n.recoveryPrivateKey,
      recoveryPublicKey: n.recoveryPublicKey,
      recoveryCapsuleKey: n.capsuleKey,
      accountId: i.account_id,
      currentRecoveryEvent: s,
      currentRecoveryPayload: i,
      generalRelays: u,
      dmRelays: y,
      everydayKeyDerived: !0
    };
  } finally {
    r || E(n.recoveryPrivateKey, n.capsuleKey, n.everydayPrivateKey);
  }
}
async function Ea(e) {
  const t = e.now ?? Math.floor(Date.now() / 1e3), n = Ut(e.newLoginName), { recovered: r } = e, o = r.currentRecoveryPayload.connection_vault_root !== void 0 ? {
    connection_vault_root: r.currentRecoveryPayload.connection_vault_root,
    vault_sudo_key: r.currentRecoveryPayload.vault_sudo_key
  } : {}, i = r.currentRecoveryPayload.connection_vault_root !== void 0 ? {
    connection_vault_root: r.currentRecoveryPayload.connection_vault_root
  } : {}, { locatorPrivateKey: s, capsuleKey: a } = await lt(e.newPassword, n);
  try {
    const c = _(s), u = new K(e.vaultRelayUrls, {
      authPrivateKey: s
    });
    let y;
    try {
      y = await dt(u, c, a, e.timeoutMs);
    } finally {
      u.closeAll();
    }
    if (!y.quorumMet)
      throw new ge("Couldn't verify the new login name and password aren't already registered. Please retry, or add more vault relays.");
    const d = y.best?.payload ?? null, p = d !== null && d.account_id === r.accountId && d.operational_public_key === r.everydayPublicKey && d.recovery_public_key === r.recoveryPublicKey && d.generation === 0 && d.recovery_capsule_event.id === r.currentRecoveryEvent.id;
    if (y.candidates.length > 0 && !p)
      throw new ge("Another account is already registered with that login name and password. Pick a different one.");
    const f = r.currentRecoveryPayload.recovery_generation + 1, g = {
      schema: Dt,
      account_id: r.accountId,
      recovery_generation: f,
      previous_recovery_event_id: r.currentRecoveryEvent.id,
      operational_private_key: I(r.everydayPrivateKey),
      operational_public_key: r.everydayPublicKey,
      recovery_public_key: r.recoveryPublicKey,
      ...o,
      created_at: yt(r.currentRecoveryEvent.created_at, t),
      vault_relay_hints: We(e.vaultRelayUrls),
      protocol: {
        capsule_encryption: je,
        recovery_derivation: Fe,
        ...Ge(r.everydayKeyDerived)
      }
    }, v = await qn({
      recoveryPrivateKey: r.recoveryPrivateKey,
      capsuleKey: r.recoveryCapsuleKey,
      payload: g
    }), w = new K(e.vaultRelayUrls, {
      authPrivateKey: r.recoveryPrivateKey
    });
    let h;
    try {
      h = await Ie(w, v, {
        dTag: pt,
        minAcks: e.minAcknowledgements,
        timeoutMs: e.timeoutMs
      });
    } finally {
      w.closeAll();
    }
    if (!h.success)
      throw new ge("Could not publish the refreshed recovery capsule to enough relays. No new credential was published; please retry.");
    r.currentRecoveryEvent = v, r.currentRecoveryPayload = g;
    const b = {
      schema: Ot,
      account_id: r.accountId,
      generation: 0,
      operational_private_key: I(r.everydayPrivateKey),
      operational_public_key: r.everydayPublicKey,
      recovery_public_key: r.recoveryPublicKey,
      recovery_capsule_event: v,
      ...i,
      // A retry may be repairing a credential that reached only one relay.
      // It must replace that partial event deterministically on every relay.
      created_at: y.best ? yt(y.best.event.created_at, t) : t,
      vault_relay_hints: We(e.vaultRelayUrls),
      protocol: {
        password_kdf: $n,
        capsule_encryption: je,
        recovery_derivation: Fe,
        ...Ge(r.everydayKeyDerived)
      }
    }, k = await Bn({
      locatorPrivateKey: s,
      capsuleKey: a,
      payload: b
    }), R = new K(e.vaultRelayUrls, {
      authPrivateKey: s
    });
    let B;
    try {
      B = await Ie(R, k, {
        dTag: He,
        minAcks: e.minAcknowledgements,
        timeoutMs: e.timeoutMs
      });
    } finally {
      R.closeAll();
    }
    if (!B.success)
      throw new ge("Could not publish the new credential capsule to enough relays. Please retry.");
    return e.store && await Js(e.store, r.everydayPublicKey, {
      generation: 0,
      recoveryGeneration: f
    }), {
      normalizedLoginName: n,
      locatorPublicKey: c,
      credentialEvent: k,
      refreshedRecoveryEvent: v,
      credentialPublish: B,
      recoveryPublish: h
    };
  } finally {
    E(s, a);
  }
}
async function _a(e) {
  const t = e.now ?? Math.floor(Date.now() / 1e3), n = Ut(e.loginName), r = await lt(e.oldPassword, n), o = _(r.locatorPrivateKey), i = new K(e.vaultRelayUrls, {
    authPrivateKey: r.locatorPrivateKey
  });
  let s;
  try {
    s = await dt(i, o, r.capsuleKey, e.timeoutMs);
  } finally {
    i.closeAll();
  }
  if (!s.quorumMet)
    throw new Te("quorum-not-met");
  if (!s.best)
    throw new Te(s.candidates.length > 0 ? "no-valid-candidate" : "no-matching-event");
  const a = s.best.payload, c = s.best.event, u = e.store ?? new ko(), y = await Dn(u, a.operational_public_key);
  if (a.generation < y.generation && !e.acknowledgeRollback)
    throw new io(y.generation, a.generation);
  const d = await lt(e.newPassword, n), p = _(d.locatorPrivateKey), f = new K(e.vaultRelayUrls, {
    authPrivateKey: d.locatorPrivateKey
  });
  let g;
  try {
    g = await dt(f, p, d.capsuleKey, e.timeoutMs);
  } finally {
    f.closeAll();
  }
  if (!g.quorumMet)
    throw new we("Couldn't verify the new password isn't already registered under this login name. Please retry, or add more vault relays.");
  if (g.candidates.length > 0)
    throw new oo("Another account is already registered with this login name and the new password you chose. Pick a different new password.");
  const v = a.generation + 1, w = {
    schema: Ot,
    account_id: a.account_id,
    generation: v,
    operational_private_key: a.operational_private_key,
    operational_public_key: a.operational_public_key,
    recovery_public_key: a.recovery_public_key,
    recovery_capsule_event: a.recovery_capsule_event,
    // Carry only the session root. A legacy credential may contain the sudo
    // key, but rotation deliberately scrubs it; personal-tier access remains
    // phrase-gated through the recovery capsule.
    ...a.connection_vault_root !== void 0 ? { connection_vault_root: a.connection_vault_root } : {},
    created_at: t,
    vault_relay_hints: We(e.vaultRelayUrls),
    protocol: {
      password_kdf: $n,
      capsule_encryption: je,
      recovery_derivation: Fe,
      ...Ge(go(a))
    }
  }, h = await Bn({
    locatorPrivateKey: d.locatorPrivateKey,
    capsuleKey: d.capsuleKey,
    payload: w
  }), b = new K(e.vaultRelayUrls, {
    authPrivateKey: d.locatorPrivateKey
  }), k = await Ie(b, h, {
    dTag: He,
    minAcks: e.minAcknowledgements,
    timeoutMs: e.timeoutMs
  });
  if (b.closeAll(), !k.success)
    throw new we("The new credential capsule did not reach the required relay acknowledgement and readback quorum. Your existing password still works; nothing was changed. Please retry.");
  const R = la({
    oldLocatorPrivateKey: r.locatorPrivateKey,
    createdAt: yt(c.created_at, t)
  }), B = Cr({
    privateKey: r.locatorPrivateKey,
    eventIdToDelete: c.id,
    deletedEventKind: z,
    createdAt: t
  }), N = new K(e.vaultRelayUrls, {
    authPrivateKey: r.locatorPrivateKey
  }), [L, T] = await Promise.all([
    N.publishAll(R, e.timeoutMs),
    N.publishAll(B, e.timeoutMs)
  ]);
  return N.closeAll(), await so(u, a.operational_public_key, {
    generation: v
  }), {
    normalizedLoginName: n,
    oldLocatorPublicKey: o,
    newLocatorPublicKey: p,
    newGeneration: v,
    recoveryPublicKey: a.recovery_public_key,
    recoveryCapsuleEvent: a.recovery_capsule_event,
    newCredentialEvent: h,
    tombstoneEvent: R,
    deletionRequestEvent: B,
    newCredentialPublish: k,
    tombstoneAcknowledgedCount: Se(L),
    deletionAcknowledgedCount: Se(T)
  };
}
const Pa = "bitlogin/connection-vault-root/v1", Ka = "bitlogin/connection-vault-signing/v1", Aa = "bitlogin/connection-record-encryption/v1", Ra = "bitlogin/connection-vault-personal/v1", cn = "bitlogin:connection:";
function Sa(e) {
  if (e.length !== 32)
    throw new Error("connection_vault_root must be exactly 32 bytes.");
  return Bt(Sr(Pa), e);
}
function Ze(e) {
  return bi(e, Ka).scalar;
}
function Ko(e) {
  const t = Ze(e);
  try {
    return _(t);
  } finally {
    E(t);
  }
}
function Na(e, t) {
  if (t.length !== 32)
    throw new Error("vault_sudo_key must be exactly 32 bytes.");
  if (e.length !== 32)
    throw new Error("connection_vault_root must be exactly 32 bytes.");
  return Bt(Sr(Ra), Je(e, t));
}
function Ao(e, t) {
  const n = $t(t);
  return Ye(e, Je(H(Aa), new Uint8Array([0]), n), 32);
}
function Ca() {
  return I(G(16));
}
function $t(e) {
  const t = V(e);
  if (t.length !== 16)
    throw new Error("connection_id must decode to exactly 16 bytes (§CV7).");
  return t;
}
function Ro(e) {
  return $t(e), `${cn}${e}`;
}
function So(e) {
  if (!e.startsWith(cn))
    return null;
  const t = e.slice(cn.length);
  try {
    return $t(t), t;
  } catch {
    return null;
  }
}
class be {
  privateKey;
  publicKeyHex;
  destroyed = !1;
  constructor(t) {
    this.privateKey = t, this.publicKeyHex = _(t);
  }
  assertAlive() {
    if (this.destroyed)
      throw new Error("This signer has been destroyed (session locked or logged out).");
  }
  getPublicKey() {
    return this.assertAlive(), this.publicKeyHex;
  }
  signEvent(t) {
    return this.assertAlive(), oe({
      pubkey: this.publicKeyHex,
      created_at: t.created_at ?? Math.floor(Date.now() / 1e3),
      kind: t.kind,
      tags: t.tags ?? [],
      content: t.content
    }, this.privateKey);
  }
  nip44Encrypt(t, n) {
    return this.assertAlive(), sn(Tt(this.privateKey, t), n);
  }
  nip44Decrypt(t, n) {
    return this.assertAlive(), Nn(Tt(this.privateKey, t), n);
  }
  /** Legacy relative to nip44Encrypt above, but still what a real NIP-07 extension exposes as
   * window.nostr.nip04.encrypt -- implemented for drop-in parity. */
  nip04Encrypt(t, n) {
    return this.assertAlive(), Ws(this.privateKey, t, n);
  }
  nip04Decrypt(t, n) {
    return this.assertAlive(), zs(this.privateKey, t, n);
  }
  /** Best-practical secret wipe (§11.10, §21.4): overwrites the private key buffer in place. */
  destroy() {
    E(this.privateKey), this.destroyed = !0;
  }
}
const No = "bitlogin.connection.v1", Co = "bitlogin.connection.nwc.v1", or = 120, xa = /* @__PURE__ */ new Set(["active", "suspended", "deleted"]), Ta = /* @__PURE__ */ new Set(["connectable", "personal"]);
class Ve extends Error {
  constructor(t) {
    super(t), this.name = "ConnectionRecordError";
  }
}
function xo(e, t) {
  return H(`bitlogin|connection-record|v1|${e}|30078|${t}`);
}
function To(e) {
  const t = e, n = (i) => {
    throw new Ve(i);
  };
  (!t || typeof t != "object") && n("Connection record must be an object."), t.schema !== No && n("Unsupported connection record schema (§CV8.3)."), typeof t.connection_id != "string" && n("connection_id must be a string (§CV7)."), (typeof t.connection_type != "string" || t.connection_type.length === 0) && n("connection_type must be a non-empty string (§CV8.3)."), Ta.has(t.tier) || n("tier must be connectable or personal."), xa.has(t.state) || n("state must be active, suspended, or deleted (§CV8.3)."), (typeof t.label != "string" || t.label.length > or) && n(`label must be a string of at most ${or} characters.`), (!Number.isInteger(t.created_at) || !Number.isInteger(t.updated_at)) && n("created_at and updated_at must be integers (§CV8.3).");
  const r = t.credential;
  (!r || typeof r != "object" || typeof r.schema != "string") && n("credential must be an object naming its profile schema (§CV8.3).");
  const o = t.application_binding;
  (!o || typeof o != "object" || o.origin !== null && typeof o.origin != "string" || o.app_pubkey !== null && typeof o.app_pubkey != "string") && n("application_binding must carry origin and app_pubkey (string or null)."), t.notes !== null && typeof t.notes != "string" && n("notes must be a string or null.");
}
async function zt(e) {
  To(e.record);
  const t = Ze(e.vaultPrk), n = _(t), r = Ro(e.record.connection_id), o = Ao(e.recordPrk, e.record.connection_id), i = await On(e.record, o, xo(n, r));
  return oe({
    pubkey: n,
    created_at: yt(e.previousCreatedAt, e.now),
    kind: z,
    tags: [["d", r]],
    content: JSON.stringify(i)
  }, t);
}
async function Ia(e, t, n) {
  if (!M(e))
    throw new Ve("Connection record event has an invalid id or signature.");
  const r = _(Ze(t));
  if (e.pubkey !== r)
    throw new Ve("Connection record event is not signed by this vault's identity.");
  const o = Xe(e, "d") ?? "", i = So(o);
  if (i === null)
    throw new Ve("Connection record event has a malformed d tag.");
  const s = JSON.parse(e.content), a = xo(e.pubkey, o), c = [
    { prk: t, tier: "connectable" },
    ...n ? [{ prk: n, tier: "personal" }] : []
  ];
  for (const u of c) {
    let y;
    try {
      y = await Un(s, Ao(u.prk, i), a);
    } catch {
      continue;
    }
    if (To(y), y.connection_id !== i)
      throw new Ve("Connection record id does not match its d tag.");
    if (y.tier !== u.tier)
      throw new Ve("Connection record tier does not match the key that decrypted it.");
    return { record: y, tier: u.tier, event: e };
  }
  return null;
}
function Ma(e, t) {
  return {
    ...e,
    state: "deleted",
    credential: { schema: e.credential.schema },
    notes: null,
    updated_at: t
  };
}
const Lt = /^[0-9a-f]{64}$/u;
class de extends Error {
  constructor(t) {
    super(t), this.name = "NwcParseError";
  }
}
function ir(e) {
  const t = e.trim();
  if (!/^nostr\+walletconnect:\/\//iu.test(t))
    throw new de("Not an NWC URI: it must start with nostr+walletconnect://");
  let n;
  try {
    n = new URL(t.replace(/^nostr\+walletconnect:\/\//iu, "http://"));
  } catch {
    throw new de("The NWC URI is malformed.");
  }
  const r = n.hostname.toLowerCase();
  if (!Lt.test(r))
    throw new de("The NWC URI's wallet service pubkey is not 64-char hex.");
  const o = [], i = [];
  let s = null, a = null;
  for (const [c, u] of n.searchParams.entries())
    if (c === "relay") {
      if (!Qe(u))
        throw new de("An NWC relay must use secure WebSockets, except for an explicit loopback development endpoint.");
      o.push(u);
    } else if (c === "secret") {
      const y = u.toLowerCase();
      if (!Lt.test(y))
        throw new de("The NWC URI's secret is not a 64-char hex client key.");
      s = y;
    } else c === "lud16" ? a = u : i.push([c, u]);
  if (o.length === 0)
    throw new de("The NWC URI names no relay.");
  if (s === null)
    throw new de("The NWC URI carries no secret.");
  return {
    schema: Co,
    wallet_pubkey: r,
    relays: o,
    secret: s,
    lud16: a,
    extra_params: i
  };
}
function La(e) {
  Io(e);
  const t = new URLSearchParams();
  for (const n of e.relays)
    t.append("relay", n);
  t.append("secret", e.secret), e.lud16 !== null && t.append("lud16", e.lud16);
  for (const [n, r] of e.extra_params)
    t.append(n, r);
  return `nostr+walletconnect://${e.wallet_pubkey}?${t.toString()}`;
}
function Da(e, t) {
  return e.wallet_pubkey === t.wallet_pubkey && e.secret === t.secret;
}
function Io(e) {
  const t = e, n = (r) => {
    throw new de(r);
  };
  (!t || typeof t != "object") && n("NWC credential must be an object."), t.schema !== Co && n("NWC credential has the wrong schema."), (typeof t.wallet_pubkey != "string" || !Lt.test(t.wallet_pubkey)) && n("NWC credential wallet_pubkey must be 64-char lowercase hex."), (!Array.isArray(t.relays) || t.relays.length === 0 || t.relays.some((r) => typeof r != "string")) && n("NWC credential must name at least one relay."), t.relays.some((r) => !Qe(r)) && n("NWC relays must use secure WebSockets, except for explicit loopback development endpoints."), (typeof t.secret != "string" || !Lt.test(t.secret)) && n("NWC credential secret must be 64-char lowercase hex."), t.lud16 !== null && typeof t.lud16 != "string" && n("NWC credential lud16 must be a string or null."), (!Array.isArray(t.extra_params) || t.extra_params.some((r) => !Array.isArray(r) || r.length !== 2 || typeof r[0] != "string" || typeof r[1] != "string")) && n("NWC credential extra_params must be [key, value] string pairs.");
}
const Oa = "bitlogin:vault-hwm:v2:", Ua = "bitlogin/vault-hwm-index/v2", Mo = "bitlogin/vault-hwm-encryption/v2", Va = /^[0-9a-f]{64}$/u;
class me extends Error {
  constructor() {
    super("The local Connection Vault rollback marker is invalid or has been tampered with."), this.name = "RecordHighWaterMarkError";
  }
}
function jn(e) {
  if (!e || typeof e != "object")
    return !1;
  const t = e;
  return Number.isInteger(t.createdAt) && (t.createdAt ?? -1) >= 0 && typeof t.eventId == "string" && Va.test(t.eventId);
}
function Lo(e, t) {
  $t(t);
  const n = Ye(e, Ua, 32), r = H(t);
  try {
    return `${Oa}${I(mn(kn, n, r))}`;
  } finally {
    E(n, r);
  }
}
function Ba(e, t) {
  return `bitlogin:vault-hwm:${Ko(e)}:${t}`;
}
async function qa(e, t, n) {
  const r = Ye(e, Mo, 32), o = H(JSON.stringify(n)), i = H(t);
  try {
    const s = await Fr(r, o, i), a = {
      v: 2,
      nonce: I(s.nonce),
      ciphertext: I(s.ciphertext)
    };
    return JSON.stringify(a);
  } finally {
    E(r, o, i);
  }
}
async function $a(e, t, n) {
  const r = Ye(e, Mo, 32), o = H(t);
  let i;
  try {
    const s = JSON.parse(n);
    if (s.v !== 2 || typeof s.nonce != "string" || typeof s.ciphertext != "string")
      throw new me();
    i = await Wr(r, V(s.nonce), V(s.ciphertext), o);
    const a = JSON.parse(Vt(i));
    if (!jn(a))
      throw new me();
    return a;
  } catch (s) {
    throw s instanceof me ? s : new me();
  } finally {
    E(r, o), i && E(i);
  }
}
async function Do(e, t, n, r) {
  const o = Lo(t, n);
  await e.set(o, await qa(t, o, r));
}
async function Oo(e, t, n) {
  const r = Lo(t, n), o = await e.get(r);
  if (o !== void 0)
    return $a(t, r, o);
  const i = Ba(t, n), s = await e.get(i);
  if (s === void 0)
    return null;
  try {
    const a = JSON.parse(s);
    if (!jn(a))
      throw new me();
    return await Do(e, t, n, a), await e.delete(i), a;
  } catch (a) {
    throw a instanceof me ? a : new me();
  }
}
async function Uo(e, t, n, r) {
  if (!jn(r))
    throw new me();
  const o = await Oo(e, t, n);
  o && tn({ created_at: r.createdAt, id: r.eventId }, { created_at: o.createdAt, id: o.eventId }) <= 0 || await Do(e, t, n, r);
}
async function ja(e) {
  const t = Ze(e.vaultPrk), n = new K(e.relayUrls, { authPrivateKey: t });
  let r;
  try {
    r = await Ie(n, e.event, {
      dTag: Ro(e.connectionId),
      minAcks: e.minAcknowledgements,
      // The readback bar follows the ack bar: a caller publishing to fewer
      // relays (a targeted repair, a test) has already lowered its quorum.
      minReadbacks: e.minAcknowledgements,
      timeoutMs: e.timeoutMs
    });
  } finally {
    n.closeAll(), E(t);
  }
  return r.success && await Uo(e.store, e.vaultPrk, e.connectionId, {
    createdAt: e.event.created_at,
    eventId: e.event.id
  }), r;
}
const sr = 500;
async function Fa(e) {
  const t = Ze(e.vaultPrk), n = _(t), r = new K(e.relayUrls, { authPrivateKey: t });
  let o;
  try {
    o = await r.queryQuorum({ kinds: [z], authors: [n], limit: sr }, e.timeoutMs);
  } finally {
    r.closeAll(), E(t);
  }
  const i = o.outcomes.some((u) => u.events.length >= sr), s = /* @__PURE__ */ new Map();
  for (const u of o.outcomes.flatMap((y) => y.events)) {
    if (!M(u) || u.pubkey !== n)
      continue;
    const y = So(Xe(u, "d") ?? "");
    if (y === null)
      continue;
    const d = s.get(y);
    (!d || tn(u, d) > 0) && s.set(y, u);
  }
  const a = /* @__PURE__ */ new Map(), c = [];
  for (const [u, y] of s) {
    const d = await Oo(e.store, e.vaultPrk, u);
    if (d !== null && tn(y, {
      created_at: d.createdAt,
      id: d.eventId
    }) < 0) {
      c.push(u);
      continue;
    }
    a.set(u, y), await Uo(e.store, e.vaultPrk, u, {
      createdAt: y.created_at,
      eventId: y.id
    });
  }
  return {
    events: a,
    rollbackWarnings: c,
    quorumMet: o.quorumMet,
    respondedCount: o.respondedCount,
    truncated: i
  };
}
class Wa {
  vaultPrk;
  personalPrk = null;
  destroyed = !1;
  connectionVaultRoot;
  vaultPublicKey;
  constructor(t) {
    this.connectionVaultRoot = t.slice(), this.vaultPrk = Sa(this.connectionVaultRoot), this.vaultPublicKey = Ko(this.vaultPrk);
  }
  get sudoActive() {
    return this.personalPrk !== null;
  }
  /** Opens a sudo window. Consumes (wipes) the caller's sudo key copy. */
  enableSudo(t) {
    this.endSudo(), this.personalPrk = Na(this.connectionVaultRoot, t), E(t);
  }
  /** Closes the sudo window and wipes the personal-tier key material. */
  endSudo() {
    this.personalPrk && E(this.personalPrk), this.personalPrk = null;
  }
  /**
   * Wipes everything this session holds, permanently.
   *
   * The ROOT is wiped too, not just the derived prk: the root regenerates the
   * prk and (with a sudo key) the personal prk, so leaving it live made
   * "wipes everything" false. And the session is marked destroyed rather than
   * merely zeroed, because a zeroed prk is not inert -- deriveRecordKey and
   * deriveVaultSigningKey over 32 zero bytes are deterministic, WORLD-
   * COMPUTABLE values. A stale reference calling createConnection() after
   * teardown would otherwise seal a wallet secret under a key any observer
   * can derive, sign it with a publicly known identity, and report success.
   * Failing loudly is the only safe behaviour.
   */
  destroy() {
    this.endSudo(), E(this.vaultPrk, this.connectionVaultRoot), this.destroyed = !0;
  }
  prkForTier(t) {
    if (this.destroyed)
      throw new Error("This vault session was destroyed; create a new one from the account's root.");
    if (t === "connectable")
      return this.vaultPrk;
    if (!this.personalPrk)
      throw new Error("Personal-tier records require an open sudo window (enableSudo).");
    return this.personalPrk;
  }
  /** Builds a fresh record + its signed event. Purely local; publish separately. */
  async createConnection(t) {
    const n = t.now ?? Math.floor(Date.now() / 1e3), r = {
      schema: No,
      connection_id: Ca(),
      connection_type: t.connection_type,
      tier: t.tier,
      state: "active",
      label: t.label,
      created_at: n,
      updated_at: n,
      credential: t.credential,
      application_binding: t.application_binding ?? {
        origin: null,
        app_pubkey: null
      },
      notes: t.notes ?? null
    }, o = await zt({
      vaultPrk: this.vaultPrk,
      recordPrk: this.prkForTier(t.tier),
      record: r,
      now: n
    });
    return { record: r, event: o };
  }
  /** Replaces a record's content. The tier is immutable — moving a secret
   *  between tiers is a delete-and-recreate, never a silent re-encryption. */
  async updateConnection(t, n, r) {
    const o = r ?? Math.floor(Date.now() / 1e3), i = {
      ...t.record,
      ...n,
      tier: t.record.tier,
      connection_id: t.record.connection_id,
      created_at: t.record.created_at,
      updated_at: o
    }, s = await zt({
      vaultPrk: this.vaultPrk,
      recordPrk: this.prkForTier(i.tier),
      record: i,
      previousCreatedAt: t.event.created_at,
      now: o
    });
    return { record: i, event: s };
  }
  /** §CV11 step 2: the encrypted tombstone replacement. */
  async deleteConnection(t, n) {
    const r = n ?? Math.floor(Date.now() / 1e3), o = Ma(t.record, r), i = await zt({
      vaultPrk: this.vaultPrk,
      recordPrk: this.prkForTier(o.tier),
      record: o,
      previousCreatedAt: t.event.created_at,
      now: r
    });
    return { record: o, event: i };
  }
  /** Trial-decrypts one event; personal-tier records resolve only inside a sudo window. */
  decryptEvent(t) {
    return this.destroyed ? Promise.reject(new Error("This vault session was destroyed; create a new one from the account's root.")) : Ia(t, this.vaultPrk, this.personalPrk ?? void 0);
  }
  /** §CV11 step 3: a NIP-09 deletion request for a replaced record event,
   *  signed by the vault identity. Best-effort by contract — the encrypted
   *  tombstone is the durable part of a deletion, this is the courtesy ask. */
  buildDeletionRequest(t, n) {
    if (this.destroyed)
      throw new Error("This vault session was destroyed; create a new one from the account's root.");
    return Cr({
      privateKey: Ze(this.vaultPrk),
      eventIdToDelete: t,
      deletedEventKind: z,
      createdAt: n ?? Math.floor(Date.now() / 1e3)
    });
  }
  publish(t) {
    return ja({ vaultPrk: this.vaultPrk, ...t });
  }
  fetchEvents(t) {
    return Fa({ vaultPrk: this.vaultPrk, ...t });
  }
  /**
   * Fetches and decrypts everything decryptable right now. Outside a sudo
   * window the personal tier is simply absent from the result — invisible,
   * not erroring, exactly like the app-facing API contract.
   */
  async listConnections(t) {
    const n = await this.fetchEvents(t);
    if (!n.quorumMet && !t.acknowledgeIncompleteQuorum)
      throw new Error("Not enough vault relays answered to list your connections reliably. Check your connection and retry.");
    const r = [], o = [];
    for (const i of n.events.values())
      try {
        const s = await this.decryptEvent(i);
        s && r.push(s);
      } catch {
        o.push(i.id);
      }
    return r.sort((i, s) => s.record.updated_at - i.record.updated_at), {
      connections: r,
      rollbackWarnings: n.rollbackWarnings,
      unreadable: o,
      truncated: n.truncated,
      quorumMet: n.quorumMet
    };
  }
}
const Ga = "bitlogin", pe = "kv", se = "device-keys", za = 2;
function Ha() {
  return new Promise((e, t) => {
    const n = indexedDB.open(Ga, za);
    n.onupgradeneeded = () => {
      const r = n.result;
      r.objectStoreNames.contains(pe) || r.createObjectStore(pe), r.objectStoreNames.contains(se) || r.createObjectStore(se);
    }, n.onsuccess = () => e(n.result), n.onerror = () => t(n.error);
  });
}
class Ja {
  dbPromise = null;
  db() {
    return this.dbPromise || (this.dbPromise = Ha()), this.dbPromise;
  }
  async get(t) {
    const n = await this.db();
    return new Promise((r, o) => {
      const s = n.transaction(pe, "readonly").objectStore(pe).get(t);
      s.onsuccess = () => r(s.result), s.onerror = () => o(s.error);
    });
  }
  async set(t, n) {
    const r = await this.db();
    return new Promise((o, i) => {
      const s = r.transaction(pe, "readwrite");
      s.objectStore(pe).put(n, t), s.oncomplete = () => o(), s.onerror = () => i(s.error);
    });
  }
  async delete(t) {
    const n = await this.db();
    return new Promise((r, o) => {
      const i = n.transaction(pe, "readwrite");
      i.objectStore(pe).delete(t), i.oncomplete = () => r(), i.onerror = () => o(i.error);
    });
  }
  /**
   * Returns a non-extractable AES-GCM key kept by the browser's IndexedDB
   * implementation. The key is deliberately separate from the string-only KV
   * API so callers cannot accidentally serialize it as application data.
   */
  async getOrCreateDeviceKey(t) {
    const n = await this.db(), r = await new Promise((i, s) => {
      const a = n.transaction(se, "readonly").objectStore(se).get(t);
      a.onsuccess = () => i(a.result), a.onerror = () => s(a.error);
    });
    if (r) return r;
    const o = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      !1,
      ["encrypt", "decrypt"]
    );
    try {
      return await new Promise((i, s) => {
        const a = n.transaction(se, "readwrite");
        a.objectStore(se).add(o, t), a.oncomplete = () => i(), a.onerror = () => s(a.error);
      }), o;
    } catch {
      const i = await new Promise((s, a) => {
        const c = n.transaction(se, "readonly").objectStore(se).get(t);
        c.onsuccess = () => s(c.result), c.onerror = () => a(c.error);
      });
      if (i) return i;
      throw new Error("Unable to create the browser-bound session key.");
    }
  }
  async deleteDeviceKey(t) {
    const n = await this.db();
    return new Promise((r, o) => {
      const i = n.transaction(se, "readwrite");
      i.objectStore(se).delete(t), i.oncomplete = () => r(), i.onerror = () => o(i.error);
    });
  }
}
const ke = "bitlogin:session:v1", Fn = "bitlogin:session-device-key:v1";
function Vo(e) {
  return !!(e && typeof e == "object" && e.v === 3 && typeof e.iv == "string" && typeof e.ciphertext == "string");
}
async function Bo(e, t) {
  if (e.length !== 32) throw new Error("Not a lock key.");
  return crypto.subtle.importKey("raw", it(e), "AES-GCM", !1, [t]);
}
async function qo(e) {
  try {
    const t = await e.get(ke);
    if (!t) return "none";
    const n = JSON.parse(t);
    return Vo(n) ? "locked" : $o(n) ? "open" : "none";
  } catch {
    return "none";
  }
}
function gt(e) {
  let t = "";
  for (const n of e) t += String.fromCharCode(n);
  return btoa(t);
}
function bt(e) {
  const t = atob(e);
  return Uint8Array.from(t, (n) => n.charCodeAt(0));
}
function it(e) {
  const t = new Uint8Array(e.byteLength);
  return t.set(e), t.buffer;
}
function $o(e) {
  return !!(e && typeof e == "object" && e.v === 2 && typeof e.iv == "string" && typeof e.ciphertext == "string");
}
async function Ya(e, t, n) {
  const r = {
    everydayPrivateKeyHex: Array.from(t.everydayPrivateKey, (o) => o.toString(16).padStart(2, "0")).join(""),
    accountId: t.accountId,
    recoveryPublicKey: t.recoveryPublicKey,
    activeCredentialEvent: t.activeCredentialEvent,
    activeRecoveryEvent: t.activeRecoveryEvent,
    ...t.connectionVaultRoot ? {
      connectionVaultRootHex: Array.from(
        t.connectionVaultRoot,
        (o) => o.toString(16).padStart(2, "0")
      ).join("")
    } : {},
    ...t.vaultEnabled !== void 0 ? { vaultEnabled: t.vaultEnabled } : {},
    ...t.everydayKeyDerived !== void 0 ? { everydayKeyDerived: t.everydayKeyDerived } : {}
  };
  try {
    if (typeof e.getOrCreateDeviceKey != "function") {
      await e.delete(ke);
      return;
    }
    const o = await e.getOrCreateDeviceKey(Fn), i = crypto.getRandomValues(new Uint8Array(12)), s = new TextEncoder().encode(JSON.stringify(r)), a = await crypto.subtle.encrypt({ name: "AES-GCM", iv: i }, o, s), c = {
      v: 2,
      iv: gt(i),
      ciphertext: gt(new Uint8Array(a))
    };
    if (!n) {
      await e.set(ke, JSON.stringify(c));
      return;
    }
    const u = crypto.getRandomValues(new Uint8Array(12)), y = await crypto.subtle.encrypt({ name: "AES-GCM", iv: u }, await Bo(n, "encrypt"), new TextEncoder().encode(JSON.stringify(c))), d = { v: 3, iv: gt(u), ciphertext: gt(new Uint8Array(y)) };
    await e.set(ke, JSON.stringify(d));
  } catch {
    n && await e.delete(ke).catch(() => {
    });
  }
}
async function Xa(e, t) {
  let n;
  try {
    n = await e.get(ke);
  } catch {
    return null;
  }
  if (!n) return null;
  try {
    let r = JSON.parse(n);
    if (Vo(r)) {
      if (!t) return null;
      const a = await crypto.subtle.decrypt({ name: "AES-GCM", iv: it(bt(r.iv)) }, await Bo(t, "decrypt"), it(bt(r.ciphertext)));
      r = JSON.parse(new TextDecoder().decode(a));
    }
    if (!$o(r) || typeof e.getOrCreateDeviceKey != "function")
      return await e.delete(ke), null;
    const o = await e.getOrCreateDeviceKey(Fn), i = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: it(bt(r.iv)) },
      o,
      it(bt(r.ciphertext))
    ), s = JSON.parse(new TextDecoder().decode(i));
    return typeof s.everydayPrivateKeyHex != "string" || typeof s.accountId != "string" || typeof s.recoveryPublicKey != "string" || !s.activeCredentialEvent || !s.activeRecoveryEvent ? null : {
      everydayPrivateKey: Uint8Array.from(
        s.everydayPrivateKeyHex.match(/.{1,2}/g) || [],
        (a) => Number.parseInt(a, 16)
      ),
      accountId: s.accountId,
      recoveryPublicKey: s.recoveryPublicKey,
      activeCredentialEvent: s.activeCredentialEvent,
      activeRecoveryEvent: s.activeRecoveryEvent,
      ...typeof s.connectionVaultRootHex == "string" ? {
        connectionVaultRoot: Uint8Array.from(
          s.connectionVaultRootHex.match(/.{1,2}/g) || [],
          (a) => Number.parseInt(a, 16)
        )
      } : {},
      ...typeof s.vaultEnabled == "boolean" ? { vaultEnabled: s.vaultEnabled } : {},
      ...typeof s.everydayKeyDerived == "boolean" ? { everydayKeyDerived: s.everydayKeyDerived } : {}
    };
  } catch {
    return null;
  }
}
async function ar(e) {
  try {
    await e.delete(ke), typeof e.deleteDeviceKey == "function" && await e.deleteDeviceKey(Fn);
  } catch {
  }
}
const Wn = "bitlogin:lock:v1", Qa = "bitlogin/lock/device/v1", Za = H("bitlogin:lock:device-wrap:v1"), ue = {
  pinMin: 6,
  pinMax: 64,
  /** Wrong tries, with the PIN or the device, before the record is removed. */
  tries: 5,
  /** Unused for this long, an unlocked session locks itself. In seconds. */
  idleSec: 900
}, qe = (e) => {
  const t = new Uint8Array(e.byteLength);
  return t.set(e), t.buffer;
};
function jo(e) {
  if (typeof e != "string") return null;
  const t = e.normalize("NFKC"), n = [...t].length;
  return n >= ue.pinMin && n <= ue.pinMax ? H(t) : null;
}
async function Fo(e, t) {
  const n = G(12), r = await crypto.subtle.importKey("raw", qe(e), "AES-GCM", !1, ["encrypt"]), o = await crypto.subtle.encrypt({ name: "AES-GCM", iv: qe(n) }, r, qe(t));
  return { iv: I(n), wrapped: I(new Uint8Array(o)) };
}
async function Wo(e, t) {
  try {
    const n = await crypto.subtle.importKey("raw", qe(e), "AES-GCM", !1, ["decrypt"]), r = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: qe(V(t.iv)) }, n, qe(V(t.wrapped))));
    return r.length === 32 ? r : null;
  } catch {
    return null;
  }
}
const Go = (e) => Ye(Bt(Za, e), Qa, 32), cr = (e) => !!e && typeof e == "object" && typeof e.iv == "string" && typeof e.wrapped == "string";
async function Pe(e) {
  let t;
  try {
    t = await e.get(Wn);
  } catch {
    return null;
  }
  if (!t) return null;
  try {
    const n = JSON.parse(t);
    return n.v !== 1 || typeof n.tries != "number" || !Number.isInteger(n.tries) || n.tries < 0 || !cr(n.pin) || typeof n.pin.salt != "string" || n.device !== void 0 && (!cr(n.device) || typeof n.device.credentialId != "string") ? null : { v: 1, tries: n.tries, pin: n.pin, ...n.device ? { device: n.device } : {} };
  } catch {
    return null;
  }
}
const ft = (e, t) => e.set(Wn, JSON.stringify(t));
async function st(e) {
  try {
    await e.delete(Wn);
  } catch {
  }
}
async function ec(e, t, n) {
  const r = jo(t);
  if (!r) throw new Error(`A PIN is ${ue.pinMin} to ${ue.pinMax} characters.`);
  const o = n ? n.slice() : G(32), i = G(16), s = await Kr(r, i);
  try {
    const a = n ? await Pe(e) : null;
    await ft(e, { v: 1, tries: 0, pin: { salt: I(i), ...await Fo(s, o) }, ...a?.device ? { device: a.device } : {} });
  } finally {
    s.fill(0), r.fill(0);
  }
  return o;
}
async function tc(e, t, n, r) {
  const o = await Pe(e);
  if (!o) throw new Error("The lock is not on.");
  if (r.length !== 32 || !/^[A-Za-z0-9_-]{8,1400}$/u.test(n)) throw new Error("That is not a device unlock.");
  const i = Go(r);
  try {
    await ft(e, { ...o, device: { credentialId: n, ...await Fo(i, t) } });
  } finally {
    i.fill(0);
  }
}
async function nc(e) {
  const t = await Pe(e);
  t?.device && await ft(e, { v: 1, tries: t.tries, pin: t.pin });
}
async function zo(e, t) {
  const n = await Pe(e);
  if (!n) return { ok: !1, left: 0, removed: !0 };
  const r = n.tries + 1;
  await ft(e, { ...n, tries: r });
  const o = await t(n);
  return o ? (await ft(e, { ...n, tries: 0 }), { ok: !0, lockKey: o }) : r >= ue.tries ? (await st(e), { ok: !1, left: 0, removed: !0 }) : { ok: !1, left: ue.tries - r, removed: !1 };
}
function rc(e, t) {
  return zo(e, async (n) => {
    const r = jo(t);
    if (!r) return null;
    const o = await Kr(r, V(n.pin.salt));
    try {
      return await Wo(o, n.pin);
    } finally {
      o.fill(0), r.fill(0);
    }
  });
}
function oc(e, t) {
  return zo(e, async (n) => {
    if (!n.device || t.length !== 32) return null;
    const r = Go(t);
    try {
      return await Wo(r, n.device);
    } finally {
      r.fill(0);
    }
  });
}
const ic = 27300, ze = {
  /** The longest address a picture may have. */
  pictureChars: 300,
  /** The most that is said about someone, in their own words. */
  aboutChars: 280,
  /** How long a pass made here lasts, in seconds. NSWP's verifier allows twelve hours; this gives four. */
  passSec: 4 * 3600,
  /** A profile's content is not read past this many characters. */
  contentChars: 2e4
};
function sc(e) {
  if (typeof e != "string" || e.length > ze.pictureChars) return "";
  try {
    const t = new URL(e);
    return t.protocol !== "https:" || t.username || t.password || !t.hostname.includes(".") ? "" : t.href.length <= ze.pictureChars ? t.href : "";
  } catch {
    return "";
  }
}
const ac = (e) => e <= 31 || e >= 127 && e <= 159 || e >= 8203 && e <= 8207 || e >= 8232 && e <= 8239 || e >= 8288 && e <= 8303 || e === 65279;
function cc(e) {
  if (typeof e != "string") return "";
  let t = "";
  for (const n of e.slice(0, ze.aboutChars * 8).normalize("NFC")) t += ac(n.codePointAt(0)) ? " " : n;
  return [...t.replace(/\s+/gu, " ").trim()].slice(0, ze.aboutChars).join("").trim();
}
function Me(e) {
  if (!e || typeof e != "object" || Array.isArray(e)) return null;
  const t = e, n = Nr(t.name), r = sc(t.picture), o = cc(t.about);
  return !n && !r && !o ? null : { ...n ? { name: n } : {}, ...r ? { picture: r } : {}, ...o ? { about: o } : {} };
}
function lc(e, t) {
  if (!M(e) || e.kind !== 0 || e.pubkey !== t || e.content.length > ze.contentChars) return null;
  let n;
  try {
    n = JSON.parse(e.content);
  } catch {
    return null;
  }
  if (!n || typeof n != "object" || Array.isArray(n)) return null;
  const r = n;
  return Me({ name: Nr(r.name) || r.display_name, picture: r.picture, about: r.about });
}
function uc(e, t) {
  let n = null;
  for (const r of e)
    !M(r) || r.kind !== 0 || r.pubkey !== t || n && r.created_at <= n.at || (n = { at: r.created_at, profile: lc(r, t) });
  return n?.profile ?? null;
}
const yc = /^[0-9a-f]{64}$/u;
function dc(e) {
  const t = _n(e.site);
  if (!t || typeof e.session != "string" || !yc.test(e.session) || e.session === e.identity) return null;
  const n = Math.floor(e.nowSeconds), r = Me(e.profile) ?? {}, o = [
    ["nswp:session", e.session],
    ["nswp:origin", t],
    ["expiration", String(n + ze.passSec)]
  ];
  return r.name && o.push(["name", r.name]), r.picture && o.push(["picture", r.picture]), r.about && o.push(["about", r.about]), { kind: ic, created_at: n, tags: o, content: "" };
}
const Kt = 30078, At = "bitlogin:taken-back:v1", Rt = 10002, Ke = {
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
}, ln = { allBefore: 0, sites: [] }, lr = (e) => typeof e == "number" && Number.isFinite(e) && e > 0 ? Math.floor(e) : 0;
function Ho(e) {
  if (!e || typeof e != "object" || Array.isArray(e)) return null;
  const t = e;
  if (t.v !== 1 || !Array.isArray(t.sites)) return null;
  const n = /* @__PURE__ */ new Map();
  for (const r of t.sites.slice(0, Ke.sites * 2)) {
    if (!r || typeof r != "object") continue;
    const o = r, i = _n(o.site), s = lr(o.before);
    !i || i !== o.site || !s || n.set(i, Math.max(n.get(i) ?? 0, s));
  }
  return { allBefore: lr(t.all_before), sites: [...n].map(([r, o]) => ({ site: r, before: o })) };
}
const ur = (e) => JSON.stringify({ v: 1, all_before: e.allBefore, sites: e.sites });
function un(e, t, n) {
  const r = Math.max(e.allBefore, t.allBefore), o = /* @__PURE__ */ new Map();
  for (const { site: s, before: a } of [...e.sites, ...t.sites]) o.set(s, Math.max(o.get(s) ?? 0, a));
  const i = [...o].map(([s, a]) => ({ site: s, before: a })).filter((s) => s.before > r && s.before + Ke.entrySec > n).sort((s, a) => a.before - s.before).slice(0, Ke.sites);
  return { allBefore: r, sites: i };
}
function fc(e, t, n) {
  const r = Math.floor(n);
  if ("all" in t) return un(e, { allBefore: r, sites: [] }, r);
  const o = _n(t.site);
  return o ? un(e, { allBefore: 0, sites: [{ site: o, before: r }] }, r) : e;
}
function pc(e, t, n) {
  return e.allBefore >= n ? !0 : e.sites.some((r) => r.site === t && r.before >= n);
}
function yr(e, t, n) {
  let r = null;
  for (const o of e)
    !M(o) || o.kind !== Kt || o.pubkey !== t || o.tags.some((i) => i[0] === "d" && i[1] === At) && (o.created_at > n + Ke.skewSec || (!r || o.created_at > r.created_at) && (r = o));
  return r;
}
function hc(e) {
  const t = e.toLowerCase().replace(/\.$/u, "");
  if (!t.includes(".") || t.startsWith("[") || t.includes(":") || /^[0-9.]+$/u.test(t) || /^0x/u.test(t)) return !1;
  const n = t.split(".");
  return !n.every((r) => /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/u.test(r)) || /^[0-9]+$/u.test(n[n.length - 1]) ? !1 : !["localhost", "local", "internal", "lan", "home", "intranet", "private", "corp", "test", "invalid", "onion"].includes(n[n.length - 1]);
}
function ye(e, t = Ke.relays) {
  if (!Array.isArray(e)) return [];
  const n = [];
  for (const r of e) {
    if (typeof r != "string" || r.length > 200 || !Qe(r)) continue;
    let o;
    try {
      o = new URL(r);
    } catch {
      continue;
    }
    if (o.protocol !== "wss:" || o.search || !hc(o.hostname)) continue;
    const i = `${o.protocol}//${o.host}${o.pathname === "/" ? "" : o.pathname}`;
    if (n.includes(i) || n.push(i), n.length >= t) break;
  }
  return n;
}
function Ht(e, t, n = Ke.relays) {
  let r = null;
  for (const o of e)
    !M(o) || o.kind !== Rt || o.pubkey !== t || (!r || o.created_at > r.created_at) && (r = o);
  return r ? ye(
    r.tags.filter((o) => o[0] === "r" && (o[2] === void 0 || o[2] === "write")).map((o) => o[1]),
    n
  ) : [];
}
function vc(e) {
  return e.answered < Math.min(2, e.asked) || e.answered === 0 ? !1 : e.newestAt === null ? e.seenAt === 0 : e.readable && e.newestAt >= e.seenAt;
}
function dr(e, t, n) {
  const r = Math.max(n, 0);
  return r && e - r < Ke.checkEverySec ? "fresh" : e - Math.max(r, t) >= Ke.staleSec ? "overdue" : "due";
}
const at = "bitlogin:signer-grant:v1:", Jo = "bitlogin:signer-grant-device-key:v1", Ee = {
  /** The longest a site BitLogin knows is remembered, in seconds: thirty days from Allow. */
  keepSec: 720 * 3600,
  /** The longest for a site it does not know: seven days. */
  unknownKeepSec: 168 * 3600,
  /** How many recent room passes are remembered, to count them across page loads. */
  passKept: 10,
  /** How many recent signatures are remembered, to count them across page loads. */
  signedKept: 60
}, Jt = (e) => e.at ?? e.until - Yo(e.site), Yo = (e) => mi(e) !== null ? Ee.keepSec : Ee.unknownKeepSec, wc = /^[0-9a-f]{64}$/u;
function Le(e) {
  if (typeof e != "string" || e.length > 300) return "";
  try {
    const t = new URL(e);
    return (t.protocol === "https:" || t.protocol === "http:") && t.origin === e ? t.origin : "";
  } catch {
    return "";
  }
}
const fr = (e) => btoa(Array.from(e, (t) => String.fromCharCode(t)).join("")), pr = (e) => Uint8Array.from(atob(e), (t) => t.charCodeAt(0)), hr = (e) => {
  const t = new Uint8Array(e.byteLength);
  return t.set(e), t.buffer;
}, gc = (e) => Array.from(e, (t) => t.toString(16).padStart(2, "0")).join("");
async function Yt(e, t, n) {
  const r = Le(t.site);
  if (!r || t.everydayPrivateKey.length !== 32 || typeof e.getOrCreateDeviceKey != "function") return !1;
  const o = Math.min(Math.floor(t.until), Math.floor(n) + Yo(r));
  if (!(o > n)) return !1;
  const i = crypto.getRandomValues(new Uint8Array(12));
  try {
    const s = await e.getOrCreateDeviceKey(Jo), a = JSON.stringify({
      site: r,
      key: gc(t.everydayPrivateKey),
      until: o,
      ...t.name ? { name: t.name.slice(0, 48) } : {},
      ...Me(t.profile) ? { profile: Me(t.profile) } : {},
      // An application's public signatures are counted up to its own hourly limit, so more of them are kept.
      signed: t.signed.filter((y) => Number.isFinite(y)).slice(-(t.permissions ? Ct.public.hourly : Ee.signedKept)),
      ...t.permissions ? { permissions: t.permissions } : {},
      ...typeof t.at == "number" ? { at: Math.floor(t.at) } : {},
      ...ye(t.relays).length ? { relays: ye(t.relays) } : {},
      ...typeof t.checkedAt == "number" ? { checkedAt: Math.floor(t.checkedAt) } : {},
      ...typeof t.seenAt == "number" ? { seenAt: Math.floor(t.seenAt) } : {},
      ...t.signedPass?.length ? { signedPass: t.signedPass.filter((y) => Number.isFinite(y)).slice(-Ee.passKept) } : {},
      ...t.permissions && t.signedSensitive ? { signedSensitive: t.signedSensitive.filter((y) => Number.isFinite(y)).slice(-Ct.sensitive.hourly) } : {}
    }), c = await crypto.subtle.encrypt({ name: "AES-GCM", iv: i }, s, new TextEncoder().encode(a)), u = { v: 1, iv: fr(i), ciphertext: fr(new Uint8Array(c)) };
    return await e.set(at + r, JSON.stringify(u)), !0;
  } catch {
    return !1;
  }
}
async function Xt(e, t, n) {
  const r = Le(t);
  if (!r || typeof e.getOrCreateDeviceKey != "function") return null;
  try {
    const o = await e.get(at + r);
    if (!o) return null;
    const i = JSON.parse(o);
    if (i.v !== 1 || typeof i.iv != "string" || typeof i.ciphertext != "string") return null;
    const s = await e.getOrCreateDeviceKey(Jo), a = await crypto.subtle.decrypt({ name: "AES-GCM", iv: hr(pr(i.iv)) }, s, hr(pr(i.ciphertext))), c = JSON.parse(new TextDecoder().decode(a)), u = (f) => typeof f == "number" && Number.isFinite(f) && f > 0 ? Math.floor(f) : void 0, y = Me(c.profile), d = c.permissions === void 0 ? void 0 : Pn(c.permissions);
    if (d === null || d && !Kn(r, d))
      return await e.delete(at + r), null;
    const p = (f, g) => Array.isArray(f) ? f.filter((v) => typeof v == "number" && Number.isFinite(v)).slice(-g) : [];
    return c.site !== r || typeof c.key != "string" || !wc.test(c.key) || typeof c.until != "number" ? null : !(c.until > n) || c.until > n + Ee.keepSec ? (await e.delete(at + r), null) : {
      site: r,
      everydayPrivateKey: Uint8Array.from(c.key.match(/.{2}/gu) ?? [], (f) => Number.parseInt(f, 16)),
      until: c.until,
      ...typeof c.name == "string" && c.name ? { name: c.name.slice(0, 48) } : {},
      ...y ? { profile: y } : {},
      signed: p(c.signed, d ? Ct.public.hourly : Ee.signedKept),
      ...p(c.signedPass, Ee.passKept).length ? { signedPass: p(c.signedPass, Ee.passKept) } : {},
      ...u(c.at) ? { at: u(c.at) } : {},
      ...ye(c.relays).length ? { relays: ye(c.relays) } : {},
      ...u(c.checkedAt) ? { checkedAt: u(c.checkedAt) } : {},
      ...u(c.seenAt) ? { seenAt: u(c.seenAt) } : {},
      ...d ? { permissions: d, signedSensitive: p(c.signedSensitive, Ct.sensitive.hourly) } : {}
    };
  } catch {
    return null;
  }
}
async function vr(e, t) {
  const n = Le(t);
  if (n)
    try {
      await e.delete(at + n);
    } catch {
    }
}
const Xo = "bitlogin:signer-handoff:v1", bc = /* @__PURE__ */ new Set([
  "configure",
  "getPublicKey",
  "signEvent",
  "getSessionStatus",
  "logout",
  "handoffBegin",
  "handoffAccept",
  // What an approved application may ask beyond signing (§SW9.5). Each is refused unless the session carries a
  // permission set, and then held to it (cryptoWorker.ts).
  "appEncrypt",
  "appDecrypt",
  "appDecryptEvent",
  // A room pass for the site the hand-off was sealed for, built whole in the worker (§SW16).
  "roomPass",
  // Asking the user's relays whether this site was taken back (docs/take-back.md). It reads one record and the
  // user's relay list, and can only end the grant or leave it be.
  "signerCheck",
  // Remembering a site, so the user is not asked on every page load (signerGrant.ts).
  "signerKeep",
  "signerRestore",
  "signerTouch",
  "signerForget"
]), yn = /^[0-9a-f]{64}$/;
function mc(e) {
  return Array.from(e, (t) => t.toString(16).padStart(2, "0")).join("");
}
function kc(e) {
  return Uint8Array.from(e.match(/.{2}/g) ?? [], (t) => Number.parseInt(t, 16));
}
function Ec(e, t, n, r, o = {}) {
  if (!yn.test(t)) throw new Error("The hand-off has no usable recipient key.");
  if (e.length !== 32) throw new Error("No identity is unlocked in this session.");
  let i = null;
  if (r !== void 0) {
    const y = Le(r.site), d = Pn(r.permissions);
    if (!y || !d || !Kn(y, d)) throw new Error("That is not a permission set an application may be given.");
    i = { site: y, permissions: d };
  }
  const s = o.site === void 0 ? "" : Le(o.site);
  if (o.site !== void 0 && (!s || i && i.site !== s)) throw new Error("The hand-off names no usable site.");
  const a = Me(o.profile), c = !!s && o.visitOnly !== !0 && o.remember === !0, u = new be(n.slice());
  try {
    const y = JSON.stringify({ v: 1, purpose: Xo, key: mc(e), ...i ? { app: i } : {}, ...s ? { site: s } : {}, ...a ? { profile: a } : {}, ...c ? { remember: !0 } : {}, ...typeof o.at == "number" && Number.isFinite(o.at) ? { at: Math.floor(o.at) } : {}, ...ye(o.relays).length ? { relays: ye(o.relays) } : {} });
    return { senderPublicKey: u.getPublicKey(), payload: u.nip44Encrypt(t, y) };
  } finally {
    u.destroy();
  }
}
function _c(e, t) {
  if (!e || !yn.test(e.senderPublicKey) || typeof e.payload != "string")
    throw new Error("That is not a signer hand-off.");
  const n = new be(t.slice());
  let r;
  try {
    r = n.nip44Decrypt(e.senderPublicKey, e.payload);
  } catch {
    throw new Error("The hand-off could not be opened.");
  } finally {
    n.destroy();
  }
  let o;
  try {
    o = JSON.parse(r);
  } catch {
    throw new Error("The hand-off could not be read.");
  }
  if (o.v !== 1 || o.purpose !== Xo || typeof o.key != "string" || !yn.test(o.key))
    throw new Error("That is not a signer hand-off.");
  const i = kc(o.key);
  try {
    _(i);
  } catch {
    throw i.fill(0), new Error("The hand-off carried an unusable key.");
  }
  const s = o.site === void 0 ? null : Le(o.site);
  if (s === "")
    throw i.fill(0), new Error("The hand-off names no usable site.");
  const a = Me(o.profile), c = o.remember === !0 && !!s, u = typeof o.at == "number" && Number.isFinite(o.at) && o.at > 0 ? Math.floor(o.at) : null, y = ye(o.relays);
  if (o.app === void 0) return { key: i, app: null, site: s, profile: a, remember: c, at: u, relays: y };
  const d = o.app, p = d && typeof d == "object" ? Le(d.site) : "", f = d && typeof d == "object" ? Pn(d.permissions) : null;
  if (!p || !f || !Kn(p, f) || s && s !== p)
    throw i.fill(0), new Error("The hand-off carried a permission set that cannot be read.");
  return { key: i, app: { site: p, permissions: f }, site: p, profile: a, remember: c, at: u, relays: y };
}
const Qo = "bitlogin:session-public:v1";
async function Pc(e, t) {
  try {
    const n = {
      pubkey: t.pubkey,
      npub: t.npub,
      ...t.name ? { name: t.name } : {}
    };
    await e.set(Qo, JSON.stringify(n));
  } catch {
  }
}
async function wr(e) {
  try {
    await e.delete(Qo);
  } catch {
  }
}
class Kc {
  tail = Promise.resolve();
  run(t) {
    const n = this.tail.then(t, t);
    return this.tail = n.then(
      () => {
      },
      () => {
      }
    ), n;
  }
}
const l = {
  signer: null,
  everydayPrivateKey: null,
  accountId: null,
  recoveryPublicKey: null,
  activeCredentialEvent: null,
  activeRecoveryEvent: null,
  pendingRecovery: null,
  everydayKeyDerived: !1,
  connectionVaultRoot: null,
  vaultKnown: !1,
  vault: null,
  signerOnly: !1,
  app: null,
  site: null,
  profile: null,
  remember: !1,
  grantAt: null,
  relays: []
};
let Ae = null, S = [...xr], fe = [...Tr];
const m = new Ja();
let dn = !1, fn = !1;
function gr(e) {
  dn || (S = e.vaultRelays), fn || (fe = e.discoveryRelays);
}
const Ac = new Kc();
let A = null, Qt = Date.now();
const Rc = /* @__PURE__ */ new Set(["configure", "lockStatus", "lockOpen", "restoreSession", "getSessionStatus", "logout"]), Zo = "bitlogin:taken-back:v1:";
async function Sc(e) {
  try {
    const t = await m.get(Zo + e);
    return (t ? Ho(JSON.parse(t)) : null) ?? ln;
  } catch {
    return ln;
  }
}
function br(e, t) {
  try {
    return Ho(JSON.parse(e.nip44Decrypt(e.getPublicKey(), t)));
  } catch {
    return null;
  }
}
function tt() {
  he(), A && E(A), A = null;
}
async function Oe() {
  const e = await Pe(m);
  return e ? {
    on: !0,
    locked: !A && await qo(m) === "locked",
    device: !!e.device,
    ...e.device ? { credentialId: e.device.credentialId } : {},
    triesLeft: Math.max(0, ue.tries - e.tries)
  } : { on: !1, locked: !1, device: !1, triesLeft: 0 };
}
function C() {
  if (!l.signer || !l.everydayPrivateKey)
    throw new Error("No identity is unlocked in this session.");
  return { signer: l.signer, everydayPrivateKey: l.everydayPrivateKey };
}
function Zt() {
  if (!l.signerOnly || !l.app) throw new Error("refused");
  return l.app;
}
function he() {
  l.signer?.destroy(), l.everydayPrivateKey && l.everydayPrivateKey.fill(0), l.signer = null, l.everydayPrivateKey = null, l.accountId = null, l.recoveryPublicKey = null, l.activeCredentialEvent = null, l.activeRecoveryEvent = null, l.everydayKeyDerived = !1, l.vault?.destroy(), l.vault = null, l.connectionVaultRoot && l.connectionVaultRoot.fill(0), l.connectionVaultRoot = null, l.vaultKnown = !1, l.signerOnly = !1, l.app = null, l.site = null, l.profile = null, l.remember = !1, l.grantAt = null, l.relays = [], l.pendingRecovery && (l.pendingRecovery.recoveryPrivateKey.fill(0), l.pendingRecovery.everydayPrivateKey.fill(0), l.pendingRecovery = null);
}
function mr(e) {
  return he(), l.pendingRecovery = e, l.signer = new be(e.everydayPrivateKey), l.everydayPrivateKey = e.everydayPrivateKey, l.accountId = e.accountId, l.recoveryPublicKey = e.recoveryPublicKey, l.activeRecoveryEvent = e.currentRecoveryEvent, l.everydayKeyDerived = e.everydayKeyDerived, pn(
    e.currentRecoveryPayload.connection_vault_root ? V(e.currentRecoveryPayload.connection_vault_root) : void 0
  ), {
    everydayPublicKey: e.everydayPublicKey,
    accountId: e.accountId,
    generalRelays: e.generalRelays,
    dmRelays: e.dmRelays,
    chainWarning: e.chainWarning,
    everydayKeyDerived: e.everydayKeyDerived
  };
}
function pn(e, t) {
  l.connectionVaultRoot = e ?? null, l.vaultKnown = !0, l.vault = null, t && E(t);
}
async function Ue() {
  if (!l.everydayPrivateKey || !l.accountId || !l.recoveryPublicKey || !l.activeCredentialEvent || !l.activeRecoveryEvent)
    return;
  const e = await Pe(m);
  e && !A && await st(m), await Ya(m, {
    everydayPrivateKey: l.everydayPrivateKey,
    accountId: l.accountId,
    recoveryPublicKey: l.recoveryPublicKey,
    activeCredentialEvent: l.activeCredentialEvent,
    activeRecoveryEvent: l.activeRecoveryEvent,
    ...l.connectionVaultRoot ? { connectionVaultRoot: l.connectionVaultRoot } : {},
    ...l.vaultKnown ? { vaultEnabled: l.connectionVaultRoot !== null } : {},
    everydayKeyDerived: l.everydayKeyDerived
  }, e && A ? A : null), await ei();
}
async function kr() {
  const e = await Xa(m, A);
  return e ? (he(), l.signer = new be(e.everydayPrivateKey), l.everydayPrivateKey = e.everydayPrivateKey, l.accountId = e.accountId, l.recoveryPublicKey = e.recoveryPublicKey, l.activeCredentialEvent = e.activeCredentialEvent, l.activeRecoveryEvent = e.activeRecoveryEvent, l.everydayKeyDerived = e.everydayKeyDerived ?? !1, l.connectionVaultRoot = e.connectionVaultRoot ?? null, l.vaultKnown = e.vaultEnabled !== void 0, await ei(), {
    restored: !0,
    everydayPublicKey: l.signer.getPublicKey(),
    accountId: e.accountId,
    everydayKeyDerived: l.everydayKeyDerived
  }) : { restored: !1 };
}
async function ei() {
  if (!l.signer) return;
  const e = l.signer.getPublicKey();
  await Pc(m, { pubkey: e, npub: Et(e) });
}
function nt() {
  try {
    return new URL(self.location.href).origin;
  } catch {
    return "";
  }
}
function hn() {
  if (!l.signer) throw new Error("No identity is unlocked in this session.");
  if (!l.connectionVaultRoot)
    throw new Error(
      l.vaultKnown ? "This account predates the Connection Vault. Enable it from your BitLogin account manager (recovery phrase required)." : "Sign in again to use wallet connections on this device."
    );
  return l.vault ??= new Wa(l.connectionVaultRoot.slice()), l.vault;
}
function rt(e) {
  const { record: t } = e, n = {
    connectionId: t.connection_id,
    connectionType: t.connection_type,
    label: t.label,
    state: t.state,
    origin: t.application_binding.origin,
    createdAt: t.created_at,
    updatedAt: t.updated_at
  };
  if (t.connection_type === "nwc" && t.state !== "deleted") {
    const r = t.credential;
    n.walletPubkey = r.wallet_pubkey, n.relayCount = r.relays?.length;
  }
  return n;
}
async function St() {
  const e = hn(), t = await e.listConnections({ relayUrls: S, store: m });
  return {
    vault: e,
    connections: t.connections.filter((n) => n.record.state !== "deleted"),
    rollbackWarnings: t.rollbackWarnings,
    unreadable: t.unreadable,
    truncated: t.truncated,
    quorumMet: t.quorumMet
  };
}
async function en(e) {
  const { vault: t, connections: n } = await St(), r = n.find((o) => o.record.connection_id === e);
  if (!r) throw new Error("That connection no longer exists.");
  return { vault: t, connection: r };
}
let Ce = null, ce = null;
function Er(e) {
  self.postMessage({ notify: "nip46-auth-url", url: e });
}
function ot() {
  if (!Ce) throw new Error("No remote signer is connected.");
  return Ce;
}
function mt() {
  ce && (ce.abort.abort(), E(ce.clientSecretKey), ce = null);
}
function ti(e) {
  const t = e.buildLogoutEvent();
  e.close(), t && e.publishCourtesy(t);
}
function _r(e, t) {
  Ce && ti(Ce.client), Ce = { client: e, userPubkey: t };
}
async function Nc(e, t) {
  if (l.signerOnly && !bc.has(e))
    throw new Error("This session can only sign. Sign in at your own BitLogin page for anything else.");
  switch (A && e !== "configure" && Date.now() - Qt > ue.idleSec * 1e3 && tt(), Rc.has(e) || (Qt = Date.now()), e) {
    // ---- The optional lock (lock.ts) ----
    case "lockStatus":
      return Oe();
    // Turn it on, or change the PIN. Only with a full session unlocked: the key that is sealed is the one in hand.
    case "lockEnable": {
      if (C(), await Pe(m) && !A) throw new Error("Unlock first.");
      const n = await ec(m, t.pin, A ?? void 0);
      return A && E(A), A = n, await Ue(), Oe();
    }
    case "lockSetDevice": {
      if (C(), !A) throw new Error("Turn the lock on first.");
      const n = t, r = V(String(n.prfOutput));
      try {
        await tc(m, A, String(n.credentialId), r);
      } finally {
        E(r);
      }
      return Oe();
    }
    case "lockRemoveDevice": {
      if (C(), !A) throw new Error("Turn the lock on first.");
      return await nc(m), Oe();
    }
    case "lockDisable": {
      if (C(), await Pe(m) && !A) throw new Error("Unlock first.");
      return await st(m), A && E(A), A = null, await Ue(), Oe();
    }
    case "lockNow": {
      if (!A) throw new Error("The lock is not on.");
      return tt(), Oe();
    }
    // Open it, with the PIN or with the device. A wrong try is counted; one too many removes the lock and the
    // cached session with it, and the user signs in again the ordinary way.
    case "lockOpen": {
      const n = t;
      let r;
      if (typeof n.prfOutput == "string") {
        const o = V(n.prfOutput);
        try {
          r = await oc(m, o);
        } finally {
          E(o);
        }
      } else
        r = await rc(m, n.pin);
      if (r.ok) {
        A && E(A), A = r.lockKey, Qt = Date.now();
        const o = await kr();
        if (o.restored) return { ok: !0, left: ue.tries, removed: !1, ...o };
        await st(m), tt(), r = { ok: !1, left: 0, removed: !0 };
      }
      return r.removed && (tt(), await ar(m), await wr(m)), { ok: !1, left: r.left, removed: r.removed, restored: !1 };
    }
    // ---- Signer hand-off (docs/sign-in-window.md) ----
    // The receiving side, first: a throwaway key for the hand-off to be sealed to.
    case "handoffBegin":
      return Ae && E(Ae), Ae = wt(), { recipientPublicKey: _(Ae) };
    // The sending side: this worker has the session, and seals the everyday
    // key (only that) to the receiving worker's throwaway key.
    case "handoffExport": {
      const { everydayPrivateKey: n } = C(), r = wt(), o = t;
      try {
        return Ec(n, o.recipientPublicKey, r, o.app, {
          ...o.site !== void 0 ? { site: o.site } : {},
          ...l.profile ? { profile: l.profile } : {},
          ...o.remember === !0 ? { remember: !0 } : {},
          // With the lock on, nothing is kept for any site: a key at rest in a site's storage would be a key
          // the lock does not cover. Every site is allowed for the visit, and asks at the sign-in address again.
          ...A ? { visitOnly: !0 } : {},
          // When it was allowed, by this worker's clock, and where the user writes: what a signer needs to
          // find out later whether the site was taken back (docs/take-back.md).
          at: Date.now() / 1e3,
          relays: l.relays
        });
      } finally {
        E(r);
      }
    }
    // The receiving side, last: open it with the throwaway key, which is
    // then gone. What results is a signer-only session, in memory. It is
    // never written to the session cache or the public record.
    // ---- What the embedded signer remembers for a site (signerGrant.ts) ----
    // Keep this hand-off for the site that asked, so the user is not asked again on its next page load. Only a
    // session that arrived by a hand-off is ever kept this way: a full session is never written as a grant.
    case "signerKeep": {
      const { everydayPrivateKey: n } = C();
      if (!l.signerOnly) throw new Error("Only a signer-only session can be remembered for a site.");
      const r = t, o = Date.now() / 1e3;
      if (!l.remember) return { kept: !1 };
      if (l.app && l.app.site !== r.site || l.site && l.site !== r.site) throw new Error("This hand-off was for another site.");
      return {
        kept: await Yt(
          m,
          {
            site: r.site,
            everydayPrivateKey: n,
            until: r.until,
            ...r.name ? { name: r.name } : {},
            ...l.profile ? { profile: l.profile } : {},
            at: l.grantAt ?? Math.floor(o),
            ...l.relays.length ? { relays: l.relays } : {},
            signed: [],
            ...l.app ? { permissions: l.app.permissions, signedSensitive: [] } : {}
          },
          o
        )
      };
    }
    // The site's page was loaded again: what was kept for that site, if it is still in date, becomes a
    // signer-only session. It touches nothing a full session uses.
    case "signerRestore": {
      const r = await Xt(m, t.site, Date.now() / 1e3);
      return r ? (he(), l.signer = new be(r.everydayPrivateKey), l.everydayPrivateKey = r.everydayPrivateKey, l.signerOnly = !0, l.app = r.permissions ? { site: r.site, permissions: r.permissions } : null, l.site = r.site, l.profile = r.profile ?? null, l.remember = !0, l.grantAt = Jt(r), l.relays = r.relays ?? [], {
        restored: !0,
        everydayPublicKey: l.signer.getPublicKey(),
        until: r.until,
        ...r.name ? { name: r.name } : {},
        ...r.profile ? { profile: r.profile } : {},
        signed: r.signed,
        ...r.signedPass ? { signedPass: r.signedPass } : {},
        check: dr(Date.now() / 1e3, Jt(r), r.checkedAt ?? 0),
        ...r.permissions ? { permissions: r.permissions, signedSensitive: r.signedSensitive ?? [] } : {}
      }) : { restored: !1 };
    }
    // Count a signature against the site, where reloading the page can't lose the count.
    case "signerTouch": {
      const { everydayPrivateKey: n } = C();
      if (!l.signerOnly) throw new Error("Only a signer-only session is counted for a site.");
      const r = t, o = Date.now() / 1e3, i = await Xt(m, r.site, o);
      return i && _(i.everydayPrivateKey) === _(n) && await Yt(
        m,
        { ...i, signed: Array.isArray(r.signed) ? r.signed : [], ...Array.isArray(r.signedPass) ? { signedPass: r.signedPass } : {}, ...i.permissions ? { signedSensitive: Array.isArray(r.signedSensitive) ? r.signedSensitive : [] } : {} },
        o
      ), {};
    }
    case "signerForget":
      return await vr(m, t.site), {};
    case "handoffAccept": {
      if (!Ae) throw new Error("No hand-off was begun here.");
      const n = Ae;
      Ae = null;
      let r;
      try {
        r = _c(t, n);
      } finally {
        E(n);
      }
      return he(), l.signer = new be(r.key), l.everydayPrivateKey = r.key, l.signerOnly = !0, l.app = r.app, l.site = r.site, l.profile = r.profile, l.remember = r.remember, l.grantAt = r.at, l.relays = r.relays, {
        everydayPublicKey: l.signer.getPublicKey(),
        ...r.app ? { app: r.app } : {},
        ...r.site ? { site: r.site } : {},
        ...r.profile ? { profile: r.profile } : {},
        ...r.remember ? { remember: !0 } : {}
      };
    }
    // ---- Who someone is, to a world they allowed (§SW16).
    // A full session, at the sign-in address: the person's own profile, asked of relays and believed only as
    // far as its signature goes. It is sealed into the next hand-off. A session that arrived by a hand-off
    // never asks a relay anything: this action is not on its list.
    case "loadProfile": {
      const { signer: n } = C(), r = n.getPublicKey(), o = t.profile !== !1, i = [.../* @__PURE__ */ new Set([...fe, ...S])].slice(0, 8);
      if (i.length === 0) return {};
      const s = new K(i);
      try {
        const [a, c] = await Promise.all([
          o ? s.queryQuorum({ kinds: [0], authors: [r], limit: 2 }, 4e3) : Promise.resolve(null),
          s.queryQuorum({ kinds: [Rt], authors: [r], limit: 2 }, 4e3)
        ]);
        if (l.signer !== n) return {};
        l.profile = a ? uc(a.outcomes.flatMap((u) => u.events), r) : null, l.relays = Ht(c.outcomes.flatMap((u) => u.events), r);
      } finally {
        s.closeAll();
      }
      return { ...l.profile ? { profile: l.profile } : {}, relays: l.relays };
    }
    // ---- Taking a site back (docs/take-back.md) ----
    // At the sign-in address, with a full session: publish the record that says a site, or every site, is taken
    // back as of now. It carries everything an earlier record said, from the relays and from this browser's own
    // copy, so a record built here can never give a site back.
    case "takeBack": {
      const { signer: n } = C(), r = t, o = n.getPublicKey(), i = Date.now() / 1e3, s = r.all === !0 ? { all: !0 } : { site: String(r.site ?? "") }, a = new K([.../* @__PURE__ */ new Set([...fe, ...S])].slice(0, 8));
      let c;
      try {
        c = Ht((await a.queryQuorum({ kinds: [Rt], authors: [o], limit: 2 }, 4e3)).outcomes.flatMap((d) => d.events), o);
      } finally {
        a.closeAll();
      }
      const u = [.../* @__PURE__ */ new Set([...c, ...S])].slice(0, 16), y = new K(u);
      try {
        const d = await y.queryQuorum({ kinds: [Kt], authors: [o], "#d": [At], limit: 2 }, 5e3);
        if (d.respondedCount === 0) return { ok: !1, accepted: 0, of: u.length };
        const p = yr(d.outcomes.flatMap((k) => k.events), o, i), f = p ? br(n, p.content) : null, g = await Sc(o), v = fc(un(f ?? ln, g, i), s, i), w = n.signEvent({
          kind: Kt,
          // Later than the one it replaces, whatever the two clocks say.
          created_at: Math.max(Math.floor(i), (p?.created_at ?? 0) + 1),
          tags: [["d", At]],
          content: n.nip44Encrypt(o, ur(v))
        }), h = Se(await y.publishAll(w, 6e3)), b = h >= Math.min(2, u.length);
        return b && await m.set(Zo + o, ur(v)).catch(() => {
        }), { ok: b, accepted: h, of: u.length };
      } finally {
        y.closeAll();
      }
    }
    // In the embedded signer, for a kept grant: ask the user's relays whether this site was taken back. Asked at
    // most once a day. It can end the grant or leave it be, and nothing else.
    case "signerCheck": {
      const { signer: n } = C();
      if (!l.signerOnly || !l.site) return { state: "ok" };
      const r = l.site, o = Date.now() / 1e3, i = await Xt(m, r, o);
      if (!i) return { state: "ok" };
      const s = n.getPublicKey(), a = Jt(i), c = dr(o, a, i.checkedAt ?? 0);
      if (c === "fresh") return { state: "ok" };
      const u = [.../* @__PURE__ */ new Set([...ye(i.relays), ...S])].slice(0, 12), y = new K(u);
      let d, p;
      try {
        [d, p] = await Promise.all([
          y.queryQuorum({ kinds: [Kt], authors: [s], "#d": [At], limit: 2 }, 5e3),
          y.queryQuorum({ kinds: [Rt], authors: [s], limit: 2 }, 5e3)
        ]);
      } finally {
        y.closeAll();
      }
      if (l.signer !== n) return { state: "ok" };
      const f = yr(d.outcomes.flatMap((h) => h.events), s, o), g = f ? br(n, f.content) : null;
      if (g && pc(g, r, a))
        return await vr(m, r), he(), { state: "ended" };
      if (!vc({
        asked: u.length,
        answered: d.respondedCount,
        seenAt: i.seenAt ?? 0,
        newestAt: f ? f.created_at : null,
        readable: g !== null
      })) return { state: c === "overdue" ? "stale" : "ok" };
      const w = Ht(p.outcomes.flatMap((h) => h.events), s);
      return await Yt(
        m,
        {
          ...i,
          checkedAt: Math.floor(o),
          seenAt: Math.max(i.seenAt ?? 0, g && f ? f.created_at : 0),
          ...w.length ? { relays: w } : {}
        },
        o
      ), w.length && (l.relays = w), { state: "ok" };
    }
    // A room pass (NSWP kind 27300) for the site this session serves, and for no other. The site, the time, how
    // long it lasts and the profile are all this worker's own: what is asked for is a session public key. Not
    // for an application: an application is held to the set the user read, and a pass is not in one.
    case "roomPass": {
      const { signer: n } = C();
      if (!l.signerOnly || l.app || !l.site) throw new Error("refused");
      const r = dc({
        session: t.session,
        site: l.site,
        identity: n.getPublicKey(),
        nowSeconds: Date.now() / 1e3,
        profile: l.profile
      });
      if (!r) throw new Error("refused");
      return n.signEvent(r);
    }
    // ---- What an approved application may ask beyond signing (§SW9.5). Refused without a permission set.
    case "appEncrypt": {
      const { signer: n } = C(), r = Zt(), o = t, i = n.getPublicKey(), s = r.permissions.sign.some((a) => Ki.includes(a));
      if (!Ai(r.permissions, i, o.peerPublicKey) && !(s && /^[0-9a-f]{64}$/u.test(String(o.peerPublicKey))))
        throw new Error("refused");
      if (typeof o.text != "string" || o.text.length > 1e5) throw new Error("refused");
      return { text: o.scheme === "nip04" ? n.nip04Encrypt(o.peerPublicKey, o.text) : n.nip44Encrypt(o.peerPublicKey, o.text) };
    }
    case "appDecrypt": {
      const { signer: n } = C(), r = Zt(), o = t;
      if (!Pi(r.permissions, o.peerPublicKey) || typeof o.text != "string") throw new Error("refused");
      return { text: o.scheme === "nip04" ? n.nip04Decrypt(o.peerPublicKey, o.text) : n.nip44Decrypt(o.peerPublicKey, o.text) };
    }
    case "appDecryptEvent": {
      const { signer: n } = C(), r = Zt(), o = t.event;
      if (!M(o)) throw new Error("refused");
      const i = _i(r.permissions, n.getPublicKey(), o);
      if (!i) throw new Error("refused");
      return { text: o.kind === 4 || /\?iv=[A-Za-z0-9+/=]+$/u.test(o.content) ? n.nip04Decrypt(i, o.content) : n.nip44Decrypt(i, o.content) };
    }
    case "nip46Connect": {
      const r = hs(t.uri), o = new Qn({
        clientSecretKey: wt(),
        pointer: r,
        onAuthUrl: Er
      });
      try {
        await o.connect();
        const i = await o.getUserPublicKey();
        return _r(o, i), mt(), { userPubkey: i };
      } catch (i) {
        throw o.close(), i;
      }
    }
    case "nip46NostrconnectStart": {
      const n = t, r = S.slice(0, 2);
      mt();
      const o = wt(), i = ut(G(16));
      return ce = { clientSecretKey: o, relayUrls: r, secret: i, abort: new AbortController() }, { uri: vs({
        clientPubkey: _(o),
        relayUrls: r,
        secret: i,
        name: n.appName?.trim() || "BitLogin",
        perms: ["sign_event", "nip44_encrypt", "nip44_decrypt", "nip04_encrypt", "nip04_decrypt"]
      }) };
    }
    case "nip46NostrconnectAwait": {
      const n = ce;
      if (!n) throw new Error("No signer-connection attempt is in progress.");
      let r;
      try {
        ({ signerPubkey: r } = await gs({
          clientSecretKey: n.clientSecretKey,
          relayUrls: n.relayUrls,
          secret: n.secret,
          timeoutMs: 18e4,
          signal: n.abort.signal
        }));
      } catch (i) {
        throw ce === n && mt(), i;
      }
      if (ce !== n) throw new Error("This signer-connection attempt was superseded.");
      ce = null;
      const o = new Qn({
        clientSecretKey: n.clientSecretKey,
        pointer: { signerPubkey: r, relayUrls: n.relayUrls },
        onAuthUrl: Er
      });
      try {
        const i = await o.getUserPublicKey();
        return _r(o, i), { userPubkey: i };
      } catch (i) {
        throw o.close(), i;
      }
    }
    case "nip46SignEvent": {
      const n = t;
      return ot().client.signEvent({
        kind: n.kind,
        content: n.content,
        tags: n.tags ?? [],
        created_at: n.created_at ?? Math.floor(Date.now() / 1e3)
      });
    }
    case "nip46Nip44Encrypt": {
      const n = t;
      return { ciphertext: await ot().client.nip44Encrypt(n.peerPublicKey, n.plaintext) };
    }
    case "nip46Nip44Decrypt": {
      const n = t;
      return { plaintext: await ot().client.nip44Decrypt(n.peerPublicKey, n.payload) };
    }
    case "nip46Nip04Encrypt": {
      const n = t;
      return { ciphertext: await ot().client.nip04Encrypt(n.peerPublicKey, n.plaintext) };
    }
    case "nip46Nip04Decrypt": {
      const n = t;
      return { plaintext: await ot().client.nip04Decrypt(n.peerPublicKey, n.payload) };
    }
    case "nip46Disconnect": {
      const n = Ce;
      return Ce = null, mt(), n && ti(n.client), {};
    }
    case "configure": {
      const n = t;
      return dn = !!n.vaultRelayUrls?.length, fn = !!n.discoveryRelayUrls?.length, n.vaultRelayUrls?.length && (S = n.vaultRelayUrls), n.discoveryRelayUrls?.length && (fe = n.discoveryRelayUrls), gr(_t(await Mr(m))), (!dn || !fn) && Bi(m).then(gr, () => {
      }), {};
    }
    case "register": {
      const n = t, r = n.importKey ? await wa({ nsecOrHex: n.importKey, loginName: n.loginName, password: n.password, vaultRelayUrls: S }) : await bo({ loginName: n.loginName, password: n.password, vaultRelayUrls: S });
      return he(), l.signer = new be(r.everydayPrivateKey), l.everydayPrivateKey = r.everydayPrivateKey, l.accountId = r.accountId, l.recoveryPublicKey = r.recoveryPublicKey, l.activeCredentialEvent = r.credentialEvent, l.activeRecoveryEvent = r.recoveryEvent, l.everydayKeyDerived = r.everydayKeyDerived, pn(r.connectionVaultRoot, r.vaultSudoKey), await Ue(), {
        recoveryPhrase: r.recoveryPhrase,
        everydayPublicKey: r.everydayPublicKey,
        recoveryPublicKey: r.recoveryPublicKey,
        accountId: r.accountId,
        imported: r.imported,
        everydayKeyDerived: r.everydayKeyDerived,
        credentialEventId: r.credentialEvent.id,
        recoveryEventId: r.recoveryEvent.id
      };
    }
    case "previewImportKey": {
      const r = mo(t.nsecOrHex), o = _(r), i = { everydayPublicKey: o, npub: Et(o) };
      return r.fill(0), i;
    }
    case "login": {
      const n = t, r = await ga({
        loginName: n.loginName,
        password: n.password,
        vaultRelayUrls: S,
        store: m,
        acknowledgeRollback: n.acknowledgeRollback
      });
      return he(), l.signer = new be(r.everydayPrivateKey), l.everydayPrivateKey = r.everydayPrivateKey, l.accountId = r.accountId, l.recoveryPublicKey = r.recoveryPublicKey, l.activeCredentialEvent = r.credentialEvent, l.activeRecoveryEvent = r.recoveryCapsuleEvent, l.everydayKeyDerived = r.everydayKeyDerived, pn(r.connectionVaultRoot, r.vaultSudoKey), await Ue(), !r.rollbackWarning && !r.relayDisagreementWarning && tr({
        relayUrls: S,
        credentialEvent: r.credentialEvent,
        recoveryEvent: r.recoveryCapsuleEvent
      }).catch(() => {
      }), {
        everydayPublicKey: r.everydayPublicKey,
        accountId: r.accountId,
        generation: r.generation,
        everydayKeyDerived: r.everydayKeyDerived,
        rollbackWarning: r.rollbackWarning,
        relayDisagreementWarning: r.relayDisagreementWarning
      };
    }
    case "recover": {
      const n = t, r = await ba({
        phrase: n.phrase,
        vaultRelayUrls: S,
        discoveryRelayUrls: fe,
        offlineRecoveryCapsuleEvents: n.offlineExportFile?.recovery_capsule_events
      });
      return mr(r);
    }
    case "previewPhraseRebuild": {
      const r = await ma({ phrase: t.phrase, vaultRelayUrls: S, discoveryRelayUrls: fe });
      return { ...r, npub: Et(r.everydayPublicKey) };
    }
    case "rebuildFromPhrase": {
      const r = await ka({ phrase: t.phrase, vaultRelayUrls: S, discoveryRelayUrls: fe });
      return mr(r);
    }
    case "completeRecovery": {
      const n = t;
      if (!l.pendingRecovery) throw new Error("No recovery is in progress in this session.");
      const r = await Ea({
        recovered: l.pendingRecovery,
        newLoginName: n.newLoginName,
        newPassword: n.newPassword,
        vaultRelayUrls: S,
        store: m
      });
      return l.activeCredentialEvent = r.credentialEvent, l.activeRecoveryEvent = r.refreshedRecoveryEvent, l.pendingRecovery.recoveryPrivateKey.fill(0), l.pendingRecovery = null, await Ue(), {
        locatorPublicKey: r.locatorPublicKey,
        credentialEventId: r.credentialEvent.id,
        refreshedRecoveryEventId: r.refreshedRecoveryEvent.id
      };
    }
    case "changePassword": {
      const n = t, r = await _a({
        loginName: n.loginName,
        oldPassword: n.oldPassword,
        newPassword: n.newPassword,
        vaultRelayUrls: S,
        store: m,
        acknowledgeRollback: n.acknowledgeRollback
      });
      return l.activeCredentialEvent = r.newCredentialEvent, l.recoveryPublicKey = r.recoveryPublicKey, l.activeRecoveryEvent = r.recoveryCapsuleEvent, await Ue(), {
        newLocatorPublicKey: r.newLocatorPublicKey,
        newGeneration: r.newGeneration,
        tombstoneAcknowledgedCount: r.tombstoneAcknowledgedCount,
        deletionAcknowledgedCount: r.deletionAcknowledgedCount
      };
    }
    case "publishProfileAndRelayLists": {
      const n = t, { everydayPrivateKey: r } = C();
      return ta({
        everydayPrivateKey: r,
        name: n.name,
        about: n.about,
        picture: n.picture,
        generalRelays: n.generalRelays,
        dmRelays: n.dmRelays,
        discoveryRelays: fe
      });
    }
    case "getPublicKey": {
      const { signer: n } = C();
      return { publicKey: n.getPublicKey() };
    }
    case "signEvent": {
      const { signer: n } = C(), r = t;
      if (l.signerOnly) {
        if (l.app) {
          const o = ki(l.app.permissions, r, l.app.site, Date.now() / 1e3);
          if (!o) throw new Error("refused");
          return n.signEvent(o);
        }
        if (Ei(r.kind) !== "ordinary") throw new Error("refused");
      }
      return n.signEvent({ kind: r.kind, tags: r.tags, content: r.content, created_at: r.created_at });
    }
    case "nip44Encrypt": {
      const { signer: n } = C(), r = t;
      return { ciphertext: n.nip44Encrypt(r.peerPublicKey, r.plaintext) };
    }
    case "nip44Decrypt": {
      const { signer: n } = C(), r = t;
      return { plaintext: n.nip44Decrypt(r.peerPublicKey, r.payload) };
    }
    case "nip04Encrypt": {
      const { signer: n } = C(), r = t;
      return { ciphertext: n.nip04Encrypt(r.peerPublicKey, r.plaintext) };
    }
    case "nip04Decrypt": {
      const { signer: n } = C(), r = t;
      return { plaintext: n.nip04Decrypt(r.peerPublicKey, r.payload) };
    }
    case "exportIdentity": {
      const { everydayPrivateKey: n, signer: r } = C();
      return { nsec: ai(n), npub: Et(r.getPublicKey()) };
    }
    case "buildRecoveryExport": {
      if (C(), !l.recoveryPublicKey || !l.activeRecoveryEvent)
        throw new Error("No recovery capsule is known in this session yet.");
      return si({
        recoveryPublicKeyHex: l.recoveryPublicKey,
        vaultRelayUrls: S,
        recoveryCapsuleEvents: [l.activeRecoveryEvent],
        relayListEvents: []
      });
    }
    case "repairReplicas": {
      if (!l.activeCredentialEvent || !l.activeRecoveryEvent)
        throw new Error("No active capsule events are known in this session yet.");
      return tr({
        relayUrls: S,
        credentialEvent: l.activeCredentialEvent,
        recoveryEvent: l.activeRecoveryEvent
      });
    }
    case "checkReplicaHealth": {
      if (!l.activeCredentialEvent || !l.activeRecoveryEvent)
        throw new Error("No active capsule events are known in this session yet.");
      return pa({
        relayUrls: S,
        credentialEvent: l.activeCredentialEvent,
        recoveryEvent: l.activeRecoveryEvent
      });
    }
    case "getSessionStatus":
      return { unlocked: !!l.signer, everydayPublicKey: l.signer?.getPublicKey(), signerOnly: l.signerOnly };
    // Called once, right after "configure", before the widget renders its welcome
    // screen -- restores whatever persistSession() last cached for this origin, so
    // a page reload doesn't ask for the login name + password again. A missing or
    // corrupt cache is not an error: it just means the widget falls through to its
    // normal welcome screen, exactly like it always has.
    case "restoreSession":
      return !A && await qo(m) === "locked" ? { restored: !1, locked: !0 } : kr();
    case "logout":
      return tt(), await st(m), await ar(m), await wr(m), {};
    // ---- Connection Vault (connection-vault.md §12, reveal mode) ----
    case "vaultStatus":
      return l.signer ? l.connectionVaultRoot ? { enabled: !0, vaultPublicKey: hn().vaultPublicKey } : { enabled: !1, reason: l.vaultKnown ? "no-vault" : "stale-cache" } : { enabled: !1 };
    case "vaultList": {
      const { connections: n, rollbackWarnings: r, unreadable: o, truncated: i, quorumMet: s } = await St();
      return { connections: n.map(rt), rollbackWarnings: r, unreadable: o, truncated: i, quorumMet: s };
    }
    case "vaultSaveNwc": {
      const n = t, r = nt(), o = hn(), i = ir(n.uri), s = n.label.trim().slice(0, 120) || "Wallet connection", { record: a, event: c } = await o.createConnection({
        connection_type: "nwc",
        tier: "connectable",
        label: s,
        credential: i,
        application_binding: { origin: r, app_pubkey: null }
      });
      if (!(await o.publish({
        event: c,
        connectionId: a.connection_id,
        relayUrls: S,
        store: m
      })).success)
        throw new Error("The connection could not be saved to enough relays. Please try again.");
      const y = await o.decryptEvent(c);
      return rt(y);
    }
    case "vaultFindForOrigin": {
      const n = nt(), { connections: r } = await St(), o = r.find(
        (i) => i.record.connection_type === "nwc" && i.record.state === "active" && i.record.application_binding.origin === n
      );
      return { connection: o ? rt(o) : null };
    }
    case "vaultRevealNwc": {
      const n = t, { connection: r } = await en(n.connectionId);
      if (r.record.connection_type !== "nwc" || r.record.state !== "active")
        throw new Error("That connection is not an active wallet connection.");
      const o = r.record.application_binding.origin;
      if (o !== null && o !== nt())
        throw new Error("That connection belongs to a different site.");
      const i = r.record.credential;
      return Io(i), { uri: La(i) };
    }
    case "vaultSetBinding": {
      const n = t, { vault: r, connection: o } = await en(n.connectionId), i = n.origin === null ? null : nt(), { record: s, event: a } = await r.updateConnection(o, {
        application_binding: { origin: i, app_pubkey: null }
      });
      if (!(await r.publish({
        event: a,
        connectionId: s.connection_id,
        relayUrls: S,
        store: m
      })).success) throw new Error("The change could not reach enough relays. Please try again.");
      const u = await r.decryptEvent(a);
      return rt(u);
    }
    case "vaultDelete": {
      const n = t, { vault: r, connection: o } = await en(n.connectionId), { record: i, event: s } = await r.deleteConnection(o);
      if (!(await r.publish({
        event: s,
        connectionId: i.connection_id,
        relayUrls: S,
        store: m
      })).success) throw new Error("The deletion could not reach enough relays. Please try again.");
      try {
        const c = r.buildDeletionRequest(o.event.id), u = new K(S);
        await u.publishAll(c), u.closeAll();
      } catch {
      }
      return {};
    }
    case "vaultOfferCheck": {
      const n = t, r = nt(), o = ir(n.uri), { connections: i } = await St(), s = i.find(
        (a) => a.record.connection_type === "nwc" && Da(a.record.credential, o)
      );
      return s ? s.record.application_binding.origin !== r ? { duplicate: !1 } : { duplicate: !0, connection: rt(s) } : { duplicate: !1 };
    }
    default:
      throw new Error(`Unknown worker action: ${e}`);
  }
}
const Cc = /* @__PURE__ */ new Set([
  "configure",
  "register",
  "previewImportKey",
  "login",
  "recover",
  "previewPhraseRebuild",
  "rebuildFromPhrase",
  "completeRecovery",
  "changePassword",
  "publishProfileAndRelayLists",
  "getPublicKey",
  "signEvent",
  "nip44Encrypt",
  "nip44Decrypt",
  "nip04Encrypt",
  "nip04Decrypt",
  "exportIdentity",
  "buildRecoveryExport",
  "repairReplicas",
  "checkReplicaHealth",
  "getSessionStatus",
  "restoreSession",
  "logout",
  "handoffBegin",
  "handoffExport",
  "handoffAccept",
  "signerKeep",
  "signerRestore",
  "signerTouch",
  "signerForget",
  "appEncrypt",
  "appDecrypt",
  "appDecryptEvent",
  "loadProfile",
  "roomPass",
  "takeBack",
  "signerCheck",
  "lockStatus",
  "lockEnable",
  "lockSetDevice",
  "lockRemoveDevice",
  "lockDisable",
  "lockNow",
  "lockOpen",
  "vaultStatus",
  "vaultList",
  "vaultSaveNwc",
  "vaultFindForOrigin",
  "vaultRevealNwc",
  "vaultSetBinding",
  "vaultDelete",
  "vaultOfferCheck",
  "nip46Connect",
  "nip46NostrconnectStart",
  "nip46NostrconnectAwait",
  "nip46SignEvent",
  "nip46Nip44Encrypt",
  "nip46Nip44Decrypt",
  "nip46Nip04Encrypt",
  "nip46Nip04Decrypt",
  "nip46Disconnect"
]);
self.addEventListener("message", (e) => {
  const t = e.data;
  if (!t || typeof t != "object" || typeof t.id != "string") return;
  if (typeof t.action != "string" || !Cc.has(t.action)) {
    const s = {
      id: t.id,
      ok: !1,
      error: `Unknown worker action: ${String(t.action)}`,
      errorName: "Error"
    };
    self.postMessage(s);
    return;
  }
  const { id: n, action: r, payload: o } = e.data;
  (r.startsWith("nip46") ? (s) => s() : (s) => Ac.run(s))(() => Nc(r, o)).then(
    (s) => {
      const a = { id: n, ok: !0, result: s };
      self.postMessage(a);
    },
    (s) => {
      const a = s instanceof Error ? s : new Error(String(s)), c = { id: n, ok: !1, error: a.message, errorName: a.name };
      self.postMessage(c);
    }
  );
});
