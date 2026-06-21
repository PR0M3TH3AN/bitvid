// Opt-in encrypted cross-login sync of bitvid settings (storage credentials, NWC
// wallet) published as NIP-78 app-data (kind 30078) *replaceable* events,
// encrypted to the user's own key.
//
// Security model (see todo item #15 — keep this in sync with the opt-in UX copy):
// - Content is NIP-44-encrypted to the user's OWN pubkey (NIP-04 fallback only if
//   the signer lacks NIP-44, e.g. some NIP-46 remotes). The blob lives on PUBLIC
//   relays: encryption hides the contents, NOT the fact that this pubkey stores
//   bitvid settings.
// - Anyone who controls the user's Nostr key can decrypt these — the same trust
//   root as everything else they sign. The opt-in copy must say so.
// - NWC URIs are bearer SPENDING secrets; callers must gate that sync behind an
//   explicit warning.
// - Never log decrypted payloads or ciphertext.
// - Publish to WRITE relays so the update reaches everywhere; reads take the
//   NEWEST event per d-tag so a stale device can't clobber newer settings.
// - created_at is forced strictly-newer than any known prior event so a replace
//   actually wins.
//
// This module is pure / dependency-injected so it can be unit-tested without a
// live signer or relay pool.

export const APP_DATA_KIND = 30078;
export const ENCRYPTED_SYNC_VERSION = 1;

function nowSeconds(now) {
  const ms = typeof now === "function" ? now() : Date.now();
  return Math.floor(ms / 1000);
}

function normalizeDTag(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePubkey(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

async function encryptToSelf(signer, pubkey, plaintext) {
  const caps = signer.capabilities || { nip04: true, nip44: true };
  if (caps.nip44 && typeof signer.nip44Encrypt === "function") {
    try {
      const ciphertext = await signer.nip44Encrypt(pubkey, plaintext);
      return { alg: "nip44", ciphertext };
    } catch (err) {
      // Fall through to NIP-04 for signers whose NIP-44 path is unavailable.
    }
  }
  if (caps.nip04 && typeof signer.nip04Encrypt === "function") {
    const ciphertext = await signer.nip04Encrypt(pubkey, plaintext);
    return { alg: "nip04", ciphertext };
  }
  throw new Error("Signer does not support encryption (NIP-04 or NIP-44).");
}

async function decryptFromSelf(signer, pubkey, alg, ciphertext) {
  const caps = signer.capabilities || { nip04: true, nip44: true };
  if (alg === "nip44" && caps.nip44 && typeof signer.nip44Decrypt === "function") {
    return signer.nip44Decrypt(pubkey, ciphertext);
  }
  if ((alg === "nip04" || !alg) && caps.nip04 && typeof signer.nip04Decrypt === "function") {
    return signer.nip04Decrypt(pubkey, ciphertext);
  }
  throw new Error(`Signer cannot decrypt ${alg || "nip04"} content.`);
}

// Replaceable semantics: of all events a relay returns for a (kind, author, d),
// only the newest created_at is authoritative.
function selectNewest(events) {
  let newest = null;
  for (const ev of Array.isArray(events) ? events : []) {
    if (!ev || typeof ev !== "object") {
      continue;
    }
    const createdAt = Number(ev.created_at);
    if (!Number.isFinite(createdAt)) {
      continue;
    }
    if (!newest || createdAt > Number(newest.created_at)) {
      newest = ev;
    }
  }
  return newest;
}

export function createEncryptedSyncManager(deps = {}) {
  const {
    getActivePubkey,
    getSigner,
    getWriteRelays,
    getReadRelays,
    getPool,
    publishEventToRelays,
    summarizePublishResults,
    signEvent,
    now,
  } = deps;

  function resolvePubkey() {
    return normalizePubkey(
      typeof getActivePubkey === "function" ? getActivePubkey() : "",
    );
  }

  function resolveSigner() {
    return typeof getSigner === "function" ? getSigner() : null;
  }

  function isAvailable() {
    const pubkey = resolvePubkey();
    const signer = resolveSigner();
    if (!pubkey || !signer) {
      return false;
    }
    const caps = signer.capabilities || { nip04: true, nip44: true };
    return Boolean(
      (caps.nip44 && typeof signer.nip44Encrypt === "function") ||
        (caps.nip04 && typeof signer.nip04Encrypt === "function"),
    );
  }

  function resolveCreatedAt(options) {
    return Math.max(
      nowSeconds(now),
      (Number(options?.afterCreatedAt) || 0) + 1,
    );
  }

  async function publishTemplate(template) {
    let signed;
    try {
      signed = await signEvent(template);
    } catch (err) {
      return { ok: false, error: "sign-failed", cause: err };
    }
    const relays =
      (typeof getWriteRelays === "function" ? getWriteRelays() : []) || [];
    const pool = typeof getPool === "function" ? getPool() : null;
    if (!pool || !relays.length) {
      return { ok: false, error: "no-relays" };
    }
    const results = await publishEventToRelays(pool, relays, signed);
    const { accepted, failed } = summarizePublishResults(results);
    return {
      ok: accepted.length > 0,
      accepted: accepted.length,
      total: accepted.length + failed.length,
      event: signed,
      createdAt: template.created_at,
    };
  }

  async function push(dTag, payload, options = {}) {
    const tag = normalizeDTag(dTag);
    if (!tag) {
      return { ok: false, error: "missing-d-tag" };
    }
    const pubkey = resolvePubkey();
    const signer = resolveSigner();
    if (!pubkey || !signer) {
      return { ok: false, error: "not-authenticated" };
    }

    let plaintext;
    try {
      plaintext = JSON.stringify(payload ?? null);
    } catch (err) {
      return { ok: false, error: "payload-not-serializable" };
    }

    let envelope;
    try {
      envelope = await encryptToSelf(signer, pubkey, plaintext);
    } catch (err) {
      return { ok: false, error: "encrypt-failed", cause: err };
    }

    const template = {
      kind: APP_DATA_KIND,
      pubkey,
      created_at: resolveCreatedAt(options),
      tags: [
        ["d", tag],
        ["client", "bitvid"],
      ],
      content: JSON.stringify({
        v: ENCRYPTED_SYNC_VERSION,
        alg: envelope.alg,
        data: envelope.ciphertext,
      }),
    };

    return publishTemplate(template);
  }

  async function pull(dTag) {
    const tag = normalizeDTag(dTag);
    if (!tag) {
      return { found: false, error: "missing-d-tag" };
    }
    const pubkey = resolvePubkey();
    const signer = resolveSigner();
    if (!pubkey || !signer) {
      return { found: false, error: "not-authenticated" };
    }

    const relays =
      (typeof getReadRelays === "function" ? getReadRelays() : []) || [];
    const pool = typeof getPool === "function" ? getPool() : null;
    if (!pool || !relays.length) {
      return { found: false, error: "no-relays" };
    }

    let events = [];
    try {
      events = await pool.list(relays, [
        { kinds: [APP_DATA_KIND], authors: [pubkey], "#d": [tag], limit: 20 },
      ]);
    } catch (err) {
      return { found: false, error: "fetch-failed", cause: err };
    }

    const newest = selectNewest(Array.isArray(events) ? events.flat() : []);
    if (!newest) {
      return { found: false };
    }

    const rawContent =
      typeof newest.content === "string" ? newest.content.trim() : "";
    if (!rawContent) {
      return { found: false, cleared: true, createdAt: newest.created_at };
    }

    let parsed;
    try {
      parsed = JSON.parse(rawContent);
    } catch (err) {
      return { found: false, error: "corrupt-content", createdAt: newest.created_at };
    }
    if (parsed && parsed.cleared === true) {
      return { found: false, cleared: true, createdAt: newest.created_at };
    }

    let plaintext;
    try {
      plaintext = await decryptFromSelf(signer, pubkey, parsed?.alg, parsed?.data);
    } catch (err) {
      return { found: false, error: "decrypt-failed", cause: err };
    }

    let payload;
    try {
      payload = JSON.parse(plaintext);
    } catch (err) {
      return { found: false, error: "corrupt-payload" };
    }

    return { found: true, payload, createdAt: newest.created_at, event: newest };
  }

  async function clear(dTag, options = {}) {
    const tag = normalizeDTag(dTag);
    if (!tag) {
      return { ok: false, error: "missing-d-tag" };
    }
    const pubkey = resolvePubkey();
    const signer = resolveSigner();
    if (!pubkey || !signer) {
      return { ok: false, error: "not-authenticated" };
    }

    // Publish a cleared marker (NOT empty content — some relays reject empty) so
    // the cleared state propagates and a stale older event can't win on read.
    const template = {
      kind: APP_DATA_KIND,
      pubkey,
      created_at: resolveCreatedAt(options),
      tags: [
        ["d", tag],
        ["client", "bitvid"],
      ],
      content: JSON.stringify({ v: ENCRYPTED_SYNC_VERSION, cleared: true }),
    };

    return publishTemplate(template);
  }

  return { isAvailable, push, pull, clear, APP_DATA_KIND };
}

export default createEncryptedSyncManager;
