const c = "bitlogin";
const s = "bitlogin:session-public:v1";
function u(e) {
  if (!e) return null;
  try {
    const n = JSON.parse(e);
    return typeof n.pubkey != "string" || typeof n.npub != "string" ? null : {
      pubkey: n.pubkey,
      npub: n.npub,
      ...typeof n.name == "string" && n.name ? { name: n.name } : {}
    };
  } catch {
    return null;
  }
}
function d(e) {
  return new Promise((n) => {
    let o;
    try {
      o = indexedDB.open(c);
    } catch {
      n(void 0);
      return;
    }
    o.onerror = () => n(void 0), o.onblocked = () => n(void 0), o.onsuccess = () => {
      const t = o.result;
      if (!t.objectStoreNames.contains("kv")) {
        t.close(), n(void 0);
        return;
      }
      try {
        const i = t.transaction("kv", "readonly"), r = i.objectStore("kv").get(e);
        r.onsuccess = () => n(r.result), r.onerror = () => n(void 0), i.oncomplete = () => t.close(), i.onerror = () => {
          n(void 0), t.close();
        };
      } catch {
        t.close(), n(void 0);
      }
    };
  });
}
async function a() {
  return typeof indexedDB > "u" ? null : u(await d(s));
}
if (typeof window < "u") {
  const e = window;
  e.bitlogin ??= {}, typeof e.bitlogin.readCachedSession != "function" && (e.bitlogin.readCachedSession = a);
}
export {
  a as readCachedSession
};
