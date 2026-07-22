import { v as ce, g as R, s as X, c as tn, K as nn, b as ct, d as qe, f as ze, h as he, u as pe, j as rn, k as on, l as oe, m as ue, n as je, S as $e, o as Be, q as Re, D as fe, t as xe, w as an, x as sn, y as cn, z as ln, A as Le, B as et, C as lt, F as un, G as dn, H as yn, I as ke, J as ut, L as hn, M as pn, N as Ge, O as Ae, P as ge, Q as fn, T as dt, U as vn, V as gn, W as wn, X as yt, Y as de, Z as Ce, _ as ht, $ as mn, a0 as bn, a1 as kn, a2 as En, a as tt, a3 as _n } from "./bitlogin-shared-QIBe5Omw.js";
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
class pt extends Error {
  constructor(t = "An account already exists with this login name and password. Sign in instead, or choose different credentials.") {
    super(t), this.name = "AccountAlreadyExistsError";
  }
}
class ft extends Error {
  constructor(t) {
    super(t), this.name = "RecoveryFailedError";
  }
}
class vt extends Error {
  seenGeneration;
  capsuleGeneration;
  constructor(t, n) {
    super(`This credential capsule reports generation ${n}, but this device has already seen generation ${t}. Refusing to log in with older, possibly-revoked credentials.`), this.name = "RollbackDetectedError", this.seenGeneration = t, this.capsuleGeneration = n;
  }
}
function gt(e, t) {
  const n = t ?? Math.floor(Date.now() / 1e3);
  return e == null ? n : Math.max(n, e + 1);
}
const Pn = { generation: -1, recoveryGeneration: -1 };
function wt(e) {
  return `bitlogin:hwm:${e}`;
}
async function Ve(e, t) {
  const n = await e.get(wt(t));
  return n ? JSON.parse(n) : Pn;
}
async function mt(e, t, n) {
  const r = await Ve(e, t), o = {
    generation: Math.max(r.generation, n.generation ?? -1),
    recoveryGeneration: Math.max(r.recoveryGeneration, n.recoveryGeneration ?? -1)
  };
  return await e.set(wt(t), JSON.stringify(o)), o;
}
function Kn() {
  const e = globalThis.WebSocket;
  if (!e)
    throw new Error("No global WebSocket implementation is available in this environment.");
  return e;
}
class Rn {
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
      const r = Kn(), o = new r(this.url);
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
      kind: nn,
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
    const r = tn({
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
class S {
  connections = /* @__PURE__ */ new Map();
  constructor(t, n = {}) {
    for (const r of new Set(t))
      this.connections.set(r, new Rn(r, n));
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
function xn(e, t, n) {
  return X({ pubkey: R(e), created_at: n, kind: ct, tags: [], content: JSON.stringify(t) }, e);
}
function An(e, t, n) {
  const r = t.map((o) => {
    const a = ["r", o.url];
    return o.read && !o.write && a.push("read"), o.write && !o.read && a.push("write"), a;
  });
  return X({ pubkey: R(e), created_at: n, kind: qe, tags: r, content: "" }, e);
}
function Cn(e, t, n) {
  return X({
    pubkey: R(e),
    created_at: n,
    kind: ze,
    tags: t.map((r) => ["relay", r]),
    content: ""
  }, e);
}
function Ln(e) {
  return e.tags.filter((t) => t[0] === "r" && t[1]).map((t) => t[1]);
}
function Tn(e) {
  return e.tags.filter((t) => t[0] === "relay" && t[1]).map((t) => t[1]);
}
async function Nn(e) {
  const t = R(e.everydayPrivateKey), n = Math.floor(Date.now() / 1e3), r = [.../* @__PURE__ */ new Set([...e.generalRelays, ...e.dmRelays, ...e.discoveryRelays])], o = new S(r), [a, i, c] = await Promise.all([
    o.queryQuorum({ authors: [t], kinds: [ct] }),
    o.queryQuorum({ authors: [t], kinds: [qe] }),
    o.queryQuorum({ authors: [t], kinds: [ze] })
  ]);
  o.closeAll();
  const s = a.outcomes.some((h) => h.events.length > 0), l = i.outcomes.some((h) => h.events.length > 0), u = c.outcomes.some((h) => h.events.length > 0), d = new S(r);
  let v = null, g = null, p = null;
  const f = [];
  if (!s && (e.name || e.about || e.picture)) {
    const h = xn(e.everydayPrivateKey, { name: e.name, about: e.about, picture: e.picture }, n);
    f.push(d.publishAll(h).then((y) => void (v = y)));
  }
  if (!l) {
    const h = An(e.everydayPrivateKey, e.generalRelays.map((y) => ({ url: y, read: !0, write: !0 })), n);
    f.push(d.publishAll(h).then((y) => void (g = y)));
  }
  if (!u) {
    const h = Cn(e.everydayPrivateKey, e.dmRelays, n);
    f.push(d.publishAll(h).then((y) => void (p = y)));
  }
  return await Promise.all(f), d.closeAll(), {
    profilePublished: v !== null && te(v) > 0,
    relayListAcknowledgedCount: g !== null ? te(g) : 0,
    dmRelayListAcknowledgedCount: p !== null ? te(p) : 0,
    profileSkippedExisting: s,
    relayListSkippedExisting: l,
    dmRelayListSkippedExisting: u
  };
}
async function we(e, t, n) {
  const r = n.minAcks ?? 2, o = n.minReadbacks ?? 2, a = await e.publishAll(t, n.timeoutMs), i = te(a), s = (await e.queryQuorum({ kinds: [he], authors: [t.pubkey], "#d": [n.dTag], limit: 5 }, n.timeoutMs)).outcomes.filter((l) => l.events.some((u) => u.id === t.id)).length;
  return {
    acknowledgedCount: i,
    readbackVerifiedCount: s,
    success: i >= r && s >= o
  };
}
function Sn(e) {
  const t = rn(e);
  if (t === void 0)
    throw new Error("Value is not JSON-serializable for canonicalization.");
  return t;
}
function In(e) {
  return pe(Sn(e));
}
const _e = [1024, 2048, 4096], re = 4;
function Mn(e) {
  const t = re + e.length, n = _e.find((a) => a >= t);
  if (n === void 0)
    throw new Error(`Payload of ${e.length} bytes exceeds the largest padding bucket (${_e[_e.length - 1]} bytes minus ${re}-byte length prefix).`);
  const r = new Uint8Array(n);
  return new DataView(r.buffer).setUint32(0, e.length, !1), r.set(e, re), r;
}
function Un(e) {
  if (!_e.includes(e.length))
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
function We() {
  const e = globalThis.crypto;
  if (!e || !e.subtle)
    throw new Error("WebCrypto SubtleCrypto is not available in this environment.");
  return e;
}
async function bt(e) {
  if (e.length !== 32)
    throw new Error("AES-256-GCM key must be exactly 32 bytes.");
  return We().subtle.importKey("raw", e, "AES-GCM", !1, ["encrypt", "decrypt"]);
}
async function On(e, t, n) {
  const r = on(), o = await bt(e), a = await We().subtle.encrypt({ name: "AES-GCM", iv: r, additionalData: n, tagLength: 128 }, o, t);
  return { nonce: r, ciphertext: new Uint8Array(a) };
}
async function Dn(e, t, n, r) {
  const o = await bt(e);
  try {
    const a = await We().subtle.decrypt({ name: "AES-GCM", iv: t, additionalData: r, tagLength: 128 }, o, n);
    return new Uint8Array(a);
  } catch {
    throw new Error("AES-256-GCM authentication failed: capsule is corrupted, tampered, or the wrong key was used.");
  }
}
function kt(e) {
  return pe(`bitlogin|password-capsule|v1|${e}|30078|bitlogin:password:v1`);
}
function Et(e) {
  return pe(`bitlogin|recovery-capsule|v1|${e}|30078|bitlogin:recovery:v1`);
}
async function _t(e, t, n) {
  const r = In(e), o = Mn(r), a = await On(t, o, n);
  return {
    version: 1,
    algorithm: "aes-256-gcm",
    nonce: oe(a.nonce),
    ciphertext: oe(a.ciphertext)
  };
}
async function Pt(e, t, n) {
  if (e.version !== 1 || e.algorithm !== "aes-256-gcm")
    throw new Error(`Unsupported capsule envelope version/algorithm: ${e.version}/${e.algorithm}`);
  const r = ue(e.nonce), o = ue(e.ciphertext), a = await Dn(t, r, o, n), i = Un(a);
  return JSON.parse(je(i));
}
class He extends Error {
  constructor(t) {
    super(t), this.name = "CapsuleValidationError";
  }
}
const qn = /* @__PURE__ */ new Set(["wss:", "ws:"]), zn = 1e6, jn = /^[0-9a-f]{64}$/u;
function x(e, t) {
  if (!e)
    throw new He(t);
}
function Pe(e) {
  return typeof e == "string" && jn.test(e);
}
function Kt(e) {
  x(Array.isArray(e), "vault_relay_hints must be an array (§12.4.7).");
  for (const t of e) {
    x(typeof t == "string", "Each relay hint must be a string (§12.4.7).");
    let n;
    try {
      n = new URL(t);
    } catch {
      throw new He(`Invalid relay URL: ${String(t)} (§12.4.7)`);
    }
    x(qn.has(n.protocol), `Relay URL uses a disallowed scheme: ${t} (§12.4.7)`);
  }
}
function Rt(e) {
  x(typeof e == "string", "account_id must be a string (§12.4.2).");
  let t;
  try {
    t = ue(e);
  } catch {
    throw new He("account_id is not valid base64url (§12.4.2).");
  }
  x(t.length === 16, "account_id must decode to exactly 128 bits (§12.4.2).");
}
function xt(e, t) {
  x(typeof e == "string", "operational_private_key must be a string (§12.4.3).");
  const n = ue(e);
  x(n.length === 32, "operational_private_key must be exactly 32 bytes (§12.4.3)."), x(Be(n), "operational_private_key is not a valid secp256k1 scalar (§12.4.3)."), x(Pe(t), "operational_public_key must be lowercase 64-char hex (§12.4.4).");
  const r = R(n);
  x(r === t, "operational_public_key does not match the derived public key (§12.4.4).");
}
function At(e, t) {
  x(Number.isInteger(e) && e >= 0 && e <= zn, `${t} is out of supported bounds (§12.4.8).`);
}
function $n(e) {
  x(e.schema === Re, `Unsupported or unknown schema: ${String(e.schema)} (§12.4.1)`), Rt(e.account_id), At(e.generation, "generation"), xt(e.operational_private_key, e.operational_public_key), x(Pe(e.recovery_public_key), "recovery_public_key must be lowercase 64-char hex (§12.4.5)."), Kt(e.vault_relay_hints);
  const t = e.recovery_capsule_event;
  x(!!t && typeof t == "object", "recovery_capsule_event must be present (§12.4.6)."), x(ce(t), "Embedded recovery_capsule_event has an invalid event id or signature (§12.4.6)."), x(t.pubkey === e.recovery_public_key, "Embedded recovery_capsule_event author does not match recovery_public_key (§12.4.5).");
}
function Bn(e) {
  x(e.schema === $e, `Unsupported or unknown schema: ${String(e.schema)} (§12.4.1)`), Rt(e.account_id), At(e.recovery_generation, "recovery_generation"), x(e.previous_recovery_event_id === null || Pe(e.previous_recovery_event_id), "previous_recovery_event_id must be null or lowercase 64-char hex (§12.3)."), xt(e.operational_private_key, e.operational_public_key), x(Pe(e.recovery_public_key), "recovery_public_key must be lowercase 64-char hex."), Kt(e.vault_relay_hints);
}
function Gn(e) {
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
async function Fe(e) {
  const t = R(e.locatorPrivateKey), n = await _t(e.payload, e.capsuleKey, kt(t));
  return X({
    pubkey: t,
    created_at: e.payload.created_at,
    kind: he,
    tags: [["d", fe]],
    content: JSON.stringify(n)
  }, e.locatorPrivateKey);
}
function Vn(e) {
  const t = R(e.oldLocatorPrivateKey);
  return X({
    pubkey: t,
    created_at: e.createdAt,
    kind: he,
    tags: [["d", fe]],
    content: ""
  }, e.oldLocatorPrivateKey);
}
async function Wn(e, t) {
  if (!ce(e))
    throw new Error("Credential capsule event has an invalid id or signature.");
  const n = JSON.parse(e.content), r = await Pt(n, t, kt(e.pubkey));
  return $n(r), r;
}
async function Ct(e) {
  const t = R(e.recoveryPrivateKey), n = await _t(e.payload, e.capsuleKey, Et(t));
  return X({
    pubkey: t,
    created_at: e.payload.created_at,
    kind: he,
    tags: [["d", xe]],
    content: JSON.stringify(n)
  }, e.recoveryPrivateKey);
}
async function Lt(e, t) {
  if (!ce(e))
    throw new Error("Recovery capsule event has an invalid id or signature.");
  const n = JSON.parse(e.content), r = await Pt(n, t, Et(e.pubkey));
  return Bn(r), r;
}
function Hn(e) {
  const t = /* @__PURE__ */ new Map();
  for (const n of e)
    ce(n) && t.set(n.id, n);
  return [...t.values()].sort((n, r) => r.created_at - n.created_at);
}
async function Tt(e, t, n, r, o) {
  const a = await e.queryQuorum({ kinds: [he], authors: [t], "#d": [n], limit: 5 }, o), i = a.outcomes.flatMap((v) => v.events), c = Hn(i), s = [];
  for (const v of c)
    try {
      const g = await r(v);
      s.push({ event: v, payload: g });
    } catch (g) {
      s.push({ event: v, payload: null, error: g.message });
    }
  const l = s.find((v) => v.payload !== null) ?? null, u = a.outcomes.filter((v) => v.responded && v.events.length > 0).map((v) => v.events.slice().sort((g, p) => p.created_at - g.created_at)[0].id), d = new Set(u).size > 1;
  return {
    quorumMet: a.quorumMet,
    respondedCount: a.respondedCount,
    totalCount: a.totalCount,
    candidates: s,
    best: l,
    relayDisagreement: d
  };
}
async function Ke(e, t, n, r = 8e3) {
  return Tt(e, t, fe, (o) => Wn(o, n), r);
}
async function Fn(e, t, n, r = 8e3) {
  return Tt(e, t, xe, (o) => Lt(o, n), r);
}
function Jn(e) {
  const t = e.filter((n) => n.payload !== null);
  return t.length < 2 ? { consistent: !0 } : Gn(t.map((n) => ({
    eventId: n.event.id,
    recoveryGeneration: n.payload.recovery_generation,
    previousRecoveryEventId: n.payload.previous_recovery_event_id
  })));
}
async function Yn(e, t, n, r) {
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
const Nt = `abandon
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
function Qn(e, t, n, r) {
  cn(e);
  const o = ln({ dkLen: 32, asyncTick: 10 }, r), { c: a, dkLen: i, asyncTick: c } = o;
  if (Le(a), Le(i), Le(c), a < 1)
    throw new Error("iterations (c) should be >= 1");
  const s = et(t), l = et(n), u = new Uint8Array(i), d = lt.create(e, s), v = d._cloneInto().update(l);
  return { c: a, dkLen: i, asyncTick: c, DK: u, PRF: d, PRFSalt: v };
}
function Xn(e, t, n, r, o) {
  return e.destroy(), t.destroy(), r && r.destroy(), un(o), n;
}
async function Zn(e, t, n, r) {
  const { c: o, dkLen: a, asyncTick: i, DK: c, PRF: s, PRFSalt: l } = Qn(e, t, n, r);
  let u;
  const d = new Uint8Array(4), v = an(d), g = new Uint8Array(s.outputLen);
  for (let p = 1, f = 0; f < a; p++, f += s.outputLen) {
    const h = c.subarray(f, f + s.outputLen);
    v.setInt32(0, p, !1), (u = l._cloneInto(u)).update(d).digestInto(g), h.set(g.subarray(0, h.length)), await sn(o - 1, i, () => {
      s._cloneInto(u).update(g).digestInto(g);
      for (let y = 0; y < h.length; y++)
        h[y] ^= g[y];
    });
  }
  return Xn(s, l, c, u, g);
}
/*! scure-bip39 - MIT License (c) 2022 Patricio Palladino, Paul Miller (paulmillr.com) */
const er = (e) => e[0] === "あいこくしん";
function St(e) {
  if (typeof e != "string")
    throw new TypeError("invalid mnemonic type: " + typeof e);
  return e.normalize("NFKD");
}
function It(e) {
  const t = St(e), n = t.split(" ");
  if (![12, 15, 18, 21, 24].includes(n.length))
    throw new Error("Invalid mnemonic");
  return { nfkd: t, words: n };
}
function Mt(e) {
  yn(e, 16, 20, 24, 28, 32);
}
const tr = (e) => {
  const t = 8 - e.length / 4;
  return new Uint8Array([ut(e)[0] >> t << t]);
};
function Ut(e) {
  if (!Array.isArray(e) || e.length !== 2048 || typeof e[0] != "string")
    throw new Error("Wordlist: expected array of 2048 strings");
  return e.forEach((t) => {
    if (typeof t != "string")
      throw new Error("wordlist: non-string element: " + t);
  }), ke.chain(ke.checksum(1, tr), ke.radix2(11, !0), ke.alphabet(e));
}
function nr(e, t) {
  const { words: n } = It(e), r = Ut(t).decode(n);
  return Mt(r), r;
}
function rr(e, t) {
  return Mt(e), Ut(t).encode(e).join(er(t) ? "　" : " ");
}
function or(e, t) {
  try {
    nr(e, t);
  } catch {
    return !1;
  }
  return !0;
}
const ar = (e) => St("mnemonic" + e);
function ir(e, t = "") {
  return Zn(dn, It(e).nfkd, ar(t), { c: 2048, dkLen: 64 });
}
function sr(e) {
  if (e.length !== 16)
    throw new Error("Recovery phrase entropy must be exactly 128 bits (16 bytes).");
  return rr(e, Nt);
}
function cr(e) {
  try {
    return or(Ot(e), Nt);
  } catch {
    return !1;
  }
}
function Ot(e) {
  return e.trim().normalize("NFKD").split(/\s+/u).join(" ");
}
async function Dt(e) {
  return ir(Ot(e), "");
}
const Je = hn.id, me = "aes-256-gcm-v1", be = "bitlogin-bip39-hkdf-v1";
async function qt(e) {
  const t = Ae(e.loginName), n = e.now ?? Math.floor(Date.now() / 1e3), { locatorPrivateKey: r, capsuleKey: o } = await ge(e.password, t), a = R(r), i = new S(e.vaultRelayUrls, { authPrivateKey: r });
  let c;
  try {
    c = await Ke(i, a, o, e.timeoutMs);
  } finally {
    i.closeAll();
  }
  if (!c.quorumMet)
    throw new ae("Couldn't verify this login name and password aren't already registered. Please retry, or add more vault relays.");
  if (c.candidates.length > 0)
    throw new pt();
  const s = sr(fn()), l = await Dt(s), { recoveryPrivateKey: u, capsuleKey: d } = dt(l), v = R(u), g = e.everydayPrivateKey !== void 0;
  if (g && !Be(e.everydayPrivateKey))
    throw new ae("The provided key is not a valid secp256k1 private key.");
  const p = g ? e.everydayPrivateKey : vn(), f = R(p), h = oe(gn()), y = {
    schema: $e,
    account_id: h,
    recovery_generation: 0,
    previous_recovery_event_id: null,
    operational_private_key: oe(p),
    operational_public_key: f,
    recovery_public_key: v,
    created_at: n,
    vault_relay_hints: e.vaultRelayUrls,
    protocol: { capsule_encryption: me, recovery_derivation: be }
  }, m = await Ct({
    recoveryPrivateKey: u,
    capsuleKey: d,
    payload: y
  }), b = {
    schema: Re,
    account_id: h,
    generation: 0,
    operational_private_key: oe(p),
    operational_public_key: f,
    recovery_public_key: v,
    recovery_capsule_event: m,
    created_at: n,
    vault_relay_hints: e.vaultRelayUrls,
    protocol: {
      password_kdf: Je,
      capsule_encryption: me,
      recovery_derivation: be
    }
  }, _ = await Fe({
    locatorPrivateKey: r,
    capsuleKey: o,
    payload: b
  }), I = new S(e.vaultRelayUrls, { authPrivateKey: u }), E = await we(I, m, {
    dTag: xe,
    minAcks: e.minAcknowledgements,
    timeoutMs: e.timeoutMs
  });
  I.closeAll();
  const P = new S(e.vaultRelayUrls, { authPrivateKey: r }), K = await we(P, _, {
    dTag: fe,
    minAcks: e.minAcknowledgements,
    timeoutMs: e.timeoutMs
  });
  if (P.closeAll(), !E.success || !K.success)
    throw new ae("Registration did not reach the required relay acknowledgement and readback quorum. Please retry, or add more vault relays.");
  return {
    normalizedLoginName: t,
    recoveryPhrase: s,
    everydayPrivateKey: p,
    everydayPublicKey: f,
    recoveryPublicKey: v,
    locatorPublicKey: a,
    accountId: h,
    imported: g,
    credentialEvent: _,
    recoveryEvent: m,
    credentialPublish: K,
    recoveryPublish: E
  };
}
async function lr(e) {
  const { nsecOrHex: t, ...n } = e, r = zt(t);
  return qt({ ...n, everydayPrivateKey: r });
}
function zt(e) {
  const t = e.trim();
  let n;
  if (t.startsWith("nsec1"))
    n = pn(t);
  else if (/^[0-9a-fA-F]{64}$/u.test(t))
    n = Ge(t.toLowerCase());
  else
    throw new ae("Enter a valid nsec (nsec1…) or a 64-character hex private key.");
  if (!Be(n))
    throw new ae("The provided key is not a valid secp256k1 private key.");
  return n;
}
class jt {
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
async function ur(e) {
  const t = Ae(e.loginName), { locatorPrivateKey: n, capsuleKey: r } = await ge(e.password, t), o = R(n), a = new S(e.vaultRelayUrls, { authPrivateKey: n });
  try {
    const i = await Ke(a, o, r, e.timeoutMs);
    if (!i.quorumMet)
      throw new ye("quorum-not-met");
    if (!i.best)
      throw new ye(i.candidates.length > 0 ? "no-valid-candidate" : "no-matching-event");
    const c = i.best.payload, s = e.store ?? new jt(), l = await Ve(s, c.operational_public_key), u = c.generation < l.generation;
    if (u && !e.acknowledgeRollback)
      throw new vt(l.generation, c.generation);
    const d = u ? `This device previously saw credential generation ${l.generation}, but the accepted capsule is generation ${c.generation}. Relays may be serving stale data, or an old capsule is being replayed.` : void 0;
    await mt(s, c.operational_public_key, { generation: c.generation });
    const v = i.relayDisagreement ? 'Configured relays returned different credential capsules as "latest" for this account. Some relays may be stale, censored, or malicious.' : void 0;
    return {
      everydayPrivateKey: ue(c.operational_private_key),
      everydayPublicKey: c.operational_public_key,
      recoveryPublicKey: c.recovery_public_key,
      accountId: c.account_id,
      generation: c.generation,
      credentialEvent: i.best.event,
      recoveryCapsuleEvent: c.recovery_capsule_event,
      rollbackWarning: d,
      relayDisagreementWarning: v
    };
  } finally {
    a.closeAll();
  }
}
function nt(e) {
  return e.filter((t) => ce(t)).sort((t, n) => n.created_at - t.created_at)[0];
}
async function dr(e) {
  if (!cr(e.phrase))
    throw new ft("This does not look like a valid 12-word BitLogin recovery phrase.");
  const t = await Dt(e.phrase), { recoveryPrivateKey: n, capsuleKey: r } = dt(t), o = R(n), a = new S(e.vaultRelayUrls, { authPrivateKey: n });
  let i;
  try {
    i = await Fn(a, o, r, e.timeoutMs);
  } finally {
    a.closeAll();
  }
  if (e.offlineRecoveryCapsuleEvents?.length) {
    const f = [];
    for (const b of e.offlineRecoveryCapsuleEvents)
      if (ce(b))
        try {
          f.push({ event: b, payload: await Lt(b, r) });
        } catch (_) {
          f.push({ event: b, payload: null, error: _.message });
        }
    const h = /* @__PURE__ */ new Map();
    for (const b of [...i.candidates, ...f])
      h.set(b.event.id, b);
    const y = [...h.values()].sort((b, _) => _.event.created_at - b.event.created_at), m = y.find((b) => b.payload !== null) ?? null;
    i = { ...i, candidates: y, best: m, quorumMet: i.quorumMet || m !== null };
  }
  if (!i.quorumMet)
    throw new ye("quorum-not-met");
  if (!i.best)
    throw new ye(i.candidates.length > 0 ? "no-valid-candidate" : "no-matching-event");
  const c = i.best.payload, s = Jn(i.candidates), l = ue(c.operational_private_key), u = c.operational_public_key, d = [.../* @__PURE__ */ new Set([...e.discoveryRelayUrls, ...c.vault_relay_hints])], v = new S(d);
  let g = [], p = [];
  try {
    const f = await v.queryQuorum({ kinds: [qe], authors: [u], limit: 5 }, e.timeoutMs), h = nt(f.outcomes.flatMap((b) => b.events));
    h && (g = Ln(h));
    const y = await v.queryQuorum({ kinds: [ze], authors: [u], limit: 5 }, e.timeoutMs), m = nt(y.outcomes.flatMap((b) => b.events));
    m && (p = Tn(m));
  } finally {
    v.closeAll();
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
    generalRelays: g,
    dmRelays: p,
    chainWarning: s.consistent ? void 0 : s.warning
  };
}
async function yr(e) {
  const t = e.now ?? Math.floor(Date.now() / 1e3), n = Ae(e.newLoginName), { recovered: r } = e, o = {
    schema: $e,
    account_id: r.accountId,
    recovery_generation: r.currentRecoveryPayload.recovery_generation + 1,
    previous_recovery_event_id: r.currentRecoveryEvent.id,
    operational_private_key: oe(r.everydayPrivateKey),
    operational_public_key: r.everydayPublicKey,
    recovery_public_key: r.recoveryPublicKey,
    created_at: gt(r.currentRecoveryEvent.created_at, t),
    vault_relay_hints: e.vaultRelayUrls,
    protocol: { capsule_encryption: me, recovery_derivation: be }
  }, a = await Ct({
    recoveryPrivateKey: r.recoveryPrivateKey,
    capsuleKey: r.recoveryCapsuleKey,
    payload: o
  }), i = new S(e.vaultRelayUrls, { authPrivateKey: r.recoveryPrivateKey }), c = await we(i, a, {
    dTag: xe,
    minAcks: e.minAcknowledgements,
    timeoutMs: e.timeoutMs
  });
  i.closeAll();
  const { locatorPrivateKey: s, capsuleKey: l } = await ge(e.newPassword, n), u = R(s), d = {
    schema: Re,
    account_id: r.accountId,
    generation: 0,
    operational_private_key: oe(r.everydayPrivateKey),
    operational_public_key: r.everydayPublicKey,
    recovery_public_key: r.recoveryPublicKey,
    recovery_capsule_event: a,
    created_at: t,
    vault_relay_hints: e.vaultRelayUrls,
    protocol: {
      password_kdf: Je,
      capsule_encryption: me,
      recovery_derivation: be
    }
  }, v = await Fe({ locatorPrivateKey: s, capsuleKey: l, payload: d }), g = new S(e.vaultRelayUrls, { authPrivateKey: s }), p = await we(g, v, {
    dTag: fe,
    minAcks: e.minAcknowledgements,
    timeoutMs: e.timeoutMs
  });
  if (g.closeAll(), !c.success || !p.success)
    throw new ft("Could not publish the refreshed recovery and credential capsules to enough relays. Please retry.");
  return { normalizedLoginName: n, locatorPublicKey: u, credentialEvent: v, refreshedRecoveryEvent: a, credentialPublish: p, recoveryPublish: c };
}
function hr(e) {
  const t = R(e.privateKey);
  return X({
    pubkey: t,
    created_at: e.createdAt,
    kind: wn,
    tags: [
      ["e", e.eventIdToDelete],
      ["k", String(e.deletedEventKind)]
    ],
    content: e.reason ?? ""
  }, e.privateKey);
}
async function pr(e) {
  const t = e.now ?? Math.floor(Date.now() / 1e3), n = Ae(e.loginName), r = await ge(e.oldPassword, n), o = R(r.locatorPrivateKey), a = new S(e.vaultRelayUrls, { authPrivateKey: r.locatorPrivateKey });
  let i;
  try {
    i = await Ke(a, o, r.capsuleKey, e.timeoutMs);
  } finally {
    a.closeAll();
  }
  if (!i.quorumMet)
    throw new ye("quorum-not-met");
  if (!i.best)
    throw new ye(i.candidates.length > 0 ? "no-valid-candidate" : "no-matching-event");
  const c = i.best.payload, s = i.best.event, l = e.store ?? new jt(), u = await Ve(l, c.operational_public_key);
  if (c.generation < u.generation && !e.acknowledgeRollback)
    throw new vt(u.generation, c.generation);
  const d = await ge(e.newPassword, n), v = R(d.locatorPrivateKey), g = new S(e.vaultRelayUrls, { authPrivateKey: d.locatorPrivateKey });
  let p;
  try {
    p = await Ke(g, v, d.capsuleKey, e.timeoutMs);
  } finally {
    g.closeAll();
  }
  if (!p.quorumMet)
    throw new ae("Couldn't verify the new password isn't already registered under this login name. Please retry, or add more vault relays.");
  if (p.candidates.length > 0)
    throw new pt("Another account is already registered with this login name and the new password you chose. Pick a different new password.");
  const f = c.generation + 1, h = {
    schema: Re,
    account_id: c.account_id,
    generation: f,
    operational_private_key: c.operational_private_key,
    operational_public_key: c.operational_public_key,
    recovery_public_key: c.recovery_public_key,
    recovery_capsule_event: c.recovery_capsule_event,
    created_at: t,
    vault_relay_hints: e.vaultRelayUrls,
    protocol: {
      password_kdf: Je,
      capsule_encryption: me,
      recovery_derivation: be
    }
  }, y = await Fe({
    locatorPrivateKey: d.locatorPrivateKey,
    capsuleKey: d.capsuleKey,
    payload: h
  }), m = new S(e.vaultRelayUrls, { authPrivateKey: d.locatorPrivateKey }), b = await we(m, y, {
    dTag: fe,
    minAcks: e.minAcknowledgements,
    timeoutMs: e.timeoutMs
  });
  m.closeAll();
  const _ = Vn({
    oldLocatorPrivateKey: r.locatorPrivateKey,
    createdAt: gt(s.created_at, t)
  }), I = hr({
    privateKey: r.locatorPrivateKey,
    eventIdToDelete: s.id,
    deletedEventKind: he,
    createdAt: t
  }), E = new S(e.vaultRelayUrls, { authPrivateKey: r.locatorPrivateKey }), [P, K] = await Promise.all([
    E.publishAll(_, e.timeoutMs),
    E.publishAll(I, e.timeoutMs)
  ]);
  if (E.closeAll(), !b.success)
    throw new ae("The new credential capsule did not reach the required relay acknowledgement and readback quorum. Please retry.");
  return await mt(l, c.operational_public_key, { generation: f }), {
    normalizedLoginName: n,
    oldLocatorPublicKey: o,
    newLocatorPublicKey: v,
    newGeneration: f,
    recoveryPublicKey: c.recovery_public_key,
    recoveryCapsuleEvent: c.recovery_capsule_event,
    newCredentialEvent: y,
    tombstoneEvent: _,
    deletionRequestEvent: I,
    newCredentialPublish: b,
    tombstoneAcknowledgedCount: te(P),
    deletionAcknowledgedCount: te(K)
  };
}
/*! noble-ciphers - MIT License (c) 2023 Paul Miller (paulmillr.com) */
function fr(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in e && e.BYTES_PER_ELEMENT === 1;
}
function rt(e) {
  if (typeof e != "boolean")
    throw new TypeError(`boolean expected, not ${e}`);
}
function Te(e) {
  if (typeof e != "number")
    throw new TypeError("number expected, got " + typeof e);
  if (!Number.isSafeInteger(e) || e < 0)
    throw new RangeError("positive integer expected, got " + e);
}
function T(e, t, n = "") {
  const r = fr(e), o = e?.length, a = t !== void 0;
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
const H = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68, vr = (e) => e << 24 & 4278190080 | e << 8 & 16711680 | e >>> 8 & 65280 | e >>> 24 & 255, gr = (e) => {
  for (let t = 0; t < e.length; t++)
    e[t] = vr(e[t]);
  return e;
}, N = H ? (e) => e : gr;
function wr(e, t) {
  return !e.byteLength || !t.byteLength ? !1 : e.buffer === t.buffer && // best we can do, may fail with an obscure Proxy
  e.byteOffset < t.byteOffset + t.byteLength && // a starts before b end
  t.byteOffset < e.byteOffset + e.byteLength;
}
function $t(e, t) {
  if (wr(e, t) && e.byteOffset < t.byteOffset)
    throw new Error("complex overlap of input and output is not supported");
}
function mr(e, t) {
  if (t == null || typeof t != "object")
    throw new Error("options must be defined");
  return Object.assign(e, t);
}
const br = /* @__NO_SIDE_EFFECTS__ */ (e, t) => {
  function n(r, ...o) {
    if (T(r, void 0, "key"), e.nonceLength !== void 0) {
      const u = o[0];
      T(u, e.varSizeNonce ? void 0 : e.nonceLength, "nonce");
    }
    const a = e.tagLength;
    a && o[1] !== void 0 && T(o[1], void 0, "AAD");
    const i = t(r, ...o), c = (u, d) => {
      if (d !== void 0) {
        if (u !== 2)
          throw new Error("cipher output not supported");
        T(d, void 0, "output");
      }
    };
    let s = !1;
    return {
      encrypt(u, d) {
        if (s)
          throw new Error("cannot encrypt() twice with same key + nonce");
        return s = !0, T(u), c(i.encrypt.length, d), i.encrypt(u, d);
      },
      decrypt(u, d) {
        if (T(u), a && u.length < a)
          throw new Error('"ciphertext" expected length bigger than tagLength=' + a);
        return c(i.decrypt.length, d), i.decrypt(u, d);
      }
    };
  }
  return Object.assign(n, e), n;
};
function Ye(e, t, n = !0) {
  if (t === void 0)
    return new Uint8Array(e);
  if (T(t, void 0, "output"), t.length !== e)
    throw new Error('"output" expected Uint8Array of length ' + e + ", got: " + t.length);
  if (n && !Q(t))
    throw new Error("invalid output, must be aligned");
  return t;
}
function Q(e) {
  return e.byteOffset % 4 === 0;
}
function ie(e) {
  return Uint8Array.from(T(e));
}
const Bt = (e) => Uint8Array.from(e.split(""), (t) => t.charCodeAt(0)), kr = N(A(Bt("expand 16-byte k"))), Er = N(A(Bt("expand 32-byte k")));
function k(e, t) {
  return e << t | e >>> 32 - t;
}
const ve = 64, _r = 16, Me = 2 ** 32 - 1, ot = /* @__PURE__ */ Uint32Array.of();
function Pr(e, t, n, r, o, a, i, c) {
  const s = o.length, l = new Uint8Array(ve), u = A(l), d = H && Q(o) && Q(a), v = d ? A(o) : ot, g = d ? A(a) : ot;
  if (!H) {
    for (let p = 0; p < s; i++) {
      if (e(t, n, r, u, i, c), N(u), i >= Me)
        throw new Error("arx: counter overflow");
      const f = Math.min(ve, s - p);
      for (let h = 0, y; h < f; h++)
        y = p + h, a[y] = o[y] ^ l[h];
      p += f;
    }
    return;
  }
  for (let p = 0; p < s; i++) {
    if (e(t, n, r, u, i, c), i >= Me)
      throw new Error("arx: counter overflow");
    const f = Math.min(ve, s - p);
    if (d && f === ve) {
      const h = p / 4;
      if (p % 4 !== 0)
        throw new Error("arx: invalid block position");
      for (let y = 0, m; y < _r; y++)
        m = h + y, g[m] = v[m] ^ u[y];
      p += ve;
      continue;
    }
    for (let h = 0, y; h < f; h++)
      y = p + h, a[y] = o[y] ^ l[h];
    p += f;
  }
}
function Kr(e, t) {
  const { allowShortKeys: n, extendNonceFn: r, counterLength: o, counterRight: a, rounds: i } = mr({ allowShortKeys: !1, counterLength: 8, counterRight: !1, rounds: 20 }, t);
  if (typeof e != "function")
    throw new Error("core must be a function");
  return Te(o), Te(i), rt(a), rt(n), (c, s, l, u, d = 0) => {
    T(c, void 0, "key"), T(s, void 0, "nonce"), T(l, void 0, "data");
    const v = l.length;
    if (u = Ye(v, u, !1), Te(d), d < 0 || d >= Me)
      throw new Error("arx: counter overflow");
    const g = [];
    let p = c.length, f, h;
    if (p === 32)
      g.push(f = ie(c)), h = Er;
    else if (p === 16 && n)
      f = new Uint8Array(32), f.set(c), f.set(c, 16), h = kr, g.push(f);
    else
      throw T(c, 32, "arx key"), new Error("invalid key size");
    (!H || !Q(s)) && g.push(s = ie(s));
    let y = A(f);
    if (r) {
      if (s.length !== 24)
        throw new Error("arx: extended nonce must be 24 bytes");
      const _ = s.subarray(0, 16);
      if (H)
        r(h, y, A(_), y);
      else {
        const I = N(Uint32Array.from(h));
        r(I, y, A(_), y), se(I), N(y);
      }
      s = s.subarray(16);
    } else H || N(y);
    const m = 16 - o;
    if (m !== s.length)
      throw new Error(`arx: nonce must be ${m} or 16 bytes`);
    if (m !== 12) {
      const _ = new Uint8Array(12);
      _.set(s, a ? 0 : 12 - s.length), s = _, g.push(s);
    }
    const b = N(A(s));
    try {
      return Pr(e, h, y, b, l, u, d, i), u;
    } finally {
      se(...g);
    }
  };
}
function Rr(e, t, n, r, o, a = 20) {
  let i = e[0], c = e[1], s = e[2], l = e[3], u = t[0], d = t[1], v = t[2], g = t[3], p = t[4], f = t[5], h = t[6], y = t[7], m = o, b = n[0], _ = n[1], I = n[2], E = i, P = c, K = s, L = l, M = u, U = d, O = v, D = g, q = p, z = f, j = h, $ = y, B = m, G = b, V = _, W = I;
  for (let Ze = 0; Ze < a; Ze += 2)
    E = E + M | 0, B = k(B ^ E, 16), q = q + B | 0, M = k(M ^ q, 12), E = E + M | 0, B = k(B ^ E, 8), q = q + B | 0, M = k(M ^ q, 7), P = P + U | 0, G = k(G ^ P, 16), z = z + G | 0, U = k(U ^ z, 12), P = P + U | 0, G = k(G ^ P, 8), z = z + G | 0, U = k(U ^ z, 7), K = K + O | 0, V = k(V ^ K, 16), j = j + V | 0, O = k(O ^ j, 12), K = K + O | 0, V = k(V ^ K, 8), j = j + V | 0, O = k(O ^ j, 7), L = L + D | 0, W = k(W ^ L, 16), $ = $ + W | 0, D = k(D ^ $, 12), L = L + D | 0, W = k(W ^ L, 8), $ = $ + W | 0, D = k(D ^ $, 7), E = E + U | 0, W = k(W ^ E, 16), j = j + W | 0, U = k(U ^ j, 12), E = E + U | 0, W = k(W ^ E, 8), j = j + W | 0, U = k(U ^ j, 7), P = P + O | 0, B = k(B ^ P, 16), $ = $ + B | 0, O = k(O ^ $, 12), P = P + O | 0, B = k(B ^ P, 8), $ = $ + B | 0, O = k(O ^ $, 7), K = K + D | 0, G = k(G ^ K, 16), q = q + G | 0, D = k(D ^ q, 12), K = K + D | 0, G = k(G ^ K, 8), q = q + G | 0, D = k(D ^ q, 7), L = L + M | 0, V = k(V ^ L, 16), z = z + V | 0, M = k(M ^ z, 12), L = L + M | 0, V = k(V ^ L, 8), z = z + V | 0, M = k(M ^ z, 7);
  let C = 0;
  r[C++] = i + E | 0, r[C++] = c + P | 0, r[C++] = s + K | 0, r[C++] = l + L | 0, r[C++] = u + M | 0, r[C++] = d + U | 0, r[C++] = v + O | 0, r[C++] = g + D | 0, r[C++] = p + q | 0, r[C++] = f + z | 0, r[C++] = h + j | 0, r[C++] = y + $ | 0, r[C++] = m + B | 0, r[C++] = b + G | 0, r[C++] = _ + V | 0, r[C++] = I + W | 0;
}
const Gt = /* @__PURE__ */ Kr(Rr, {
  counterRight: !1,
  counterLength: 4,
  allowShortKeys: !1
}), Vt = 2, Ue = 1, Wt = 65536, Oe = 4294967295;
function at(e, t) {
  const n = Ce(new Uint8Array([2]), Ge(t)), o = ht.getSharedSecret(e, n, !0).slice(1, 33);
  return mn(pe("nip44-v2"), o);
}
function Ht(e, t) {
  const n = kn(e, t, 76);
  return {
    chachaKey: n.slice(0, 32),
    chachaNonce: n.slice(32, 44),
    hmacKey: n.slice(44, 76)
  };
}
function Ft(e) {
  if (e <= 32)
    return 32;
  const t = 2 ** Math.floor(Math.log2(e - 1) + 1), n = t <= 256 ? 32 : t / 8;
  return n * (Math.floor((e - 1) / n) + 1);
}
function xr(e) {
  if (e < Wt) {
    const n = new Uint8Array(2);
    return new DataView(n.buffer).setUint16(0, e, !1), n;
  }
  const t = new Uint8Array(6);
  return new DataView(t.buffer).setUint32(2, e, !1), t;
}
function Ar(e) {
  const t = e.length;
  if (t < Ue || t > Oe)
    throw new Error(`NIP-44 plaintext length must be between ${Ue} and ${Oe} bytes.`);
  const n = xr(t), r = Ft(t), o = new Uint8Array(n.length + r);
  return o.set(n, 0), o.set(e, n.length), o;
}
function Cr(e) {
  const t = new DataView(e.buffer, e.byteOffset, e.byteLength), n = t.getUint16(0, !1);
  let r, o;
  if (n === 0) {
    if (r = t.getUint32(2, !1), o = 6, r < Wt)
      throw new Error("NIP-44 payload has inconsistent padding.");
  } else
    r = n, o = 2;
  if (r < Ue || r > Oe || e.length !== o + Ft(r))
    throw new Error("NIP-44 payload has inconsistent padding.");
  return e.slice(o, o + r);
}
function Jt(e, t, n) {
  return lt(ut, e, Ce(t, n));
}
function Lr(e, t, n) {
  const r = yt(32), { chachaKey: o, chachaNonce: a, hmacKey: i } = Ht(e, r), c = Ar(pe(t)), s = Gt(o, a, c), l = Jt(i, r, s);
  return de.encode(Ce(new Uint8Array([Vt]), r, s, l));
}
function Tr(e, t) {
  const n = de.decode(t);
  if (n[0] !== Vt)
    throw new Error(`Unsupported NIP-44 version: ${n[0]}`);
  const r = n.slice(1, 33), o = n.slice(n.length - 32), a = n.slice(33, n.length - 32), { chachaKey: i, chachaNonce: c, hmacKey: s } = Ht(e, r), l = Jt(s, r, a);
  if (!bn(o, l))
    throw new Error("NIP-44 MAC verification failed: payload is corrupted, tampered, or uses the wrong key.");
  const u = Gt(i, c, a);
  return je(Cr(u));
}
const ne = 16, Nr = 283;
function Sr(e) {
  if (![16, 24, 32].includes(e.length))
    throw new Error('"aes key" expected Uint8Array of length 16/24/32, got length=' + e.length);
}
function Qe(e) {
  return e << 1 ^ Nr & -(e >> 7);
}
function le(e, t) {
  let n = 0;
  for (; t > 0; t >>= 1)
    n ^= e & -(t & 1), e = Qe(e);
  return n;
}
const De = /* @__PURE__ */ (() => {
  const e = new Uint8Array(256);
  for (let n = 0, r = 1; n < 256; n++, r ^= Qe(r))
    e[n] = r;
  const t = new Uint8Array(256);
  t[0] = 99;
  for (let n = 0; n < 255; n++) {
    let r = e[255 - n];
    r |= r << 8, t[e[n]] = (r ^ r >> 4 ^ r >> 5 ^ r >> 6 ^ r >> 7 ^ 99) & 255;
  }
  return se(e), t;
})(), Ir = /* @__PURE__ */ De.map((e, t) => De.indexOf(t)), Mr = (e) => e << 24 | e >>> 8, Ne = (e) => e << 8 | e >>> 24;
function Yt(e, t) {
  if (e.length !== 256)
    throw new Error("Wrong sbox length");
  const n = new Uint32Array(256).map((l, u) => t(e[u])), r = n.map(Ne), o = r.map(Ne), a = o.map(Ne), i = new Uint32Array(256 * 256), c = new Uint32Array(256 * 256), s = new Uint16Array(256 * 256);
  for (let l = 0; l < 256; l++)
    for (let u = 0; u < 256; u++) {
      const d = l * 256 + u;
      i[d] = n[l] ^ r[u], c[d] = o[l] ^ a[u], s[d] = e[l] << 8 | e[u];
    }
  return { sbox: e, sbox2: s, T0: n, T1: r, T2: o, T3: a, T01: i, T23: c };
}
const Xe = /* @__PURE__ */ Yt(De, (e) => le(e, 3) << 24 | e << 16 | e << 8 | le(e, 2)), Qt = /* @__PURE__ */ Yt(Ir, (e) => le(e, 11) << 24 | le(e, 13) << 16 | le(e, 9) << 8 | le(e, 14)), Ur = /* @__PURE__ */ (() => {
  const e = new Uint8Array(16);
  for (let t = 0, n = 1; t < 16; t++, n = Qe(n))
    e[t] = n;
  return e;
})();
function Xt(e) {
  T(e);
  const t = e.length;
  Sr(e);
  const { sbox2: n } = Xe, r = [];
  (!H || !Q(e)) && r.push(e = ie(e));
  const o = N(A(e)), a = o.length, i = (s) => F(n, s, s, s, s), c = new Uint32Array(t + 28);
  c.set(o);
  for (let s = a; s < c.length; s++) {
    let l = c[s - 1];
    s % a === 0 ? l = i(Mr(l)) ^ Ur[s / a - 1] : a > 6 && s % a === 4 && (l = i(l)), c[s] = c[s - a] ^ l;
  }
  return se(...r), c;
}
function Or(e) {
  const t = Xt(e), n = t.slice(), r = t.length, { sbox2: o } = Xe, { T0: a, T1: i, T2: c, T3: s } = Qt;
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
function it(e, t, n, r, o) {
  const { sbox2: a, T01: i, T23: c } = Xe;
  let s = 0;
  t ^= e[s++], n ^= e[s++], r ^= e[s++], o ^= e[s++];
  const l = e.length / 4 - 2;
  for (let p = 0; p < l; p++) {
    const f = e[s++] ^ ee(i, c, t, n, r, o), h = e[s++] ^ ee(i, c, n, r, o, t), y = e[s++] ^ ee(i, c, r, o, t, n), m = e[s++] ^ ee(i, c, o, t, n, r);
    t = f, n = h, r = y, o = m;
  }
  const u = e[s++] ^ F(a, t, n, r, o), d = e[s++] ^ F(a, n, r, o, t), v = e[s++] ^ F(a, r, o, t, n), g = e[s++] ^ F(a, o, t, n, r);
  return { s0: u, s1: d, s2: v, s3: g };
}
function Dr(e, t, n, r, o) {
  const { sbox2: a, T01: i, T23: c } = Qt;
  let s = 0;
  t ^= e[s++], n ^= e[s++], r ^= e[s++], o ^= e[s++];
  const l = e.length / 4 - 2;
  for (let p = 0; p < l; p++) {
    const f = e[s++] ^ ee(i, c, t, o, r, n), h = e[s++] ^ ee(i, c, n, t, o, r), y = e[s++] ^ ee(i, c, r, n, t, o), m = e[s++] ^ ee(i, c, o, r, n, t);
    t = f, n = h, r = y, o = m;
  }
  const u = e[s++] ^ F(a, t, o, r, n), d = e[s++] ^ F(a, n, t, o, r), v = e[s++] ^ F(a, r, n, t, o), g = e[s++] ^ F(a, o, r, n, t);
  return { s0: u, s1: d, s2: v, s3: g };
}
function qr(e) {
  if (T(e), e.length % ne !== 0)
    throw new Error("aes-(cbc/ecb).decrypt ciphertext should consist of blocks with size " + ne);
}
function zr(e, t, n) {
  T(e);
  let r = e.length;
  const o = r % ne;
  if (!t && o !== 0)
    throw new Error("aec/(cbc-ecb): unpadded plaintext with disabled padding");
  if (t) {
    let c = ne - o;
    c || (c = ne), r = r + c;
  }
  n = Ye(r, n), $t(e, n), (!H || !Q(e)) && (e = ie(e));
  const a = A(e);
  N(a);
  const i = A(n);
  return { b: a, o: i, out: n };
}
function jr(e, t) {
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
function $r(e) {
  const t = new Uint8Array(16), n = A(t);
  t.set(e);
  const r = ne - e.length;
  for (let o = ne - r; o < ne; o++)
    t[o] = r;
  return n;
}
const Zt = /* @__PURE__ */ br({ blockSize: 16, nonceLength: 16 }, function(t, n, r = {}) {
  const o = !r.disablePadding;
  return {
    encrypt(a, i) {
      const c = Xt(t), { b: s, o: l, out: u } = zr(a, o, i);
      let d = n;
      const v = [c];
      (!H || !Q(d)) && v.push(d = ie(d));
      const g = A(d);
      N(g);
      let p = g[0], f = g[1], h = g[2], y = g[3], m = 0;
      for (; m + 4 <= s.length; )
        p ^= s[m + 0], f ^= s[m + 1], h ^= s[m + 2], y ^= s[m + 3], { s0: p, s1: f, s2: h, s3: y } = it(c, p, f, h, y), l[m++] = p, l[m++] = f, l[m++] = h, l[m++] = y;
      if (o) {
        const b = $r(a.subarray(m * 4));
        N(b), p ^= b[0], f ^= b[1], h ^= b[2], y ^= b[3], { s0: p, s1: f, s2: h, s3: y } = it(c, p, f, h, y), l[m++] = p, l[m++] = f, l[m++] = h, l[m++] = y;
      }
      return N(l), se(...v), u;
    },
    decrypt(a, i) {
      qr(a);
      const c = Or(t);
      let s = n;
      const l = [c];
      (!H || !Q(s)) && l.push(s = ie(s));
      const u = A(s);
      N(u), i = Ye(a.length, i), $t(a, i), (!H || !Q(a)) && l.push(a = ie(a));
      const d = A(a), v = A(i);
      N(d);
      let g = u[0], p = u[1], f = u[2], h = u[3];
      for (let y = 0; y + 4 <= d.length; ) {
        const m = g, b = p, _ = f, I = h;
        g = d[y + 0], p = d[y + 1], f = d[y + 2], h = d[y + 3];
        const { s0: E, s1: P, s2: K, s3: L } = Dr(c, g, p, f, h);
        v[y++] = E ^ m, v[y++] = P ^ b, v[y++] = K ^ _, v[y++] = L ^ I;
      }
      return N(v), se(...l), jr(i, o);
    }
  };
});
function en(e, t) {
  const n = Ce(new Uint8Array([2]), Ge(t));
  return ht.getSharedSecret(e, n, !0).slice(1, 33);
}
function Br(e, t, n, r) {
  const o = en(e, t), a = yt(16), i = Zt(o, a).encrypt(pe(n));
  return `${de.encode(i)}?iv=${de.encode(a)}`;
}
function Gr(e, t, n) {
  const r = n.indexOf("?iv=");
  if (r === -1)
    throw new Error('NIP-04 payload is missing its "?iv=" suffix.');
  const o = de.decode(n.slice(0, r)), a = de.decode(n.slice(r + 4)), i = en(e, t), c = Zt(i, a).decrypt(o);
  return je(c);
}
function Vr(...e) {
  for (const t of e)
    t && t.fill(0);
}
class Se {
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
    return this.assertAlive(), Lr(at(this.privateKey, t), n);
  }
  nip44Decrypt(t, n) {
    return this.assertAlive(), Tr(at(this.privateKey, t), n);
  }
  /** Legacy relative to nip44Encrypt above, but still what a real NIP-07 extension exposes as
   * window.nostr.nip04.encrypt -- implemented for drop-in parity. */
  nip04Encrypt(t, n) {
    return this.assertAlive(), Br(this.privateKey, t, n);
  }
  nip04Decrypt(t, n) {
    return this.assertAlive(), Gr(this.privateKey, t, n);
  }
  /** Best-practical secret wipe (§11.10, §21.4): overwrites the private key buffer in place. */
  destroy() {
    Vr(this.privateKey), this.destroyed = !0;
  }
}
const Wr = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.nostr.band",
  "wss://nostr.wine",
  "wss://relay.snort.social"
], Hr = [
  "wss://purplepag.es",
  "wss://relay.nostr.band",
  "wss://nostr-pub.wellorder.net"
], Fr = "bitlogin", Z = "kv", Jr = 1;
function Yr() {
  return new Promise((e, t) => {
    const n = indexedDB.open(Fr, Jr);
    n.onupgradeneeded = () => {
      const r = n.result;
      r.objectStoreNames.contains(Z) || r.createObjectStore(Z);
    }, n.onsuccess = () => e(n.result), n.onerror = () => t(n.error);
  });
}
class Qr {
  dbPromise = null;
  db() {
    return this.dbPromise || (this.dbPromise = Yr()), this.dbPromise;
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
const w = {
  signer: null,
  everydayPrivateKey: null,
  accountId: null,
  recoveryPublicKey: null,
  activeCredentialEvent: null,
  activeRecoveryEvent: null,
  pendingRecovery: null
};
let J = [...Wr], Ie = [...Hr];
const st = new Qr();
function Y() {
  if (!w.signer || !w.everydayPrivateKey)
    throw new Error("No identity is unlocked in this session.");
  return { signer: w.signer, everydayPrivateKey: w.everydayPrivateKey };
}
function Ee() {
  w.signer?.destroy(), w.everydayPrivateKey && w.everydayPrivateKey.fill(0), w.signer = null, w.everydayPrivateKey = null, w.accountId = null, w.recoveryPublicKey = null, w.activeCredentialEvent = null, w.activeRecoveryEvent = null, w.pendingRecovery && (w.pendingRecovery.recoveryPrivateKey.fill(0), w.pendingRecovery.everydayPrivateKey.fill(0), w.pendingRecovery = null);
}
async function Xr(e, t) {
  switch (e) {
    case "configure": {
      const n = t;
      return n.vaultRelayUrls?.length && (J = n.vaultRelayUrls), n.discoveryRelayUrls?.length && (Ie = n.discoveryRelayUrls), {};
    }
    case "register": {
      const n = t, r = n.importKey ? await lr({ nsecOrHex: n.importKey, loginName: n.loginName, password: n.password, vaultRelayUrls: J }) : await qt({ loginName: n.loginName, password: n.password, vaultRelayUrls: J });
      return Ee(), w.signer = new Se(r.everydayPrivateKey), w.everydayPrivateKey = r.everydayPrivateKey, w.accountId = r.accountId, w.recoveryPublicKey = r.recoveryPublicKey, w.activeCredentialEvent = r.credentialEvent, w.activeRecoveryEvent = r.recoveryEvent, {
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
      const r = zt(t.nsecOrHex), o = R(r), a = { everydayPublicKey: o, npub: tt(o) };
      return r.fill(0), a;
    }
    case "login": {
      const n = t, r = await ur({
        loginName: n.loginName,
        password: n.password,
        vaultRelayUrls: J,
        store: st,
        acknowledgeRollback: n.acknowledgeRollback
      });
      return Ee(), w.signer = new Se(r.everydayPrivateKey), w.everydayPrivateKey = r.everydayPrivateKey, w.accountId = r.accountId, w.recoveryPublicKey = r.recoveryPublicKey, w.activeCredentialEvent = r.credentialEvent, w.activeRecoveryEvent = r.recoveryCapsuleEvent, {
        everydayPublicKey: r.everydayPublicKey,
        accountId: r.accountId,
        generation: r.generation,
        rollbackWarning: r.rollbackWarning,
        relayDisagreementWarning: r.relayDisagreementWarning
      };
    }
    case "recover": {
      const n = t, r = await dr({
        phrase: n.phrase,
        vaultRelayUrls: J,
        discoveryRelayUrls: Ie,
        offlineRecoveryCapsuleEvents: n.offlineExportFile?.recovery_capsule_events
      });
      return Ee(), w.pendingRecovery = r, w.signer = new Se(r.everydayPrivateKey), w.everydayPrivateKey = r.everydayPrivateKey, w.accountId = r.accountId, w.recoveryPublicKey = r.recoveryPublicKey, w.activeRecoveryEvent = r.currentRecoveryEvent, {
        everydayPublicKey: r.everydayPublicKey,
        accountId: r.accountId,
        generalRelays: r.generalRelays,
        dmRelays: r.dmRelays,
        chainWarning: r.chainWarning
      };
    }
    case "completeRecovery": {
      const n = t;
      if (!w.pendingRecovery) throw new Error("No recovery is in progress in this session.");
      const r = await yr({
        recovered: w.pendingRecovery,
        newLoginName: n.newLoginName,
        newPassword: n.newPassword,
        vaultRelayUrls: J
      });
      return w.activeCredentialEvent = r.credentialEvent, w.activeRecoveryEvent = r.refreshedRecoveryEvent, w.pendingRecovery.recoveryPrivateKey.fill(0), w.pendingRecovery = null, {
        locatorPublicKey: r.locatorPublicKey,
        credentialEventId: r.credentialEvent.id,
        refreshedRecoveryEventId: r.refreshedRecoveryEvent.id
      };
    }
    case "changePassword": {
      const n = t, r = await pr({
        loginName: n.loginName,
        oldPassword: n.oldPassword,
        newPassword: n.newPassword,
        vaultRelayUrls: J,
        store: st,
        acknowledgeRollback: n.acknowledgeRollback
      });
      return w.activeCredentialEvent = r.newCredentialEvent, w.recoveryPublicKey = r.recoveryPublicKey, w.activeRecoveryEvent = r.recoveryCapsuleEvent, {
        newLocatorPublicKey: r.newLocatorPublicKey,
        newGeneration: r.newGeneration,
        tombstoneAcknowledgedCount: r.tombstoneAcknowledgedCount,
        deletionAcknowledgedCount: r.deletionAcknowledgedCount
      };
    }
    case "publishProfileAndRelayLists": {
      const n = t, { everydayPrivateKey: r } = Y();
      return Nn({
        everydayPrivateKey: r,
        name: n.name,
        about: n.about,
        picture: n.picture,
        generalRelays: n.generalRelays,
        dmRelays: n.dmRelays,
        discoveryRelays: Ie
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
      return { nsec: _n(n), npub: tt(r.getPublicKey()) };
    }
    case "buildRecoveryExport": {
      if (Y(), !w.recoveryPublicKey || !w.activeRecoveryEvent)
        throw new Error("No recovery capsule is known in this session yet.");
      return En({
        recoveryPublicKeyHex: w.recoveryPublicKey,
        vaultRelayUrls: J,
        recoveryCapsuleEvents: [w.activeRecoveryEvent],
        relayListEvents: []
      });
    }
    case "repairReplicas": {
      if (!w.activeCredentialEvent || !w.activeRecoveryEvent)
        throw new Error("No active capsule events are known in this session yet.");
      const n = new S(J), r = await Yn(n, w.activeCredentialEvent, w.activeRecoveryEvent);
      return n.closeAll(), r;
    }
    case "getSessionStatus":
      return { unlocked: !!w.signer, everydayPublicKey: w.signer?.getPublicKey() };
    case "logout":
      return Ee(), {};
    default:
      throw new Error(`Unknown worker action: ${e}`);
  }
}
self.addEventListener("message", (e) => {
  const { id: t, action: n, payload: r } = e.data;
  Xr(n, r).then(
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
