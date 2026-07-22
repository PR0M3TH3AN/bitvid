import { v as ce, g as R, s as X, K as rn, c as on, b as ut, d as $e, f as Be, h as he, u as pe, j as an, k as sn, l as oe, m as ue, n as Ge, S as Ve, o as He, q as Ce, D as ve, t as Le, w as cn, x as ln, y as un, z as dn, A as Ie, B as rt, C as dt, F as yn, G as hn, H as pn, I as Pe, J as yt, L as vn, M as fn, N as Se, O as Ne, P as be, Q as gn, T as ht, U as wn, V as bn, W as mn, X as pt, Y as de, Z as Te, _ as vt, $ as kn, a0 as En, a1 as Pn, a2 as _n, a3 as Kn, a as ot, a4 as Rn } from "./bitlogin-shared-n51Pos3V.js";
class ye extends Error {
  reason;
  constructor(t) {
    super("Account not found or credentials incorrect."), this.name = "AccountNotFoundError", this.reason = t;
  }
}
class ae extends Error {
  constructor(t) {
    super(t), this.name = "RegistrationFailedError";
  }
}
class ft extends Error {
  constructor(t = "An account already exists with this login name and password. Sign in instead, or choose different credentials.") {
    super(t), this.name = "AccountAlreadyExistsError";
  }
}
class gt extends Error {
  constructor(t) {
    super(t), this.name = "RecoveryFailedError";
  }
}
class wt extends Error {
  seenGeneration;
  capsuleGeneration;
  constructor(t, n) {
    super(`This credential capsule reports generation ${n}, but this device has already seen generation ${t}. Refusing to log in with older, possibly-revoked credentials.`), this.name = "RollbackDetectedError", this.seenGeneration = t, this.capsuleGeneration = n;
  }
}
function bt(e, t) {
  const n = t ?? Math.floor(Date.now() / 1e3);
  return e == null ? n : Math.max(n, e + 1);
}
const xn = { generation: -1, recoveryGeneration: -1 };
function mt(e) {
  return `bitlogin:hwm:${e}`;
}
async function We(e, t) {
  const n = await e.get(mt(t));
  return n ? JSON.parse(n) : xn;
}
async function kt(e, t, n) {
  const r = await We(e, t), o = {
    generation: Math.max(r.generation, n.generation ?? -1),
    recoveryGeneration: Math.max(r.recoveryGeneration, n.recoveryGeneration ?? -1)
  };
  return await e.set(mt(t), JSON.stringify(o)), o;
}
function An() {
  const e = globalThis.WebSocket;
  if (!e)
    throw new Error("No global WebSocket implementation is available in this environment.");
  return e;
}
class Cn {
  url;
  ws = null;
  connectPromise = null;
  subs = /* @__PURE__ */ new Map();
  pendingPublishes = /* @__PURE__ */ new Map();
  authPrivateKey;
  connectTimeoutMs;
  authenticated = !1;
  constructor(t, n = {}) {
    this.url = t, this.authPrivateKey = n.authPrivateKey, this.connectTimeoutMs = n.connectTimeoutMs ?? 8e3;
  }
  async connect() {
    return this.connectPromise ? this.connectPromise : (this.connectPromise = new Promise((t, n) => {
      const r = An(), o = new r(this.url);
      this.ws = o;
      const a = setTimeout(() => {
        n(new Error(`Timed out connecting to relay ${this.url}`));
      }, this.connectTimeoutMs);
      o.addEventListener("open", () => {
        clearTimeout(a), t();
      }), o.addEventListener("error", () => {
        clearTimeout(a), n(new Error(`WebSocket error connecting to relay ${this.url}`));
      }), o.addEventListener("close", () => {
        this.connectPromise = null;
      }), o.addEventListener("message", (i) => {
        this.handleMessage(String(i.data));
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
      const [a, i] = o, c = this.subs.get(a);
      c && ce(i) && c.events.push(i);
      return;
    }
    if (r === "EOSE") {
      const [a] = o;
      this.subs.get(a)?.onEose();
      return;
    }
    if (r === "OK") {
      const [a, i, c] = o;
      this.pendingPublishes.get(a)?.({ ok: i, message: c ?? "" }), this.pendingPublishes.delete(a);
      return;
    }
    if (r === "AUTH") {
      const [a] = o;
      this.respondToAuthChallenge(a);
      return;
    }
  }
  async respondToAuthChallenge(t) {
    if (!this.authPrivateKey)
      return;
    const n = R(this.authPrivateKey), r = X({
      pubkey: n,
      created_at: Math.floor(Date.now() / 1e3),
      kind: rn,
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
      this.pendingPublishes.set(t.id, (a) => {
        clearTimeout(o), r(a);
      }), this.send(["EVENT", t]);
    });
  }
  async queryOnce(t, n = 8e3) {
    await this.connect();
    const r = on({
      pubkey: "0".repeat(64),
      created_at: Date.now(),
      kind: 0,
      tags: [],
      content: JSON.stringify(t) + Math.random()
    }).slice(0, 16);
    return new Promise((o) => {
      const a = [], i = () => {
        clearTimeout(c), this.subs.delete(r), this.send(["CLOSE", r]), o(a);
      }, c = setTimeout(i, n);
      this.subs.set(r, { events: a, onEose: i }), this.send(["REQ", r, t]);
    });
  }
}
class T {
  connections = /* @__PURE__ */ new Map();
  constructor(t, n = {}) {
    for (const r of new Set(t))
      this.connections.set(r, new Cn(r, n));
  }
  get relayUrls() {
    return [...this.connections.keys()];
  }
  /** Queries every configured relay and waits for a quorum of responses (or all timeouts) before returning (§16.2). */
  async queryQuorum(t, n = 8e3) {
    const r = [...this.connections.entries()], o = await Promise.all(r.map(async ([c, s]) => {
      try {
        const l = await s.queryOnce(t, n);
        return { relayUrl: c, events: l, responded: !0 };
      } catch (l) {
        return { relayUrl: c, events: [], responded: !1, error: l.message };
      }
    })), a = o.filter((c) => c.responded).length, i = o.length;
    return {
      outcomes: o,
      quorumMet: a >= Math.ceil(i / 2),
      respondedCount: a,
      totalCount: i
    };
  }
  /** Publishes an event to every configured relay, best-effort (§15.6, §24.4). */
  async publishAll(t, n = 8e3) {
    const r = [...this.connections.entries()];
    return Promise.all(r.map(async ([o, a]) => {
      try {
        const i = await a.publish(t, n);
        return { relayUrl: o, result: i };
      } catch (i) {
        return { relayUrl: o, result: { ok: !1, message: i.message } };
      }
    }));
  }
  closeAll() {
    for (const t of this.connections.values())
      t.close();
  }
}
function te(e) {
  return e.filter((t) => t.result.ok).length;
}
function Ln(e, t, n) {
  return X({ pubkey: R(e), created_at: n, kind: ut, tags: [], content: JSON.stringify(t) }, e);
}
function Sn(e, t, n) {
  const r = t.map((o) => {
    const a = ["r", o.url];
    return o.read && !o.write && a.push("read"), o.write && !o.read && a.push("write"), a;
  });
  return X({ pubkey: R(e), created_at: n, kind: $e, tags: r, content: "" }, e);
}
function Nn(e, t, n) {
  return X({
    pubkey: R(e),
    created_at: n,
    kind: Be,
    tags: t.map((r) => ["relay", r]),
    content: ""
  }, e);
}
function Tn(e) {
  return e.tags.filter((t) => t[0] === "r" && t[1]).map((t) => t[1]);
}
function In(e) {
  return e.tags.filter((t) => t[0] === "relay" && t[1]).map((t) => t[1]);
}
async function Mn(e) {
  const t = R(e.everydayPrivateKey), n = Math.floor(Date.now() / 1e3), r = [.../* @__PURE__ */ new Set([...e.generalRelays, ...e.dmRelays, ...e.discoveryRelays])], o = new T(r), [a, i, c] = await Promise.all([
    o.queryQuorum({ authors: [t], kinds: [ut] }),
    o.queryQuorum({ authors: [t], kinds: [$e] }),
    o.queryQuorum({ authors: [t], kinds: [Be] })
  ]);
  o.closeAll();
  const s = a.outcomes.some((p) => p.events.length > 0), l = i.outcomes.some((p) => p.events.length > 0), u = c.outcomes.some((p) => p.events.length > 0), d = new T(r);
  let g = null, w = null, v = null;
  const f = [];
  if (!s && (e.name || e.about || e.picture)) {
    const p = Ln(e.everydayPrivateKey, { name: e.name, about: e.about, picture: e.picture }, n);
    f.push(d.publishAll(p).then((h) => void (g = h)));
  }
  if (!l) {
    const p = Sn(e.everydayPrivateKey, e.generalRelays.map((h) => ({ url: h, read: !0, write: !0 })), n);
    f.push(d.publishAll(p).then((h) => void (w = h)));
  }
  if (!u) {
    const p = Nn(e.everydayPrivateKey, e.dmRelays, n);
    f.push(d.publishAll(p).then((h) => void (v = h)));
  }
  return await Promise.all(f), d.closeAll(), {
    profilePublished: g !== null && te(g) > 0,
    relayListAcknowledgedCount: w !== null ? te(w) : 0,
    dmRelayListAcknowledgedCount: v !== null ? te(v) : 0,
    profileSkippedExisting: s,
    relayListSkippedExisting: l,
    dmRelayListSkippedExisting: u
  };
}
async function me(e, t, n) {
  const r = n.minAcks ?? 2, o = n.minReadbacks ?? 2, a = await e.publishAll(t, n.timeoutMs), i = te(a), s = (await e.queryQuorum({ kinds: [he], authors: [t.pubkey], "#d": [n.dTag], limit: 5 }, n.timeoutMs)).outcomes.filter((l) => l.events.some((u) => u.id === t.id)).length;
  return {
    acknowledgedCount: i,
    readbackVerifiedCount: s,
    success: i >= r && s >= o
  };
}
function Un(e) {
  const t = an(e);
  if (t === void 0)
    throw new Error("Value is not JSON-serializable for canonicalization.");
  return t;
}
function On(e) {
  return pe(Un(e));
}
const Re = [1024, 2048, 4096], re = 4;
function Dn(e) {
  const t = re + e.length, n = Re.find((a) => a >= t);
  if (n === void 0)
    throw new Error(`Payload of ${e.length} bytes exceeds the largest padding bucket (${Re[Re.length - 1]} bytes minus ${re}-byte length prefix).`);
  const r = new Uint8Array(n);
  return new DataView(r.buffer).setUint32(0, e.length, !1), r.set(e, re), r;
}
function qn(e) {
  if (!Re.includes(e.length))
    throw new Error(`Padded plaintext length ${e.length} does not match a known bucket.`);
  const n = new DataView(e.buffer, e.byteOffset, e.byteLength).getUint32(0, !1);
  if (n > e.length - re)
    throw new Error("Declared payload length exceeds the padded bucket size.");
  const r = e.slice(re, re + n), o = e.slice(re + n);
  for (const a of o)
    if (a !== 0)
      throw new Error("Padding bytes are not all zero; capsule plaintext is malformed.");
  return r;
}
function Fe() {
  const e = globalThis.crypto;
  if (!e || !e.subtle)
    throw new Error("WebCrypto SubtleCrypto is not available in this environment.");
  return e;
}
async function Et(e) {
  if (e.length !== 32)
    throw new Error("AES-256-GCM key must be exactly 32 bytes.");
  return Fe().subtle.importKey("raw", e, "AES-GCM", !1, ["encrypt", "decrypt"]);
}
async function zn(e, t, n) {
  const r = sn(), o = await Et(e), a = await Fe().subtle.encrypt({ name: "AES-GCM", iv: r, additionalData: n, tagLength: 128 }, o, t);
  return { nonce: r, ciphertext: new Uint8Array(a) };
}
async function jn(e, t, n, r) {
  const o = await Et(e);
  try {
    const a = await Fe().subtle.decrypt({ name: "AES-GCM", iv: t, additionalData: r, tagLength: 128 }, o, n);
    return new Uint8Array(a);
  } catch {
    throw new Error("AES-256-GCM authentication failed: capsule is corrupted, tampered, or the wrong key was used.");
  }
}
function Pt(e) {
  return pe(`bitlogin|password-capsule|v1|${e}|30078|bitlogin:password:v1`);
}
function _t(e) {
  return pe(`bitlogin|recovery-capsule|v1|${e}|30078|bitlogin:recovery:v1`);
}
async function Kt(e, t, n) {
  const r = On(e), o = Dn(r), a = await zn(t, o, n);
  return {
    version: 1,
    algorithm: "aes-256-gcm",
    nonce: oe(a.nonce),
    ciphertext: oe(a.ciphertext)
  };
}
async function Rt(e, t, n) {
  if (e.version !== 1 || e.algorithm !== "aes-256-gcm")
    throw new Error(`Unsupported capsule envelope version/algorithm: ${e.version}/${e.algorithm}`);
  const r = ue(e.nonce), o = ue(e.ciphertext), a = await jn(t, r, o, n), i = qn(a);
  return JSON.parse(Ge(i));
}
class Je extends Error {
  constructor(t) {
    super(t), this.name = "CapsuleValidationError";
  }
}
const $n = /* @__PURE__ */ new Set(["wss:", "ws:"]), Bn = 1e6, Gn = /^[0-9a-f]{64}$/u;
function x(e, t) {
  if (!e)
    throw new Je(t);
}
function xe(e) {
  return typeof e == "string" && Gn.test(e);
}
function xt(e) {
  x(Array.isArray(e), "vault_relay_hints must be an array (§12.4.7).");
  for (const t of e) {
    x(typeof t == "string", "Each relay hint must be a string (§12.4.7).");
    let n;
    try {
      n = new URL(t);
    } catch {
      throw new Je(`Invalid relay URL: ${String(t)} (§12.4.7)`);
    }
    x($n.has(n.protocol), `Relay URL uses a disallowed scheme: ${t} (§12.4.7)`);
  }
}
function At(e) {
  x(typeof e == "string", "account_id must be a string (§12.4.2).");
  let t;
  try {
    t = ue(e);
  } catch {
    throw new Je("account_id is not valid base64url (§12.4.2).");
  }
  x(t.length === 16, "account_id must decode to exactly 128 bits (§12.4.2).");
}
function Ct(e, t) {
  x(typeof e == "string", "operational_private_key must be a string (§12.4.3).");
  const n = ue(e);
  x(n.length === 32, "operational_private_key must be exactly 32 bytes (§12.4.3)."), x(He(n), "operational_private_key is not a valid secp256k1 scalar (§12.4.3)."), x(xe(t), "operational_public_key must be lowercase 64-char hex (§12.4.4).");
  const r = R(n);
  x(r === t, "operational_public_key does not match the derived public key (§12.4.4).");
}
function Lt(e, t) {
  x(Number.isInteger(e) && e >= 0 && e <= Bn, `${t} is out of supported bounds (§12.4.8).`);
}
function Vn(e) {
  x(e.schema === Ce, `Unsupported or unknown schema: ${String(e.schema)} (§12.4.1)`), At(e.account_id), Lt(e.generation, "generation"), Ct(e.operational_private_key, e.operational_public_key), x(xe(e.recovery_public_key), "recovery_public_key must be lowercase 64-char hex (§12.4.5)."), xt(e.vault_relay_hints);
  const t = e.recovery_capsule_event;
  x(!!t && typeof t == "object", "recovery_capsule_event must be present (§12.4.6)."), x(ce(t), "Embedded recovery_capsule_event has an invalid event id or signature (§12.4.6)."), x(t.pubkey === e.recovery_public_key, "Embedded recovery_capsule_event author does not match recovery_public_key (§12.4.5).");
}
function Hn(e) {
  x(e.schema === Ve, `Unsupported or unknown schema: ${String(e.schema)} (§12.4.1)`), At(e.account_id), Lt(e.recovery_generation, "recovery_generation"), x(e.previous_recovery_event_id === null || xe(e.previous_recovery_event_id), "previous_recovery_event_id must be null or lowercase 64-char hex (§12.3)."), Ct(e.operational_private_key, e.operational_public_key), x(xe(e.recovery_public_key), "recovery_public_key must be lowercase 64-char hex."), xt(e.vault_relay_hints);
}
function Wn(e) {
  const t = new Map(e.map((r) => [r.recoveryGeneration, r])), n = [...e].sort((r, o) => r.recoveryGeneration - o.recoveryGeneration);
  for (let r = 1; r < n.length; r++) {
    const o = n[r], a = t.get(o.recoveryGeneration - 1);
    if (o.previousRecoveryEventId === null)
      return { consistent: !1, warning: `Generation ${o.recoveryGeneration} has a null previous-event link but is not the first generation.` };
    if (a && o.previousRecoveryEventId !== a.eventId)
      return {
        consistent: !1,
        warning: `Recovery generation chain is broken between generation ${a.recoveryGeneration} and ${o.recoveryGeneration}: possible replay or relay misbehavior.`
      };
  }
  return { consistent: !0 };
}
async function Ye(e) {
  const t = R(e.locatorPrivateKey), n = await Kt(e.payload, e.capsuleKey, Pt(t));
  return X({
    pubkey: t,
    created_at: e.payload.created_at,
    kind: he,
    tags: [["d", ve]],
    content: JSON.stringify(n)
  }, e.locatorPrivateKey);
}
function Fn(e) {
  const t = R(e.oldLocatorPrivateKey);
  return X({
    pubkey: t,
    created_at: e.createdAt,
    kind: he,
    tags: [["d", ve]],
    content: ""
  }, e.oldLocatorPrivateKey);
}
async function Jn(e, t) {
  if (!ce(e))
    throw new Error("Credential capsule event has an invalid id or signature.");
  const n = JSON.parse(e.content), r = await Rt(n, t, Pt(e.pubkey));
  return Vn(r), r;
}
async function St(e) {
  const t = R(e.recoveryPrivateKey), n = await Kt(e.payload, e.capsuleKey, _t(t));
  return X({
    pubkey: t,
    created_at: e.payload.created_at,
    kind: he,
    tags: [["d", Le]],
    content: JSON.stringify(n)
  }, e.recoveryPrivateKey);
}
async function Nt(e, t) {
  if (!ce(e))
    throw new Error("Recovery capsule event has an invalid id or signature.");
  const n = JSON.parse(e.content), r = await Rt(n, t, _t(e.pubkey));
  return Hn(r), r;
}
function Yn(e) {
  const t = /* @__PURE__ */ new Map();
  for (const n of e)
    ce(n) && t.set(n.id, n);
  return [...t.values()].sort((n, r) => r.created_at - n.created_at);
}
async function Tt(e, t, n, r, o) {
  const a = await e.queryQuorum({ kinds: [he], authors: [t], "#d": [n], limit: 5 }, o), i = a.outcomes.flatMap((g) => g.events), c = Yn(i), s = [];
  for (const g of c)
    try {
      const w = await r(g);
      s.push({ event: g, payload: w });
    } catch (w) {
      s.push({ event: g, payload: null, error: w.message });
    }
  const l = s.find((g) => g.payload !== null) ?? null, u = a.outcomes.filter((g) => g.responded && g.events.length > 0).map((g) => g.events.slice().sort((w, v) => v.created_at - w.created_at)[0].id), d = new Set(u).size > 1;
  return {
    quorumMet: a.quorumMet,
    respondedCount: a.respondedCount,
    totalCount: a.totalCount,
    candidates: s,
    best: l,
    relayDisagreement: d
  };
}
async function Ae(e, t, n, r = 8e3) {
  return Tt(e, t, ve, (o) => Jn(o, n), r);
}
async function Qn(e, t, n, r = 8e3) {
  return Tt(e, t, Le, (o) => Nt(o, n), r);
}
function Xn(e) {
  const t = e.filter((n) => n.payload !== null);
  return t.length < 2 ? { consistent: !0 } : Wn(t.map((n) => ({
    eventId: n.event.id,
    recoveryGeneration: n.payload.recovery_generation,
    previousRecoveryEventId: n.payload.previous_recovery_event_id
  })));
}
async function Zn(e, t, n, r) {
  const [o, a] = await Promise.all([
    e.publishAll(t, r),
    e.publishAll(n, r)
  ]);
  return {
    credentialAcknowledgedCount: te(o),
    recoveryAcknowledgedCount: te(a),
    relaysTried: e.relayUrls.length
  };
}
const It = `abandon
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
function er(e, t, n, r) {
  un(e);
  const o = dn({ dkLen: 32, asyncTick: 10 }, r), { c: a, dkLen: i, asyncTick: c } = o;
  if (Ie(a), Ie(i), Ie(c), a < 1)
    throw new Error("iterations (c) should be >= 1");
  const s = rt(t), l = rt(n), u = new Uint8Array(i), d = dt.create(e, s), g = d._cloneInto().update(l);
  return { c: a, dkLen: i, asyncTick: c, DK: u, PRF: d, PRFSalt: g };
}
function tr(e, t, n, r, o) {
  return e.destroy(), t.destroy(), r && r.destroy(), yn(o), n;
}
async function nr(e, t, n, r) {
  const { c: o, dkLen: a, asyncTick: i, DK: c, PRF: s, PRFSalt: l } = er(e, t, n, r);
  let u;
  const d = new Uint8Array(4), g = cn(d), w = new Uint8Array(s.outputLen);
  for (let v = 1, f = 0; f < a; v++, f += s.outputLen) {
    const p = c.subarray(f, f + s.outputLen);
    g.setInt32(0, v, !1), (u = l._cloneInto(u)).update(d).digestInto(w), p.set(w.subarray(0, p.length)), await ln(o - 1, i, () => {
      s._cloneInto(u).update(w).digestInto(w);
      for (let h = 0; h < p.length; h++)
        p[h] ^= w[h];
    });
  }
  return tr(s, l, c, u, w);
}
/*! scure-bip39 - MIT License (c) 2022 Patricio Palladino, Paul Miller (paulmillr.com) */
const rr = (e) => e[0] === "あいこくしん";
function Mt(e) {
  if (typeof e != "string")
    throw new TypeError("invalid mnemonic type: " + typeof e);
  return e.normalize("NFKD");
}
function Ut(e) {
  const t = Mt(e), n = t.split(" ");
  if (![12, 15, 18, 21, 24].includes(n.length))
    throw new Error("Invalid mnemonic");
  return { nfkd: t, words: n };
}
function Ot(e) {
  pn(e, 16, 20, 24, 28, 32);
}
const or = (e) => {
  const t = 8 - e.length / 4;
  return new Uint8Array([yt(e)[0] >> t << t]);
};
function Dt(e) {
  if (!Array.isArray(e) || e.length !== 2048 || typeof e[0] != "string")
    throw new Error("Wordlist: expected array of 2048 strings");
  return e.forEach((t) => {
    if (typeof t != "string")
      throw new Error("wordlist: non-string element: " + t);
  }), Pe.chain(Pe.checksum(1, or), Pe.radix2(11, !0), Pe.alphabet(e));
}
function ar(e, t) {
  const { words: n } = Ut(e), r = Dt(t).decode(n);
  return Ot(r), r;
}
function ir(e, t) {
  return Ot(e), Dt(t).encode(e).join(rr(t) ? "　" : " ");
}
function sr(e, t) {
  try {
    ar(e, t);
  } catch {
    return !1;
  }
  return !0;
}
const cr = (e) => Mt("mnemonic" + e);
function lr(e, t = "") {
  return nr(hn, Ut(e).nfkd, cr(t), { c: 2048, dkLen: 64 });
}
function ur(e) {
  if (e.length !== 16)
    throw new Error("Recovery phrase entropy must be exactly 128 bits (16 bytes).");
  return ir(e, It);
}
function dr(e) {
  try {
    return sr(qt(e), It);
  } catch {
    return !1;
  }
}
function qt(e) {
  return e.trim().normalize("NFKD").split(/\s+/u).join(" ");
}
async function zt(e) {
  return lr(qt(e), "");
}
const Qe = vn.id, ke = "aes-256-gcm-v1", Ee = "bitlogin-bip39-hkdf-v1";
async function jt(e) {
  const t = Ne(e.loginName), n = e.now ?? Math.floor(Date.now() / 1e3), { locatorPrivateKey: r, capsuleKey: o } = await be(e.password, t), a = R(r), i = new T(e.vaultRelayUrls, { authPrivateKey: r });
  let c;
  try {
    c = await Ae(i, a, o, e.timeoutMs);
  } finally {
    i.closeAll();
  }
  if (!c.quorumMet)
    throw new ae("Couldn't verify this login name and password aren't already registered. Please retry, or add more vault relays.");
  if (c.candidates.length > 0)
    throw new ft();
  const s = ur(gn()), l = await zt(s), { recoveryPrivateKey: u, capsuleKey: d } = ht(l), g = R(u), w = e.everydayPrivateKey !== void 0;
  if (w && !He(e.everydayPrivateKey))
    throw new ae("The provided key is not a valid secp256k1 private key.");
  const v = w ? e.everydayPrivateKey : wn(), f = R(v), p = oe(bn()), h = {
    schema: Ve,
    account_id: p,
    recovery_generation: 0,
    previous_recovery_event_id: null,
    operational_private_key: oe(v),
    operational_public_key: f,
    recovery_public_key: g,
    created_at: n,
    vault_relay_hints: e.vaultRelayUrls,
    protocol: { capsule_encryption: ke, recovery_derivation: Ee }
  }, b = await St({
    recoveryPrivateKey: u,
    capsuleKey: d,
    payload: h
  }), m = {
    schema: Ce,
    account_id: p,
    generation: 0,
    operational_private_key: oe(v),
    operational_public_key: f,
    recovery_public_key: g,
    recovery_capsule_event: b,
    created_at: n,
    vault_relay_hints: e.vaultRelayUrls,
    protocol: {
      password_kdf: Qe,
      capsule_encryption: ke,
      recovery_derivation: Ee
    }
  }, P = await Ye({
    locatorPrivateKey: r,
    capsuleKey: o,
    payload: m
  }), I = new T(e.vaultRelayUrls, { authPrivateKey: u }), E = await me(I, b, {
    dTag: Le,
    minAcks: e.minAcknowledgements,
    timeoutMs: e.timeoutMs
  });
  I.closeAll();
  const _ = new T(e.vaultRelayUrls, { authPrivateKey: r }), K = await me(_, P, {
    dTag: ve,
    minAcks: e.minAcknowledgements,
    timeoutMs: e.timeoutMs
  });
  if (_.closeAll(), !E.success || !K.success)
    throw new ae("Registration did not reach the required relay acknowledgement and readback quorum. Please retry, or add more vault relays.");
  return {
    normalizedLoginName: t,
    recoveryPhrase: s,
    everydayPrivateKey: v,
    everydayPublicKey: f,
    recoveryPublicKey: g,
    locatorPublicKey: a,
    accountId: p,
    imported: w,
    credentialEvent: P,
    recoveryEvent: b,
    credentialPublish: K,
    recoveryPublish: E
  };
}
async function yr(e) {
  const { nsecOrHex: t, ...n } = e, r = $t(t);
  return jt({ ...n, everydayPrivateKey: r });
}
function $t(e) {
  const t = e.trim();
  let n;
  if (t.startsWith("nsec1"))
    n = fn(t);
  else if (/^[0-9a-fA-F]{64}$/u.test(t))
    n = Se(t.toLowerCase());
  else
    throw new ae("Enter a valid nsec (nsec1…) or a 64-character hex private key.");
  if (!He(n))
    throw new ae("The provided key is not a valid secp256k1 private key.");
  return n;
}
class Bt {
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
async function hr(e) {
  const t = Ne(e.loginName), { locatorPrivateKey: n, capsuleKey: r } = await be(e.password, t), o = R(n), a = new T(e.vaultRelayUrls, { authPrivateKey: n });
  try {
    const i = await Ae(a, o, r, e.timeoutMs);
    if (!i.quorumMet)
      throw new ye("quorum-not-met");
    if (!i.best)
      throw new ye(i.candidates.length > 0 ? "no-valid-candidate" : "no-matching-event");
    const c = i.best.payload, s = e.store ?? new Bt(), l = await We(s, c.operational_public_key), u = c.generation < l.generation;
    if (u && !e.acknowledgeRollback)
      throw new wt(l.generation, c.generation);
    const d = u ? `This device previously saw credential generation ${l.generation}, but the accepted capsule is generation ${c.generation}. Relays may be serving stale data, or an old capsule is being replayed.` : void 0;
    await kt(s, c.operational_public_key, { generation: c.generation });
    const g = i.relayDisagreement ? 'Configured relays returned different credential capsules as "latest" for this account. Some relays may be stale, censored, or malicious.' : void 0;
    return {
      everydayPrivateKey: ue(c.operational_private_key),
      everydayPublicKey: c.operational_public_key,
      recoveryPublicKey: c.recovery_public_key,
      accountId: c.account_id,
      generation: c.generation,
      credentialEvent: i.best.event,
      recoveryCapsuleEvent: c.recovery_capsule_event,
      rollbackWarning: d,
      relayDisagreementWarning: g
    };
  } finally {
    a.closeAll();
  }
}
function at(e) {
  return e.filter((t) => ce(t)).sort((t, n) => n.created_at - t.created_at)[0];
}
async function pr(e) {
  if (!dr(e.phrase))
    throw new gt("This does not look like a valid 12-word BitLogin recovery phrase.");
  const t = await zt(e.phrase), { recoveryPrivateKey: n, capsuleKey: r } = ht(t), o = R(n), a = new T(e.vaultRelayUrls, { authPrivateKey: n });
  let i;
  try {
    i = await Qn(a, o, r, e.timeoutMs);
  } finally {
    a.closeAll();
  }
  if (e.offlineRecoveryCapsuleEvents?.length) {
    const f = [];
    for (const m of e.offlineRecoveryCapsuleEvents)
      if (ce(m))
        try {
          f.push({ event: m, payload: await Nt(m, r) });
        } catch (P) {
          f.push({ event: m, payload: null, error: P.message });
        }
    const p = /* @__PURE__ */ new Map();
    for (const m of [...i.candidates, ...f])
      p.set(m.event.id, m);
    const h = [...p.values()].sort((m, P) => P.event.created_at - m.event.created_at), b = h.find((m) => m.payload !== null) ?? null;
    i = { ...i, candidates: h, best: b, quorumMet: i.quorumMet || b !== null };
  }
  if (!i.quorumMet)
    throw new ye("quorum-not-met");
  if (!i.best)
    throw new ye(i.candidates.length > 0 ? "no-valid-candidate" : "no-matching-event");
  const c = i.best.payload, s = Xn(i.candidates), l = ue(c.operational_private_key), u = c.operational_public_key, d = [.../* @__PURE__ */ new Set([...e.discoveryRelayUrls, ...c.vault_relay_hints])], g = new T(d);
  let w = [], v = [];
  try {
    const f = await g.queryQuorum({ kinds: [$e], authors: [u], limit: 5 }, e.timeoutMs), p = at(f.outcomes.flatMap((m) => m.events));
    p && (w = Tn(p));
    const h = await g.queryQuorum({ kinds: [Be], authors: [u], limit: 5 }, e.timeoutMs), b = at(h.outcomes.flatMap((m) => m.events));
    b && (v = In(b));
  } finally {
    g.closeAll();
  }
  return {
    everydayPrivateKey: l,
    everydayPublicKey: u,
    recoveryPrivateKey: n,
    recoveryPublicKey: o,
    recoveryCapsuleKey: r,
    accountId: c.account_id,
    currentRecoveryEvent: i.best.event,
    currentRecoveryPayload: c,
    generalRelays: w,
    dmRelays: v,
    chainWarning: s.consistent ? void 0 : s.warning
  };
}
async function vr(e) {
  const t = e.now ?? Math.floor(Date.now() / 1e3), n = Ne(e.newLoginName), { recovered: r } = e, o = {
    schema: Ve,
    account_id: r.accountId,
    recovery_generation: r.currentRecoveryPayload.recovery_generation + 1,
    previous_recovery_event_id: r.currentRecoveryEvent.id,
    operational_private_key: oe(r.everydayPrivateKey),
    operational_public_key: r.everydayPublicKey,
    recovery_public_key: r.recoveryPublicKey,
    created_at: bt(r.currentRecoveryEvent.created_at, t),
    vault_relay_hints: e.vaultRelayUrls,
    protocol: { capsule_encryption: ke, recovery_derivation: Ee }
  }, a = await St({
    recoveryPrivateKey: r.recoveryPrivateKey,
    capsuleKey: r.recoveryCapsuleKey,
    payload: o
  }), i = new T(e.vaultRelayUrls, { authPrivateKey: r.recoveryPrivateKey }), c = await me(i, a, {
    dTag: Le,
    minAcks: e.minAcknowledgements,
    timeoutMs: e.timeoutMs
  });
  i.closeAll();
  const { locatorPrivateKey: s, capsuleKey: l } = await be(e.newPassword, n), u = R(s), d = {
    schema: Ce,
    account_id: r.accountId,
    generation: 0,
    operational_private_key: oe(r.everydayPrivateKey),
    operational_public_key: r.everydayPublicKey,
    recovery_public_key: r.recoveryPublicKey,
    recovery_capsule_event: a,
    created_at: t,
    vault_relay_hints: e.vaultRelayUrls,
    protocol: {
      password_kdf: Qe,
      capsule_encryption: ke,
      recovery_derivation: Ee
    }
  }, g = await Ye({ locatorPrivateKey: s, capsuleKey: l, payload: d }), w = new T(e.vaultRelayUrls, { authPrivateKey: s }), v = await me(w, g, {
    dTag: ve,
    minAcks: e.minAcknowledgements,
    timeoutMs: e.timeoutMs
  });
  if (w.closeAll(), !c.success || !v.success)
    throw new gt("Could not publish the refreshed recovery and credential capsules to enough relays. Please retry.");
  return { normalizedLoginName: n, locatorPublicKey: u, credentialEvent: g, refreshedRecoveryEvent: a, credentialPublish: v, recoveryPublish: c };
}
function fr(e) {
  const t = R(e.privateKey);
  return X({
    pubkey: t,
    created_at: e.createdAt,
    kind: mn,
    tags: [
      ["e", e.eventIdToDelete],
      ["k", String(e.deletedEventKind)]
    ],
    content: e.reason ?? ""
  }, e.privateKey);
}
async function gr(e) {
  const t = e.now ?? Math.floor(Date.now() / 1e3), n = Ne(e.loginName), r = await be(e.oldPassword, n), o = R(r.locatorPrivateKey), a = new T(e.vaultRelayUrls, { authPrivateKey: r.locatorPrivateKey });
  let i;
  try {
    i = await Ae(a, o, r.capsuleKey, e.timeoutMs);
  } finally {
    a.closeAll();
  }
  if (!i.quorumMet)
    throw new ye("quorum-not-met");
  if (!i.best)
    throw new ye(i.candidates.length > 0 ? "no-valid-candidate" : "no-matching-event");
  const c = i.best.payload, s = i.best.event, l = e.store ?? new Bt(), u = await We(l, c.operational_public_key);
  if (c.generation < u.generation && !e.acknowledgeRollback)
    throw new wt(u.generation, c.generation);
  const d = await be(e.newPassword, n), g = R(d.locatorPrivateKey), w = new T(e.vaultRelayUrls, { authPrivateKey: d.locatorPrivateKey });
  let v;
  try {
    v = await Ae(w, g, d.capsuleKey, e.timeoutMs);
  } finally {
    w.closeAll();
  }
  if (!v.quorumMet)
    throw new ae("Couldn't verify the new password isn't already registered under this login name. Please retry, or add more vault relays.");
  if (v.candidates.length > 0)
    throw new ft("Another account is already registered with this login name and the new password you chose. Pick a different new password.");
  const f = c.generation + 1, p = {
    schema: Ce,
    account_id: c.account_id,
    generation: f,
    operational_private_key: c.operational_private_key,
    operational_public_key: c.operational_public_key,
    recovery_public_key: c.recovery_public_key,
    recovery_capsule_event: c.recovery_capsule_event,
    created_at: t,
    vault_relay_hints: e.vaultRelayUrls,
    protocol: {
      password_kdf: Qe,
      capsule_encryption: ke,
      recovery_derivation: Ee
    }
  }, h = await Ye({
    locatorPrivateKey: d.locatorPrivateKey,
    capsuleKey: d.capsuleKey,
    payload: p
  }), b = new T(e.vaultRelayUrls, { authPrivateKey: d.locatorPrivateKey }), m = await me(b, h, {
    dTag: ve,
    minAcks: e.minAcknowledgements,
    timeoutMs: e.timeoutMs
  });
  b.closeAll();
  const P = Fn({
    oldLocatorPrivateKey: r.locatorPrivateKey,
    createdAt: bt(s.created_at, t)
  }), I = fr({
    privateKey: r.locatorPrivateKey,
    eventIdToDelete: s.id,
    deletedEventKind: he,
    createdAt: t
  }), E = new T(e.vaultRelayUrls, { authPrivateKey: r.locatorPrivateKey }), [_, K] = await Promise.all([
    E.publishAll(P, e.timeoutMs),
    E.publishAll(I, e.timeoutMs)
  ]);
  if (E.closeAll(), !m.success)
    throw new ae("The new credential capsule did not reach the required relay acknowledgement and readback quorum. Please retry.");
  return await kt(l, c.operational_public_key, { generation: f }), {
    normalizedLoginName: n,
    oldLocatorPublicKey: o,
    newLocatorPublicKey: g,
    newGeneration: f,
    recoveryPublicKey: c.recovery_public_key,
    recoveryCapsuleEvent: c.recovery_capsule_event,
    newCredentialEvent: h,
    tombstoneEvent: P,
    deletionRequestEvent: I,
    newCredentialPublish: m,
    tombstoneAcknowledgedCount: te(_),
    deletionAcknowledgedCount: te(K)
  };
}
/*! noble-ciphers - MIT License (c) 2023 Paul Miller (paulmillr.com) */
function wr(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in e && e.BYTES_PER_ELEMENT === 1;
}
function it(e) {
  if (typeof e != "boolean")
    throw new TypeError(`boolean expected, not ${e}`);
}
function Me(e) {
  if (typeof e != "number")
    throw new TypeError("number expected, got " + typeof e);
  if (!Number.isSafeInteger(e) || e < 0)
    throw new RangeError("positive integer expected, got " + e);
}
function S(e, t, n = "") {
  const r = wr(e), o = e?.length, a = t !== void 0;
  if (!r || a && o !== t) {
    const i = n && `"${n}" `, c = a ? ` of length ${t}` : "", s = r ? `length=${o}` : `type=${typeof e}`, l = i + "expected Uint8Array" + c + ", got " + s;
    throw r ? new RangeError(l) : new TypeError(l);
  }
  return e;
}
function A(e) {
  return new Uint32Array(e.buffer, e.byteOffset, Math.floor(e.byteLength / 4));
}
function se(...e) {
  for (let t = 0; t < e.length; t++)
    e[t].fill(0);
}
const W = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68, br = (e) => e << 24 & 4278190080 | e << 8 & 16711680 | e >>> 8 & 65280 | e >>> 24 & 255, mr = (e) => {
  for (let t = 0; t < e.length; t++)
    e[t] = br(e[t]);
  return e;
}, N = W ? (e) => e : mr;
function kr(e, t) {
  return !e.byteLength || !t.byteLength ? !1 : e.buffer === t.buffer && // best we can do, may fail with an obscure Proxy
  e.byteOffset < t.byteOffset + t.byteLength && // a starts before b end
  t.byteOffset < e.byteOffset + e.byteLength;
}
function Gt(e, t) {
  if (kr(e, t) && e.byteOffset < t.byteOffset)
    throw new Error("complex overlap of input and output is not supported");
}
function Er(e, t) {
  if (t == null || typeof t != "object")
    throw new Error("options must be defined");
  return Object.assign(e, t);
}
const Pr = /* @__NO_SIDE_EFFECTS__ */ (e, t) => {
  function n(r, ...o) {
    if (S(r, void 0, "key"), e.nonceLength !== void 0) {
      const u = o[0];
      S(u, e.varSizeNonce ? void 0 : e.nonceLength, "nonce");
    }
    const a = e.tagLength;
    a && o[1] !== void 0 && S(o[1], void 0, "AAD");
    const i = t(r, ...o), c = (u, d) => {
      if (d !== void 0) {
        if (u !== 2)
          throw new Error("cipher output not supported");
        S(d, void 0, "output");
      }
    };
    let s = !1;
    return {
      encrypt(u, d) {
        if (s)
          throw new Error("cannot encrypt() twice with same key + nonce");
        return s = !0, S(u), c(i.encrypt.length, d), i.encrypt(u, d);
      },
      decrypt(u, d) {
        if (S(u), a && u.length < a)
          throw new Error('"ciphertext" expected length bigger than tagLength=' + a);
        return c(i.decrypt.length, d), i.decrypt(u, d);
      }
    };
  }
  return Object.assign(n, e), n;
};
function Xe(e, t, n = !0) {
  if (t === void 0)
    return new Uint8Array(e);
  if (S(t, void 0, "output"), t.length !== e)
    throw new Error('"output" expected Uint8Array of length ' + e + ", got: " + t.length);
  if (n && !Q(t))
    throw new Error("invalid output, must be aligned");
  return t;
}
function Q(e) {
  return e.byteOffset % 4 === 0;
}
function ie(e) {
  return Uint8Array.from(S(e));
}
const Vt = (e) => Uint8Array.from(e.split(""), (t) => t.charCodeAt(0)), _r = N(A(Vt("expand 16-byte k"))), Kr = N(A(Vt("expand 32-byte k")));
function k(e, t) {
  return e << t | e >>> 32 - t;
}
const fe = 64, Rr = 16, De = 2 ** 32 - 1, st = /* @__PURE__ */ Uint32Array.of();
function xr(e, t, n, r, o, a, i, c) {
  const s = o.length, l = new Uint8Array(fe), u = A(l), d = W && Q(o) && Q(a), g = d ? A(o) : st, w = d ? A(a) : st;
  if (!W) {
    for (let v = 0; v < s; i++) {
      if (e(t, n, r, u, i, c), N(u), i >= De)
        throw new Error("arx: counter overflow");
      const f = Math.min(fe, s - v);
      for (let p = 0, h; p < f; p++)
        h = v + p, a[h] = o[h] ^ l[p];
      v += f;
    }
    return;
  }
  for (let v = 0; v < s; i++) {
    if (e(t, n, r, u, i, c), i >= De)
      throw new Error("arx: counter overflow");
    const f = Math.min(fe, s - v);
    if (d && f === fe) {
      const p = v / 4;
      if (v % 4 !== 0)
        throw new Error("arx: invalid block position");
      for (let h = 0, b; h < Rr; h++)
        b = p + h, w[b] = g[b] ^ u[h];
      v += fe;
      continue;
    }
    for (let p = 0, h; p < f; p++)
      h = v + p, a[h] = o[h] ^ l[p];
    v += f;
  }
}
function Ar(e, t) {
  const { allowShortKeys: n, extendNonceFn: r, counterLength: o, counterRight: a, rounds: i } = Er({ allowShortKeys: !1, counterLength: 8, counterRight: !1, rounds: 20 }, t);
  if (typeof e != "function")
    throw new Error("core must be a function");
  return Me(o), Me(i), it(a), it(n), (c, s, l, u, d = 0) => {
    S(c, void 0, "key"), S(s, void 0, "nonce"), S(l, void 0, "data");
    const g = l.length;
    if (u = Xe(g, u, !1), Me(d), d < 0 || d >= De)
      throw new Error("arx: counter overflow");
    const w = [];
    let v = c.length, f, p;
    if (v === 32)
      w.push(f = ie(c)), p = Kr;
    else if (v === 16 && n)
      f = new Uint8Array(32), f.set(c), f.set(c, 16), p = _r, w.push(f);
    else
      throw S(c, 32, "arx key"), new Error("invalid key size");
    (!W || !Q(s)) && w.push(s = ie(s));
    let h = A(f);
    if (r) {
      if (s.length !== 24)
        throw new Error("arx: extended nonce must be 24 bytes");
      const P = s.subarray(0, 16);
      if (W)
        r(p, h, A(P), h);
      else {
        const I = N(Uint32Array.from(p));
        r(I, h, A(P), h), se(I), N(h);
      }
      s = s.subarray(16);
    } else W || N(h);
    const b = 16 - o;
    if (b !== s.length)
      throw new Error(`arx: nonce must be ${b} or 16 bytes`);
    if (b !== 12) {
      const P = new Uint8Array(12);
      P.set(s, a ? 0 : 12 - s.length), s = P, w.push(s);
    }
    const m = N(A(s));
    try {
      return xr(e, p, h, m, l, u, d, i), u;
    } finally {
      se(...w);
    }
  };
}
function Cr(e, t, n, r, o, a = 20) {
  let i = e[0], c = e[1], s = e[2], l = e[3], u = t[0], d = t[1], g = t[2], w = t[3], v = t[4], f = t[5], p = t[6], h = t[7], b = o, m = n[0], P = n[1], I = n[2], E = i, _ = c, K = s, L = l, M = u, U = d, O = g, D = w, q = v, z = f, j = p, $ = h, B = b, G = m, V = P, H = I;
  for (let nt = 0; nt < a; nt += 2)
    E = E + M | 0, B = k(B ^ E, 16), q = q + B | 0, M = k(M ^ q, 12), E = E + M | 0, B = k(B ^ E, 8), q = q + B | 0, M = k(M ^ q, 7), _ = _ + U | 0, G = k(G ^ _, 16), z = z + G | 0, U = k(U ^ z, 12), _ = _ + U | 0, G = k(G ^ _, 8), z = z + G | 0, U = k(U ^ z, 7), K = K + O | 0, V = k(V ^ K, 16), j = j + V | 0, O = k(O ^ j, 12), K = K + O | 0, V = k(V ^ K, 8), j = j + V | 0, O = k(O ^ j, 7), L = L + D | 0, H = k(H ^ L, 16), $ = $ + H | 0, D = k(D ^ $, 12), L = L + D | 0, H = k(H ^ L, 8), $ = $ + H | 0, D = k(D ^ $, 7), E = E + U | 0, H = k(H ^ E, 16), j = j + H | 0, U = k(U ^ j, 12), E = E + U | 0, H = k(H ^ E, 8), j = j + H | 0, U = k(U ^ j, 7), _ = _ + O | 0, B = k(B ^ _, 16), $ = $ + B | 0, O = k(O ^ $, 12), _ = _ + O | 0, B = k(B ^ _, 8), $ = $ + B | 0, O = k(O ^ $, 7), K = K + D | 0, G = k(G ^ K, 16), q = q + G | 0, D = k(D ^ q, 12), K = K + D | 0, G = k(G ^ K, 8), q = q + G | 0, D = k(D ^ q, 7), L = L + M | 0, V = k(V ^ L, 16), z = z + V | 0, M = k(M ^ z, 12), L = L + M | 0, V = k(V ^ L, 8), z = z + V | 0, M = k(M ^ z, 7);
  let C = 0;
  r[C++] = i + E | 0, r[C++] = c + _ | 0, r[C++] = s + K | 0, r[C++] = l + L | 0, r[C++] = u + M | 0, r[C++] = d + U | 0, r[C++] = g + O | 0, r[C++] = w + D | 0, r[C++] = v + q | 0, r[C++] = f + z | 0, r[C++] = p + j | 0, r[C++] = h + $ | 0, r[C++] = b + B | 0, r[C++] = m + G | 0, r[C++] = P + V | 0, r[C++] = I + H | 0;
}
const Ht = /* @__PURE__ */ Ar(Cr, {
  counterRight: !1,
  counterLength: 4,
  allowShortKeys: !1
}), Wt = 2, qe = 1, Ft = 65536, ze = 4294967295;
function ct(e, t) {
  const n = Te(new Uint8Array([2]), Se(t)), o = vt.getSharedSecret(e, n, !0).slice(1, 33);
  return kn(pe("nip44-v2"), o);
}
function Jt(e, t) {
  const n = Pn(e, t, 76);
  return {
    chachaKey: n.slice(0, 32),
    chachaNonce: n.slice(32, 44),
    hmacKey: n.slice(44, 76)
  };
}
function Yt(e) {
  if (e <= 32)
    return 32;
  const t = 2 ** Math.floor(Math.log2(e - 1) + 1), n = t <= 256 ? 32 : t / 8;
  return n * (Math.floor((e - 1) / n) + 1);
}
function Lr(e) {
  if (e < Ft) {
    const n = new Uint8Array(2);
    return new DataView(n.buffer).setUint16(0, e, !1), n;
  }
  const t = new Uint8Array(6);
  return new DataView(t.buffer).setUint32(2, e, !1), t;
}
function Sr(e) {
  const t = e.length;
  if (t < qe || t > ze)
    throw new Error(`NIP-44 plaintext length must be between ${qe} and ${ze} bytes.`);
  const n = Lr(t), r = Yt(t), o = new Uint8Array(n.length + r);
  return o.set(n, 0), o.set(e, n.length), o;
}
function Nr(e) {
  const t = new DataView(e.buffer, e.byteOffset, e.byteLength), n = t.getUint16(0, !1);
  let r, o;
  if (n === 0) {
    if (r = t.getUint32(2, !1), o = 6, r < Ft)
      throw new Error("NIP-44 payload has inconsistent padding.");
  } else
    r = n, o = 2;
  if (r < qe || r > ze || e.length !== o + Yt(r))
    throw new Error("NIP-44 payload has inconsistent padding.");
  return e.slice(o, o + r);
}
function Qt(e, t, n) {
  return dt(yt, e, Te(t, n));
}
function Tr(e, t, n) {
  const r = pt(32), { chachaKey: o, chachaNonce: a, hmacKey: i } = Jt(e, r), c = Sr(pe(t)), s = Ht(o, a, c), l = Qt(i, r, s);
  return de.encode(Te(new Uint8Array([Wt]), r, s, l));
}
function Ir(e, t) {
  const n = de.decode(t);
  if (n[0] !== Wt)
    throw new Error(`Unsupported NIP-44 version: ${n[0]}`);
  const r = n.slice(1, 33), o = n.slice(n.length - 32), a = n.slice(33, n.length - 32), { chachaKey: i, chachaNonce: c, hmacKey: s } = Jt(e, r), l = Qt(s, r, a);
  if (!En(o, l))
    throw new Error("NIP-44 MAC verification failed: payload is corrupted, tampered, or uses the wrong key.");
  const u = Ht(i, c, a);
  return Ge(Nr(u));
}
const ne = 16, Mr = 283;
function Ur(e) {
  if (![16, 24, 32].includes(e.length))
    throw new Error('"aes key" expected Uint8Array of length 16/24/32, got length=' + e.length);
}
function Ze(e) {
  return e << 1 ^ Mr & -(e >> 7);
}
function le(e, t) {
  let n = 0;
  for (; t > 0; t >>= 1)
    n ^= e & -(t & 1), e = Ze(e);
  return n;
}
const je = /* @__PURE__ */ (() => {
  const e = new Uint8Array(256);
  for (let n = 0, r = 1; n < 256; n++, r ^= Ze(r))
    e[n] = r;
  const t = new Uint8Array(256);
  t[0] = 99;
  for (let n = 0; n < 255; n++) {
    let r = e[255 - n];
    r |= r << 8, t[e[n]] = (r ^ r >> 4 ^ r >> 5 ^ r >> 6 ^ r >> 7 ^ 99) & 255;
  }
  return se(e), t;
})(), Or = /* @__PURE__ */ je.map((e, t) => je.indexOf(t)), Dr = (e) => e << 24 | e >>> 8, Ue = (e) => e << 8 | e >>> 24;
function Xt(e, t) {
  if (e.length !== 256)
    throw new Error("Wrong sbox length");
  const n = new Uint32Array(256).map((l, u) => t(e[u])), r = n.map(Ue), o = r.map(Ue), a = o.map(Ue), i = new Uint32Array(256 * 256), c = new Uint32Array(256 * 256), s = new Uint16Array(256 * 256);
  for (let l = 0; l < 256; l++)
    for (let u = 0; u < 256; u++) {
      const d = l * 256 + u;
      i[d] = n[l] ^ r[u], c[d] = o[l] ^ a[u], s[d] = e[l] << 8 | e[u];
    }
  return { sbox: e, sbox2: s, T0: n, T1: r, T2: o, T3: a, T01: i, T23: c };
}
const et = /* @__PURE__ */ Xt(je, (e) => le(e, 3) << 24 | e << 16 | e << 8 | le(e, 2)), Zt = /* @__PURE__ */ Xt(Or, (e) => le(e, 11) << 24 | le(e, 13) << 16 | le(e, 9) << 8 | le(e, 14)), qr = /* @__PURE__ */ (() => {
  const e = new Uint8Array(16);
  for (let t = 0, n = 1; t < 16; t++, n = Ze(n))
    e[t] = n;
  return e;
})();
function en(e) {
  S(e);
  const t = e.length;
  Ur(e);
  const { sbox2: n } = et, r = [];
  (!W || !Q(e)) && r.push(e = ie(e));
  const o = N(A(e)), a = o.length, i = (s) => F(n, s, s, s, s), c = new Uint32Array(t + 28);
  c.set(o);
  for (let s = a; s < c.length; s++) {
    let l = c[s - 1];
    s % a === 0 ? l = i(Dr(l)) ^ qr[s / a - 1] : a > 6 && s % a === 4 && (l = i(l)), c[s] = c[s - a] ^ l;
  }
  return se(...r), c;
}
function zr(e) {
  const t = en(e), n = t.slice(), r = t.length, { sbox2: o } = et, { T0: a, T1: i, T2: c, T3: s } = Zt;
  for (let l = 0; l < r; l += 4)
    for (let u = 0; u < 4; u++)
      n[l + u] = t[r - l - 4 + u];
  se(t);
  for (let l = 4; l < r - 4; l++) {
    const u = n[l], d = F(o, u, u, u, u);
    n[l] = a[d & 255] ^ i[d >>> 8 & 255] ^ c[d >>> 16 & 255] ^ s[d >>> 24];
  }
  return n;
}
function ee(e, t, n, r, o, a) {
  return e[n << 8 & 65280 | r >>> 8 & 255] ^ t[o >>> 8 & 65280 | a >>> 24 & 255];
}
function F(e, t, n, r, o) {
  return e[t & 255 | n & 65280] | e[r >>> 16 & 255 | o >>> 16 & 65280] << 16;
}
function lt(e, t, n, r, o) {
  const { sbox2: a, T01: i, T23: c } = et;
  let s = 0;
  t ^= e[s++], n ^= e[s++], r ^= e[s++], o ^= e[s++];
  const l = e.length / 4 - 2;
  for (let v = 0; v < l; v++) {
    const f = e[s++] ^ ee(i, c, t, n, r, o), p = e[s++] ^ ee(i, c, n, r, o, t), h = e[s++] ^ ee(i, c, r, o, t, n), b = e[s++] ^ ee(i, c, o, t, n, r);
    t = f, n = p, r = h, o = b;
  }
  const u = e[s++] ^ F(a, t, n, r, o), d = e[s++] ^ F(a, n, r, o, t), g = e[s++] ^ F(a, r, o, t, n), w = e[s++] ^ F(a, o, t, n, r);
  return { s0: u, s1: d, s2: g, s3: w };
}
function jr(e, t, n, r, o) {
  const { sbox2: a, T01: i, T23: c } = Zt;
  let s = 0;
  t ^= e[s++], n ^= e[s++], r ^= e[s++], o ^= e[s++];
  const l = e.length / 4 - 2;
  for (let v = 0; v < l; v++) {
    const f = e[s++] ^ ee(i, c, t, o, r, n), p = e[s++] ^ ee(i, c, n, t, o, r), h = e[s++] ^ ee(i, c, r, n, t, o), b = e[s++] ^ ee(i, c, o, r, n, t);
    t = f, n = p, r = h, o = b;
  }
  const u = e[s++] ^ F(a, t, o, r, n), d = e[s++] ^ F(a, n, t, o, r), g = e[s++] ^ F(a, r, n, t, o), w = e[s++] ^ F(a, o, r, n, t);
  return { s0: u, s1: d, s2: g, s3: w };
}
function $r(e) {
  if (S(e), e.length % ne !== 0)
    throw new Error("aes-(cbc/ecb).decrypt ciphertext should consist of blocks with size " + ne);
}
function Br(e, t, n) {
  S(e);
  let r = e.length;
  const o = r % ne;
  if (!t && o !== 0)
    throw new Error("aec/(cbc-ecb): unpadded plaintext with disabled padding");
  if (t) {
    let c = ne - o;
    c || (c = ne), r = r + c;
  }
  n = Xe(r, n), Gt(e, n), (!W || !Q(e)) && (e = ie(e));
  const a = A(e);
  N(a);
  const i = A(n);
  return { b: a, o: i, out: n };
}
function Gr(e, t) {
  if (!t)
    return e;
  const n = e.length;
  if (n === 0)
    throw new Error("aes/pkcs7: empty ciphertext not allowed");
  const r = e[n - 1];
  let o = 1;
  o &= r - 1 >>> 31 ^ 1, o &= 16 - r >>> 31 ^ 1;
  for (let a = 0; a < 16; a++) {
    const i = a - r >>> 31, c = (e[n - 1 - a] ^ r) === 0 ? 1 : 0;
    o &= c | i ^ 1;
  }
  if (!o)
    throw new Error("aes/pkcs7: wrong padding");
  return e.subarray(0, n - r);
}
function Vr(e) {
  const t = new Uint8Array(16), n = A(t);
  t.set(e);
  const r = ne - e.length;
  for (let o = ne - r; o < ne; o++)
    t[o] = r;
  return n;
}
const tn = /* @__PURE__ */ Pr({ blockSize: 16, nonceLength: 16 }, function(t, n, r = {}) {
  const o = !r.disablePadding;
  return {
    encrypt(a, i) {
      const c = en(t), { b: s, o: l, out: u } = Br(a, o, i);
      let d = n;
      const g = [c];
      (!W || !Q(d)) && g.push(d = ie(d));
      const w = A(d);
      N(w);
      let v = w[0], f = w[1], p = w[2], h = w[3], b = 0;
      for (; b + 4 <= s.length; )
        v ^= s[b + 0], f ^= s[b + 1], p ^= s[b + 2], h ^= s[b + 3], { s0: v, s1: f, s2: p, s3: h } = lt(c, v, f, p, h), l[b++] = v, l[b++] = f, l[b++] = p, l[b++] = h;
      if (o) {
        const m = Vr(a.subarray(b * 4));
        N(m), v ^= m[0], f ^= m[1], p ^= m[2], h ^= m[3], { s0: v, s1: f, s2: p, s3: h } = lt(c, v, f, p, h), l[b++] = v, l[b++] = f, l[b++] = p, l[b++] = h;
      }
      return N(l), se(...g), u;
    },
    decrypt(a, i) {
      $r(a);
      const c = zr(t);
      let s = n;
      const l = [c];
      (!W || !Q(s)) && l.push(s = ie(s));
      const u = A(s);
      N(u), i = Xe(a.length, i), Gt(a, i), (!W || !Q(a)) && l.push(a = ie(a));
      const d = A(a), g = A(i);
      N(d);
      let w = u[0], v = u[1], f = u[2], p = u[3];
      for (let h = 0; h + 4 <= d.length; ) {
        const b = w, m = v, P = f, I = p;
        w = d[h + 0], v = d[h + 1], f = d[h + 2], p = d[h + 3];
        const { s0: E, s1: _, s2: K, s3: L } = jr(c, w, v, f, p);
        g[h++] = E ^ b, g[h++] = _ ^ m, g[h++] = K ^ P, g[h++] = L ^ I;
      }
      return N(g), se(...l), Gr(i, o);
    }
  };
});
function nn(e, t) {
  const n = Te(new Uint8Array([2]), Se(t));
  return vt.getSharedSecret(e, n, !0).slice(1, 33);
}
function Hr(e, t, n, r) {
  const o = nn(e, t), a = pt(16), i = tn(o, a).encrypt(pe(n));
  return `${de.encode(i)}?iv=${de.encode(a)}`;
}
function Wr(e, t, n) {
  const r = n.indexOf("?iv=");
  if (r === -1)
    throw new Error('NIP-04 payload is missing its "?iv=" suffix.');
  const o = de.decode(n.slice(0, r)), a = de.decode(n.slice(r + 4)), i = nn(e, t), c = tn(i, a).decrypt(o);
  return Ge(c);
}
function Fr(...e) {
  for (const t of e)
    t && t.fill(0);
}
class _e {
  privateKey;
  publicKeyHex;
  destroyed = !1;
  constructor(t) {
    this.privateKey = t, this.publicKeyHex = R(t);
  }
  assertAlive() {
    if (this.destroyed)
      throw new Error("This signer has been destroyed (session locked or logged out).");
  }
  getPublicKey() {
    return this.assertAlive(), this.publicKeyHex;
  }
  signEvent(t) {
    return this.assertAlive(), X({
      pubkey: this.publicKeyHex,
      created_at: t.created_at ?? Math.floor(Date.now() / 1e3),
      kind: t.kind,
      tags: t.tags ?? [],
      content: t.content
    }, this.privateKey);
  }
  nip44Encrypt(t, n) {
    return this.assertAlive(), Tr(ct(this.privateKey, t), n);
  }
  nip44Decrypt(t, n) {
    return this.assertAlive(), Ir(ct(this.privateKey, t), n);
  }
  /** Legacy relative to nip44Encrypt above, but still what a real NIP-07 extension exposes as
   * window.nostr.nip04.encrypt -- implemented for drop-in parity. */
  nip04Encrypt(t, n) {
    return this.assertAlive(), Hr(this.privateKey, t, n);
  }
  nip04Decrypt(t, n) {
    return this.assertAlive(), Wr(this.privateKey, t, n);
  }
  /** Best-practical secret wipe (§11.10, §21.4): overwrites the private key buffer in place. */
  destroy() {
    Fr(this.privateKey), this.destroyed = !0;
  }
}
const Jr = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.nostr.band",
  "wss://nostr.wine",
  "wss://relay.snort.social"
], Yr = [
  "wss://purplepag.es",
  "wss://relay.nostr.band",
  "wss://nostr-pub.wellorder.net"
], Qr = "bitlogin", Z = "kv", Xr = 1;
function Zr() {
  return new Promise((e, t) => {
    const n = indexedDB.open(Qr, Xr);
    n.onupgradeneeded = () => {
      const r = n.result;
      r.objectStoreNames.contains(Z) || r.createObjectStore(Z);
    }, n.onsuccess = () => e(n.result), n.onerror = () => t(n.error);
  });
}
class eo {
  dbPromise = null;
  db() {
    return this.dbPromise || (this.dbPromise = Zr()), this.dbPromise;
  }
  async get(t) {
    const n = await this.db();
    return new Promise((r, o) => {
      const i = n.transaction(Z, "readonly").objectStore(Z).get(t);
      i.onsuccess = () => r(i.result), i.onerror = () => o(i.error);
    });
  }
  async set(t, n) {
    const r = await this.db();
    return new Promise((o, a) => {
      const i = r.transaction(Z, "readwrite");
      i.objectStore(Z).put(n, t), i.oncomplete = () => o(), i.onerror = () => a(i.error);
    });
  }
  async delete(t) {
    const n = await this.db();
    return new Promise((r, o) => {
      const a = n.transaction(Z, "readwrite");
      a.objectStore(Z).delete(t), a.oncomplete = () => r(), a.onerror = () => o(a.error);
    });
  }
}
const tt = "bitlogin:session:v1";
async function to(e, t) {
  const n = {
    everydayPrivateKeyHex: _n(t.everydayPrivateKey),
    accountId: t.accountId,
    recoveryPublicKey: t.recoveryPublicKey,
    activeCredentialEvent: t.activeCredentialEvent,
    activeRecoveryEvent: t.activeRecoveryEvent
  };
  try {
    await e.set(tt, JSON.stringify(n));
  } catch {
  }
}
async function no(e) {
  let t;
  try {
    t = await e.get(tt);
  } catch {
    return null;
  }
  if (!t) return null;
  try {
    const n = JSON.parse(t);
    return typeof n.everydayPrivateKeyHex != "string" || typeof n.accountId != "string" || typeof n.recoveryPublicKey != "string" || !n.activeCredentialEvent || !n.activeRecoveryEvent ? null : {
      everydayPrivateKey: Se(n.everydayPrivateKeyHex),
      accountId: n.accountId,
      recoveryPublicKey: n.recoveryPublicKey,
      activeCredentialEvent: n.activeCredentialEvent,
      activeRecoveryEvent: n.activeRecoveryEvent
    };
  } catch {
    return null;
  }
}
async function ro(e) {
  try {
    await e.delete(tt);
  } catch {
  }
}
const y = {
  signer: null,
  everydayPrivateKey: null,
  accountId: null,
  recoveryPublicKey: null,
  activeCredentialEvent: null,
  activeRecoveryEvent: null,
  pendingRecovery: null
};
let J = [...Jr], Oe = [...Yr];
const we = new eo();
function Y() {
  if (!y.signer || !y.everydayPrivateKey)
    throw new Error("No identity is unlocked in this session.");
  return { signer: y.signer, everydayPrivateKey: y.everydayPrivateKey };
}
function ge() {
  y.signer?.destroy(), y.everydayPrivateKey && y.everydayPrivateKey.fill(0), y.signer = null, y.everydayPrivateKey = null, y.accountId = null, y.recoveryPublicKey = null, y.activeCredentialEvent = null, y.activeRecoveryEvent = null, y.pendingRecovery && (y.pendingRecovery.recoveryPrivateKey.fill(0), y.pendingRecovery.everydayPrivateKey.fill(0), y.pendingRecovery = null);
}
async function Ke() {
  !y.everydayPrivateKey || !y.accountId || !y.recoveryPublicKey || !y.activeCredentialEvent || !y.activeRecoveryEvent || await to(we, {
    everydayPrivateKey: y.everydayPrivateKey,
    accountId: y.accountId,
    recoveryPublicKey: y.recoveryPublicKey,
    activeCredentialEvent: y.activeCredentialEvent,
    activeRecoveryEvent: y.activeRecoveryEvent
  });
}
async function oo(e, t) {
  switch (e) {
    case "configure": {
      const n = t;
      return n.vaultRelayUrls?.length && (J = n.vaultRelayUrls), n.discoveryRelayUrls?.length && (Oe = n.discoveryRelayUrls), {};
    }
    case "register": {
      const n = t, r = n.importKey ? await yr({ nsecOrHex: n.importKey, loginName: n.loginName, password: n.password, vaultRelayUrls: J }) : await jt({ loginName: n.loginName, password: n.password, vaultRelayUrls: J });
      return ge(), y.signer = new _e(r.everydayPrivateKey), y.everydayPrivateKey = r.everydayPrivateKey, y.accountId = r.accountId, y.recoveryPublicKey = r.recoveryPublicKey, y.activeCredentialEvent = r.credentialEvent, y.activeRecoveryEvent = r.recoveryEvent, await Ke(), {
        recoveryPhrase: r.recoveryPhrase,
        everydayPublicKey: r.everydayPublicKey,
        recoveryPublicKey: r.recoveryPublicKey,
        accountId: r.accountId,
        imported: r.imported,
        credentialEventId: r.credentialEvent.id,
        recoveryEventId: r.recoveryEvent.id
      };
    }
    case "previewImportKey": {
      const r = $t(t.nsecOrHex), o = R(r), a = { everydayPublicKey: o, npub: ot(o) };
      return r.fill(0), a;
    }
    case "login": {
      const n = t, r = await hr({
        loginName: n.loginName,
        password: n.password,
        vaultRelayUrls: J,
        store: we,
        acknowledgeRollback: n.acknowledgeRollback
      });
      return ge(), y.signer = new _e(r.everydayPrivateKey), y.everydayPrivateKey = r.everydayPrivateKey, y.accountId = r.accountId, y.recoveryPublicKey = r.recoveryPublicKey, y.activeCredentialEvent = r.credentialEvent, y.activeRecoveryEvent = r.recoveryCapsuleEvent, await Ke(), {
        everydayPublicKey: r.everydayPublicKey,
        accountId: r.accountId,
        generation: r.generation,
        rollbackWarning: r.rollbackWarning,
        relayDisagreementWarning: r.relayDisagreementWarning
      };
    }
    case "recover": {
      const n = t, r = await pr({
        phrase: n.phrase,
        vaultRelayUrls: J,
        discoveryRelayUrls: Oe,
        offlineRecoveryCapsuleEvents: n.offlineExportFile?.recovery_capsule_events
      });
      return ge(), y.pendingRecovery = r, y.signer = new _e(r.everydayPrivateKey), y.everydayPrivateKey = r.everydayPrivateKey, y.accountId = r.accountId, y.recoveryPublicKey = r.recoveryPublicKey, y.activeRecoveryEvent = r.currentRecoveryEvent, {
        everydayPublicKey: r.everydayPublicKey,
        accountId: r.accountId,
        generalRelays: r.generalRelays,
        dmRelays: r.dmRelays,
        chainWarning: r.chainWarning
      };
    }
    case "completeRecovery": {
      const n = t;
      if (!y.pendingRecovery) throw new Error("No recovery is in progress in this session.");
      const r = await vr({
        recovered: y.pendingRecovery,
        newLoginName: n.newLoginName,
        newPassword: n.newPassword,
        vaultRelayUrls: J
      });
      return y.activeCredentialEvent = r.credentialEvent, y.activeRecoveryEvent = r.refreshedRecoveryEvent, y.pendingRecovery.recoveryPrivateKey.fill(0), y.pendingRecovery = null, await Ke(), {
        locatorPublicKey: r.locatorPublicKey,
        credentialEventId: r.credentialEvent.id,
        refreshedRecoveryEventId: r.refreshedRecoveryEvent.id
      };
    }
    case "changePassword": {
      const n = t, r = await gr({
        loginName: n.loginName,
        oldPassword: n.oldPassword,
        newPassword: n.newPassword,
        vaultRelayUrls: J,
        store: we,
        acknowledgeRollback: n.acknowledgeRollback
      });
      return y.activeCredentialEvent = r.newCredentialEvent, y.recoveryPublicKey = r.recoveryPublicKey, y.activeRecoveryEvent = r.recoveryCapsuleEvent, await Ke(), {
        newLocatorPublicKey: r.newLocatorPublicKey,
        newGeneration: r.newGeneration,
        tombstoneAcknowledgedCount: r.tombstoneAcknowledgedCount,
        deletionAcknowledgedCount: r.deletionAcknowledgedCount
      };
    }
    case "publishProfileAndRelayLists": {
      const n = t, { everydayPrivateKey: r } = Y();
      return Mn({
        everydayPrivateKey: r,
        name: n.name,
        about: n.about,
        picture: n.picture,
        generalRelays: n.generalRelays,
        dmRelays: n.dmRelays,
        discoveryRelays: Oe
      });
    }
    case "getPublicKey": {
      const { signer: n } = Y();
      return { publicKey: n.getPublicKey() };
    }
    case "signEvent": {
      const { signer: n } = Y(), r = t;
      return n.signEvent({ kind: r.kind, tags: r.tags, content: r.content, created_at: r.created_at });
    }
    case "nip44Encrypt": {
      const { signer: n } = Y(), r = t;
      return { ciphertext: n.nip44Encrypt(r.peerPublicKey, r.plaintext) };
    }
    case "nip44Decrypt": {
      const { signer: n } = Y(), r = t;
      return { plaintext: n.nip44Decrypt(r.peerPublicKey, r.payload) };
    }
    case "nip04Encrypt": {
      const { signer: n } = Y(), r = t;
      return { ciphertext: n.nip04Encrypt(r.peerPublicKey, r.plaintext) };
    }
    case "nip04Decrypt": {
      const { signer: n } = Y(), r = t;
      return { plaintext: n.nip04Decrypt(r.peerPublicKey, r.payload) };
    }
    case "exportIdentity": {
      const { everydayPrivateKey: n, signer: r } = Y();
      return { nsec: Rn(n), npub: ot(r.getPublicKey()) };
    }
    case "buildRecoveryExport": {
      if (Y(), !y.recoveryPublicKey || !y.activeRecoveryEvent)
        throw new Error("No recovery capsule is known in this session yet.");
      return Kn({
        recoveryPublicKeyHex: y.recoveryPublicKey,
        vaultRelayUrls: J,
        recoveryCapsuleEvents: [y.activeRecoveryEvent],
        relayListEvents: []
      });
    }
    case "repairReplicas": {
      if (!y.activeCredentialEvent || !y.activeRecoveryEvent)
        throw new Error("No active capsule events are known in this session yet.");
      const n = new T(J), r = await Zn(n, y.activeCredentialEvent, y.activeRecoveryEvent);
      return n.closeAll(), r;
    }
    case "getSessionStatus":
      return { unlocked: !!y.signer, everydayPublicKey: y.signer?.getPublicKey() };
    // Called once, right after "configure", before the widget renders its welcome
    // screen -- restores whatever persistSession() last cached for this origin, so
    // a page reload doesn't ask for the login name + password again. A missing or
    // corrupt cache is not an error: it just means the widget falls through to its
    // normal welcome screen, exactly like it always has.
    case "restoreSession": {
      const n = await no(we);
      return n ? (ge(), y.signer = new _e(n.everydayPrivateKey), y.everydayPrivateKey = n.everydayPrivateKey, y.accountId = n.accountId, y.recoveryPublicKey = n.recoveryPublicKey, y.activeCredentialEvent = n.activeCredentialEvent, y.activeRecoveryEvent = n.activeRecoveryEvent, { restored: !0, everydayPublicKey: y.signer.getPublicKey(), accountId: n.accountId }) : { restored: !1 };
    }
    case "logout":
      return ge(), await ro(we), {};
    default:
      throw new Error(`Unknown worker action: ${e}`);
  }
}
self.addEventListener("message", (e) => {
  const { id: t, action: n, payload: r } = e.data;
  oo(n, r).then(
    (o) => {
      const a = { id: t, ok: !0, result: o };
      self.postMessage(a);
    },
    (o) => {
      const a = o instanceof Error ? o : new Error(String(o)), i = { id: t, ok: !1, error: a.message, errorName: a.name };
      self.postMessage(i);
    }
  );
});
