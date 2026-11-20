import { K as jo, b as Go, c as x, D as gr, d as vt, w as k, f as Et, g as ze, h as pn, S as Nt, j as Tt, k as Me, l as ot, B as Ho, m as Jo, n as It, o as Ye, q as fn, r as hn, a as We, s as mr, t as zo, u as Yo } from "./bitlogin-shared-D5YLu70u.js";
import { g as b, s as O, v as N, b as Qe, a as M, f as Oe, i as Qo, j as Xo, k as Zo, l as ei, m as ti, n as Lt, o as jn, p as br, q as ni, t as ri, w as oi, x as lt, y as kr, u as D, z as ii, A as _t, B as vn, C as wn, D as Er, E as ai, d as C, e as T, F as gn, G as si, H as _r, h as mn, I as Pr, J as ci, c as it, K as Qt, L as ut } from "./bitlogin-shared-Cj9s0_W_.js";
import { b as at, r as z, c as Y, k as li, i as Se, d as Gn, T as Ut, e as Vt, R as qt, n as Hn, g as ui, h as di, w as Ft, t as yi, m as pi, N as Xt, j as Jn, l as Kr } from "./bitlogin-shared-Bz2TyEFe.js";
import { j as we, n as bn, o as Zt, w as fi, q as $e, t as je, u as Ge, v as ee, x as X, y as Sr, z as Rr, B as Xe, C as kn, c as hi, D as Ze, r as En, m as _n, A as Pt, E as ce, k as vi, p as wi, F as gi, G as mi, H as bi, M as ki, I as Ei, J as _i, K as Pi, L as Ki, N as Si, O as Ri, Q as zn, T as Ai, U as Ci, V as Ni, X as Ti, Y as Ii, Z as xi, _ as Mi, a as Oi, $ as Di, a0 as Li, a1 as Ui, a2 as Vi, a3 as qi, a4 as Fi } from "./bitlogin-shared-DsCziTXz.js";
function Ar(e) {
  const t = b(e.privateKey);
  return O({
    pubkey: t,
    created_at: e.createdAt,
    kind: jo,
    tags: [
      ["e", e.eventIdToDelete],
      ["k", String(e.deletedEventKind)]
    ],
    content: e.reason ?? ""
  }, e.privateKey);
}
function Bi() {
  const e = globalThis.WebSocket;
  if (!e)
    throw new Error("No global WebSocket implementation is available in this environment.");
  return e;
}
const Kt = 1e3, Wi = 262144;
function $i(e) {
  const t = Math.min(e.limit ?? Kt, Kt);
  return Math.max(50, t * 3);
}
const ji = 2048, Gi = 1e4, Hi = 100;
function Ji(e, t) {
  if (e.size >= ji) {
    const n = e.values().next().value;
    n !== void 0 && e.delete(n);
  }
  e.add(t);
}
class Pn {
  url;
  ws = null;
  connectPromise = null;
  subs = /* @__PURE__ */ new Map();
  pendingPublishes = /* @__PURE__ */ new Map();
  authPrivateKey;
  connectTimeoutMs;
  authenticated = !1;
  constructor(t, n = {}) {
    if (!at(t))
      throw new Error("Relay URL must use secure WebSockets, except for an explicit loopback development endpoint.");
    this.url = t, this.authPrivateKey = n.authPrivateKey, this.connectTimeoutMs = n.connectTimeoutMs ?? 8e3;
  }
  async connect() {
    return this.connectPromise ? this.connectPromise : (this.connectPromise = new Promise((t, n) => {
      const r = Bi(), o = new r(this.url);
      this.ws = o;
      const i = setTimeout(() => {
        n(new Error(`Timed out connecting to relay ${this.url}`));
      }, this.connectTimeoutMs);
      o.addEventListener("open", () => {
        clearTimeout(i);
        for (const [a, s] of this.subs)
          o.send(JSON.stringify(["REQ", a, s.filter]));
        t();
      }), o.addEventListener("error", () => {
        clearTimeout(i), n(new Error(`WebSocket error connecting to relay ${this.url}`));
      }), o.addEventListener("close", () => {
        this.connectPromise = null;
      }), o.addEventListener("message", (a) => {
        this.handleMessage(String(a.data));
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
    if (t.length > Wi)
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
      const [i, a] = o;
      if (typeof i != "string")
        return;
      const s = this.subs.get(i);
      if (!s)
        return;
      const l = a?.id;
      if (typeof l != "string" || s.seenIds.has(l))
        return;
      if (s.onEvent) {
        const d = Date.now();
        if (d - s.liveWindowStart >= Gi && (s.liveWindowStart = d, s.liveVerifies = 0), s.liveVerifies >= Hi || (s.liveVerifies++, !N(a) || !Yn(a, s.filter)))
          return;
        Ji(s.seenIds, a.id), s.onEvent(a);
        return;
      }
      const u = Math.min(s.filter.limit ?? Kt, Kt);
      if (s.events.length >= u || s.verifyBudget <= 0 || (s.verifyBudget--, !N(a) || !Yn(a, s.filter)))
        return;
      s.seenIds.add(a.id), s.events.push(a);
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
      const [i, a, s] = o;
      if (typeof i != "string" || typeof a != "boolean" || s !== void 0 && typeof s != "string")
        return;
      this.pendingPublishes.get(i)?.({ ok: a, message: s ?? "" }), this.pendingPublishes.delete(i);
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
    const n = b(this.authPrivateKey), r = O({
      pubkey: n,
      created_at: Math.floor(Date.now() / 1e3),
      kind: Go,
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
    const r = Qe(M(8));
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
    const r = Qe(M(8));
    return new Promise((o, i) => {
      const a = [], s = (u) => {
        clearTimeout(l), this.subs.delete(r);
        try {
          this.send(["CLOSE", r]);
        } catch {
        }
        u ? i(u) : o(a);
      }, l = setTimeout(() => s(new Error("relay did not answer the subscription before the timeout")), n);
      this.subs.set(r, {
        events: a,
        seenIds: /* @__PURE__ */ new Set(),
        verifyBudget: $i(t),
        liveWindowStart: 0,
        liveVerifies: 0,
        filter: t,
        onEose: () => s()
      }), this.send(["REQ", r, t]);
    });
  }
}
function Yn(e, t) {
  if (t.ids && !t.ids.some((n) => e.id.startsWith(n)) || t.authors && !t.authors.some((n) => e.pubkey.startsWith(n)) || t.kinds && !t.kinds.includes(e.kind) || t.since !== void 0 && e.created_at < t.since || t.until !== void 0 && e.created_at > t.until)
    return !1;
  for (const [n, r] of Object.entries(t)) {
    if (!n.startsWith("#") || !Array.isArray(r))
      continue;
    const o = n.slice(1), i = r;
    if (!e.tags.some((a) => a[0] === o && i.some((s) => s === (a[1] ?? ""))))
      return !1;
  }
  return !0;
}
class K {
  connections = /* @__PURE__ */ new Map();
  constructor(t, n = {}) {
    for (const r of new Set(t))
      this.connections.set(r, new Pn(r, n));
  }
  get relayUrls() {
    return [...this.connections.keys()];
  }
  /** Queries every configured relay and waits for a quorum of responses (or all timeouts) before returning (§16.2). */
  async queryQuorum(t, n = 8e3) {
    const r = [...this.connections.entries()], o = await Promise.all(r.map(async ([s, l]) => {
      try {
        const u = await l.queryOnce(t, n);
        return { relayUrl: s, events: u, responded: !0 };
      } catch (u) {
        return { relayUrl: s, events: [], responded: !1, error: u.message };
      }
    })), i = o.filter((s) => s.responded).length, a = o.length;
    return {
      outcomes: o,
      quorumMet: i >= Math.ceil(a / 2),
      respondedCount: i,
      totalCount: a
    };
  }
  /** Publishes an event to every configured relay, best-effort (§15.6, §24.4). */
  async publishAll(t, n = 8e3) {
    const r = [...this.connections.entries()];
    return Promise.all(r.map(async ([o, i]) => {
      try {
        const a = await i.publish(t, n);
        return { relayUrl: o, result: a };
      } catch (a) {
        return { relayUrl: o, result: { ok: !1, message: a.message } };
      }
    }));
  }
  closeAll() {
    for (const t of this.connections.values())
      t.close();
  }
}
function ge(e) {
  return e.filter((t) => t.result.ok).length;
}
const st = null, Cr = [
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
  // Measured again 2026-11-20, from one machine, re-read 15 to 17 minutes after publishing. NOTHING IS CHANGED BY
  // IT: one run adds no relay and removes none.
  //   Held 8 of 8: nos.lol, nostr.bitcoiner.social, relay.primal.net, nostr-01.yakihonne.com,
  //     relay.nostr.wirednet.jp, nostr.sathoarder.com.
  //   Accepted 8, held about half: offchain.pub (4), nostr.mom (4, then 3).
  //   Accepted 8, held 0 in one run and 4 in another: relay.snort.social.
  //   One of eight stored: relay.damus.io. Never connected: relay.mostr.pub, nostr-pub.wellorder.net,
  //     relay.nostr.net.
  // So six of these thirteen kept an account, against the floor of two acknowledgements.
  // Of 60 relays that NIP-66 monitors listed as open, 49 refused a capsule from a key they did not know. Five not
  // on this list held 8 of 8 through the re-read, once: nostr.hanshan.io, relay.nearhood.co.uk, relay.jmoose.rocks,
  // relay-fra.zombi.cloudrodion.com, relay.solomonstr.com. They are candidates for the next run, and are added
  // only if they hold again on another day (CONTRIBUTING.md, "Before a promotion: the relay probe").
], Nr = [
  "wss://purplepag.es",
  "wss://relay.nostr.band",
  "wss://nostr-pub.wellorder.net",
  "wss://relay.primal.net",
  // Added 2026-11-18: relay.nostr.band timed out and nostr-pub.wellorder.net
  // never connected in the same measurement, leaving two working lookups.
  "wss://nos.lol"
], zi = [], Yi = /^[0-9a-f]{64}$/u, Qi = 64;
function Bt(e) {
  return Array.isArray(e) && e.length <= Qi && e.every((t) => typeof t == "string" && at(t)) && new Set(e).size === e.length;
}
function xt(e, t = st, n = -1) {
  if (!t || !Yi.test(t) || /^0{64}$/u.test(t) || !N(e) || e.pubkey !== t || e.kind !== x || Oe(e, "d") !== gr)
    return null;
  try {
    const r = JSON.parse(e.content);
    if (typeof r != "object" || r === null || Array.isArray(r))
      return null;
    const o = r;
    return !Number.isSafeInteger(o.version) || o.version < 1 || o.version <= n || !Bt(o.vaultRelays) || !Bt(o.discoveryRelays) || o.deprecated !== void 0 && !Bt(o.deprecated) ? null : {
      version: o.version,
      vaultRelays: o.vaultRelays,
      discoveryRelays: o.discoveryRelays,
      ...o.deprecated === void 0 ? {} : { deprecated: o.deprecated }
    };
  } catch {
    return null;
  }
}
function Xi(e) {
  return Math.max(0, e - 1);
}
function Qn(e, t, n) {
  const r = t ? n === "vault" ? t.vaultRelays : t.discoveryRelays : [], o = new Set(t?.deprecated ?? []), i = new Set(e), a = [...new Set(r)].filter((s) => !o.has(s) && !i.has(s)).slice(0, Xi(e.length));
  return [...e, ...a];
}
async function Zi(e, t = st, n = -1, r = 6e3) {
  if (!t || e.length === 0)
    return null;
  const o = new K([...e]);
  let i;
  try {
    i = (await o.queryQuorum({ kinds: [x], authors: [t], "#d": [gr], limit: 3 }, r)).outcomes.flatMap((l) => l.events);
  } finally {
    o.closeAll();
  }
  let a = null;
  for (const s of i) {
    const l = xt(s, t, n);
    l && (!a || l.version > a.list.version) && (a = { event: s, list: l });
  }
  return a;
}
const Tr = "bitlogin:bootstrap-relays:v1";
async function Ir(e, t = st) {
  if (!t)
    return null;
  try {
    const n = await e.get(Tr);
    return n ? xt(JSON.parse(n), t) : null;
  } catch {
    return null;
  }
}
function wt(e) {
  return {
    vaultRelays: Qn(Cr, e, "vault"),
    discoveryRelays: Qn(Nr, e, "discovery"),
    listVersion: e?.version ?? null
  };
}
async function ea(e, t = {}) {
  const n = t.maintainerPubkeyHex === void 0 ? st : t.maintainerPubkeyHex, r = await Ir(e, n);
  if (!n)
    return wt(null);
  const o = wt(r), i = r?.version ?? -1;
  try {
    let a = await Zi(t.queryRelayUrls ?? [.../* @__PURE__ */ new Set([...o.vaultRelays, ...o.discoveryRelays])], n, i, t.timeoutMs);
    if (!a) {
      const s = await ta(t.httpsFallbackUrls ?? zi, n, i), l = s ? xt(s, n, i) : null;
      s && l && (a = { event: s, list: l });
    }
    return a ? (await e.set(Tr, JSON.stringify(a.event)), wt(a.list)) : o;
  } catch {
    return o;
  }
}
async function ta(e, t = st, n = -1) {
  if (!t)
    return null;
  for (const r of e)
    try {
      if (new URL(r).protocol !== "https:")
        continue;
      const o = await fetch(r);
      if (!o.ok || Number(o.headers.get("content-length") ?? 0) > 1e6)
        continue;
      const a = await o.text();
      if (a.length > 1e6)
        continue;
      const s = JSON.parse(a);
      if (N(s) && xt(s, t, n))
        return s;
    } catch {
    }
  return null;
}
const Kn = /^[0-9a-f]{64}$/u, na = 8, ra = 4096, oa = 256, ia = 512;
class _e extends Error {
  name = "BunkerUriParseError";
}
class aa extends Error {
  name = "Nip46RequestTimeoutError";
  constructor(t, n) {
    super(`The remote signer did not answer ${t} within ${Math.round(n / 1e3)}s. It may be offline, or waiting for your approval on another device -- check your signer and try again.`);
  }
}
class sa extends Error {
  name = "Nip46ErrorResponse";
}
function ca(e) {
  let t;
  try {
    t = new URL(e.trim());
  } catch {
    return null;
  }
  const n = t.hostname === "localhost" || t.hostname === "127.0.0.1";
  return t.protocol === "https:" || t.protocol === "http:" && n ? t.toString() : null;
}
function la(e) {
  if (e.length > ra)
    throw new _e("That bunker URI is unreasonably long.");
  let t;
  try {
    t = new URL(e.trim());
  } catch {
    throw new _e("That doesn't look like a valid URI.");
  }
  if (t.protocol !== "bunker:")
    throw new _e("A remote-signer URI must start with bunker://");
  const n = (t.host || t.pathname.replace(/^\/+/u, "")).toLowerCase();
  if (!Kn.test(n))
    throw new _e("The bunker URI does not name a valid signer public key.");
  const r = [
    ...new Set(t.searchParams.getAll("relay").map((i) => i.trim()).filter((i) => i.length > 0 && i.length <= ia))
  ].slice(0, na);
  if (r.length === 0)
    throw new _e("The bunker URI names no relays -- without at least one relay= parameter there is no way to reach the signer.");
  const o = t.searchParams.get("secret") ?? void 0;
  if (o && o.length > oa)
    throw new _e("The bunker URI's secret is unreasonably long.");
  return { signerPubkey: n, relayUrls: r, secret: o || void 0 };
}
function ua(e) {
  if (!Kn.test(e.clientPubkey))
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
const da = 12e4;
class Xn {
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
    this.clientSecretKey = t.clientSecretKey, this.clientPubkey = b(t.clientSecretKey), this.pointer = t.pointer, this.conversationKey = we(t.clientSecretKey, t.pointer.signerPubkey), this.onAuthUrl = t.onAuthUrl, this.requestTimeoutMs = t.requestTimeoutMs ?? da, this.conns = t.pointer.relayUrls.map((n) => new Pn(n, { authPrivateKey: t.clientSecretKey }));
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
        kinds: [vt],
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
      n = JSON.parse(bn(this.conversationKey, t.content));
    } catch {
      return;
    }
    if (typeof n.id != "string")
      return;
    const r = this.pending.get(n.id);
    if (r) {
      if (n.result === "auth_url") {
        if (!r.authUrlSeen && typeof n.error == "string" && n.error) {
          const o = ca(n.error);
          o && (r.authUrlSeen = !0, this.onAuthUrl?.(o));
        }
        return;
      }
      if (this.pending.delete(n.id), clearTimeout(r.timer), typeof n.error == "string" && n.error) {
        r.reject(new sa(n.error));
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
    const r = Qe(M(8)), o = Zt(this.conversationKey, JSON.stringify({ id: r, method: t, params: n })), i = [["p", this.pointer.signerPubkey]], a = O({
      pubkey: this.clientPubkey,
      created_at: Math.floor(Date.now() / 1e3),
      kind: vt,
      tags: i,
      content: o
    }, this.clientSecretKey), s = new Promise((d, y) => {
      const h = setTimeout(() => {
        this.pending.delete(r), y(new aa(t, this.requestTimeoutMs));
      }, this.requestTimeoutMs);
      this.pending.set(r, { resolve: d, reject: y, timer: h, authUrlSeen: !1 });
    });
    if (s.catch(() => {
    }), !(await Promise.allSettled(this.conns.map((d) => d.publish(a)))).some((d) => d.status === "fulfilled" && d.value.ok)) {
      const d = this.pending.get(r);
      throw d && (this.pending.delete(r), clearTimeout(d.timer)), new Error("No relay accepted the request to the signer.");
    }
    return s;
  }
  /** bunker:// flow: announce ourselves; any non-error answer is acceptance. */
  async connect() {
    await this.rpc("connect", [this.pointer.signerPubkey, this.pointer.secret ?? ""]);
  }
  async getUserPublicKey() {
    const t = (await this.rpc("get_public_key", [])).trim().toLowerCase();
    if (!Kn.test(t))
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
    if (!N(o))
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
      const t = Qe(M(8)), n = Zt(this.conversationKey, JSON.stringify({ id: t, method: "logout", params: [] }));
      return O({
        pubkey: this.clientPubkey,
        created_at: Math.floor(Date.now() / 1e3),
        kind: vt,
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
    this.pending.clear(), k(this.clientSecretKey), k(this.conversationKey);
  }
}
async function ya(e) {
  const t = b(e.clientSecretKey), n = e.timeoutMs, r = e.relayUrls.map((i) => new Pn(i, { authPrivateKey: e.clientSecretKey })), o = () => {
    for (const i of r)
      i.close();
  };
  return new Promise((i, a) => {
    let s = !1;
    const l = () => u(new Error("The signer-connection attempt was cancelled.")), u = (p) => {
      s || (s = !0, clearTimeout(d), e.signal?.removeEventListener("abort", l), o(), p instanceof Error ? a(p) : i(p));
    }, d = setTimeout(() => u(new Error(`No signer connected within ${Math.round(n / 1e3)}s. Scan or paste the connection code in your signer app, then try again.`)), n);
    if (e.signal?.aborted) {
      l();
      return;
    }
    e.signal?.addEventListener("abort", l, { once: !0 });
    const y = { kinds: [vt], "#p": [t] }, h = (p) => {
      let v, w = null;
      try {
        w = we(e.clientSecretKey, p.pubkey), v = JSON.parse(bn(w, p.content));
      } catch {
        return;
      } finally {
        w && k(w);
      }
      v.result === e.secret && u({ signerPubkey: p.pubkey });
    };
    Promise.allSettled(r.map((p) => p.subscribeLive(y, h))).then((p) => {
      p.some((v) => v.status === "fulfilled") || u(new Error("Could not reach any relay to listen for the signer."));
    });
  });
}
function Sn() {
  const e = globalThis.crypto;
  if (!e || !e.subtle)
    throw new Error("WebCrypto SubtleCrypto is not available in this environment.");
  return e;
}
async function xr(e) {
  if (e.length !== 32)
    throw new Error("AES-256-GCM key must be exactly 32 bytes.");
  return Sn().subtle.importKey("raw", e, "AES-GCM", !1, ["encrypt", "decrypt"]);
}
async function Mr(e, t, n) {
  const r = Qo(), o = await xr(e), i = await Sn().subtle.encrypt({ name: "AES-GCM", iv: r, additionalData: n, tagLength: 128 }, o, t);
  return { nonce: r, ciphertext: new Uint8Array(i) };
}
async function Or(e, t, n, r) {
  const o = await xr(e);
  try {
    const i = await Sn().subtle.decrypt({ name: "AES-GCM", iv: t, additionalData: r, tagLength: 128 }, o, n);
    return new Uint8Array(i);
  } catch {
    throw new Error("AES-256-GCM authentication failed: capsule is corrupted, tampered, or the wrong key was used.");
  }
}
const Dr = `abandon
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
function pa(e, t, n, r) {
  ei(e);
  const o = ti({ dkLen: 32, asyncTick: 10 }, r), { c: i, dkLen: a, asyncTick: s } = o;
  if (Lt(i), Lt(a), Lt(s), i < 1)
    throw new Error("iterations (c) should be >= 1");
  const l = jn(t), u = jn(n), d = new Uint8Array(a), y = br.create(e, l), h = y._cloneInto().update(u);
  return { c: i, dkLen: a, asyncTick: s, DK: d, PRF: y, PRFSalt: h };
}
function fa(e, t, n, r, o) {
  return e.destroy(), t.destroy(), r && r.destroy(), ni(o), n;
}
async function ha(e, t, n, r) {
  const { c: o, dkLen: i, asyncTick: a, DK: s, PRF: l, PRFSalt: u } = pa(e, t, n, r);
  let d;
  const y = new Uint8Array(4), h = Xo(y), p = new Uint8Array(l.outputLen);
  for (let v = 1, w = 0; w < i; v++, w += l.outputLen) {
    const m = s.subarray(w, w + l.outputLen);
    h.setInt32(0, v, !1), (d = u._cloneInto(d)).update(y).digestInto(p), m.set(p.subarray(0, m.length)), await Zo(o - 1, a, () => {
      l._cloneInto(d).update(p).digestInto(p);
      for (let g = 0; g < m.length; g++)
        m[g] ^= p[g];
    });
  }
  return fa(l, u, s, d, p);
}
/*! scure-bip39 - MIT License (c) 2022 Patricio Palladino, Paul Miller (paulmillr.com) */
const va = (e) => e[0] === "あいこくしん";
function Lr(e) {
  if (typeof e != "string")
    throw new TypeError("invalid mnemonic type: " + typeof e);
  return e.normalize("NFKD");
}
function Ur(e) {
  const t = Lr(e), n = t.split(" ");
  if (![12, 15, 18, 21, 24].includes(n.length))
    throw new Error("Invalid mnemonic");
  return { nfkd: t, words: n };
}
function Vr(e) {
  oi(e, 16, 20, 24, 28, 32);
}
const wa = (e) => {
  const t = 8 - e.length / 4;
  return new Uint8Array([kr(e)[0] >> t << t]);
};
function qr(e) {
  if (!Array.isArray(e) || e.length !== 2048 || typeof e[0] != "string")
    throw new Error("Wordlist: expected array of 2048 strings");
  return e.forEach((t) => {
    if (typeof t != "string")
      throw new Error("wordlist: non-string element: " + t);
  }), lt.chain(lt.checksum(1, wa), lt.radix2(11, !0), lt.alphabet(e));
}
function ga(e, t) {
  const { words: n } = Ur(e), r = qr(t).decode(n);
  return Vr(r), r;
}
function ma(e, t) {
  return Vr(e), qr(t).encode(e).join(va(t) ? "　" : " ");
}
function ba(e, t) {
  try {
    ga(e, t);
  } catch {
    return !1;
  }
  return !0;
}
const ka = (e) => Lr("mnemonic" + e);
function Ea(e, t = "") {
  return ha(ri, Ur(e).nfkd, ka(t), { c: 2048, dkLen: 64 });
}
function _a(e) {
  if (e.length !== 16)
    throw new Error("Recovery phrase entropy must be exactly 128 bits (16 bytes).");
  return ma(e, Dr);
}
function Fr(e) {
  try {
    return ba(Br(e), Dr);
  } catch {
    return !1;
  }
}
function Br(e) {
  return e.trim().normalize("NFKD").toLowerCase().split(/\s+/u).join(" ");
}
async function Rn(e) {
  return Ea(Br(e), "");
}
const gt = [1024, 2048, 4096], he = 4;
function Pa(e) {
  const t = he + e.length, n = gt.find((i) => i >= t);
  if (n === void 0)
    throw new Error(`Payload of ${e.length} bytes exceeds the largest padding bucket (${gt[gt.length - 1]} bytes minus ${he}-byte length prefix).`);
  const r = new Uint8Array(n);
  return new DataView(r.buffer).setUint32(0, e.length, !1), r.set(e, he), r;
}
function Ka(e) {
  if (!gt.includes(e.length))
    throw new Error(`Padded plaintext length ${e.length} does not match a known bucket.`);
  const n = new DataView(e.buffer, e.byteOffset, e.byteLength).getUint32(0, !1);
  if (n > e.length - he)
    throw new Error("Declared payload length exceeds the padded bucket size.");
  const r = e.slice(he, he + n), o = e.slice(he + n);
  for (const i of o)
    if (i !== 0)
      throw new Error("Padding bytes are not all zero; capsule plaintext is malformed.");
  return r;
}
function Sa(e) {
  const t = ii(e);
  if (t === void 0)
    throw new Error("Value is not JSON-serializable for canonicalization.");
  return t;
}
function Ra(e) {
  return D(Sa(e));
}
const se = 16, Aa = 283;
function Ca(e) {
  if (![16, 24, 32].includes(e.length))
    throw new Error('"aes key" expected Uint8Array of length 16/24/32, got length=' + e.length);
}
function An(e) {
  return e << 1 ^ Aa & -(e >> 7);
}
function Re(e, t) {
  let n = 0;
  for (; t > 0; t >>= 1)
    n ^= e & -(t & 1), e = An(e);
  return n;
}
const en = /* @__PURE__ */ (() => {
  const e = new Uint8Array(256);
  for (let n = 0, r = 1; n < 256; n++, r ^= An(r))
    e[n] = r;
  const t = new Uint8Array(256);
  t[0] = 99;
  for (let n = 0; n < 255; n++) {
    let r = e[255 - n];
    r |= r << 8, t[e[n]] = (r ^ r >> 4 ^ r >> 5 ^ r >> 6 ^ r >> 7 ^ 99) & 255;
  }
  return Xe(e), t;
})(), Na = /* @__PURE__ */ en.map((e, t) => en.indexOf(t)), Ta = (e) => e << 24 | e >>> 8, Wt = (e) => e << 8 | e >>> 24;
function Wr(e, t) {
  if (e.length !== 256)
    throw new Error("Wrong sbox length");
  const n = new Uint32Array(256).map((u, d) => t(e[d])), r = n.map(Wt), o = r.map(Wt), i = o.map(Wt), a = new Uint32Array(256 * 256), s = new Uint32Array(256 * 256), l = new Uint16Array(256 * 256);
  for (let u = 0; u < 256; u++)
    for (let d = 0; d < 256; d++) {
      const y = u * 256 + d;
      a[y] = n[u] ^ r[d], s[y] = o[u] ^ i[d], l[y] = e[u] << 8 | e[d];
    }
  return { sbox: e, sbox2: l, T0: n, T1: r, T2: o, T3: i, T01: a, T23: s };
}
const Cn = /* @__PURE__ */ Wr(en, (e) => Re(e, 3) << 24 | e << 16 | e << 8 | Re(e, 2)), $r = /* @__PURE__ */ Wr(Na, (e) => Re(e, 11) << 24 | Re(e, 13) << 16 | Re(e, 9) << 8 | Re(e, 14)), Ia = /* @__PURE__ */ (() => {
  const e = new Uint8Array(16);
  for (let t = 0, n = 1; t < 16; t++, n = An(n))
    e[t] = n;
  return e;
})();
function jr(e) {
  kn(e);
  const t = e.length;
  Ca(e);
  const { sbox2: n } = Cn, r = [];
  (!$e || !je(e)) && r.push(e = Ge(e));
  const o = X(ee(e)), i = o.length, a = (l) => B(n, l, l, l, l), s = new Uint32Array(t + 28);
  s.set(o);
  for (let l = i; l < s.length; l++) {
    let u = s[l - 1];
    l % i === 0 ? u = a(Ta(u)) ^ Ia[l / i - 1] : i > 6 && l % i === 4 && (u = a(u)), s[l] = s[l - i] ^ u;
  }
  return Xe(...r), s;
}
function xa(e) {
  const t = jr(e), n = t.slice(), r = t.length, { sbox2: o } = Cn, { T0: i, T1: a, T2: s, T3: l } = $r;
  for (let u = 0; u < r; u += 4)
    for (let d = 0; d < 4; d++)
      n[u + d] = t[r - u - 4 + d];
  Xe(t);
  for (let u = 4; u < r - 4; u++) {
    const d = n[u], y = B(o, d, d, d, d);
    n[u] = i[y & 255] ^ a[y >>> 8 & 255] ^ s[y >>> 16 & 255] ^ l[y >>> 24];
  }
  return n;
}
function te(e, t, n, r, o, i) {
  return e[n << 8 & 65280 | r >>> 8 & 255] ^ t[o >>> 8 & 65280 | i >>> 24 & 255];
}
function B(e, t, n, r, o) {
  return e[t & 255 | n & 65280] | e[r >>> 16 & 255 | o >>> 16 & 65280] << 16;
}
function Zn(e, t, n, r, o) {
  const { sbox2: i, T01: a, T23: s } = Cn;
  let l = 0;
  t ^= e[l++], n ^= e[l++], r ^= e[l++], o ^= e[l++];
  const u = e.length / 4 - 2;
  for (let v = 0; v < u; v++) {
    const w = e[l++] ^ te(a, s, t, n, r, o), m = e[l++] ^ te(a, s, n, r, o, t), g = e[l++] ^ te(a, s, r, o, t, n), E = e[l++] ^ te(a, s, o, t, n, r);
    t = w, n = m, r = g, o = E;
  }
  const d = e[l++] ^ B(i, t, n, r, o), y = e[l++] ^ B(i, n, r, o, t), h = e[l++] ^ B(i, r, o, t, n), p = e[l++] ^ B(i, o, t, n, r);
  return { s0: d, s1: y, s2: h, s3: p };
}
function Ma(e, t, n, r, o) {
  const { sbox2: i, T01: a, T23: s } = $r;
  let l = 0;
  t ^= e[l++], n ^= e[l++], r ^= e[l++], o ^= e[l++];
  const u = e.length / 4 - 2;
  for (let v = 0; v < u; v++) {
    const w = e[l++] ^ te(a, s, t, o, r, n), m = e[l++] ^ te(a, s, n, t, o, r), g = e[l++] ^ te(a, s, r, n, t, o), E = e[l++] ^ te(a, s, o, r, n, t);
    t = w, n = m, r = g, o = E;
  }
  const d = e[l++] ^ B(i, t, o, r, n), y = e[l++] ^ B(i, n, t, o, r), h = e[l++] ^ B(i, r, n, t, o), p = e[l++] ^ B(i, o, r, n, t);
  return { s0: d, s1: y, s2: h, s3: p };
}
function Oa(e) {
  if (kn(e), e.length % se !== 0)
    throw new Error("aes-(cbc/ecb).decrypt ciphertext should consist of blocks with size " + se);
}
function Da(e, t, n) {
  kn(e);
  let r = e.length;
  const o = r % se;
  if (!t && o !== 0)
    throw new Error("aec/(cbc-ecb): unpadded plaintext with disabled padding");
  if (t) {
    let s = se - o;
    s || (s = se), r = r + s;
  }
  n = Sr(r, n), Rr(e, n), (!$e || !je(e)) && (e = Ge(e));
  const i = ee(e);
  X(i);
  const a = ee(n);
  return { b: i, o: a, out: n };
}
function La(e, t) {
  if (!t)
    return e;
  const n = e.length;
  if (n === 0)
    throw new Error("aes/pkcs7: empty ciphertext not allowed");
  const r = e[n - 1];
  let o = 1;
  o &= r - 1 >>> 31 ^ 1, o &= 16 - r >>> 31 ^ 1;
  for (let i = 0; i < 16; i++) {
    const a = i - r >>> 31, s = (e[n - 1 - i] ^ r) === 0 ? 1 : 0;
    o &= s | a ^ 1;
  }
  if (!o)
    throw new Error("aes/pkcs7: wrong padding");
  return e.subarray(0, n - r);
}
function Ua(e) {
  const t = new Uint8Array(16), n = ee(t);
  t.set(e);
  const r = se - e.length;
  for (let o = se - r; o < se; o++)
    t[o] = r;
  return n;
}
const Gr = /* @__PURE__ */ fi({ blockSize: 16, nonceLength: 16 }, function(t, n, r = {}) {
  const o = !r.disablePadding;
  return {
    encrypt(i, a) {
      const s = jr(t), { b: l, o: u, out: d } = Da(i, o, a);
      let y = n;
      const h = [s];
      (!$e || !je(y)) && h.push(y = Ge(y));
      const p = ee(y);
      X(p);
      let v = p[0], w = p[1], m = p[2], g = p[3], E = 0;
      for (; E + 4 <= l.length; )
        v ^= l[E + 0], w ^= l[E + 1], m ^= l[E + 2], g ^= l[E + 3], { s0: v, s1: w, s2: m, s3: g } = Zn(s, v, w, m, g), u[E++] = v, u[E++] = w, u[E++] = m, u[E++] = g;
      if (o) {
        const _ = Ua(i.subarray(E * 4));
        X(_), v ^= _[0], w ^= _[1], m ^= _[2], g ^= _[3], { s0: v, s1: w, s2: m, s3: g } = Zn(s, v, w, m, g), u[E++] = v, u[E++] = w, u[E++] = m, u[E++] = g;
      }
      return X(u), Xe(...h), d;
    },
    decrypt(i, a) {
      Oa(i);
      const s = xa(t);
      let l = n;
      const u = [s];
      (!$e || !je(l)) && u.push(l = Ge(l));
      const d = ee(l);
      X(d), a = Sr(i.length, a), Rr(i, a), (!$e || !je(i)) && u.push(i = Ge(i));
      const y = ee(i), h = ee(a);
      X(y);
      let p = d[0], v = d[1], w = d[2], m = d[3];
      for (let g = 0; g + 4 <= y.length; ) {
        const E = p, _ = v, I = w, V = m;
        p = y[g + 0], v = y[g + 1], w = y[g + 2], m = y[g + 3];
        const { s0: $, s1: Ee, s2: de, s3: Ot } = Ma(s, p, v, w, m);
        h[g++] = $ ^ E, h[g++] = Ee ^ _, h[g++] = de ^ I, h[g++] = Ot ^ V;
      }
      return X(h), Xe(...u), La(a, o);
    }
  };
});
function Hr(e, t) {
  const n = wn(new Uint8Array([2]), Er(t));
  return ai.getSharedSecret(e, n, !0).slice(1, 33);
}
function Va(e, t, n) {
  return qa(e, t, n, M(16));
}
function qa(e, t, n, r) {
  if (r.length !== 16)
    throw new Error("NIP-04 iv must be exactly 16 bytes.");
  const o = Hr(e, t), i = Gr(o, r).encrypt(D(n));
  return `${_t.encode(i)}?iv=${_t.encode(r)}`;
}
function Fa(e, t, n) {
  const r = n.indexOf("?iv=");
  if (r === -1)
    throw new Error('NIP-04 payload is missing its "?iv=" suffix.');
  const o = _t.decode(n.slice(0, r)), i = _t.decode(n.slice(r + 4)), a = Hr(e, t), s = Gr(a, i).decrypt(o);
  return vn(s);
}
class be extends Error {
  reason;
  constructor(t) {
    super("Account not found or credentials incorrect."), this.name = "AccountNotFoundError", this.reason = t;
  }
}
class ne extends Error {
  constructor(t) {
    super(t), this.name = "RegistrationFailedError";
  }
}
class Jr extends Error {
  constructor(t = "An account already exists with this login name and password. Sign in instead, or choose different credentials.") {
    super(t), this.name = "AccountAlreadyExistsError";
  }
}
class re extends Error {
  constructor(t) {
    super(t), this.name = "RecoveryFailedError";
  }
}
class zr extends Error {
  seenGeneration;
  capsuleGeneration;
  constructor(t, n) {
    super(`This credential capsule reports generation ${n}, but this device has already seen generation ${t}. Refusing to log in with older, possibly-revoked credentials.`), this.name = "RollbackDetectedError", this.seenGeneration = t, this.capsuleGeneration = n;
  }
}
function et(e, t) {
  const n = t ?? Math.floor(Date.now() / 1e3);
  return e == null ? n : Math.max(n, e + 1);
}
const Ba = { generation: -1, recoveryGeneration: -1 };
function Nn(e) {
  return `bitlogin:hwm:${e}`;
}
async function Tn(e, t) {
  const n = await e.get(Nn(t));
  return n ? JSON.parse(n) : Ba;
}
async function Yr(e, t, n) {
  const r = await Tn(e, t), o = {
    generation: Math.max(r.generation, n.generation ?? -1),
    recoveryGeneration: Math.max(r.recoveryGeneration, n.recoveryGeneration ?? -1)
  };
  return await e.set(Nn(t), JSON.stringify(o)), o;
}
async function Wa(e, t, n = { generation: 0, recoveryGeneration: -1 }) {
  await e.set(Nn(t), JSON.stringify(n));
}
function $a(e, t, n) {
  return O({ pubkey: b(e), created_at: n, kind: Et, tags: [], content: JSON.stringify(t) }, e);
}
function ja(e, t, n) {
  const r = t.map((o) => {
    const i = ["r", o.url];
    return o.read && !o.write && i.push("read"), o.write && !o.read && i.push("write"), i;
  });
  return O({ pubkey: b(e), created_at: n, kind: ze, tags: r, content: "" }, e);
}
function Ga(e, t, n) {
  return O({
    pubkey: b(e),
    created_at: n,
    kind: pn,
    tags: t.map((r) => ["relay", r]),
    content: ""
  }, e);
}
function Ha(e) {
  return e.tags.filter((t) => t[0] === "r" && t[1]).map((t) => t[1]);
}
function Ja(e) {
  return e.tags.filter((t) => t[0] === "relay" && t[1]).map((t) => t[1]);
}
async function za(e) {
  const t = b(e.everydayPrivateKey), n = Math.floor(Date.now() / 1e3), r = [.../* @__PURE__ */ new Set([...e.generalRelays, ...e.dmRelays, ...e.discoveryRelays])], o = new K(r), [i, a, s] = await Promise.all([
    o.queryQuorum({ authors: [t], kinds: [Et] }),
    o.queryQuorum({ authors: [t], kinds: [ze] }),
    o.queryQuorum({ authors: [t], kinds: [pn] })
  ]);
  o.closeAll();
  const l = i.outcomes.some((m) => m.events.length > 0), u = a.outcomes.some((m) => m.events.length > 0), d = s.outcomes.some((m) => m.events.length > 0), y = new K(r);
  let h = null, p = null, v = null;
  const w = [];
  if (!l && (e.name || e.about || e.picture)) {
    const m = $a(e.everydayPrivateKey, { name: e.name, about: e.about, picture: e.picture }, n);
    w.push(y.publishAll(m).then((g) => void (h = g)));
  }
  if (!u) {
    const m = ja(e.everydayPrivateKey, e.generalRelays.map((g) => ({ url: g, read: !0, write: !0 })), n);
    w.push(y.publishAll(m).then((g) => void (p = g)));
  }
  if (!d) {
    const m = Ga(e.everydayPrivateKey, e.dmRelays, n);
    w.push(y.publishAll(m).then((g) => void (v = g)));
  }
  return await Promise.all(w), y.closeAll(), {
    profilePublished: h !== null && ge(h) > 0,
    relayListAcknowledgedCount: p !== null ? ge(p) : 0,
    dmRelayListAcknowledgedCount: v !== null ? ge(v) : 0,
    profileSkippedExisting: l,
    relayListSkippedExisting: u,
    dmRelayListSkippedExisting: d
  };
}
async function ke(e, t, n) {
  const r = n.minAcks ?? 2, o = n.minReadbacks ?? 2, i = await e.publishAll(t, n.timeoutMs), a = ge(i), l = (await e.queryQuorum({ kinds: [x], authors: [t.pubkey], "#d": [n.dTag], limit: 5 }, n.timeoutMs)).outcomes.filter((u) => u.events.some((d) => d.id === t.id)).length;
  return {
    acknowledgedCount: a,
    readbackVerifiedCount: l,
    success: a >= r && l >= o
  };
}
function Qr(e) {
  return D(`bitlogin|password-capsule|v1|${e}|30078|bitlogin:password:v1`);
}
function Xr(e) {
  return D(`bitlogin|recovery-capsule|v1|${e}|30078|bitlogin:recovery:v1`);
}
async function In(e, t, n) {
  const r = Ra(e), o = Pa(r), i = await Mr(t, o, n);
  return {
    version: 1,
    algorithm: "aes-256-gcm",
    nonce: C(i.nonce),
    ciphertext: C(i.ciphertext)
  };
}
async function xn(e, t, n) {
  if (e.version !== 1 || e.algorithm !== "aes-256-gcm")
    throw new Error(`Unsupported capsule envelope version/algorithm: ${e.version}/${e.algorithm}`);
  const r = T(e.nonce), o = T(e.ciphertext), i = await Or(t, r, o, n), a = Ka(i);
  return JSON.parse(vn(a));
}
class Mn extends Error {
  constructor(t) {
    super(t), this.name = "CapsuleValidationError";
  }
}
const Ya = 1e6, Qa = /^[0-9a-f]{64}$/u;
function A(e, t) {
  if (!e)
    throw new Mn(t);
}
function St(e) {
  return typeof e == "string" && Qa.test(e);
}
function Zr(e) {
  A(Array.isArray(e), "vault_relay_hints must be an array (§12.4.7).");
  for (const t of e)
    A(typeof t == "string", "Each relay hint must be a string (§12.4.7)."), A(at(t), `Relay URL must use secure WebSockets, except for an explicit loopback development endpoint (§12.4.7): ${t}`);
}
function eo(e) {
  A(typeof e == "string", "account_id must be a string (§12.4.2).");
  let t;
  try {
    t = T(e);
  } catch {
    throw new Mn("account_id is not valid base64url (§12.4.2).");
  }
  A(t.length === 16, "account_id must decode to exactly 128 bits (§12.4.2).");
}
function to(e, t) {
  A(typeof e == "string", "operational_private_key must be a string (§12.4.3).");
  const n = T(e);
  A(n.length === 32, "operational_private_key must be exactly 32 bytes (§12.4.3)."), A(gn(n), "operational_private_key is not a valid secp256k1 scalar (§12.4.3)."), A(St(t), "operational_public_key must be lowercase 64-char hex (§12.4.4).");
  const r = b(n);
  A(r === t, "operational_public_key does not match the derived public key (§12.4.4).");
}
function Rt(e, t) {
  A(typeof t == "string", `${e} must be a string (§CV5.2).`);
  let n;
  try {
    n = T(t);
  } catch {
    throw new Mn(`${e} is not valid base64url (§CV5.2).`);
  }
  A(n.length === 32, `${e} must decode to exactly 32 bytes (§CV5.2).`);
}
function Xa(e) {
  const t = e.connection_vault_root, n = e.vault_sudo_key;
  t === void 0 && n === void 0 || (A(t !== void 0 && n !== void 0, "connection_vault_root and vault_sudo_key must appear together (§CV5.2)."), Rt("connection_vault_root", t), Rt("vault_sudo_key", n));
}
function Za(e) {
  const t = e.connection_vault_root, n = e.vault_sudo_key;
  t === void 0 && n === void 0 || (A(t !== void 0, "vault_sudo_key cannot appear without connection_vault_root (§CV5.2)."), Rt("connection_vault_root", t), n !== void 0 && Rt("vault_sudo_key", n));
}
function no(e, t) {
  A(Number.isInteger(e) && e >= 0 && e <= Ya, `${t} is out of supported bounds (§12.4.8).`);
}
function es(e) {
  A(e.schema === Tt, `Unsupported or unknown schema: ${String(e.schema)} (§12.4.1)`), eo(e.account_id), no(e.generation, "generation"), to(e.operational_private_key, e.operational_public_key), A(St(e.recovery_public_key), "recovery_public_key must be lowercase 64-char hex (§12.4.5)."), Zr(e.vault_relay_hints), Za(e);
  const t = e.recovery_capsule_event;
  A(!!t && typeof t == "object", "recovery_capsule_event must be present (§12.4.6)."), A(N(t), "Embedded recovery_capsule_event has an invalid event id or signature (§12.4.6)."), A(t.pubkey === e.recovery_public_key, "Embedded recovery_capsule_event author does not match recovery_public_key (§12.4.5).");
}
function ts(e) {
  A(e.schema === Nt, `Unsupported or unknown schema: ${String(e.schema)} (§12.4.1)`), eo(e.account_id), no(e.recovery_generation, "recovery_generation"), A(e.previous_recovery_event_id === null || St(e.previous_recovery_event_id), "previous_recovery_event_id must be null or lowercase 64-char hex (§12.3)."), to(e.operational_private_key, e.operational_public_key), A(St(e.recovery_public_key), "recovery_public_key must be lowercase 64-char hex."), Zr(e.vault_relay_hints), Xa(e);
}
function ns(e) {
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
async function On(e) {
  const t = b(e.locatorPrivateKey), n = await In(e.payload, e.capsuleKey, Qr(t));
  return O({
    pubkey: t,
    created_at: e.payload.created_at,
    kind: x,
    tags: [["d", Me]],
    content: JSON.stringify(n)
  }, e.locatorPrivateKey);
}
function rs(e) {
  const t = b(e.oldLocatorPrivateKey);
  return O({
    pubkey: t,
    created_at: e.createdAt,
    kind: x,
    tags: [["d", Me]],
    content: ""
  }, e.oldLocatorPrivateKey);
}
async function os(e, t) {
  if (!N(e))
    throw new Error("Credential capsule event has an invalid id or signature.");
  const n = JSON.parse(e.content), r = await xn(n, t, Qr(e.pubkey));
  return es(r), r;
}
async function Dn(e) {
  const t = b(e.recoveryPrivateKey), n = await In(e.payload, e.capsuleKey, Xr(t));
  return O({
    pubkey: t,
    created_at: e.payload.created_at,
    kind: x,
    tags: [["d", ot]],
    content: JSON.stringify(n)
  }, e.recoveryPrivateKey);
}
async function ro(e, t) {
  if (!N(e))
    throw new Error("Recovery capsule event has an invalid id or signature.");
  const n = JSON.parse(e.content), r = await xn(n, t, Xr(e.pubkey));
  return ts(r), r;
}
function er(e, t, n) {
  const r = /* @__PURE__ */ new Map();
  for (const o of e)
    o.pubkey === t && o.kind === x && Oe(o, "d") === n && N(o) && r.set(o.id, o);
  return [...r.values()].sort((o, i) => i.created_at - o.created_at);
}
async function oo(e, t, n, r, o) {
  const i = await e.queryQuorum({ kinds: [x], authors: [t], "#d": [n], limit: 5 }, o), a = i.outcomes.flatMap((h) => h.events), s = er(a, t, n), l = [];
  for (const h of s)
    try {
      const p = await r(h);
      l.push({ event: h, payload: p });
    } catch (p) {
      l.push({ event: h, payload: null, error: p.message });
    }
  const u = l.find((h) => h.payload !== null) ?? null, d = i.outcomes.map((h) => ({
    responded: h.responded,
    events: er(h.events, t, n)
  })).filter((h) => h.responded && h.events.length > 0).map((h) => h.events[0].id), y = new Set(d).size > 1;
  return {
    quorumMet: i.quorumMet,
    respondedCount: i.respondedCount,
    totalCount: i.totalCount,
    candidates: l,
    best: u,
    relayDisagreement: y
  };
}
async function tt(e, t, n, r = 8e3) {
  return oo(e, t, Me, (o) => os(o, n), r);
}
async function io(e, t, n, r = 8e3) {
  return oo(e, t, ot, (o) => ro(o, n), r);
}
function is(e) {
  const t = e.filter((n) => n.payload !== null);
  return t.length < 2 ? { consistent: !0 } : ns(t.map((n) => ({
    eventId: n.event.id,
    recoveryGeneration: n.payload.recovery_generation,
    previousRecoveryEventId: n.payload.previous_recovery_event_id
  })));
}
async function tr(e) {
  const t = [...new Set(e.relayUrls)], n = async (s) => {
    const l = new K(t);
    try {
      const u = await l.publishAll(s, e.timeoutMs);
      return new Map(u.map((d) => [
        d.relayUrl,
        { ok: d.result.ok, message: d.result.message ?? "" }
      ]));
    } finally {
      l.closeAll();
    }
  }, [r, o] = await Promise.all([
    n(e.credentialEvent),
    n(e.recoveryEvent)
  ]), i = { ok: !1, message: "no reply" }, a = t.map((s) => ({
    relayUrl: s,
    credential: r.get(s) ?? i,
    recovery: o.get(s) ?? i
  }));
  return {
    credentialAcknowledgedCount: a.filter((s) => s.credential.ok).length,
    recoveryAcknowledgedCount: a.filter((s) => s.recovery.ok).length,
    relaysTried: a.length,
    relays: a
  };
}
function as(e) {
  const t = Oe(e, "d");
  if (e.kind !== x || t === void 0 || !N(e))
    throw new Error("This session's capsule event is not a valid capsule.");
  return { pubkey: e.pubkey, dTag: t };
}
function ss(e, t, n) {
  const r = e.filter((i) => i.pubkey === n.pubkey && i.kind === x && Oe(i, "d") === n.dTag && N(i));
  return r.some((i) => i.id === t.id) ? "current" : r.length === 0 ? "missing" : Math.max(...r.map((i) => i.created_at)) >= t.created_at ? "newer" : "older";
}
async function nr(e, t, n) {
  const r = as(t), o = new K(e);
  try {
    const i = await o.queryQuorum({
      kinds: [x],
      authors: [r.pubkey],
      "#d": [r.dTag],
      limit: 5
    }, n);
    return new Map(i.outcomes.map((a) => [
      a.relayUrl,
      a.responded ? { status: ss(a.events, t, r) } : { status: "unreachable", error: a.error }
    ]));
  } finally {
    o.closeAll();
  }
}
async function cs(e) {
  const t = [...new Set(e.relayUrls)], [n, r] = await Promise.all([
    nr(t, e.credentialEvent, e.timeoutMs),
    nr(t, e.recoveryEvent, e.timeoutMs)
  ]), o = t.map((i) => {
    const a = n.get(i) ?? { status: "unreachable" }, s = r.get(i) ?? { status: "unreachable" }, l = a.error ?? s.error;
    return {
      relayUrl: i,
      credential: a.status,
      recovery: s.status,
      ...l ? { error: l } : {}
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
const Ln = Ho.id, Ce = "aes-256-gcm-v1", Ne = "bitlogin-bip39-hkdf-v1", ao = "bitlogin-recovery-hkdf-v1", ls = 4, us = 64;
function Te(e) {
  return [...new Set(e)].filter((t) => t.length <= us).slice(0, ls);
}
function Ie(e) {
  return e ? { everyday_derivation: ao } : {};
}
function so(e) {
  return e.protocol?.everyday_derivation === ao;
}
async function co(e) {
  const t = It(e.loginName), n = e.now ?? Math.floor(Date.now() / 1e3), { locatorPrivateKey: r, capsuleKey: o } = await Ye(e.password, t);
  try {
    const i = b(r), a = new K(e.vaultRelayUrls, {
      authPrivateKey: r
    });
    let s;
    try {
      s = await tt(a, i, o, e.timeoutMs);
    } finally {
      a.closeAll();
    }
    if (!s.quorumMet)
      throw new ne("Couldn't verify this login name and password aren't already registered. Please retry, or add more vault relays.");
    if (s.candidates.length > 0)
      throw new Jr();
    const l = e.everydayPrivateKey !== void 0;
    if (l && !gn(e.everydayPrivateKey))
      throw new ne("The provided key is not a valid secp256k1 private key.");
    const u = _a(si()), d = await Rn(u);
    let y, h, p;
    try {
      ({ recoveryPrivateKey: y, capsuleKey: h } = fn(d)), p = l ? e.everydayPrivateKey : hn(d);
    } finally {
      k(d);
    }
    const v = !l, w = M(32), m = M(32);
    let g = !1;
    try {
      const E = b(y), _ = b(p), I = C(_r()), V = {
        schema: Nt,
        account_id: I,
        recovery_generation: 0,
        previous_recovery_event_id: null,
        operational_private_key: C(p),
        operational_public_key: _,
        recovery_public_key: E,
        connection_vault_root: C(w),
        vault_sudo_key: C(m),
        created_at: n,
        vault_relay_hints: Te(e.vaultRelayUrls),
        protocol: {
          capsule_encryption: Ce,
          recovery_derivation: Ne,
          ...Ie(v)
        }
      }, $ = await Dn({
        recoveryPrivateKey: y,
        capsuleKey: h,
        payload: V
      }), Ee = new K(e.vaultRelayUrls, {
        authPrivateKey: y
      });
      let de;
      try {
        de = await ke(Ee, $, {
          dTag: ot,
          minAcks: e.minAcknowledgements,
          timeoutMs: e.timeoutMs
        });
      } finally {
        Ee.closeAll();
      }
      if (!de.success)
        throw new ne("The recovery capsule did not reach the required relay acknowledgement and readback quorum. No login credential was published. Please retry, or add more vault relays.");
      const Ot = {
        schema: Tt,
        account_id: I,
        generation: 0,
        operational_private_key: C(p),
        operational_public_key: _,
        recovery_public_key: E,
        recovery_capsule_event: $,
        connection_vault_root: C(w),
        created_at: n,
        vault_relay_hints: Te(e.vaultRelayUrls),
        protocol: {
          password_kdf: Ln,
          capsule_encryption: Ce,
          recovery_derivation: Ne,
          ...Ie(v)
        }
      }, Wn = await On({
        locatorPrivateKey: r,
        capsuleKey: o,
        payload: Ot
      }), $n = new K(e.vaultRelayUrls, {
        authPrivateKey: r
      });
      let Dt;
      try {
        Dt = await ke($n, Wn, {
          dTag: Me,
          minAcks: e.minAcknowledgements,
          timeoutMs: e.timeoutMs
        });
      } finally {
        $n.closeAll();
      }
      if (!Dt.success)
        throw new ne("Registration did not reach the required credential acknowledgement and readback quorum. Please retry, or add more vault relays.");
      return g = !0, {
        normalizedLoginName: t,
        recoveryPhrase: u,
        everydayPrivateKey: p,
        everydayPublicKey: _,
        recoveryPublicKey: E,
        locatorPublicKey: i,
        accountId: I,
        imported: l,
        everydayKeyDerived: v,
        connectionVaultRoot: w,
        vaultSudoKey: m,
        credentialEvent: Wn,
        recoveryEvent: $,
        credentialPublish: Dt,
        recoveryPublish: de
      };
    } finally {
      k(y, h), g || (l || k(p), k(w, m));
    }
  } finally {
    k(r, o);
  }
}
async function ds(e) {
  const { nsecOrHex: t, ...n } = e, r = lo(t);
  return co({ ...n, everydayPrivateKey: r });
}
function lo(e) {
  const t = e.trim();
  let n;
  if (t.startsWith("nsec1"))
    n = Jo(t);
  else if (/^[0-9a-fA-F]{64}$/u.test(t))
    n = Er(t.toLowerCase());
  else
    throw new ne("Enter a valid nsec (nsec1…) or a 64-character hex private key.");
  if (!gn(n))
    throw new ne("The provided key is not a valid secp256k1 private key.");
  return n;
}
class uo {
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
async function ys(e) {
  const t = It(e.loginName), { locatorPrivateKey: n, capsuleKey: r } = await Ye(e.password, t), o = b(n), i = new K(e.vaultRelayUrls, {
    authPrivateKey: n
  });
  try {
    const a = await tt(i, o, r, e.timeoutMs);
    if (!a.quorumMet)
      throw new be("quorum-not-met");
    if (!a.best)
      throw new be(a.candidates.length > 0 ? "no-valid-candidate" : "no-matching-event");
    const s = a.best.payload, l = e.store ?? new uo(), u = await Tn(l, s.operational_public_key), d = s.generation < u.generation;
    if (d && !e.acknowledgeRollback)
      throw new zr(u.generation, s.generation);
    const y = d ? `This device previously saw credential generation ${u.generation}, but the accepted capsule is generation ${s.generation}. Relays may be serving stale data, or an old capsule is being replayed.` : void 0;
    await Yr(l, s.operational_public_key, {
      generation: s.generation
    });
    const h = a.relayDisagreement ? 'Configured relays returned different credential capsules as "latest" for this account. Some relays may be stale, censored, or malicious.' : void 0;
    return {
      everydayPrivateKey: T(s.operational_private_key),
      everydayPublicKey: s.operational_public_key,
      recoveryPublicKey: s.recovery_public_key,
      accountId: s.account_id,
      generation: s.generation,
      everydayKeyDerived: so(s),
      credentialEvent: a.best.event,
      recoveryCapsuleEvent: s.recovery_capsule_event,
      connectionVaultRoot: s.connection_vault_root ? T(s.connection_vault_root) : void 0,
      rollbackWarning: y,
      relayDisagreementWarning: h
    };
  } finally {
    i.closeAll();
  }
}
function rr(e) {
  return e.filter((t) => N(t)).sort((t, n) => n.created_at - t.created_at)[0];
}
async function ps(e) {
  if (!Fr(e.phrase))
    throw new re("This does not look like a valid 12-word BitLogin recovery phrase.");
  const t = await Rn(e.phrase), { recoveryPrivateKey: n, capsuleKey: r } = fn(t), o = hn(t), i = b(o);
  k(t, o);
  const a = b(n), s = new K(e.vaultRelayUrls, {
    authPrivateKey: n
  });
  let l;
  try {
    l = await io(s, a, r, e.timeoutMs);
  } finally {
    s.closeAll();
  }
  if (e.offlineRecoveryCapsuleEvents?.length) {
    const w = [];
    for (const _ of e.offlineRecoveryCapsuleEvents)
      if (N(_))
        try {
          w.push({
            event: _,
            payload: await ro(_, r)
          });
        } catch (I) {
          w.push({
            event: _,
            payload: null,
            error: I.message
          });
        }
    const m = /* @__PURE__ */ new Map();
    for (const _ of [...l.candidates, ...w])
      m.set(_.event.id, _);
    const g = [...m.values()].sort((_, I) => I.event.created_at - _.event.created_at), E = g.find((_) => _.payload !== null) ?? null;
    l = {
      ...l,
      candidates: g,
      best: E,
      quorumMet: l.quorumMet || E !== null
    };
  }
  if (!l.quorumMet)
    throw new be("quorum-not-met");
  if (!l.best)
    throw new be(l.candidates.length > 0 ? "no-valid-candidate" : "no-matching-event");
  const u = l.best.payload, d = is(l.candidates), y = T(u.operational_private_key), h = u.operational_public_key, { generalRelays: p, dmRelays: v } = await yo(h, [...e.discoveryRelayUrls, ...u.vault_relay_hints], e.timeoutMs);
  return {
    everydayPrivateKey: y,
    everydayPublicKey: h,
    recoveryPrivateKey: n,
    recoveryPublicKey: a,
    recoveryCapsuleKey: r,
    accountId: u.account_id,
    currentRecoveryEvent: l.best.event,
    currentRecoveryPayload: u,
    generalRelays: p,
    dmRelays: v,
    chainWarning: d.consistent ? void 0 : d.warning,
    everydayKeyDerived: h === i
  };
}
async function yo(e, t, n) {
  const r = new K([...new Set(t)]);
  let o = [], i = [];
  try {
    const a = await r.queryQuorum({ kinds: [ze], authors: [e], limit: 5 }, n), s = rr(a.outcomes.flatMap((d) => d.events));
    s && (o = Ha(s));
    const l = await r.queryQuorum({ kinds: [pn], authors: [e], limit: 5 }, n), u = rr(l.outcomes.flatMap((d) => d.events));
    u && (i = Ja(u));
  } finally {
    r.closeAll();
  }
  return { generalRelays: o, dmRelays: i };
}
async function po(e) {
  if (!Fr(e))
    throw new re("This does not look like a valid 12-word BitLogin recovery phrase.");
  const t = await Rn(e);
  try {
    const { recoveryPrivateKey: n, capsuleKey: r } = fn(t), o = hn(t);
    return {
      recoveryPrivateKey: n,
      recoveryPublicKey: b(n),
      capsuleKey: r,
      everydayPrivateKey: o,
      everydayPublicKey: b(o)
    };
  } finally {
    k(t);
  }
}
async function fo(e, t, n) {
  const r = new K(t, {
    authPrivateKey: e.recoveryPrivateKey
  });
  let o;
  try {
    o = await io(r, e.recoveryPublicKey, e.capsuleKey, n);
  } finally {
    r.closeAll();
  }
  if (!o.quorumMet)
    throw new be("quorum-not-met");
  if (o.best)
    throw new re("This account's recovery capsule is still on the relays. Use normal recovery instead of a rebuild.");
  return o.candidates.length > 0 ? Math.max(...o.candidates.map((i) => i.event.created_at)) : null;
}
async function fs(e) {
  const t = await po(e.phrase);
  try {
    await fo(t, e.vaultRelayUrls, e.timeoutMs);
    const n = new K([
      .../* @__PURE__ */ new Set([...e.discoveryRelayUrls, ...e.vaultRelayUrls])
    ]);
    try {
      const o = (await n.queryQuorum({
        kinds: [Et, ze],
        authors: [t.everydayPublicKey],
        limit: 10
      }, e.timeoutMs)).outcomes.flatMap((i) => i.events).filter((i) => i.pubkey === t.everydayPublicKey && N(i));
      return {
        everydayPublicKey: t.everydayPublicKey,
        profileFound: o.some((i) => i.kind === Et),
        relayListFound: o.some((i) => i.kind === ze)
      };
    } finally {
      n.closeAll();
    }
  } finally {
    k(t.recoveryPrivateKey, t.capsuleKey, t.everydayPrivateKey);
  }
}
async function hs(e) {
  const t = e.now ?? Math.floor(Date.now() / 1e3), n = await po(e.phrase);
  let r = !1;
  try {
    const o = await fo(n, e.vaultRelayUrls, e.timeoutMs), i = {
      schema: Nt,
      account_id: C(_r()),
      recovery_generation: 0,
      previous_recovery_event_id: null,
      operational_private_key: C(n.everydayPrivateKey),
      operational_public_key: n.everydayPublicKey,
      recovery_public_key: n.recoveryPublicKey,
      connection_vault_root: C(M(32)),
      vault_sudo_key: C(M(32)),
      created_at: o === null ? t : et(o, t),
      vault_relay_hints: Te(e.vaultRelayUrls),
      protocol: {
        capsule_encryption: Ce,
        recovery_derivation: Ne,
        ...Ie(!0)
      }
    }, a = await Dn({
      recoveryPrivateKey: n.recoveryPrivateKey,
      capsuleKey: n.capsuleKey,
      payload: i
    }), s = new K(e.vaultRelayUrls, {
      authPrivateKey: n.recoveryPrivateKey
    });
    let l;
    try {
      l = await ke(s, a, {
        dTag: ot,
        minAcks: e.minAcknowledgements,
        timeoutMs: e.timeoutMs
      });
    } finally {
      s.closeAll();
    }
    if (!l.success)
      throw new re("Could not publish the rebuilt recovery capsule to enough relays. Nothing else was changed; please retry.");
    const { generalRelays: u, dmRelays: d } = await yo(n.everydayPublicKey, [...e.discoveryRelayUrls, ...e.vaultRelayUrls], e.timeoutMs);
    return r = !0, {
      everydayPrivateKey: n.everydayPrivateKey,
      everydayPublicKey: n.everydayPublicKey,
      recoveryPrivateKey: n.recoveryPrivateKey,
      recoveryPublicKey: n.recoveryPublicKey,
      recoveryCapsuleKey: n.capsuleKey,
      accountId: i.account_id,
      currentRecoveryEvent: a,
      currentRecoveryPayload: i,
      generalRelays: u,
      dmRelays: d,
      everydayKeyDerived: !0
    };
  } finally {
    r || k(n.recoveryPrivateKey, n.capsuleKey, n.everydayPrivateKey);
  }
}
async function vs(e) {
  const t = e.now ?? Math.floor(Date.now() / 1e3), n = It(e.newLoginName), { recovered: r } = e, o = r.currentRecoveryPayload.connection_vault_root !== void 0 ? {
    connection_vault_root: r.currentRecoveryPayload.connection_vault_root,
    vault_sudo_key: r.currentRecoveryPayload.vault_sudo_key
  } : {}, i = r.currentRecoveryPayload.connection_vault_root !== void 0 ? {
    connection_vault_root: r.currentRecoveryPayload.connection_vault_root
  } : {}, { locatorPrivateKey: a, capsuleKey: s } = await Ye(e.newPassword, n);
  try {
    const l = b(a), u = new K(e.vaultRelayUrls, {
      authPrivateKey: a
    });
    let d;
    try {
      d = await tt(u, l, s, e.timeoutMs);
    } finally {
      u.closeAll();
    }
    if (!d.quorumMet)
      throw new re("Couldn't verify the new login name and password aren't already registered. Please retry, or add more vault relays.");
    const y = d.best?.payload ?? null, h = y !== null && y.account_id === r.accountId && y.operational_public_key === r.everydayPublicKey && y.recovery_public_key === r.recoveryPublicKey && y.generation === 0 && y.recovery_capsule_event.id === r.currentRecoveryEvent.id;
    if (d.candidates.length > 0 && !h)
      throw new re("Another account is already registered with that login name and password. Pick a different one.");
    const p = r.currentRecoveryPayload.recovery_generation + 1, v = {
      schema: Nt,
      account_id: r.accountId,
      recovery_generation: p,
      previous_recovery_event_id: r.currentRecoveryEvent.id,
      operational_private_key: C(r.everydayPrivateKey),
      operational_public_key: r.everydayPublicKey,
      recovery_public_key: r.recoveryPublicKey,
      ...o,
      created_at: et(r.currentRecoveryEvent.created_at, t),
      vault_relay_hints: Te(e.vaultRelayUrls),
      protocol: {
        capsule_encryption: Ce,
        recovery_derivation: Ne,
        ...Ie(r.everydayKeyDerived)
      }
    }, w = await Dn({
      recoveryPrivateKey: r.recoveryPrivateKey,
      capsuleKey: r.recoveryCapsuleKey,
      payload: v
    }), m = new K(e.vaultRelayUrls, {
      authPrivateKey: r.recoveryPrivateKey
    });
    let g;
    try {
      g = await ke(m, w, {
        dTag: ot,
        minAcks: e.minAcknowledgements,
        timeoutMs: e.timeoutMs
      });
    } finally {
      m.closeAll();
    }
    if (!g.success)
      throw new re("Could not publish the refreshed recovery capsule to enough relays. No new credential was published; please retry.");
    r.currentRecoveryEvent = w, r.currentRecoveryPayload = v;
    const E = {
      schema: Tt,
      account_id: r.accountId,
      generation: 0,
      operational_private_key: C(r.everydayPrivateKey),
      operational_public_key: r.everydayPublicKey,
      recovery_public_key: r.recoveryPublicKey,
      recovery_capsule_event: w,
      ...i,
      // A retry may be repairing a credential that reached only one relay.
      // It must replace that partial event deterministically on every relay.
      created_at: d.best ? et(d.best.event.created_at, t) : t,
      vault_relay_hints: Te(e.vaultRelayUrls),
      protocol: {
        password_kdf: Ln,
        capsule_encryption: Ce,
        recovery_derivation: Ne,
        ...Ie(r.everydayKeyDerived)
      }
    }, _ = await On({
      locatorPrivateKey: a,
      capsuleKey: s,
      payload: E
    }), I = new K(e.vaultRelayUrls, {
      authPrivateKey: a
    });
    let V;
    try {
      V = await ke(I, _, {
        dTag: Me,
        minAcks: e.minAcknowledgements,
        timeoutMs: e.timeoutMs
      });
    } finally {
      I.closeAll();
    }
    if (!V.success)
      throw new re("Could not publish the new credential capsule to enough relays. Please retry.");
    return e.store && await Wa(e.store, r.everydayPublicKey, {
      generation: 0,
      recoveryGeneration: p
    }), {
      normalizedLoginName: n,
      locatorPublicKey: l,
      credentialEvent: _,
      refreshedRecoveryEvent: w,
      credentialPublish: V,
      recoveryPublish: g
    };
  } finally {
    k(a, s);
  }
}
async function ws(e) {
  const t = e.now ?? Math.floor(Date.now() / 1e3), n = It(e.loginName), r = await Ye(e.oldPassword, n), o = b(r.locatorPrivateKey), i = new K(e.vaultRelayUrls, {
    authPrivateKey: r.locatorPrivateKey
  });
  let a;
  try {
    a = await tt(i, o, r.capsuleKey, e.timeoutMs);
  } finally {
    i.closeAll();
  }
  if (!a.quorumMet)
    throw new be("quorum-not-met");
  if (!a.best)
    throw new be(a.candidates.length > 0 ? "no-valid-candidate" : "no-matching-event");
  const s = a.best.payload, l = a.best.event, u = e.store ?? new uo(), d = await Tn(u, s.operational_public_key);
  if (s.generation < d.generation && !e.acknowledgeRollback)
    throw new zr(d.generation, s.generation);
  const y = await Ye(e.newPassword, n), h = b(y.locatorPrivateKey), p = new K(e.vaultRelayUrls, {
    authPrivateKey: y.locatorPrivateKey
  });
  let v;
  try {
    v = await tt(p, h, y.capsuleKey, e.timeoutMs);
  } finally {
    p.closeAll();
  }
  if (!v.quorumMet)
    throw new ne("Couldn't verify the new password isn't already registered under this login name. Please retry, or add more vault relays.");
  if (v.candidates.length > 0)
    throw new Jr("Another account is already registered with this login name and the new password you chose. Pick a different new password.");
  const w = s.generation + 1, m = {
    schema: Tt,
    account_id: s.account_id,
    generation: w,
    operational_private_key: s.operational_private_key,
    operational_public_key: s.operational_public_key,
    recovery_public_key: s.recovery_public_key,
    recovery_capsule_event: s.recovery_capsule_event,
    // Carry only the session root. A legacy credential may contain the sudo
    // key, but rotation deliberately scrubs it; personal-tier access remains
    // phrase-gated through the recovery capsule.
    ...s.connection_vault_root !== void 0 ? { connection_vault_root: s.connection_vault_root } : {},
    created_at: t,
    vault_relay_hints: Te(e.vaultRelayUrls),
    protocol: {
      password_kdf: Ln,
      capsule_encryption: Ce,
      recovery_derivation: Ne,
      ...Ie(so(s))
    }
  }, g = await On({
    locatorPrivateKey: y.locatorPrivateKey,
    capsuleKey: y.capsuleKey,
    payload: m
  }), E = new K(e.vaultRelayUrls, {
    authPrivateKey: y.locatorPrivateKey
  }), _ = await ke(E, g, {
    dTag: Me,
    minAcks: e.minAcknowledgements,
    timeoutMs: e.timeoutMs
  });
  if (E.closeAll(), !_.success)
    throw new ne("The new credential capsule did not reach the required relay acknowledgement and readback quorum. Your existing password still works; nothing was changed. Please retry.");
  const I = rs({
    oldLocatorPrivateKey: r.locatorPrivateKey,
    createdAt: et(l.created_at, t)
  }), V = Ar({
    privateKey: r.locatorPrivateKey,
    eventIdToDelete: l.id,
    deletedEventKind: x,
    createdAt: t
  }), $ = new K(e.vaultRelayUrls, {
    authPrivateKey: r.locatorPrivateKey
  }), [Ee, de] = await Promise.all([
    $.publishAll(I, e.timeoutMs),
    $.publishAll(V, e.timeoutMs)
  ]);
  return $.closeAll(), await Yr(u, s.operational_public_key, {
    generation: w
  }), {
    normalizedLoginName: n,
    oldLocatorPublicKey: o,
    newLocatorPublicKey: h,
    newGeneration: w,
    recoveryPublicKey: s.recovery_public_key,
    recoveryCapsuleEvent: s.recovery_capsule_event,
    newCredentialEvent: g,
    tombstoneEvent: I,
    deletionRequestEvent: V,
    newCredentialPublish: _,
    tombstoneAcknowledgedCount: ge(Ee),
    deletionAcknowledgedCount: ge(de)
  };
}
const gs = "bitlogin/connection-vault-root/v1", ms = "bitlogin/connection-vault-signing/v1", bs = "bitlogin/connection-record-encryption/v1", ks = "bitlogin/connection-vault-personal/v1", tn = "bitlogin:connection:";
function Es(e) {
  if (e.length !== 32)
    throw new Error("connection_vault_root must be exactly 32 bytes.");
  return mn(Pr(gs), e);
}
function De(e) {
  return ci(e, ms).scalar;
}
function ho(e) {
  const t = De(e);
  try {
    return b(t);
  } finally {
    k(t);
  }
}
function _s(e, t) {
  if (t.length !== 32)
    throw new Error("vault_sudo_key must be exactly 32 bytes.");
  if (e.length !== 32)
    throw new Error("connection_vault_root must be exactly 32 bytes.");
  return mn(Pr(ks), wn(e, t));
}
function vo(e, t) {
  const n = Mt(t);
  return it(e, wn(D(bs), new Uint8Array([0]), n), 32);
}
function Ps() {
  return C(M(16));
}
function Mt(e) {
  const t = T(e);
  if (t.length !== 16)
    throw new Error("connection_id must decode to exactly 16 bytes (§CV7).");
  return t;
}
function wo(e) {
  return Mt(e), `${tn}${e}`;
}
function go(e) {
  if (!e.startsWith(tn))
    return null;
  const t = e.slice(tn.length);
  try {
    return Mt(t), t;
  } catch {
    return null;
  }
}
class oe {
  privateKey;
  publicKeyHex;
  destroyed = !1;
  constructor(t) {
    this.privateKey = t, this.publicKeyHex = b(t);
  }
  assertAlive() {
    if (this.destroyed)
      throw new Error("This signer has been destroyed (session locked or logged out).");
  }
  getPublicKey() {
    return this.assertAlive(), this.publicKeyHex;
  }
  signEvent(t) {
    return this.assertAlive(), O({
      pubkey: this.publicKeyHex,
      created_at: t.created_at ?? Math.floor(Date.now() / 1e3),
      kind: t.kind,
      tags: t.tags ?? [],
      content: t.content
    }, this.privateKey);
  }
  nip44Encrypt(t, n) {
    return this.assertAlive(), Zt(we(this.privateKey, t), n);
  }
  nip44Decrypt(t, n) {
    return this.assertAlive(), bn(we(this.privateKey, t), n);
  }
  /** Legacy relative to nip44Encrypt above, but still what a real NIP-07 extension exposes as
   * window.nostr.nip04.encrypt -- implemented for drop-in parity. */
  nip04Encrypt(t, n) {
    return this.assertAlive(), Va(this.privateKey, t, n);
  }
  nip04Decrypt(t, n) {
    return this.assertAlive(), Fa(this.privateKey, t, n);
  }
  /** Best-practical secret wipe (§11.10, §21.4): overwrites the private key buffer in place. */
  destroy() {
    k(this.privateKey), this.destroyed = !0;
  }
}
const mo = "bitlogin.connection.v1", bo = "bitlogin.connection.nwc.v1", or = 120, Ks = /* @__PURE__ */ new Set(["active", "suspended", "deleted"]), Ss = /* @__PURE__ */ new Set(["connectable", "personal"]);
class Ke extends Error {
  constructor(t) {
    super(t), this.name = "ConnectionRecordError";
  }
}
function ko(e, t) {
  return D(`bitlogin|connection-record|v1|${e}|30078|${t}`);
}
function Eo(e) {
  const t = e, n = (i) => {
    throw new Ke(i);
  };
  (!t || typeof t != "object") && n("Connection record must be an object."), t.schema !== mo && n("Unsupported connection record schema (§CV8.3)."), typeof t.connection_id != "string" && n("connection_id must be a string (§CV7)."), (typeof t.connection_type != "string" || t.connection_type.length === 0) && n("connection_type must be a non-empty string (§CV8.3)."), Ss.has(t.tier) || n("tier must be connectable or personal."), Ks.has(t.state) || n("state must be active, suspended, or deleted (§CV8.3)."), (typeof t.label != "string" || t.label.length > or) && n(`label must be a string of at most ${or} characters.`), (!Number.isInteger(t.created_at) || !Number.isInteger(t.updated_at)) && n("created_at and updated_at must be integers (§CV8.3).");
  const r = t.credential;
  (!r || typeof r != "object" || typeof r.schema != "string") && n("credential must be an object naming its profile schema (§CV8.3).");
  const o = t.application_binding;
  (!o || typeof o != "object" || o.origin !== null && typeof o.origin != "string" || o.app_pubkey !== null && typeof o.app_pubkey != "string") && n("application_binding must carry origin and app_pubkey (string or null)."), t.notes !== null && typeof t.notes != "string" && n("notes must be a string or null.");
}
async function $t(e) {
  Eo(e.record);
  const t = De(e.vaultPrk), n = b(t), r = wo(e.record.connection_id), o = vo(e.recordPrk, e.record.connection_id), i = await In(e.record, o, ko(n, r));
  return O({
    pubkey: n,
    created_at: et(e.previousCreatedAt, e.now),
    kind: x,
    tags: [["d", r]],
    content: JSON.stringify(i)
  }, t);
}
async function Rs(e, t, n) {
  if (!N(e))
    throw new Ke("Connection record event has an invalid id or signature.");
  const r = b(De(t));
  if (e.pubkey !== r)
    throw new Ke("Connection record event is not signed by this vault's identity.");
  const o = Oe(e, "d") ?? "", i = go(o);
  if (i === null)
    throw new Ke("Connection record event has a malformed d tag.");
  const a = JSON.parse(e.content), s = ko(e.pubkey, o), l = [
    { prk: t, tier: "connectable" },
    ...n ? [{ prk: n, tier: "personal" }] : []
  ];
  for (const u of l) {
    let d;
    try {
      d = await xn(a, vo(u.prk, i), s);
    } catch {
      continue;
    }
    if (Eo(d), d.connection_id !== i)
      throw new Ke("Connection record id does not match its d tag.");
    if (d.tier !== u.tier)
      throw new Ke("Connection record tier does not match the key that decrypted it.");
    return { record: d, tier: u.tier, event: e };
  }
  return null;
}
function As(e, t) {
  return {
    ...e,
    state: "deleted",
    credential: { schema: e.credential.schema },
    notes: null,
    updated_at: t
  };
}
const At = /^[0-9a-f]{64}$/u;
class Q extends Error {
  constructor(t) {
    super(t), this.name = "NwcParseError";
  }
}
function ir(e) {
  const t = e.trim();
  if (!/^nostr\+walletconnect:\/\//iu.test(t))
    throw new Q("Not an NWC URI: it must start with nostr+walletconnect://");
  let n;
  try {
    n = new URL(t.replace(/^nostr\+walletconnect:\/\//iu, "http://"));
  } catch {
    throw new Q("The NWC URI is malformed.");
  }
  const r = n.hostname.toLowerCase();
  if (!At.test(r))
    throw new Q("The NWC URI's wallet service pubkey is not 64-char hex.");
  const o = [], i = [];
  let a = null, s = null;
  for (const [l, u] of n.searchParams.entries())
    if (l === "relay") {
      if (!at(u))
        throw new Q("An NWC relay must use secure WebSockets, except for an explicit loopback development endpoint.");
      o.push(u);
    } else if (l === "secret") {
      const d = u.toLowerCase();
      if (!At.test(d))
        throw new Q("The NWC URI's secret is not a 64-char hex client key.");
      a = d;
    } else l === "lud16" ? s = u : i.push([l, u]);
  if (o.length === 0)
    throw new Q("The NWC URI names no relay.");
  if (a === null)
    throw new Q("The NWC URI carries no secret.");
  return {
    schema: bo,
    wallet_pubkey: r,
    relays: o,
    secret: a,
    lud16: s,
    extra_params: i
  };
}
function Cs(e) {
  _o(e);
  const t = new URLSearchParams();
  for (const n of e.relays)
    t.append("relay", n);
  t.append("secret", e.secret), e.lud16 !== null && t.append("lud16", e.lud16);
  for (const [n, r] of e.extra_params)
    t.append(n, r);
  return `nostr+walletconnect://${e.wallet_pubkey}?${t.toString()}`;
}
function Ns(e, t) {
  return e.wallet_pubkey === t.wallet_pubkey && e.secret === t.secret;
}
function _o(e) {
  const t = e, n = (r) => {
    throw new Q(r);
  };
  (!t || typeof t != "object") && n("NWC credential must be an object."), t.schema !== bo && n("NWC credential has the wrong schema."), (typeof t.wallet_pubkey != "string" || !At.test(t.wallet_pubkey)) && n("NWC credential wallet_pubkey must be 64-char lowercase hex."), (!Array.isArray(t.relays) || t.relays.length === 0 || t.relays.some((r) => typeof r != "string")) && n("NWC credential must name at least one relay."), t.relays.some((r) => !at(r)) && n("NWC relays must use secure WebSockets, except for explicit loopback development endpoints."), (typeof t.secret != "string" || !At.test(t.secret)) && n("NWC credential secret must be 64-char lowercase hex."), t.lud16 !== null && typeof t.lud16 != "string" && n("NWC credential lud16 must be a string or null."), (!Array.isArray(t.extra_params) || t.extra_params.some((r) => !Array.isArray(r) || r.length !== 2 || typeof r[0] != "string" || typeof r[1] != "string")) && n("NWC credential extra_params must be [key, value] string pairs.");
}
const Ts = "bitlogin:vault-hwm:v2:", Is = "bitlogin/vault-hwm-index/v2", Po = "bitlogin/vault-hwm-encryption/v2", xs = /^[0-9a-f]{64}$/u;
class ie extends Error {
  constructor() {
    super("The local Connection Vault rollback marker is invalid or has been tampered with."), this.name = "RecordHighWaterMarkError";
  }
}
function Un(e) {
  if (!e || typeof e != "object")
    return !1;
  const t = e;
  return Number.isInteger(t.createdAt) && (t.createdAt ?? -1) >= 0 && typeof t.eventId == "string" && xs.test(t.eventId);
}
function Ko(e, t) {
  Mt(t);
  const n = it(e, Is, 32), r = D(t);
  try {
    return `${Ts}${C(br(kr, n, r))}`;
  } finally {
    k(n, r);
  }
}
function Ms(e, t) {
  return `bitlogin:vault-hwm:${ho(e)}:${t}`;
}
async function Os(e, t, n) {
  const r = it(e, Po, 32), o = D(JSON.stringify(n)), i = D(t);
  try {
    const a = await Mr(r, o, i), s = {
      v: 2,
      nonce: C(a.nonce),
      ciphertext: C(a.ciphertext)
    };
    return JSON.stringify(s);
  } finally {
    k(r, o, i);
  }
}
async function Ds(e, t, n) {
  const r = it(e, Po, 32), o = D(t);
  let i;
  try {
    const a = JSON.parse(n);
    if (a.v !== 2 || typeof a.nonce != "string" || typeof a.ciphertext != "string")
      throw new ie();
    i = await Or(r, T(a.nonce), T(a.ciphertext), o);
    const s = JSON.parse(vn(i));
    if (!Un(s))
      throw new ie();
    return s;
  } catch (a) {
    throw a instanceof ie ? a : new ie();
  } finally {
    k(r, o), i && k(i);
  }
}
async function So(e, t, n, r) {
  const o = Ko(t, n);
  await e.set(o, await Os(t, o, r));
}
async function Ro(e, t, n) {
  const r = Ko(t, n), o = await e.get(r);
  if (o !== void 0)
    return Ds(t, r, o);
  const i = Ms(t, n), a = await e.get(i);
  if (a === void 0)
    return null;
  try {
    const s = JSON.parse(a);
    if (!Un(s))
      throw new ie();
    return await So(e, t, n, s), await e.delete(i), s;
  } catch (s) {
    throw s instanceof ie ? s : new ie();
  }
}
async function Ao(e, t, n, r) {
  if (!Un(r))
    throw new ie();
  const o = await Ro(e, t, n);
  o && Qt({ created_at: r.createdAt, id: r.eventId }, { created_at: o.createdAt, id: o.eventId }) <= 0 || await So(e, t, n, r);
}
async function Ls(e) {
  const t = De(e.vaultPrk), n = new K(e.relayUrls, { authPrivateKey: t });
  let r;
  try {
    r = await ke(n, e.event, {
      dTag: wo(e.connectionId),
      minAcks: e.minAcknowledgements,
      // The readback bar follows the ack bar: a caller publishing to fewer
      // relays (a targeted repair, a test) has already lowered its quorum.
      minReadbacks: e.minAcknowledgements,
      timeoutMs: e.timeoutMs
    });
  } finally {
    n.closeAll(), k(t);
  }
  return r.success && await Ao(e.store, e.vaultPrk, e.connectionId, {
    createdAt: e.event.created_at,
    eventId: e.event.id
  }), r;
}
const ar = 500;
async function Us(e) {
  const t = De(e.vaultPrk), n = b(t), r = new K(e.relayUrls, { authPrivateKey: t });
  let o;
  try {
    o = await r.queryQuorum({ kinds: [x], authors: [n], limit: ar }, e.timeoutMs);
  } finally {
    r.closeAll(), k(t);
  }
  const i = o.outcomes.some((u) => u.events.length >= ar), a = /* @__PURE__ */ new Map();
  for (const u of o.outcomes.flatMap((d) => d.events)) {
    if (!N(u) || u.pubkey !== n)
      continue;
    const d = go(Oe(u, "d") ?? "");
    if (d === null)
      continue;
    const y = a.get(d);
    (!y || Qt(u, y) > 0) && a.set(d, u);
  }
  const s = /* @__PURE__ */ new Map(), l = [];
  for (const [u, d] of a) {
    const y = await Ro(e.store, e.vaultPrk, u);
    if (y !== null && Qt(d, {
      created_at: y.createdAt,
      id: y.eventId
    }) < 0) {
      l.push(u);
      continue;
    }
    s.set(u, d), await Ao(e.store, e.vaultPrk, u, {
      createdAt: d.created_at,
      eventId: d.id
    });
  }
  return {
    events: s,
    rollbackWarnings: l,
    quorumMet: o.quorumMet,
    respondedCount: o.respondedCount,
    truncated: i
  };
}
class Vs {
  vaultPrk;
  personalPrk = null;
  destroyed = !1;
  connectionVaultRoot;
  vaultPublicKey;
  constructor(t) {
    this.connectionVaultRoot = t.slice(), this.vaultPrk = Es(this.connectionVaultRoot), this.vaultPublicKey = ho(this.vaultPrk);
  }
  get sudoActive() {
    return this.personalPrk !== null;
  }
  /** Opens a sudo window. Consumes (wipes) the caller's sudo key copy. */
  enableSudo(t) {
    this.endSudo(), this.personalPrk = _s(this.connectionVaultRoot, t), k(t);
  }
  /** Closes the sudo window and wipes the personal-tier key material. */
  endSudo() {
    this.personalPrk && k(this.personalPrk), this.personalPrk = null;
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
    this.endSudo(), k(this.vaultPrk, this.connectionVaultRoot), this.destroyed = !0;
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
      schema: mo,
      connection_id: Ps(),
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
    }, o = await $t({
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
    }, a = await $t({
      vaultPrk: this.vaultPrk,
      recordPrk: this.prkForTier(i.tier),
      record: i,
      previousCreatedAt: t.event.created_at,
      now: o
    });
    return { record: i, event: a };
  }
  /** §CV11 step 2: the encrypted tombstone replacement. */
  async deleteConnection(t, n) {
    const r = n ?? Math.floor(Date.now() / 1e3), o = As(t.record, r), i = await $t({
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
    return this.destroyed ? Promise.reject(new Error("This vault session was destroyed; create a new one from the account's root.")) : Rs(t, this.vaultPrk, this.personalPrk ?? void 0);
  }
  /** §CV11 step 3: a NIP-09 deletion request for a replaced record event,
   *  signed by the vault identity. Best-effort by contract — the encrypted
   *  tombstone is the durable part of a deletion, this is the courtesy ask. */
  buildDeletionRequest(t, n) {
    if (this.destroyed)
      throw new Error("This vault session was destroyed; create a new one from the account's root.");
    return Ar({
      privateKey: De(this.vaultPrk),
      eventIdToDelete: t,
      deletedEventKind: x,
      createdAt: n ?? Math.floor(Date.now() / 1e3)
    });
  }
  publish(t) {
    return Ls({ vaultPrk: this.vaultPrk, ...t });
  }
  fetchEvents(t) {
    return Us({ vaultPrk: this.vaultPrk, ...t });
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
        const a = await this.decryptEvent(i);
        a && r.push(a);
      } catch {
        o.push(i.id);
      }
    return r.sort((i, a) => a.record.updated_at - i.record.updated_at), {
      connections: r,
      rollbackWarnings: n.rollbackWarnings,
      unreadable: o,
      truncated: n.truncated,
      quorumMet: n.quorumMet
    };
  }
}
const qs = "bitlogin", Z = "kv", q = "device-keys", Fs = 2;
function Bs() {
  return new Promise((e, t) => {
    const n = indexedDB.open(qs, Fs);
    n.onupgradeneeded = () => {
      const r = n.result;
      r.objectStoreNames.contains(Z) || r.createObjectStore(Z), r.objectStoreNames.contains(q) || r.createObjectStore(q);
    }, n.onsuccess = () => e(n.result), n.onerror = () => t(n.error);
  });
}
class Ws {
  dbPromise = null;
  db() {
    return this.dbPromise || (this.dbPromise = Bs()), this.dbPromise;
  }
  async get(t) {
    const n = await this.db();
    return new Promise((r, o) => {
      const a = n.transaction(Z, "readonly").objectStore(Z).get(t);
      a.onsuccess = () => r(a.result), a.onerror = () => o(a.error);
    });
  }
  async set(t, n) {
    const r = await this.db();
    return new Promise((o, i) => {
      const a = r.transaction(Z, "readwrite");
      a.objectStore(Z).put(n, t), a.oncomplete = () => o(), a.onerror = () => i(a.error);
    });
  }
  async delete(t) {
    const n = await this.db();
    return new Promise((r, o) => {
      const i = n.transaction(Z, "readwrite");
      i.objectStore(Z).delete(t), i.oncomplete = () => r(), i.onerror = () => o(i.error);
    });
  }
  /**
   * Returns a non-extractable AES-GCM key kept by the browser's IndexedDB
   * implementation. The key is deliberately separate from the string-only KV
   * API so callers cannot accidentally serialize it as application data.
   */
  async getOrCreateDeviceKey(t) {
    const n = await this.db(), r = await new Promise((i, a) => {
      const s = n.transaction(q, "readonly").objectStore(q).get(t);
      s.onsuccess = () => i(s.result), s.onerror = () => a(s.error);
    });
    if (r) return r;
    const o = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      !1,
      ["encrypt", "decrypt"]
    );
    try {
      return await new Promise((i, a) => {
        const s = n.transaction(q, "readwrite");
        s.objectStore(q).add(o, t), s.oncomplete = () => i(), s.onerror = () => a(s.error);
      }), o;
    } catch {
      const i = await new Promise((a, s) => {
        const l = n.transaction(q, "readonly").objectStore(q).get(t);
        l.onsuccess = () => a(l.result), l.onerror = () => s(l.error);
      });
      if (i) return i;
      throw new Error("Unable to create the browser-bound session key.");
    }
  }
  async deleteDeviceKey(t) {
    const n = await this.db();
    return new Promise((r, o) => {
      const i = n.transaction(q, "readwrite");
      i.objectStore(q).delete(t), i.oncomplete = () => r(), i.onerror = () => o(i.error);
    });
  }
}
const ct = "bitlogin:session:v1", Vn = "bitlogin:session-device-key:v1";
function Co(e) {
  return !!(e && typeof e == "object" && e.v === 3 && typeof e.iv == "string" && typeof e.ciphertext == "string");
}
async function No(e, t) {
  if (e.length !== 32) throw new Error("Not a lock key.");
  return crypto.subtle.importKey("raw", Be(e), "AES-GCM", !1, [t]);
}
async function mt(e, t = ct) {
  try {
    const n = await e.get(t);
    if (!n) return "none";
    const r = JSON.parse(n);
    return Co(r) ? "locked" : To(r) ? "open" : "none";
  } catch {
    return "none";
  }
}
function dt(e) {
  let t = "";
  for (const n of e) t += String.fromCharCode(n);
  return btoa(t);
}
function yt(e) {
  const t = atob(e);
  return Uint8Array.from(t, (n) => n.charCodeAt(0));
}
function Be(e) {
  const t = new Uint8Array(e.byteLength);
  return t.set(e), t.buffer;
}
function To(e) {
  return !!(e && typeof e == "object" && e.v === 2 && typeof e.iv == "string" && typeof e.ciphertext == "string");
}
async function nn(e, t, n, r = ct) {
  const o = {
    everydayPrivateKeyHex: Array.from(t.everydayPrivateKey, (i) => i.toString(16).padStart(2, "0")).join(""),
    accountId: t.accountId,
    recoveryPublicKey: t.recoveryPublicKey,
    activeCredentialEvent: t.activeCredentialEvent,
    activeRecoveryEvent: t.activeRecoveryEvent,
    ...t.connectionVaultRoot ? {
      connectionVaultRootHex: Array.from(
        t.connectionVaultRoot,
        (i) => i.toString(16).padStart(2, "0")
      ).join("")
    } : {},
    ...t.vaultEnabled !== void 0 ? { vaultEnabled: t.vaultEnabled } : {},
    ...t.everydayKeyDerived !== void 0 ? { everydayKeyDerived: t.everydayKeyDerived } : {}
  };
  try {
    if (typeof e.getOrCreateDeviceKey != "function") {
      await e.delete(r);
      return;
    }
    const i = await e.getOrCreateDeviceKey(Vn), a = crypto.getRandomValues(new Uint8Array(12)), s = new TextEncoder().encode(JSON.stringify(o)), l = await crypto.subtle.encrypt({ name: "AES-GCM", iv: a }, i, s), u = {
      v: 2,
      iv: dt(a),
      ciphertext: dt(new Uint8Array(l))
    };
    if (!n) {
      await e.set(r, JSON.stringify(u));
      return;
    }
    const d = crypto.getRandomValues(new Uint8Array(12)), y = await crypto.subtle.encrypt({ name: "AES-GCM", iv: d }, await No(n, "encrypt"), new TextEncoder().encode(JSON.stringify(u))), h = { v: 3, iv: dt(d), ciphertext: dt(new Uint8Array(y)) };
    await e.set(r, JSON.stringify(h));
  } catch {
    n && await e.delete(r).catch(() => {
    });
  }
}
async function Io(e, t, n = ct) {
  let r;
  try {
    r = await e.get(n);
  } catch {
    return null;
  }
  if (!r) return null;
  try {
    let o = JSON.parse(r);
    if (Co(o)) {
      if (!t) return null;
      const l = await crypto.subtle.decrypt({ name: "AES-GCM", iv: Be(yt(o.iv)) }, await No(t, "decrypt"), Be(yt(o.ciphertext)));
      o = JSON.parse(new TextDecoder().decode(l));
    }
    if (!To(o) || typeof e.getOrCreateDeviceKey != "function")
      return await e.delete(n), null;
    const i = await e.getOrCreateDeviceKey(Vn), a = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: Be(yt(o.iv)) },
      i,
      Be(yt(o.ciphertext))
    ), s = JSON.parse(new TextDecoder().decode(a));
    return typeof s.everydayPrivateKeyHex != "string" || typeof s.accountId != "string" || typeof s.recoveryPublicKey != "string" || !s.activeCredentialEvent || !s.activeRecoveryEvent ? null : {
      everydayPrivateKey: Uint8Array.from(
        s.everydayPrivateKeyHex.match(/.{1,2}/g) || [],
        (l) => Number.parseInt(l, 16)
      ),
      accountId: s.accountId,
      recoveryPublicKey: s.recoveryPublicKey,
      activeCredentialEvent: s.activeCredentialEvent,
      activeRecoveryEvent: s.activeRecoveryEvent,
      ...typeof s.connectionVaultRootHex == "string" ? {
        connectionVaultRoot: Uint8Array.from(
          s.connectionVaultRootHex.match(/.{1,2}/g) || [],
          (l) => Number.parseInt(l, 16)
        )
      } : {},
      ...typeof s.vaultEnabled == "boolean" ? { vaultEnabled: s.vaultEnabled } : {},
      ...typeof s.everydayKeyDerived == "boolean" ? { everydayKeyDerived: s.everydayKeyDerived } : {}
    };
  } catch {
    return null;
  }
}
const $s = "bitlogin:kept-session:v1:", U = (e) => $s + e;
async function H(e, t = ct) {
  try {
    await e.delete(t);
  } catch {
  }
}
async function sr(e) {
  try {
    await e.delete(ct), typeof e.deleteDeviceKey == "function" && await e.deleteDeviceKey(Vn);
  } catch {
  }
}
const js = 27300, xe = {
  /** The longest address a picture may have. */
  pictureChars: 300,
  /** The most that is said about someone, in their own words. */
  aboutChars: 280,
  /** How long a pass made here lasts, in seconds. NSWP's verifier allows twelve hours; this gives four. */
  passSec: 4 * 3600,
  /** A profile's content is not read past this many characters. */
  contentChars: 2e4
};
function Gs(e) {
  if (typeof e != "string" || e.length > xe.pictureChars) return "";
  try {
    const t = new URL(e);
    return t.protocol !== "https:" || t.username || t.password || !t.hostname.includes(".") ? "" : t.href.length <= xe.pictureChars ? t.href : "";
  } catch {
    return "";
  }
}
const Hs = (e) => e <= 31 || e >= 127 && e <= 159 || e >= 8203 && e <= 8207 || e >= 8232 && e <= 8239 || e >= 8288 && e <= 8303 || e === 65279;
function Js(e) {
  if (typeof e != "string") return "";
  let t = "";
  for (const n of e.slice(0, xe.aboutChars * 8).normalize("NFC")) t += Hs(n.codePointAt(0)) ? " " : n;
  return [...t.replace(/\s+/gu, " ").trim()].slice(0, xe.aboutChars).join("").trim();
}
function le(e) {
  if (!e || typeof e != "object" || Array.isArray(e)) return null;
  const t = e, n = Ze(t.name), r = Gs(t.picture), o = Js(t.about);
  return !n && !r && !o ? null : { ...n ? { name: n } : {}, ...r ? { picture: r } : {}, ...o ? { about: o } : {} };
}
function zs(e, t) {
  if (!N(e) || e.kind !== 0 || e.pubkey !== t || e.content.length > xe.contentChars) return null;
  let n;
  try {
    n = JSON.parse(e.content);
  } catch {
    return null;
  }
  if (!n || typeof n != "object" || Array.isArray(n)) return null;
  const r = n;
  return le({ name: Ze(r.display_name) || Ze(r.displayName) || r.name, picture: r.picture, about: r.about });
}
function Ys(e, t) {
  let n = null;
  for (const r of e)
    !N(r) || r.kind !== 0 || r.pubkey !== t || n && r.created_at <= n.at || (n = { at: r.created_at, profile: zs(r, t) });
  return n?.profile ?? null;
}
const Qs = /^[0-9a-f]{64}$/u;
function Xs(e) {
  const t = hi(e.site);
  if (!t || typeof e.session != "string" || !Qs.test(e.session) || e.session === e.identity) return null;
  const n = Math.floor(e.nowSeconds), r = le(e.profile) ?? {}, o = [
    ["nswp:session", e.session],
    ["nswp:origin", t],
    ["expiration", String(n + xe.passSec)]
  ];
  return r.name && o.push(["name", r.name]), r.picture && o.push(["picture", r.picture]), r.about && o.push(["about", r.about]), { kind: js, created_at: n, tags: o, content: "" };
}
const rn = "bitlogin:kept-accounts:v1", Ct = {
  /** No more accounts than this are kept on one device. The one least lately used goes first. */
  accounts: 8
}, Zs = /^[0-9a-f]{64}$/u;
function qn(e) {
  if (!e || typeof e != "object") return null;
  const t = e;
  if (typeof t.pubkey != "string" || !Zs.test(t.pubkey)) return null;
  const n = le({ name: t.name, picture: t.picture, about: t.about }) ?? {}, r = typeof t.at == "number" && Number.isFinite(t.at) && t.at > 0 ? Math.floor(t.at) : 0;
  let o;
  try {
    o = We(t.pubkey);
  } catch {
    return null;
  }
  return { pubkey: t.pubkey, npub: o, ...n, at: r };
}
function ec(e) {
  if (!e) return [];
  let t;
  try {
    t = JSON.parse(e);
  } catch {
    return [];
  }
  if (!Array.isArray(t)) return [];
  const n = /* @__PURE__ */ new Set(), r = [];
  for (const o of t.slice(0, Ct.accounts * 2)) {
    const i = qn(o);
    !i || n.has(i.pubkey) || (n.add(i.pubkey), r.push(i));
  }
  return r.sort((o, i) => i.at - o.at).slice(0, Ct.accounts);
}
function tc(e, t, n, r = {}) {
  const o = e.find((s) => s.pubkey === t), i = qn({
    pubkey: t,
    at: n,
    name: Ze(r.name) || o?.name,
    picture: r.picture ?? o?.picture,
    about: r.about ?? o?.about
  });
  if (!i) return { list: [...e], dropped: [] };
  const a = [i, ...e.filter((s) => s.pubkey !== t)];
  return { list: a.slice(0, Ct.accounts), dropped: a.slice(Ct.accounts).map((s) => s.pubkey) };
}
function nc(e, t, n) {
  return e.map((r) => r.pubkey === t ? qn({ ...r, name: Ze(n.name) || r.name, picture: n.picture ?? r.picture, about: n.about ?? r.about }) ?? r : r);
}
const bt = (e, t) => e.filter((n) => n.pubkey !== t);
async function F(e) {
  try {
    return ec(await e.get(rn));
  } catch {
    return [];
  }
}
async function ve(e, t) {
  try {
    t.length === 0 ? await e.delete(rn) : await e.set(rn, JSON.stringify(t));
  } catch {
  }
}
const Fn = "bitlogin:lock:v1", rc = "bitlogin/lock/device/v1", oc = D("bitlogin:lock:device-wrap:v1"), W = {
  pinMin: 6,
  pinMax: 64,
  /** Wrong tries, with the PIN or the device, before the record is removed. */
  tries: 5,
  /** Unused for this long, an unlocked session locks itself. In seconds. */
  idleSec: 900
}, Ae = (e) => {
  const t = new Uint8Array(e.byteLength);
  return t.set(e), t.buffer;
};
function xo(e) {
  if (typeof e != "string") return null;
  const t = e.normalize("NFKC"), n = [...t].length;
  return n >= W.pinMin && n <= W.pinMax ? D(t) : null;
}
async function Mo(e, t) {
  const n = M(12), r = await crypto.subtle.importKey("raw", Ae(e), "AES-GCM", !1, ["encrypt"]), o = await crypto.subtle.encrypt({ name: "AES-GCM", iv: Ae(n) }, r, Ae(t));
  return { iv: C(n), wrapped: C(new Uint8Array(o)) };
}
async function Oo(e, t) {
  try {
    const n = await crypto.subtle.importKey("raw", Ae(e), "AES-GCM", !1, ["decrypt"]), r = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: Ae(T(t.iv)) }, n, Ae(T(t.wrapped))));
    return r.length === 32 ? r : null;
  } catch {
    return null;
  }
}
const Do = (e) => it(mn(oc, e), rc, 32), cr = (e) => !!e && typeof e == "object" && typeof e.iv == "string" && typeof e.wrapped == "string";
async function ue(e) {
  let t;
  try {
    t = await e.get(Fn);
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
const nt = (e, t) => e.set(Fn, JSON.stringify(t));
async function He(e) {
  try {
    await e.delete(Fn);
  } catch {
  }
}
async function ic(e, t, n) {
  const r = xo(t);
  if (!r) throw new Error(`A PIN is ${W.pinMin} to ${W.pinMax} characters.`);
  const o = n ? n.slice() : M(32), i = M(16), a = await mr(r, i);
  try {
    const s = n ? await ue(e) : null;
    await nt(e, { v: 1, tries: 0, pin: { salt: C(i), ...await Mo(a, o) }, ...s?.device ? { device: s.device } : {} });
  } finally {
    a.fill(0), r.fill(0);
  }
  return o;
}
async function ac(e, t, n, r) {
  const o = await ue(e);
  if (!o) throw new Error("The lock is not on.");
  if (r.length !== 32 || !/^[A-Za-z0-9_-]{8,1400}$/u.test(n)) throw new Error("That is not a device unlock.");
  const i = Do(r);
  try {
    await nt(e, { ...o, device: { credentialId: n, ...await Mo(i, t) } });
  } finally {
    i.fill(0);
  }
}
async function sc(e) {
  const t = await ue(e);
  t?.device && await nt(e, { v: 1, tries: t.tries, pin: t.pin });
}
async function Lo(e, t) {
  const n = await ue(e);
  if (!n) return { ok: !1, left: 0, removed: !0 };
  const r = n.tries + 1;
  await nt(e, { ...n, tries: r });
  const o = await t(n);
  return o ? (await nt(e, { ...n, tries: 0 }), { ok: !0, lockKey: o }) : r >= W.tries ? (await He(e), { ok: !1, left: 0, removed: !0 }) : { ok: !1, left: W.tries - r, removed: !1 };
}
function cc(e, t) {
  return Lo(e, async (n) => {
    const r = xo(t);
    if (!r) return null;
    const o = await mr(r, T(n.pin.salt));
    try {
      return await Oo(o, n.pin);
    } finally {
      o.fill(0), r.fill(0);
    }
  });
}
function lc(e, t) {
  return Lo(e, async (n) => {
    if (!n.device || t.length !== 32) return null;
    const r = Do(t);
    try {
      return await Oo(r, n.device);
    } finally {
      r.fill(0);
    }
  });
}
const Je = "bitlogin:signer-grant:v1:", Uo = "bitlogin:signer-grant-device-key:v1", ae = {
  /** The longest a site BitLogin knows is remembered, in seconds: thirty days from Allow. */
  keepSec: 720 * 3600,
  /** The longest for a site it does not know: seven days. */
  unknownKeepSec: 168 * 3600,
  /** How many recent room passes are remembered, to count them across page loads. */
  passKept: 10,
  /** How many recent signatures are remembered, to count them across page loads. */
  signedKept: 60
}, jt = (e) => e.at ?? e.until - Vo(e.site), Vo = (e) => (z(e) ? li(e) : vi(e) !== null) ? ae.keepSec : ae.unknownKeepSec, uc = /^[0-9a-f]{64}$/u;
function rt(e) {
  if (typeof e != "string" || e.length > 300 || e.includes("*")) return "";
  try {
    const t = new URL(e);
    return (t.protocol === "https:" || t.protocol === "http:") && t.origin === e ? t.origin : "";
  } catch {
    return "";
  }
}
const Bn = (e) => z(e) || rt(e), lr = (e) => btoa(Array.from(e, (t) => String.fromCharCode(t)).join("")), ur = (e) => Uint8Array.from(atob(e), (t) => t.charCodeAt(0)), dr = (e) => {
  const t = new Uint8Array(e.byteLength);
  return t.set(e), t.buffer;
}, dc = (e) => Array.from(e, (t) => t.toString(16).padStart(2, "0")).join("");
async function Gt(e, t, n) {
  const r = Bn(t.site);
  if (!r || t.everydayPrivateKey.length !== 32 || typeof e.getOrCreateDeviceKey != "function" || z(r) && t.permissions) return !1;
  const o = Math.min(Math.floor(t.until), Math.floor(n) + Vo(r));
  if (!(o > n)) return !1;
  const i = crypto.getRandomValues(new Uint8Array(12));
  try {
    const a = await e.getOrCreateDeviceKey(Uo), s = JSON.stringify({
      site: r,
      key: dc(t.everydayPrivateKey),
      until: o,
      ...t.name ? { name: t.name.slice(0, 48) } : {},
      ...le(t.profile) ? { profile: le(t.profile) } : {},
      // An application's public signatures are counted up to its own hourly limit, so more of them are kept.
      signed: t.signed.filter((d) => Number.isFinite(d)).slice(-(t.permissions ? Pt.public.hourly : ae.signedKept)),
      ...t.permissions ? { permissions: t.permissions } : {},
      ...!t.permissions && !z(r) && ce(t.more).length ? { more: ce(t.more) } : {},
      ...typeof t.at == "number" ? { at: Math.floor(t.at) } : {},
      ...Y(t.relays).length ? { relays: Y(t.relays) } : {},
      ...typeof t.checkedAt == "number" ? { checkedAt: Math.floor(t.checkedAt) } : {},
      ...typeof t.seenAt == "number" ? { seenAt: Math.floor(t.seenAt) } : {},
      ...t.signedPass?.length ? { signedPass: t.signedPass.filter((d) => Number.isFinite(d)).slice(-ae.passKept) } : {},
      ...t.permissions && t.signedSensitive ? { signedSensitive: t.signedSensitive.filter((d) => Number.isFinite(d)).slice(-Pt.sensitive.hourly) } : {}
    }), l = await crypto.subtle.encrypt({ name: "AES-GCM", iv: i }, a, new TextEncoder().encode(s)), u = { v: 1, iv: lr(i), ciphertext: lr(new Uint8Array(l)) };
    return await e.set(Je + r, JSON.stringify(u)), !0;
  } catch {
    return !1;
  }
}
async function pt(e, t, n) {
  const r = Bn(t);
  if (!r || typeof e.getOrCreateDeviceKey != "function") return null;
  try {
    const o = await e.get(Je + r);
    if (!o) return null;
    const i = JSON.parse(o);
    if (i.v !== 1 || typeof i.iv != "string" || typeof i.ciphertext != "string") return null;
    const a = await e.getOrCreateDeviceKey(Uo), s = await crypto.subtle.decrypt({ name: "AES-GCM", iv: dr(ur(i.iv)) }, a, dr(ur(i.ciphertext))), l = JSON.parse(new TextDecoder().decode(s)), u = (p) => typeof p == "number" && Number.isFinite(p) && p > 0 ? Math.floor(p) : void 0, d = le(l.profile), y = l.permissions === void 0 ? void 0 : En(l.permissions);
    if (y === null || y && (z(r) || !_n(r, y)))
      return await e.delete(Je + r), null;
    const h = (p, v) => Array.isArray(p) ? p.filter((w) => typeof w == "number" && Number.isFinite(w)).slice(-v) : [];
    return l.site !== r || typeof l.key != "string" || !uc.test(l.key) || typeof l.until != "number" ? null : !(l.until > n) || l.until > n + ae.keepSec ? (await e.delete(Je + r), null) : {
      site: r,
      everydayPrivateKey: Uint8Array.from(l.key.match(/.{2}/gu) ?? [], (p) => Number.parseInt(p, 16)),
      until: l.until,
      ...typeof l.name == "string" && l.name ? { name: l.name.slice(0, 48) } : {},
      ...d ? { profile: d } : {},
      signed: h(l.signed, y ? Pt.public.hourly : ae.signedKept),
      ...h(l.signedPass, ae.passKept).length ? { signedPass: h(l.signedPass, ae.passKept) } : {},
      ...!y && !z(r) && ce(l.more).length ? { more: ce(l.more) } : {},
      ...u(l.at) ? { at: u(l.at) } : {},
      ...Y(l.relays).length ? { relays: Y(l.relays) } : {},
      ...u(l.checkedAt) ? { checkedAt: u(l.checkedAt) } : {},
      ...u(l.seenAt) ? { seenAt: u(l.seenAt) } : {},
      ...y ? { permissions: y, signedSensitive: h(l.signedSensitive, Pt.sensitive.hourly) } : {}
    };
  } catch {
    return null;
  }
}
async function ft(e, t) {
  const n = Bn(t);
  if (n)
    try {
      await e.delete(Je + n);
    } catch {
    }
}
const qo = "bitlogin:signer-handoff:v1", yc = /* @__PURE__ */ new Set([
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
  // What a world keeps for its visitor (NSWP-12): written, found and opened for the site the session serves.
  "worldSave",
  "worldFind",
  "worldOpen",
  // One person followed or unfollowed, for a world the user let do that (NSWP-14; embedded/follows.ts).
  "worldFollow",
  // A score on one of a world's boards, built whole in the worker (embedded/scores.ts).
  "worldScore",
  // An achievement held in a world, built whole in the worker (embedded/achievements.ts).
  "worldAchieve",
  // Private messages sealed and opened, and where they reach the user, for a world let do that (embedded/messages.ts).
  "worldSeal",
  "worldUnwrap",
  "worldReach",
  // Asking the user's relays whether this site was taken back (docs/take-back.md). It reads one record and the
  // user's relay list, and can only end the grant or leave it be.
  "signerCheck",
  // Remembering a site, so the user is not asked on every page load (signerGrant.ts).
  "signerKeep",
  "signerRestore",
  "signerTouch",
  "signerForget"
]), on = /^[0-9a-f]{64}$/;
function pc(e) {
  return Array.from(e, (t) => t.toString(16).padStart(2, "0")).join("");
}
function fc(e) {
  return Uint8Array.from(e.match(/.{2}/g) ?? [], (t) => Number.parseInt(t, 16));
}
function hc(e, t, n, r, o = {}) {
  if (!on.test(t)) throw new Error("The hand-off has no usable recipient key.");
  if (e.length !== 32) throw new Error("No identity is unlocked in this session.");
  let i = null;
  if (r !== void 0) {
    const h = rt(r.site), p = En(r.permissions);
    if (!h || !p || !_n(h, p)) throw new Error("That is not a permission set an application may be given.");
    i = { site: h, permissions: p };
  }
  const a = o.site === void 0 ? "" : rt(o.site);
  if (o.site !== void 0 && (!a || i && i.site !== a)) throw new Error("The hand-off names no usable site.");
  const s = le(o.profile), l = !!a && o.visitOnly !== !0 && o.remember === !0, u = o.family === void 0 ? "" : z(o.family);
  if (o.family !== void 0 && (!u || i || !l || !Se(a, u))) throw new Error("That is not a family this site may be allowed as.");
  const d = ce(o.more);
  if (o.more !== void 0 && (d.length === 0 || !a || i || u)) throw new Error("That is not something this site may be let do.");
  const y = new oe(n.slice());
  try {
    const h = JSON.stringify({ v: 1, purpose: qo, key: pc(e), ...i ? { app: i } : {}, ...a ? { site: a } : {}, ...s ? { profile: s } : {}, ...l ? { remember: !0 } : {}, ...typeof o.at == "number" && Number.isFinite(o.at) ? { at: Math.floor(o.at) } : {}, ...Y(o.relays).length ? { relays: Y(o.relays) } : {}, ...u ? { family: u } : {}, ...d.length ? { more: d } : {} });
    return { senderPublicKey: y.getPublicKey(), payload: y.nip44Encrypt(t, h) };
  } finally {
    y.destroy();
  }
}
function vc(e, t) {
  if (!e || !on.test(e.senderPublicKey) || typeof e.payload != "string")
    throw new Error("That is not a signer hand-off.");
  const n = new oe(t.slice());
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
  if (o.v !== 1 || o.purpose !== qo || typeof o.key != "string" || !on.test(o.key))
    throw new Error("That is not a signer hand-off.");
  const i = fc(o.key);
  try {
    b(i);
  } catch {
    throw i.fill(0), new Error("The hand-off carried an unusable key.");
  }
  const a = o.site === void 0 ? null : rt(o.site);
  if (a === "")
    throw i.fill(0), new Error("The hand-off names no usable site.");
  const s = le(o.profile), l = o.remember === !0 && !!a, u = typeof o.at == "number" && Number.isFinite(o.at) && o.at > 0 ? Math.floor(o.at) : null, d = Y(o.relays), y = o.family === void 0 ? null : z(o.family);
  if (y === "" || y && (o.app !== void 0 || !l || !Se(a, y)))
    throw i.fill(0), new Error("The hand-off names a family it cannot be kept for.");
  const h = ce(o.more);
  if (o.more !== void 0 && (h.length === 0 || !a || y || o.app !== void 0))
    throw i.fill(0), new Error("The hand-off carries something this site may not be let do.");
  if (o.app === void 0) return { key: i, app: null, site: a, profile: s, remember: l, at: u, relays: d, family: y, more: h };
  const p = o.app, v = p && typeof p == "object" ? rt(p.site) : "", w = p && typeof p == "object" ? En(p.permissions) : null;
  if (!v || !w || !_n(v, w) || a && a !== v)
    throw i.fill(0), new Error("The hand-off carried a permission set that cannot be read.");
  return { key: i, app: { site: v, permissions: w }, site: v, profile: s, remember: l, at: u, relays: d, family: null, more: [] };
}
const Fo = "bitlogin:session-public:v1";
async function wc(e, t) {
  try {
    const n = {
      pubkey: t.pubkey,
      npub: t.npub,
      ...t.name ? { name: t.name } : {}
    };
    await e.set(Fo, JSON.stringify(n));
  } catch {
  }
}
async function Le(e) {
  try {
    await e.delete(Fo);
  } catch {
  }
}
class gc {
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
const c = {
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
  relays: [],
  family: null,
  more: []
};
let ye = null, S = [...Cr], G = [...Nr];
const f = new Ws();
let an = !1, sn = !1;
function yr(e) {
  an || (S = e.vaultRelays), sn || (G = e.discoveryRelays);
}
const mc = new gc();
let P = null, Ht = Date.now();
const bc = /* @__PURE__ */ new Set(["configure", "lockStatus", "lockOpen", "restoreSession", "getSessionStatus", "logout"]), Bo = "bitlogin:taken-back:v1:";
async function kc(e) {
  try {
    const t = await f.get(Bo + e);
    return (t ? Kr(JSON.parse(t)) : null) ?? Xt;
  } catch {
    return Xt;
  }
}
function pr(e, t) {
  try {
    return Kr(JSON.parse(e.nip44Decrypt(e.getPublicKey(), t)));
  } catch {
    return null;
  }
}
function Ue() {
  L(), P && k(P), P = null;
}
async function Pe() {
  const e = await ue(f);
  return e ? {
    on: !0,
    // Locked with nothing in the active slot too, where other accounts are kept: theirs are sealed under it.
    locked: !P && (await mt(f) === "locked" || (await F(f)).length > 0),
    device: !!e.device,
    ...e.device ? { credentialId: e.device.credentialId } : {},
    triesLeft: Math.max(0, W.tries - e.tries)
  } : { on: !1, locked: !1, device: !1, triesLeft: 0 };
}
function R() {
  if (!c.signer || !c.everydayPrivateKey)
    throw new Error("No identity is unlocked in this session.");
  return { signer: c.signer, everydayPrivateKey: c.everydayPrivateKey };
}
function j() {
  const e = R();
  if (!c.signerOnly || c.app || !c.site) throw new Error("refused");
  return { ...e, site: c.site };
}
const cn = "bitlogin:world-counts:v1:", Ec = "bitlogin:follows-seen:v1:", ln = /* @__PURE__ */ new Map();
async function pe(e, t, n, r = !0) {
  const o = `${cn}${e}:${t}`;
  let i = ln.get(o);
  if (!i)
    try {
      const u = r ? JSON.parse(await f.get(o) ?? "[]") : [];
      i = Array.isArray(u) ? u.filter((d) => typeof d == "number" && Number.isFinite(d)).slice(-n.hourly) : [];
    } catch {
      i = [];
    }
  const a = Oi(n, i), s = Date.now(), l = a.take(s);
  return ln.set(o, a.times()), l && r && await f.set(o, JSON.stringify(a.times())).catch(() => {
  }), l;
}
function Jt() {
  if (!c.signerOnly || !c.app) throw new Error("refused");
  return c.app;
}
function L() {
  c.signer?.destroy(), c.everydayPrivateKey && c.everydayPrivateKey.fill(0), c.signer = null, c.everydayPrivateKey = null, c.accountId = null, c.recoveryPublicKey = null, c.activeCredentialEvent = null, c.activeRecoveryEvent = null, c.everydayKeyDerived = !1, c.vault?.destroy(), c.vault = null, c.connectionVaultRoot && c.connectionVaultRoot.fill(0), c.connectionVaultRoot = null, c.vaultKnown = !1, c.signerOnly = !1, c.app = null, c.site = null, c.profile = null, c.remember = !1, c.grantAt = null, c.relays = [], c.family = null, c.more = [], c.pendingRecovery && (c.pendingRecovery.recoveryPrivateKey.fill(0), c.pendingRecovery.everydayPrivateKey.fill(0), c.pendingRecovery = null);
}
function fr(e) {
  return L(), c.pendingRecovery = e, c.signer = new oe(e.everydayPrivateKey), c.everydayPrivateKey = e.everydayPrivateKey, c.accountId = e.accountId, c.recoveryPublicKey = e.recoveryPublicKey, c.activeRecoveryEvent = e.currentRecoveryEvent, c.everydayKeyDerived = e.everydayKeyDerived, un(
    e.currentRecoveryPayload.connection_vault_root ? T(e.currentRecoveryPayload.connection_vault_root) : void 0
  ), {
    everydayPublicKey: e.everydayPublicKey,
    accountId: e.accountId,
    generalRelays: e.generalRelays,
    dmRelays: e.dmRelays,
    chainWarning: e.chainWarning,
    everydayKeyDerived: e.everydayKeyDerived
  };
}
function un(e, t) {
  c.connectionVaultRoot = e ?? null, c.vaultKnown = !0, c.vault = null, t && k(t);
}
async function fe() {
  if (!c.everydayPrivateKey || !c.accountId || !c.recoveryPublicKey || !c.activeCredentialEvent || !c.activeRecoveryEvent)
    return;
  const e = await ue(f);
  e && !P && (await He(f), await dn());
  const t = {
    everydayPrivateKey: c.everydayPrivateKey,
    accountId: c.accountId,
    recoveryPublicKey: c.recoveryPublicKey,
    activeCredentialEvent: c.activeCredentialEvent,
    activeRecoveryEvent: c.activeRecoveryEvent,
    ...c.connectionVaultRoot ? { connectionVaultRoot: c.connectionVaultRoot } : {},
    ...c.vaultKnown ? { vaultEnabled: c.connectionVaultRoot !== null } : {},
    everydayKeyDerived: c.everydayKeyDerived
  }, n = e && P ? P : null;
  await nn(f, t, n);
  const r = b(c.everydayPrivateKey);
  await nn(f, t, n, U(r));
  const o = tc(await F(f), r, Date.now() / 1e3);
  for (const i of o.dropped) await H(f, U(i));
  await ve(f, o.list), await Wo();
}
async function dn() {
  for (const e of await F(f)) await H(f, U(e.pubkey));
  await ve(f, []);
}
async function hr(e, t) {
  const n = c.everydayPrivateKey ? b(c.everydayPrivateKey) : "";
  let r = await F(f);
  for (const o of r) {
    if (o.pubkey === n) continue;
    const i = await Io(f, e, U(o.pubkey));
    i ? (await nn(f, i, t, U(o.pubkey)), i.everydayPrivateKey.fill(0), i.connectionVaultRoot?.fill(0)) : (await H(f, U(o.pubkey)), r = bt(r, o.pubkey));
  }
  await ve(f, r);
}
async function zt(e) {
  const t = await Io(f, P, e);
  return t ? (L(), c.signer = new oe(t.everydayPrivateKey), c.everydayPrivateKey = t.everydayPrivateKey, c.accountId = t.accountId, c.recoveryPublicKey = t.recoveryPublicKey, c.activeCredentialEvent = t.activeCredentialEvent, c.activeRecoveryEvent = t.activeRecoveryEvent, c.everydayKeyDerived = t.everydayKeyDerived ?? !1, c.connectionVaultRoot = t.connectionVaultRoot ?? null, c.vaultKnown = t.vaultEnabled !== void 0, await Wo(), {
    restored: !0,
    everydayPublicKey: c.signer.getPublicKey(),
    accountId: t.accountId,
    everydayKeyDerived: c.everydayKeyDerived
  }) : { restored: !1 };
}
async function Wo() {
  if (!c.signer) return;
  const e = c.signer.getPublicKey();
  await wc(f, { pubkey: e, npub: We(e) });
}
function Ve() {
  try {
    return new URL(self.location.href).origin;
  } catch {
    return "";
  }
}
function yn() {
  if (!c.signer) throw new Error("No identity is unlocked in this session.");
  if (!c.connectionVaultRoot)
    throw new Error(
      c.vaultKnown ? "This account predates the Connection Vault. Enable it from your BitLogin account manager (recovery phrase required)." : "Sign in again to use wallet connections on this device."
    );
  return c.vault ??= new Vs(c.connectionVaultRoot.slice()), c.vault;
}
function qe(e) {
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
async function kt() {
  const e = yn(), t = await e.listConnections({ relayUrls: S, store: f });
  return {
    vault: e,
    connections: t.connections.filter((n) => n.record.state !== "deleted"),
    rollbackWarnings: t.rollbackWarnings,
    unreadable: t.unreadable,
    truncated: t.truncated,
    quorumMet: t.quorumMet
  };
}
async function Yt(e) {
  const { vault: t, connections: n } = await kt(), r = n.find((o) => o.record.connection_id === e);
  if (!r) throw new Error("That connection no longer exists.");
  return { vault: t, connection: r };
}
let me = null, J = null;
function vr(e) {
  self.postMessage({ notify: "nip46-auth-url", url: e });
}
function Fe() {
  if (!me) throw new Error("No remote signer is connected.");
  return me;
}
function ht() {
  J && (J.abort.abort(), k(J.clientSecretKey), J = null);
}
function $o(e) {
  const t = e.buildLogoutEvent();
  e.close(), t && e.publishCourtesy(t);
}
function wr(e, t) {
  me && $o(me.client), me = { client: e, userPubkey: t };
}
async function _c(e, t) {
  if (c.signerOnly && !yc.has(e))
    throw new Error("This session can only sign. Sign in at your own BitLogin page for anything else.");
  switch (P && e !== "configure" && Date.now() - Ht > W.idleSec * 1e3 && Ue(), bc.has(e) || (Ht = Date.now()), e) {
    // ---- The optional lock (lock.ts) ----
    case "lockStatus":
      return Pe();
    // Turn it on, or change the PIN. Only with a full session unlocked: the key that is sealed is the one in hand.
    case "lockEnable": {
      if (R(), await ue(f) && !P) throw new Error("Unlock first.");
      const n = await ic(f, t.pin, P ?? void 0);
      return await hr(P, n), P && k(P), P = n, await fe(), Pe();
    }
    case "lockSetDevice": {
      if (R(), !P) throw new Error("Turn the lock on first.");
      const n = t, r = T(String(n.prfOutput));
      try {
        await ac(f, P, String(n.credentialId), r);
      } finally {
        k(r);
      }
      return Pe();
    }
    case "lockRemoveDevice": {
      if (R(), !P) throw new Error("Turn the lock on first.");
      return await sc(f), Pe();
    }
    case "lockDisable": {
      if (R(), await ue(f) && !P) throw new Error("Unlock first.");
      return await hr(P, null), await He(f), P && k(P), P = null, await fe(), Pe();
    }
    case "lockNow": {
      if (!P) throw new Error("The lock is not on.");
      return Ue(), Pe();
    }
    // Open it, with the PIN or with the device. A wrong try is counted; one too many removes the lock and the
    // cached session with it, and the user signs in again the ordinary way.
    case "lockOpen": {
      const n = t;
      let r;
      if (typeof n.prfOutput == "string") {
        const o = T(n.prfOutput);
        try {
          r = await lc(f, o);
        } finally {
          k(o);
        }
      } else
        r = await cc(f, n.pin);
      if (r.ok) {
        P && k(P), P = r.lockKey, Ht = Date.now();
        const o = await zt();
        if (o.restored) return { ok: !0, left: W.tries, removed: !1, ...o };
        if (await mt(f) === "none" && (await F(f)).length > 0) return { ok: !0, left: W.tries, removed: !1, restored: !1 };
        await He(f), Ue(), r = { ok: !1, left: 0, removed: !0 };
      }
      return r.removed && (Ue(), await dn(), await sr(f), await Le(f)), { ok: !1, left: r.left, removed: r.removed, restored: !1 };
    }
    // ---- Signer hand-off (docs/sign-in-window.md) ----
    // The receiving side, first: a throwaway key for the hand-off to be sealed to.
    case "handoffBegin":
      return ye && k(ye), ye = ut(), { recipientPublicKey: b(ye) };
    // The sending side: this worker has the session, and seals the everyday
    // key (only that) to the receiving worker's throwaway key.
    case "handoffExport": {
      const { everydayPrivateKey: n } = R(), r = ut(), o = t;
      try {
        return hc(n, o.recipientPublicKey, r, o.app, {
          ...o.site !== void 0 ? { site: o.site } : {},
          // Only a site that declared nothing is told who they are. An application is held to what it asked,
          // though the window may have read the profile to show the user which account this is.
          ...c.profile && !o.app ? { profile: c.profile } : {},
          ...o.remember === !0 ? { remember: !0 } : {},
          ...o.family !== void 0 ? { family: o.family } : {},
          ...o.more !== void 0 ? { more: o.more } : {},
          // With the lock on, nothing is kept for any site: a key at rest in a site's storage would be a key
          // the lock does not cover. Every site is allowed for the visit, and asks at the sign-in address again.
          ...P ? { visitOnly: !0 } : {},
          // When it was allowed, by this worker's clock, and where the user writes: what a signer needs to
          // find out later whether the site was taken back (docs/take-back.md).
          at: Date.now() / 1e3,
          relays: c.relays
        });
      } finally {
        k(r);
      }
    }
    // The receiving side, last: open it with the throwaway key, which is
    // then gone. What results is a signer-only session, in memory. It is
    // never written to the session cache or the public record.
    // ---- What the embedded signer remembers for a site (signerGrant.ts) ----
    // Keep this hand-off for the site that asked, so the user is not asked again on its next page load. Only a
    // session that arrived by a hand-off is ever kept this way: a full session is never written as a grant.
    case "signerKeep": {
      const { everydayPrivateKey: n } = R();
      if (!c.signerOnly) throw new Error("Only a signer-only session can be remembered for a site.");
      const r = t, o = Date.now() / 1e3;
      if (!c.remember) return { kept: !1 };
      if (c.app && c.app.site !== r.site || c.site && c.site !== r.site) throw new Error("This hand-off was for another site.");
      if (c.family) {
        if (!Se(r.site, c.family)) throw new Error("This hand-off was for another site.");
        await ft(f, r.site);
      }
      return {
        kept: await Gt(
          f,
          {
            site: c.family ?? r.site,
            everydayPrivateKey: n,
            until: r.until,
            ...r.name ? { name: r.name } : {},
            ...c.profile ? { profile: c.profile } : {},
            at: c.grantAt ?? Math.floor(o),
            ...c.relays.length ? { relays: c.relays } : {},
            signed: [],
            ...!c.app && !c.family && c.more.length ? { more: ce(c.more) } : {},
            ...c.app ? { permissions: c.app.permissions, signedSensitive: [] } : {}
          },
          o
        )
      };
    }
    // The site's page was loaded again: what was kept for that site, if it is still in date, becomes a
    // signer-only session. It touches nothing a full session uses.
    case "signerRestore": {
      const n = t, r = await pt(f, n.site, Date.now() / 1e3), o = !r && n.family !== void 0 && z(n.family) && Se(n.site, n.family) ? n.family : null, i = r ?? (o ? await pt(f, o, Date.now() / 1e3) : null);
      return !i || o && i.site !== o ? { restored: !1 } : (L(), c.signer = new oe(i.everydayPrivateKey), c.everydayPrivateKey = i.everydayPrivateKey, c.signerOnly = !0, c.app = i.permissions ? { site: i.site, permissions: i.permissions } : null, c.site = o ? n.site : i.site, c.family = o, c.profile = i.profile ?? null, c.remember = !0, c.grantAt = jt(i), c.relays = i.relays ?? [], c.more = o ? [] : i.more ?? [], {
        restored: !0,
        everydayPublicKey: c.signer.getPublicKey(),
        until: i.until,
        ...i.name ? { name: i.name } : {},
        ...i.profile ? { profile: i.profile } : {},
        signed: i.signed,
        ...i.signedPass ? { signedPass: i.signedPass } : {},
        check: Gn(Date.now() / 1e3, jt(i), i.checkedAt ?? 0),
        ...o ? { family: o } : {},
        ...c.more.length ? { more: ce(c.more) } : {},
        ...i.permissions ? { permissions: i.permissions, signedSensitive: i.signedSensitive ?? [] } : {}
      });
    }
    // Count a signature against the site, where reloading the page can't lose the count.
    case "signerTouch": {
      const { everydayPrivateKey: n } = R();
      if (!c.signerOnly) throw new Error("Only a signer-only session is counted for a site.");
      const r = t, o = Date.now() / 1e3, i = await pt(f, c.family && Se(r.site, c.family) ? c.family : r.site, o);
      return i && b(i.everydayPrivateKey) === b(n) && await Gt(
        f,
        { ...i, signed: Array.isArray(r.signed) ? r.signed : [], ...Array.isArray(r.signedPass) ? { signedPass: r.signedPass } : {}, ...i.permissions ? { signedSensitive: Array.isArray(r.signedSensitive) ? r.signedSensitive : [] } : {} },
        o
      ), {};
    }
    // Signing out of a site that was allowed as one of a family signs out of the family: otherwise its next page
    // load would take the family's grant up again, and the sign-out would not have happened (SF6).
    case "signerForget": {
      const n = t.site;
      await ft(f, n), c.family && Se(n, c.family) && await ft(f, c.family);
      for (const r of ["save", "follow", "seal", "unwrap", "reach", "score", "achieve"])
        ln.delete(`${cn}${r}:${n}`), await f.delete(`${cn}${r}:${n}`).catch(() => {
        });
      return {};
    }
    case "handoffAccept": {
      if (!ye) throw new Error("No hand-off was begun here.");
      const n = ye;
      ye = null;
      let r;
      try {
        r = vc(t, n);
      } finally {
        k(n);
      }
      return L(), c.signer = new oe(r.key), c.everydayPrivateKey = r.key, c.signerOnly = !0, c.app = r.app, c.site = r.site, c.profile = r.profile, c.remember = r.remember, c.grantAt = r.at, c.relays = r.relays, c.family = r.family, c.more = r.more, {
        everydayPublicKey: c.signer.getPublicKey(),
        ...r.app ? { app: r.app } : {},
        ...r.site ? { site: r.site } : {},
        ...r.profile ? { profile: r.profile } : {},
        ...r.remember ? { remember: !0 } : {},
        ...r.family ? { family: r.family } : {},
        ...r.more.length ? { more: r.more } : {}
      };
    }
    // ---- Who someone is, to a world they allowed (§SW16).
    // A full session, at the sign-in address: the person's own profile, asked of relays and believed only as
    // far as its signature goes. It is sealed into the next hand-off. A session that arrived by a hand-off
    // never asks a relay anything: this action is not on its list.
    case "loadProfile": {
      const { signer: n } = R(), r = n.getPublicKey(), o = t.profile !== !1, i = [.../* @__PURE__ */ new Set([...G, ...S])].slice(0, 8);
      if (i.length === 0) return {};
      const a = new K(i);
      try {
        const [s, l] = await Promise.all([
          o ? a.queryQuorum({ kinds: [0], authors: [r], limit: 2 }, 4e3) : Promise.resolve(null),
          a.queryQuorum({ kinds: [qt], authors: [r], limit: 2 }, 4e3)
        ]);
        if (c.signer !== n) return {};
        c.profile = s ? Ys(s.outcomes.flatMap((u) => u.events), r) : null, c.profile && !c.signerOnly && await ve(f, nc(await F(f), r, c.profile)), c.relays = Ft(l.outcomes.flatMap((u) => u.events), r);
      } finally {
        a.closeAll();
      }
      return { ...c.profile ? { profile: c.profile } : {}, relays: c.relays };
    }
    // ---- Taking a site back (docs/take-back.md) ----
    // At the sign-in address, with a full session: publish the record that says a site, or every site, is taken
    // back as of now. It carries everything an earlier record said, from the relays and from this browser's own
    // copy, so a record built here can never give a site back.
    case "takeBack": {
      const { signer: n } = R(), r = t, o = n.getPublicKey(), i = Date.now() / 1e3, a = r.all === !0 ? { all: !0 } : { site: String(r.site ?? "") }, s = new K([.../* @__PURE__ */ new Set([...G, ...S])].slice(0, 8));
      let l;
      try {
        l = Ft((await s.queryQuorum({ kinds: [qt], authors: [o], limit: 2 }, 4e3)).outcomes.flatMap((y) => y.events), o);
      } finally {
        s.closeAll();
      }
      const u = [.../* @__PURE__ */ new Set([...l, ...S])].slice(0, 16), d = new K(u);
      try {
        const y = await d.queryQuorum({ kinds: [Vt], authors: [o], "#d": [Ut], limit: 2 }, 5e3);
        if (y.respondedCount === 0) return { ok: !1, accepted: 0, of: u.length };
        const h = Hn(y.outcomes.flatMap((_) => _.events), o, i), p = h ? pr(n, h.content) : null, v = await kc(o), w = yi(pi(p ?? Xt, v, i), a, i), m = n.signEvent({
          kind: Vt,
          // Later than the one it replaces, whatever the two clocks say.
          created_at: Math.max(Math.floor(i), (h?.created_at ?? 0) + 1),
          tags: [["d", Ut]],
          content: n.nip44Encrypt(o, Jn(w))
        }), g = ge(await d.publishAll(m, 6e3)), E = g >= Math.min(2, u.length);
        return E && await f.set(Bo + o, Jn(w)).catch(() => {
        }), { ok: E, accepted: g, of: u.length };
      } finally {
        d.closeAll();
      }
    }
    // In the embedded signer, for a kept grant: ask the user's relays whether this site was taken back. Asked at
    // most once a day. It can end the grant or leave it be, and nothing else.
    case "signerCheck": {
      const { signer: n } = R();
      if (!c.signerOnly || !c.site) return { state: "ok" };
      const r = c.family ?? c.site, o = Date.now() / 1e3, i = await pt(f, r, o);
      if (!i) return { state: "ok" };
      const a = n.getPublicKey(), s = jt(i), l = Gn(o, s, i.checkedAt ?? 0);
      if (l === "fresh") return { state: "ok" };
      const u = [.../* @__PURE__ */ new Set([...Y(i.relays), ...S])].slice(0, 12), d = new K(u);
      let y, h;
      try {
        [y, h] = await Promise.all([
          d.queryQuorum({ kinds: [Vt], authors: [a], "#d": [Ut], limit: 2 }, 5e3),
          d.queryQuorum({ kinds: [qt], authors: [a], limit: 2 }, 5e3)
        ]);
      } finally {
        d.closeAll();
      }
      if (c.signer !== n) return { state: "ok" };
      const p = Hn(y.outcomes.flatMap((g) => g.events), a, o), v = p ? pr(n, p.content) : null;
      if (v && ui(v, r, s))
        return await ft(f, r), L(), { state: "ended" };
      if (!di({
        asked: u.length,
        answered: y.respondedCount,
        seenAt: i.seenAt ?? 0,
        newestAt: p ? p.created_at : null,
        readable: v !== null
      })) return { state: l === "overdue" ? "stale" : "ok" };
      const m = Ft(h.outcomes.flatMap((g) => g.events), a);
      return await Gt(
        f,
        {
          ...i,
          checkedAt: Math.floor(o),
          seenAt: Math.max(i.seenAt ?? 0, v && p ? p.created_at : 0),
          ...m.length ? { relays: m } : {}
        },
        o
      ), m.length && (c.relays = m), { state: "ok" };
    }
    // A room pass (NSWP kind 27300) for the site this session serves, and for no other. The site, the time, how
    // long it lasts and the profile are all this worker's own: what is asked for is a session public key. Not
    // for an application: an application is held to the set the user read, and a pass is not in one.
    case "roomPass": {
      const { signer: n } = R();
      if (!c.signerOnly || c.app || !c.site) throw new Error("refused");
      const r = Xs({
        session: t.session,
        site: c.site,
        identity: n.getPublicKey(),
        nowSeconds: Date.now() / 1e3,
        profile: c.profile
      });
      if (!r) throw new Error("refused");
      return n.signEvent(r);
    }
    // ---- What a world keeps for its visitor (NSWP-12; embedded/saves.ts). The world is never taken from what is
    // asked: it is the site this session serves, as the browser gave it to the signer's page.
    case "worldSave": {
      const { signer: n, everydayPrivateKey: r, site: o } = j(), i = t, a = we(r, n.getPublicKey());
      try {
        const s = xi({ conversationKey: a, world: o, slot: i.slot, data: i.data, nowSeconds: Date.now() / 1e3 });
        if (!s || !await pe("save", o, Mi)) throw new Error("refused");
        return n.signEvent(s);
      } finally {
        k(a);
      }
    }
    case "worldFind": {
      const { signer: n, everydayPrivateKey: r, site: o } = j(), i = we(r, n.getPublicKey());
      try {
        const a = Ii(i, o, t.slot);
        if (!a) throw new Error("refused");
        return { d: a };
      } finally {
        k(i);
      }
    }
    case "worldOpen": {
      const { signer: n, everydayPrivateKey: r, site: o } = j(), i = t.event;
      if (!N(i)) throw new Error("refused");
      const a = we(r, n.getPublicKey());
      try {
        const s = Ti(i, { conversationKey: a, pubkey: n.getPublicKey(), world: o });
        if (!s) throw new Error("refused");
        return s;
      } finally {
        k(a);
      }
    }
    // ---- Following from inside a world (NSWP-14; embedded/follows.ts). Only for a world the user let do this, by
    // name, in the window. The world hands over their newest follow list and one change; what is signed is that
    // list with that change and nothing else. A follow list replaces the last, so before a world's word is
    // believed this worker looks at the user's own relays itself: a world that is behind, or that says there is
    // no list where one merely couldn't be reached, is refused.
    case "worldFollow": {
      const { signer: n, site: r } = j();
      if (!c.more.includes("follows")) throw new Error("refused");
      const o = t, i = n.getPublicKey(), a = o.list === null ? null : zn(o.list, i);
      if (o.list !== null && !a) throw new Error("refused");
      const s = Ec + i;
      let l = 0;
      try {
        const v = Number(await f.get(s));
        Number.isSafeInteger(v) && v > 0 && (l = v);
      } catch {
      }
      const u = [.../* @__PURE__ */ new Set([...Y(c.relays), ...G, ...S])].slice(0, 8);
      let d = 0, y = 0;
      if (u.length) {
        const v = new K(u);
        try {
          const w = await v.queryQuorum({ kinds: [Ai], authors: [i], limit: 2 }, 3500);
          d = w.respondedCount;
          for (const m of w.outcomes.flatMap((g) => g.events))
            m.created_at > y && zn(m, i) && (y = m.created_at);
        } catch {
        } finally {
          v.closeAll();
        }
      }
      if (c.signer !== n || !c.more.includes("follows")) throw new Error("refused");
      if (l = Math.max(l, y), l && await f.set(s, String(l)).catch(() => {
      }), !Ci(a, { answered: d, newestAt: y })) throw new Error("refused");
      const h = Ni({ list: a, ...o.add !== void 0 ? { add: o.add } : {}, ...o.remove !== void 0 ? { remove: o.remove } : {}, pubkey: i, nowSeconds: Date.now() / 1e3, seen: l });
      if (!h || !await pe("follow", r, Fi)) throw new Error("refused");
      const p = n.signEvent(h);
      return await f.set(s, String(Math.max(l, p.created_at))).catch(() => {
      }), p;
    }
    // ---- A score on one of a world's boards (NSWP-15; embedded/scores.ts). For any world its visitor allowed: it
    // is less than a note. The world names its coordinate, a board and a number; the note and the mark that says
    // which site asked are this worker's own.
    case "worldScore": {
      const { signer: n, site: r } = j(), o = t, i = Ri({ world: o.world, board: o.board, score: o.score, title: o.title, format: o.format, origin: r, nowSeconds: Date.now() / 1e3 });
      if (!i || !await pe("score", r, qi)) throw new Error("refused");
      return n.signEvent(i);
    }
    // ---- An achievement held in a world (NSWP-16; embedded/achievements.ts). As a score: for any world its visitor
    // allowed, built here from three plain fields, and marked with the site this session serves.
    case "worldAchieve": {
      const { signer: n, site: r } = j(), o = t, i = Si({ world: o.world, id: o.achievement, title: o.title, origin: r, nowSeconds: Date.now() / 1e3 });
      if (!i || !await pe("achieve", r, Vi)) throw new Error("refused");
      return n.signEvent(i);
    }
    // ---- Private messages from inside a world (NSWP-14; embedded/messages.ts). Only for a world the user let do
    // this, by name, in the window. The world names a reader and the words, or hands over a wrap; it is never given
    // a key, and nothing else is encrypted or decrypted for it.
    case "worldSeal": {
      const { signer: n, site: r } = j();
      if (!c.more.includes("messages")) throw new Error("refused");
      const o = t, i = Ki(n, { to: o.to, text: o.text, nowSeconds: Date.now() / 1e3 });
      if (!i || !await pe("seal", r, Ui)) throw new Error("refused");
      return i;
    }
    case "worldUnwrap": {
      const { signer: n, site: r } = j();
      if (!c.more.includes("messages")) throw new Error("refused");
      if (!await pe("unwrap", r, Li, !1)) throw new Error("refused");
      const o = Pi(n, t.event);
      if (!o) throw new Error("refused");
      return { message: o };
    }
    case "worldReach": {
      const { signer: n, site: r } = j();
      if (!c.more.includes("messages")) throw new Error("refused");
      const o = _i(t.relays, Date.now() / 1e3);
      if (!o || !await pe("reach", r, Di)) throw new Error("refused");
      return n.signEvent(o);
    }
    // ---- What an approved application may ask beyond signing (§SW9.5). Refused without a permission set.
    case "appEncrypt": {
      const { signer: n } = R(), r = Jt(), o = t, i = n.getPublicKey(), a = r.permissions.sign.some((s) => ki.includes(s));
      if (!Ei(r.permissions, i, o.peerPublicKey) && !(a && /^[0-9a-f]{64}$/u.test(String(o.peerPublicKey))))
        throw new Error("refused");
      if (typeof o.text != "string" || o.text.length > 1e5) throw new Error("refused");
      return { text: o.scheme === "nip04" ? n.nip04Encrypt(o.peerPublicKey, o.text) : n.nip44Encrypt(o.peerPublicKey, o.text) };
    }
    case "appDecrypt": {
      const { signer: n } = R(), r = Jt(), o = t;
      if (!bi(r.permissions, o.peerPublicKey) || typeof o.text != "string") throw new Error("refused");
      return { text: o.scheme === "nip04" ? n.nip04Decrypt(o.peerPublicKey, o.text) : n.nip44Decrypt(o.peerPublicKey, o.text) };
    }
    case "appDecryptEvent": {
      const { signer: n } = R(), r = Jt(), o = t.event;
      if (!N(o)) throw new Error("refused");
      const i = mi(r.permissions, n.getPublicKey(), o), a = o.kind === 4 || /\?iv=[A-Za-z0-9+/=]+$/u.test(o.content);
      for (const s of i)
        try {
          return { text: a ? n.nip04Decrypt(s, o.content) : n.nip44Decrypt(s, o.content) };
        } catch {
        }
      throw new Error("refused");
    }
    case "nip46Connect": {
      const r = la(t.uri), o = new Xn({
        clientSecretKey: ut(),
        pointer: r,
        onAuthUrl: vr
      });
      try {
        await o.connect();
        const i = await o.getUserPublicKey();
        return wr(o, i), ht(), { userPubkey: i };
      } catch (i) {
        throw o.close(), i;
      }
    }
    case "nip46NostrconnectStart": {
      const n = t, r = S.slice(0, 2);
      ht();
      const o = ut(), i = Qe(M(16));
      return J = { clientSecretKey: o, relayUrls: r, secret: i, abort: new AbortController() }, { uri: ua({
        clientPubkey: b(o),
        relayUrls: r,
        secret: i,
        name: n.appName?.trim() || "BitLogin",
        perms: ["sign_event", "nip44_encrypt", "nip44_decrypt", "nip04_encrypt", "nip04_decrypt"]
      }) };
    }
    case "nip46NostrconnectAwait": {
      const n = J;
      if (!n) throw new Error("No signer-connection attempt is in progress.");
      let r;
      try {
        ({ signerPubkey: r } = await ya({
          clientSecretKey: n.clientSecretKey,
          relayUrls: n.relayUrls,
          secret: n.secret,
          timeoutMs: 18e4,
          signal: n.abort.signal
        }));
      } catch (i) {
        throw J === n && ht(), i;
      }
      if (J !== n) throw new Error("This signer-connection attempt was superseded.");
      J = null;
      const o = new Xn({
        clientSecretKey: n.clientSecretKey,
        pointer: { signerPubkey: r, relayUrls: n.relayUrls },
        onAuthUrl: vr
      });
      try {
        const i = await o.getUserPublicKey();
        return wr(o, i), { userPubkey: i };
      } catch (i) {
        throw o.close(), i;
      }
    }
    case "nip46SignEvent": {
      const n = t;
      return Fe().client.signEvent({
        kind: n.kind,
        content: n.content,
        tags: n.tags ?? [],
        created_at: n.created_at ?? Math.floor(Date.now() / 1e3)
      });
    }
    case "nip46Nip44Encrypt": {
      const n = t;
      return { ciphertext: await Fe().client.nip44Encrypt(n.peerPublicKey, n.plaintext) };
    }
    case "nip46Nip44Decrypt": {
      const n = t;
      return { plaintext: await Fe().client.nip44Decrypt(n.peerPublicKey, n.payload) };
    }
    case "nip46Nip04Encrypt": {
      const n = t;
      return { ciphertext: await Fe().client.nip04Encrypt(n.peerPublicKey, n.plaintext) };
    }
    case "nip46Nip04Decrypt": {
      const n = t;
      return { plaintext: await Fe().client.nip04Decrypt(n.peerPublicKey, n.payload) };
    }
    case "nip46Disconnect": {
      const n = me;
      return me = null, ht(), n && $o(n.client), {};
    }
    case "configure": {
      const n = t;
      return an = !!n.vaultRelayUrls?.length, sn = !!n.discoveryRelayUrls?.length, n.vaultRelayUrls?.length && (S = n.vaultRelayUrls), n.discoveryRelayUrls?.length && (G = n.discoveryRelayUrls), yr(wt(await Ir(f))), (!an || !sn) && ea(f).then(yr, () => {
      }), {};
    }
    case "register": {
      const n = t, r = n.importKey ? await ds({ nsecOrHex: n.importKey, loginName: n.loginName, password: n.password, vaultRelayUrls: S }) : await co({ loginName: n.loginName, password: n.password, vaultRelayUrls: S });
      return L(), c.signer = new oe(r.everydayPrivateKey), c.everydayPrivateKey = r.everydayPrivateKey, c.accountId = r.accountId, c.recoveryPublicKey = r.recoveryPublicKey, c.activeCredentialEvent = r.credentialEvent, c.activeRecoveryEvent = r.recoveryEvent, c.everydayKeyDerived = r.everydayKeyDerived, un(r.connectionVaultRoot, r.vaultSudoKey), await fe(), {
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
      const r = lo(t.nsecOrHex), o = b(r), i = { everydayPublicKey: o, npub: We(o) };
      return r.fill(0), i;
    }
    case "login": {
      const n = t, r = await ys({
        loginName: n.loginName,
        password: n.password,
        vaultRelayUrls: S,
        store: f,
        acknowledgeRollback: n.acknowledgeRollback
      });
      return L(), c.signer = new oe(r.everydayPrivateKey), c.everydayPrivateKey = r.everydayPrivateKey, c.accountId = r.accountId, c.recoveryPublicKey = r.recoveryPublicKey, c.activeCredentialEvent = r.credentialEvent, c.activeRecoveryEvent = r.recoveryCapsuleEvent, c.everydayKeyDerived = r.everydayKeyDerived, un(r.connectionVaultRoot, r.vaultSudoKey), await fe(), !r.rollbackWarning && !r.relayDisagreementWarning && tr({
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
      const n = t, r = await ps({
        phrase: n.phrase,
        vaultRelayUrls: S,
        discoveryRelayUrls: G,
        offlineRecoveryCapsuleEvents: n.offlineExportFile?.recovery_capsule_events
      });
      return fr(r);
    }
    case "previewPhraseRebuild": {
      const r = await fs({ phrase: t.phrase, vaultRelayUrls: S, discoveryRelayUrls: G });
      return { ...r, npub: We(r.everydayPublicKey) };
    }
    case "rebuildFromPhrase": {
      const r = await hs({ phrase: t.phrase, vaultRelayUrls: S, discoveryRelayUrls: G });
      return fr(r);
    }
    case "completeRecovery": {
      const n = t;
      if (!c.pendingRecovery) throw new Error("No recovery is in progress in this session.");
      const r = await vs({
        recovered: c.pendingRecovery,
        newLoginName: n.newLoginName,
        newPassword: n.newPassword,
        vaultRelayUrls: S,
        store: f
      });
      return c.activeCredentialEvent = r.credentialEvent, c.activeRecoveryEvent = r.refreshedRecoveryEvent, c.pendingRecovery.recoveryPrivateKey.fill(0), c.pendingRecovery = null, await fe(), {
        locatorPublicKey: r.locatorPublicKey,
        credentialEventId: r.credentialEvent.id,
        refreshedRecoveryEventId: r.refreshedRecoveryEvent.id
      };
    }
    case "changePassword": {
      const n = t, r = await ws({
        loginName: n.loginName,
        oldPassword: n.oldPassword,
        newPassword: n.newPassword,
        vaultRelayUrls: S,
        store: f,
        acknowledgeRollback: n.acknowledgeRollback
      });
      return c.activeCredentialEvent = r.newCredentialEvent, c.recoveryPublicKey = r.recoveryPublicKey, c.activeRecoveryEvent = r.recoveryCapsuleEvent, await fe(), {
        newLocatorPublicKey: r.newLocatorPublicKey,
        newGeneration: r.newGeneration,
        tombstoneAcknowledgedCount: r.tombstoneAcknowledgedCount,
        deletionAcknowledgedCount: r.deletionAcknowledgedCount
      };
    }
    case "publishProfileAndRelayLists": {
      const n = t, { everydayPrivateKey: r } = R();
      return za({
        everydayPrivateKey: r,
        name: n.name,
        about: n.about,
        picture: n.picture,
        generalRelays: n.generalRelays,
        dmRelays: n.dmRelays,
        discoveryRelays: G
      });
    }
    case "getPublicKey": {
      const { signer: n } = R();
      return { publicKey: n.getPublicKey() };
    }
    case "signEvent": {
      const { signer: n } = R(), r = t;
      if (c.signerOnly) {
        if (c.app) {
          const o = wi(c.app.permissions, r, c.app.site, Date.now() / 1e3);
          if (!o) throw new Error("refused");
          return n.signEvent(o);
        }
        if (gi(r.kind) !== "ordinary") throw new Error("refused");
      }
      return n.signEvent({ kind: r.kind, tags: r.tags, content: r.content, created_at: r.created_at });
    }
    case "nip44Encrypt": {
      const { signer: n } = R(), r = t;
      return { ciphertext: n.nip44Encrypt(r.peerPublicKey, r.plaintext) };
    }
    case "nip44Decrypt": {
      const { signer: n } = R(), r = t;
      return { plaintext: n.nip44Decrypt(r.peerPublicKey, r.payload) };
    }
    case "nip04Encrypt": {
      const { signer: n } = R(), r = t;
      return { ciphertext: n.nip04Encrypt(r.peerPublicKey, r.plaintext) };
    }
    case "nip04Decrypt": {
      const { signer: n } = R(), r = t;
      return { plaintext: n.nip04Decrypt(r.peerPublicKey, r.payload) };
    }
    case "exportIdentity": {
      const { everydayPrivateKey: n, signer: r } = R();
      return { nsec: Yo(n), npub: We(r.getPublicKey()) };
    }
    case "buildRecoveryExport": {
      if (R(), !c.recoveryPublicKey || !c.activeRecoveryEvent)
        throw new Error("No recovery capsule is known in this session yet.");
      return zo({
        recoveryPublicKeyHex: c.recoveryPublicKey,
        vaultRelayUrls: S,
        recoveryCapsuleEvents: [c.activeRecoveryEvent],
        relayListEvents: []
      });
    }
    case "repairReplicas": {
      if (!c.activeCredentialEvent || !c.activeRecoveryEvent)
        throw new Error("No active capsule events are known in this session yet.");
      return tr({
        relayUrls: S,
        credentialEvent: c.activeCredentialEvent,
        recoveryEvent: c.activeRecoveryEvent
      });
    }
    case "checkReplicaHealth": {
      if (!c.activeCredentialEvent || !c.activeRecoveryEvent)
        throw new Error("No active capsule events are known in this session yet.");
      return cs({
        relayUrls: S,
        credentialEvent: c.activeCredentialEvent,
        recoveryEvent: c.activeRecoveryEvent
      });
    }
    case "getSessionStatus":
      return { unlocked: !!c.signer, everydayPublicKey: c.signer?.getPublicKey(), signerOnly: c.signerOnly };
    // Called once, right after "configure", before the widget renders its welcome
    // screen -- restores whatever persistSession() last cached for this origin, so
    // a page reload doesn't ask for the login name + password again. A missing or
    // corrupt cache is not an error: it just means the widget falls through to its
    // normal welcome screen, exactly like it always has.
    case "restoreSession":
      return !P && await mt(f) === "locked" ? { restored: !1, locked: !0 } : zt();
    // Log out: this account is forgotten on this device. Other accounts kept here stay, and so does the lock
    // they are sealed under; with none left, everything goes as it always did.
    case "logout": {
      const n = c.everydayPrivateKey && !c.signerOnly ? b(c.everydayPrivateKey) : "", r = bt(await F(f), n);
      return n && await H(f, U(n)), r.length > 0 && n ? (await ve(f, r), L(), await H(f), await Le(f), {}) : (Ue(), await He(f), await dn(), await sr(f), await Le(f), {});
    }
    // ---- Several accounts on one device (docs/account-switching.md) ----
    // Who is kept here, and which of them is signed in. Public keys and what their own profiles call them.
    case "accountsList": {
      const n = c.everydayPrivateKey && !c.signerOnly ? b(c.everydayPrivateKey) : "";
      return { accounts: (await F(f)).map((r) => ({ ...r, active: r.pubkey === n })) };
    }
    // Switch to a kept account: its own slot is opened, on this device, with no password and no relay. With the
    // lock on and locked, it says so, and nothing changes.
    case "accountsSwitch": {
      if (c.signerOnly) throw new Error("A signer-only session cannot switch accounts.");
      const n = String(t.pubkey ?? ""), r = await F(f);
      if (!r.some((i) => i.pubkey === n)) return { restored: !1 };
      if (!P && await mt(f, U(n)) === "locked") return { restored: !1, locked: !0 };
      const o = await zt(U(n));
      return !o.restored || o.everydayPublicKey !== n ? (L(), await H(f, U(n)), await ve(f, bt(r, n)), await H(f), await Le(f), { restored: !1 }) : (await fe(), o);
    }
    // Make room to sign in as another account: nobody is signed in, and everyone kept stays kept.
    case "accountsAdd": {
      if (c.signerOnly) throw new Error("A signer-only session cannot add accounts.");
      return L(), await H(f), await Le(f), {};
    }
    // Forget one kept account that is not the one signed in. (For that one: log out.)
    case "accountsRemove": {
      const n = String(t.pubkey ?? ""), r = c.everydayPrivateKey && !c.signerOnly ? b(c.everydayPrivateKey) : "";
      if (n === r) throw new Error("Log out to remove the account that is signed in.");
      return await H(f, U(n)), await ve(f, bt(await F(f), n)), {};
    }
    // ---- Connection Vault (connection-vault.md §12, reveal mode) ----
    case "vaultStatus":
      return c.signer ? c.connectionVaultRoot ? { enabled: !0, vaultPublicKey: yn().vaultPublicKey } : { enabled: !1, reason: c.vaultKnown ? "no-vault" : "stale-cache" } : { enabled: !1 };
    case "vaultList": {
      const { connections: n, rollbackWarnings: r, unreadable: o, truncated: i, quorumMet: a } = await kt();
      return { connections: n.map(qe), rollbackWarnings: r, unreadable: o, truncated: i, quorumMet: a };
    }
    case "vaultSaveNwc": {
      const n = t, r = Ve(), o = yn(), i = ir(n.uri), a = n.label.trim().slice(0, 120) || "Wallet connection", { record: s, event: l } = await o.createConnection({
        connection_type: "nwc",
        tier: "connectable",
        label: a,
        credential: i,
        application_binding: { origin: r, app_pubkey: null }
      });
      if (!(await o.publish({
        event: l,
        connectionId: s.connection_id,
        relayUrls: S,
        store: f
      })).success)
        throw new Error("The connection could not be saved to enough relays. Please try again.");
      const d = await o.decryptEvent(l);
      return qe(d);
    }
    case "vaultFindForOrigin": {
      const n = Ve(), { connections: r } = await kt(), o = r.find(
        (i) => i.record.connection_type === "nwc" && i.record.state === "active" && i.record.application_binding.origin === n
      );
      return { connection: o ? qe(o) : null };
    }
    case "vaultRevealNwc": {
      const n = t, { connection: r } = await Yt(n.connectionId);
      if (r.record.connection_type !== "nwc" || r.record.state !== "active")
        throw new Error("That connection is not an active wallet connection.");
      const o = r.record.application_binding.origin;
      if (o !== null && o !== Ve())
        throw new Error("That connection belongs to a different site.");
      const i = r.record.credential;
      return _o(i), { uri: Cs(i) };
    }
    case "vaultSetBinding": {
      const n = t, { vault: r, connection: o } = await Yt(n.connectionId), i = n.origin === null ? null : Ve(), { record: a, event: s } = await r.updateConnection(o, {
        application_binding: { origin: i, app_pubkey: null }
      });
      if (!(await r.publish({
        event: s,
        connectionId: a.connection_id,
        relayUrls: S,
        store: f
      })).success) throw new Error("The change could not reach enough relays. Please try again.");
      const u = await r.decryptEvent(s);
      return qe(u);
    }
    case "vaultDelete": {
      const n = t, { vault: r, connection: o } = await Yt(n.connectionId), { record: i, event: a } = await r.deleteConnection(o);
      if (!(await r.publish({
        event: a,
        connectionId: i.connection_id,
        relayUrls: S,
        store: f
      })).success) throw new Error("The deletion could not reach enough relays. Please try again.");
      try {
        const l = r.buildDeletionRequest(o.event.id), u = new K(S);
        await u.publishAll(l), u.closeAll();
      } catch {
      }
      return {};
    }
    case "vaultOfferCheck": {
      const n = t, r = Ve(), o = ir(n.uri), { connections: i } = await kt(), a = i.find(
        (s) => s.record.connection_type === "nwc" && Ns(s.record.credential, o)
      );
      return a ? a.record.application_binding.origin !== r ? { duplicate: !1 } : { duplicate: !0, connection: qe(a) } : { duplicate: !1 };
    }
    default:
      throw new Error(`Unknown worker action: ${e}`);
  }
}
const Pc = /* @__PURE__ */ new Set([
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
  "worldSave",
  "worldFind",
  "worldOpen",
  "worldFollow",
  "worldScore",
  "worldAchieve",
  "worldSeal",
  "worldUnwrap",
  "worldReach",
  "takeBack",
  "signerCheck",
  "accountsList",
  "accountsSwitch",
  "accountsAdd",
  "accountsRemove",
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
  if (typeof t.action != "string" || !Pc.has(t.action)) {
    const a = {
      id: t.id,
      ok: !1,
      error: `Unknown worker action: ${String(t.action)}`,
      errorName: "Error"
    };
    self.postMessage(a);
    return;
  }
  const { id: n, action: r, payload: o } = e.data;
  (r.startsWith("nip46") ? (a) => a() : (a) => mc.run(a))(() => _c(r, o)).then(
    (a) => {
      const s = { id: n, ok: !0, result: a };
      self.postMessage(s);
    },
    (a) => {
      const s = a instanceof Error ? a : new Error(String(a)), l = { id: n, ok: !1, error: s.message, errorName: s.name };
      self.postMessage(l);
    }
  );
});
