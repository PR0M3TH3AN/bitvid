class c {
  worker;
  pending = /* @__PURE__ */ new Map();
  counter = 0;
  dead = !1;
  /** Why the worker is gone, surfaced on every post-teardown rejection so a
   *  developer sees the CAUSE (usually an unmounted element), not just a bare
   *  failure. Overridable via terminate(reason). */
  deadReason = "This BitLogin session was torn down; reload the page to sign in again.";
  /** Set by the element to receive unsolicited worker frames (auth_url). */
  onNotification = null;
  constructor() {
    const e = ["cryptoWorker", ".js"].join(""), r = new URL(e, import.meta.url);
    this.worker = new Worker(r, { type: "module" }), this.worker.addEventListener("message", (t) => {
      const n = t.data;
      if (!n || typeof n != "object") return;
      const s = n;
      if (s.notify === "nip46-auth-url" && typeof s.url == "string") {
        this.onNotification?.(s);
        return;
      }
      if (typeof n.id != "string") return;
      const l = this.pending.get(n.id);
      if (l)
        if (this.pending.delete(n.id), clearTimeout(l.timer), n.ok)
          l.resolve(n.result);
        else {
          const a = new Error(n.error);
          a.name = n.errorName ?? "Error", l.reject(a);
        }
    });
    const i = (t) => () => this.failAll(t);
    this.worker.addEventListener("error", i("The BitLogin crypto worker stopped unexpectedly.")), this.worker.addEventListener(
      "messageerror",
      i("The BitLogin crypto worker sent an unreadable message.")
    );
  }
  /** Settles every outstanding call with an error. Idempotent. */
  failAll(e) {
    const r = [...this.pending.values()];
    this.pending.clear();
    for (const i of r)
      clearTimeout(i.timer), i.reject(new Error(e));
  }
  call(e, r, i = 6e4) {
    if (this.dead)
      return Promise.reject(new Error(this.deadReason));
    const t = `${Date.now().toString(36)}-${(this.counter++).toString(36)}`;
    return new Promise((n, s) => {
      const l = setTimeout(() => {
        this.pending.delete(t), s(new Error(`BitLogin's ${e} call timed out.`));
      }, i);
      this.pending.set(t, { resolve: n, reject: s, timer: l });
      const a = { id: t, action: e, payload: r };
      this.worker.postMessage(a);
    });
  }
  configure(e) {
    return this.call("configure", e);
  }
  register(e) {
    return this.call("register", e);
  }
  previewImportKey(e) {
    return this.call("previewImportKey", e);
  }
  login(e) {
    return this.call("login", e);
  }
  recover(e) {
    return this.call("recover", e);
  }
  completeRecovery(e) {
    return this.call("completeRecovery", e);
  }
  changePassword(e) {
    return this.call("changePassword", e);
  }
  publishProfileAndRelayLists(e) {
    return this.call("publishProfileAndRelayLists", e);
  }
  getPublicKey() {
    return this.call("getPublicKey", {});
  }
  signEvent(e) {
    return this.call("signEvent", e);
  }
  nip44Encrypt(e) {
    return this.call("nip44Encrypt", e);
  }
  nip44Decrypt(e) {
    return this.call("nip44Decrypt", e);
  }
  nip04Encrypt(e) {
    return this.call("nip04Encrypt", e);
  }
  nip04Decrypt(e) {
    return this.call("nip04Decrypt", e);
  }
  exportIdentity() {
    return this.call("exportIdentity", {});
  }
  buildRecoveryExport() {
    return this.call("buildRecoveryExport", {});
  }
  repairReplicas() {
    return this.call("repairReplicas", {});
  }
  previewPhraseRebuild(e) {
    return this.call("previewPhraseRebuild", e);
  }
  rebuildFromPhrase(e) {
    return this.call("rebuildFromPhrase", e);
  }
  checkReplicaHealth() {
    return this.call("checkReplicaHealth", {});
  }
  getSessionStatus() {
    return this.call("getSessionStatus", {});
  }
  restoreSession() {
    return this.call("restoreSession", {});
  }
  vaultStatus() {
    return this.call("vaultStatus", {});
  }
  vaultList() {
    return this.call("vaultList", {});
  }
  vaultSaveNwc(e) {
    return this.call("vaultSaveNwc", e);
  }
  vaultFindForOrigin() {
    return this.call("vaultFindForOrigin", {});
  }
  vaultRevealNwc(e) {
    return this.call("vaultRevealNwc", e);
  }
  vaultSetBinding(e) {
    return this.call("vaultSetBinding", e);
  }
  vaultDelete(e) {
    return this.call("vaultDelete", e);
  }
  vaultOfferCheck(e) {
    return this.call("vaultOfferCheck", e);
  }
  // ---- NIP-46 remote-signer session (§LM5) ----
  nip46Connect(e) {
    return this.call("nip46Connect", e, 26e4);
  }
  nip46NostrconnectStart(e) {
    return this.call("nip46NostrconnectStart", e);
  }
  nip46NostrconnectAwait() {
    return this.call("nip46NostrconnectAwait", {}, 32e4);
  }
  nip46SignEvent(e) {
    return this.call("nip46SignEvent", e, 26e4);
  }
  nip46Nip44Encrypt(e) {
    return this.call("nip46Nip44Encrypt", e, 26e4);
  }
  nip46Nip44Decrypt(e) {
    return this.call("nip46Nip44Decrypt", e, 26e4);
  }
  nip46Nip04Encrypt(e) {
    return this.call("nip46Nip04Encrypt", e, 26e4);
  }
  nip46Nip04Decrypt(e) {
    return this.call("nip46Nip04Decrypt", e, 26e4);
  }
  nip46Disconnect() {
    return this.call("nip46Disconnect", {});
  }
  logout() {
    return this.call("logout", {});
  }
  terminate(e) {
    this.dead = !0, e && (this.deadReason = e), this.worker.terminate(), this.failAll(this.deadReason);
  }
}
const u = "BitLogin: no session is unlocked. Call restore() first, or have the user sign in once via <bitlogin-auth>.";
async function p(o = {}) {
  const e = new c();
  await e.configure({
    vaultRelayUrls: o.vaultRelays ?? [],
    discoveryRelayUrls: o.discoveryRelays ?? []
  });
  let r = null;
  const i = async () => {
    if (r) return r;
    const t = await e.getSessionStatus();
    if (!t.unlocked || !t.everydayPublicKey) throw new Error(u);
    return r = t.everydayPublicKey, r;
  };
  return {
    async restore() {
      const t = await e.restoreSession();
      return r = t.restored && t.everydayPublicKey ? t.everydayPublicKey : null, r ? { pubkey: r } : null;
    },
    async isUnlocked() {
      if (r) return !0;
      const t = await e.getSessionStatus();
      return t.unlocked && t.everydayPublicKey && (r = t.everydayPublicKey), !!t.unlocked;
    },
    getPublicKey() {
      return i();
    },
    async signEvent(t) {
      return await i(), e.signEvent(t);
    },
    async nip44Encrypt(t, n) {
      return await i(), (await e.nip44Encrypt({ peerPublicKey: t, plaintext: n })).ciphertext;
    },
    async nip44Decrypt(t, n) {
      return await i(), (await e.nip44Decrypt({ peerPublicKey: t, payload: n })).plaintext;
    },
    async logout() {
      await e.logout(), r = null;
    },
    destroy() {
      e.terminate("BitLogin headless signer was destroyed."), r = null;
    }
  };
}
export {
  c as W,
  p as c
};
