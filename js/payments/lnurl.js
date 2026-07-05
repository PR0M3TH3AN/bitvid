// js/payments/lnurl.js

const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const CHARKEY = new Map(
  Array.from(CHARSET).map((char, index) => [char, index])
);
const GENERATORS = [
  0x3b6a57b2,
  0x26508e6d,
  0x1ea119fa,
  0x3d4233dd,
  0x2a1462b3,
];

const DEFAULT_COMMENT_MAX = 0;

function hrpExpand(hrp) {
  const chars = Array.from(hrp);
  const left = chars.map((char) => char.charCodeAt(0) >> 5);
  const right = chars.map((char) => char.charCodeAt(0) & 31);
  return [...left, 0, ...right];
}

function polymod(values) {
  let chk = 1;
  for (const value of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ value;
    for (let i = 0; i < GENERATORS.length; i += 1) {
      if (((top >> i) & 1) !== 0) {
        chk ^= GENERATORS[i];
      }
    }
  }
  return chk;
}

function verifyChecksum(hrp, data) {
  return polymod([...hrpExpand(hrp), ...data]) === 1;
}

function bech32Decode(input) {
  if (typeof input !== "string") {
    throw new Error("LNURL must be a string.");
  }

  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("LNURL cannot be empty.");
  }

  const lower = trimmed.toLowerCase();
  const upper = trimmed.toUpperCase();
  if (trimmed !== lower && trimmed !== upper) {
    throw new Error("LNURL cannot mix upper and lower case characters.");
  }

  const normalized = lower;
  const separatorIndex = normalized.lastIndexOf("1");
  if (separatorIndex <= 0 || separatorIndex + 7 > normalized.length) {
    throw new Error("Invalid LNURL bech32 payload.");
  }

  const hrp = normalized.slice(0, separatorIndex);
  const dataPart = normalized.slice(separatorIndex + 1);

  const data = [];
  for (const char of dataPart) {
    if (!CHARKEY.has(char)) {
      throw new Error("LNURL payload includes invalid characters.");
    }
    data.push(CHARKEY.get(char));
  }

  if (!verifyChecksum(hrp, data)) {
    throw new Error("LNURL checksum is invalid.");
  }

  return {
    prefix: hrp,
    words: data.slice(0, -6),
  };
}

function convertWords(words, fromBits, toBits, { pad = true } = {}) {
  let value = 0;
  let bits = 0;
  const maxValue = (1 << toBits) - 1;
  const result = [];

  for (const word of words) {
    if (word < 0 || word >> fromBits !== 0) {
      throw new Error("Invalid bech32 word value.");
    }
    value = (value << fromBits) | word;
    bits += fromBits;

    while (bits >= toBits) {
      bits -= toBits;
      result.push((value >> bits) & maxValue);
    }
  }

  if (pad) {
    if (bits > 0) {
      result.push((value << (toBits - bits)) & maxValue);
    }
  } else if (bits >= fromBits || ((value << (toBits - bits)) & maxValue) !== 0) {
    throw new Error("Excess padding in bech32 payload.");
  }

  return result;
}

function createChecksum(hrp, data) {
  const values = [...hrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0];
  const mod = polymod(values) ^ 1;
  const checksum = [];
  for (let i = 0; i < 6; i += 1) {
    checksum.push((mod >> ((5 - i) * 5)) & 31);
  }
  return checksum;
}

function bech32Encode(hrp, data) {
  const checksum = createChecksum(hrp, data);
  const combined = [...data, ...checksum];
  const encodedData = combined.map((value) => {
    if (value < 0 || value >= CHARSET.length) {
      throw new Error("Invalid bech32 word value.");
    }
    return CHARSET[value];
  });
  return `${hrp}1${encodedData.join("")}`;
}

export function encodeLnurlBech32(url) {
  const sanitized = sanitizeUrl(url);
  const encoder = new TextEncoder();
  const bytes = Array.from(encoder.encode(sanitized));
  const words = convertWords(bytes, 8, 5, { pad: true });
  return bech32Encode("lnurl", words).toLowerCase();
}

function decodeLnurlBech32(encoded) {
  const { prefix, words } = bech32Decode(encoded);
  if (prefix !== "lnurl") {
    throw new Error("Only bech32 LNURL encodings are supported.");
  }

  const bytes = convertWords(words, 5, 8, { pad: false });
  const decoder = new TextDecoder("utf-8", { fatal: true });
  return decoder.decode(Uint8Array.from(bytes));
}

function ensureFetchFunction(fetcher) {
  if (typeof fetcher === "function") {
    return fetcher;
  }

  if (typeof fetch === "function") {
    return fetch;
  }

  if (typeof globalThis.fetch === "function") {
    return globalThis.fetch.bind(globalThis);
  }

  throw new Error("Fetch API is not available in this environment.");
}

function sanitizeUrl(url) {
  const trimmed = typeof url === "string" ? url.trim() : "";
  if (!trimmed) {
    throw new Error("LNURL endpoint is missing.");
  }
  return trimmed;
}

export function resolveLightningAddress(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    throw new Error("Lightning address is required.");
  }

  if (trimmed.toLowerCase().startsWith("lnurl")) {
    const decoded = decodeLnurlBech32(trimmed);
    return {
      type: "lud06",
      url: sanitizeUrl(decoded),
      address: trimmed,
    };
  }

  if (trimmed.includes("@")) {
    const [namePart, domainPart] = trimmed.split("@");
    const name = (namePart || "").trim();
    const domain = (domainPart || "").trim();
    if (!name || !domain) {
      throw new Error("Invalid Lightning address format.");
    }
    const url = `https://${domain}/.well-known/lnurlp/${encodeURIComponent(
      name.toLowerCase()
    )}`;
    return {
      type: "lud16",
      url,
      address: `${name}@${domain}`,
    };
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return {
      type: "url",
      url: trimmed,
      address: trimmed,
    };
  }

  throw new Error("Unsupported Lightning address format.");
}

function normalizeNumeric(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return numeric;
}

// LNURL servers (Strike among them) intermittently return transient failures —
// network errors, 5xx, or {status:"ERROR"} bodies like "Could not get user
// information" — for addresses that resolve fine seconds later (verified live
// 2026-07-04 against strike.me: ERROR on one request, OK with a callback on
// the retry). One short retry keeps a real zap from dying on such a blip; a
// genuinely bad address still fails after at most one extra request.
export async function fetchPayServiceData(
  url,
  { fetcher, retries = 1, retryDelayMs = 600 } = {},
) {
  const targetUrl = sanitizeUrl(url);
  const fetchFn = ensureFetchFunction(fetcher);

  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0 && retryDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
    try {
      return await fetchPayServiceDataOnce(targetUrl, fetchFn);
    } catch (error) {
      lastError = error;
      if (error?.transient !== true) {
        throw error;
      }
    }
  }
  throw lastError;
}

function markTransient(error) {
  error.transient = true;
  return error;
}

async function fetchPayServiceDataOnce(targetUrl, fetchFn) {
  let response;
  try {
    response = await fetchFn(targetUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    // Browser fetch rejects (TypeError "Failed to fetch") when the recipient's
    // Lightning endpoint is unreachable or — common for LNURL — doesn't send CORS
    // headers. Surface a clear, actionable message instead of the raw error.
    const friendly = new Error(
      "Couldn't reach this recipient's Lightning address. It may be offline or blocking browser requests.",
    );
    friendly.cause = error;
    friendly.code = "lnurl-unreachable";
    throw markTransient(friendly);
  }

  if (!response.ok) {
    throw markTransient(
      new Error(`Failed to load LNURL metadata (${response.status}).`),
    );
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    // A non-JSON body is usually an edge/CDN interstitial — treat as a blip.
    throw markTransient(new Error("LNURL endpoint did not return JSON."));
  }

  if (!payload || typeof payload !== "object") {
    throw new Error("LNURL metadata response was invalid.");
  }

  if (typeof payload.status === "string" && payload.status.toUpperCase() === "ERROR") {
    const reason =
      typeof payload.reason === "string" && payload.reason.trim()
        ? payload.reason.trim()
        : "LNURL endpoint returned an error.";
    throw markTransient(new Error(reason));
  }

  const callback = sanitizeUrl(payload.callback);
  const minSendable = Math.max(0, normalizeNumeric(payload.minSendable, 0));
  const maxSendable = Math.max(minSendable, normalizeNumeric(payload.maxSendable, minSendable));
  const commentAllowed = Math.max(0, Math.round(normalizeNumeric(payload.commentAllowed, DEFAULT_COMMENT_MAX)));
  const allowsNostr = payload.allowsNostr === true;
  const nostrPubkey =
    typeof payload.nostrPubkey === "string" ? payload.nostrPubkey.trim() : "";

  let metadata = [];
  if (typeof payload.metadata === "string" && payload.metadata.trim()) {
    try {
      const parsed = JSON.parse(payload.metadata);
      if (Array.isArray(parsed)) {
        metadata = parsed;
      }
    } catch (error) {
      // Ignore metadata parse errors – it is optional.
    }
  }

  return {
    tag: typeof payload.tag === "string" ? payload.tag : "payRequest",
    callback,
    minSendable,
    maxSendable,
    metadata,
    commentAllowed,
    allowsNostr,
    nostrPubkey,
    raw: payload,
  };
}

// Browser-side reachability probe for a Lightning address. Does exactly what a
// zapper's browser would do — resolve the address and fetch its LNURL pay-service
// data. If that fails (host offline, TLS-broken, or — most common — missing CORS
// headers), nobody can zap this address from a static client like bitvid either.
// Use it to proactively warn a creator at wallet-connect time.
// Returns: { ok, reason, address, allowsNostr }.
//   reason: "ok" | "invalid-address" | "lnurl-unreachable" | "no-nostr" | <error msg>
export async function checkLightningAddressZappable(address, { fetcher } = {}) {
  let resolved;
  try {
    resolved = resolveLightningAddress(address);
  } catch (error) {
    return {
      ok: false,
      reason: "invalid-address",
      address: typeof address === "string" ? address.trim() : "",
    };
  }

  try {
    const metadata = await fetchPayServiceData(resolved.url, { fetcher });
    // Reachable from a browser. A pay endpoint that doesn't advertise Nostr can
    // still take a normal payment but won't produce a zap receipt — surface it.
    if (metadata && metadata.allowsNostr !== true) {
      return {
        ok: true,
        reason: "no-nostr",
        address: resolved.address,
        allowsNostr: false,
      };
    }
    return { ok: true, reason: "ok", address: resolved.address, allowsNostr: true };
  } catch (error) {
    return {
      ok: false,
      reason: error?.code || (typeof error?.message === "string" ? error.message : "lnurl-unreachable"),
      address: resolved.address,
      error,
    };
  }
}

export function validateInvoiceAmount(metadata, amountSats) {
  if (!metadata || typeof metadata !== "object") {
    throw new Error("LNURL metadata is required to validate invoice amounts.");
  }

  const amount = Math.round(Number(amountSats));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Zap amount must be a positive integer.");
  }

  const amountMsats = amount * 1000;
  const min = Math.max(0, Math.round(Number(metadata.minSendable || 0)));
  const max = Math.max(min, Math.round(Number(metadata.maxSendable || amountMsats)));

  if (min && amountMsats < min) {
    throw new Error(`Amount is below the minimum sendable value (${min / 1000} sats).`);
  }

  if (max && amountMsats > max) {
    throw new Error(`Amount exceeds the maximum sendable value (${max / 1000} sats).`);
  }

  return { amountMsats };
}

function truncateComment(comment, limit) {
  const trimmed = typeof comment === "string" ? comment.trim() : "";
  if (!limit || limit <= 0) {
    return "";
  }
  if (trimmed.length <= limit) {
    return trimmed;
  }
  return trimmed.slice(0, limit);
}

export async function requestInvoice(
  metadata,
  { amountSats, amountMsats, comment, zapRequest, lnurl, fetcher } = {}
) {
  if (!metadata || typeof metadata !== "object") {
    throw new Error("LNURL metadata is required to request an invoice.");
  }

  const fetchFn = ensureFetchFunction(fetcher);
  const targetAmount = Number.isFinite(amountMsats)
    ? Math.round(amountMsats)
    : validateInvoiceAmount(metadata, amountSats).amountMsats;

  const callbackUrl = new URL(metadata.callback);
  callbackUrl.searchParams.set("amount", String(targetAmount));

  if (comment && metadata.commentAllowed > 0) {
    const truncated = truncateComment(comment, metadata.commentAllowed);
    if (truncated) {
      callbackUrl.searchParams.set("comment", truncated);
    }
  }

  if (zapRequest) {
    callbackUrl.searchParams.set("nostr", zapRequest);
  }

  const originalLnurl = typeof lnurl === "string" ? lnurl.trim() : "";
  if (originalLnurl) {
    callbackUrl.searchParams.set("lnurl", originalLnurl);
  }

  const response = await fetchFn(callbackUrl.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch LNURL invoice (${response.status}).`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error("LNURL invoice response was not JSON.");
  }

  if (!payload || typeof payload !== "object") {
    throw new Error("LNURL invoice response was invalid.");
  }

  if (typeof payload.status === "string" && payload.status.toUpperCase() === "ERROR") {
    const reason =
      typeof payload.reason === "string" && payload.reason.trim()
        ? payload.reason.trim()
        : "LNURL invoice request failed.";
    throw new Error(reason);
  }

  const invoice = typeof payload.pr === "string" ? payload.pr.trim() : "";
  if (!invoice) {
    throw new Error("LNURL endpoint did not return an invoice.");
  }

  return {
    invoice,
    raw: payload,
  };
}

export const __TESTING__ = Object.freeze({
  bech32Encode,
  bech32Decode,
  decodeLnurlBech32,
  convertWords,
  createChecksum,
});
