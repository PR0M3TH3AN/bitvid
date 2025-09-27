// js/storage/r2-mgmt.js
function computeSlugHash(input) {
  const text = String(input || "");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = Math.imul(31, hash) + text.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

export function sanitizeBucketName(npub) {
  const raw = String(npub || "");
  let value = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|[-]+$/g, "");

  if (!value) {
    value = "bitvid-user";
  }

  if (value.length > 32) {
    const prefix = value.slice(0, 20).replace(/-+$/g, "");
    const hash = computeSlugHash(raw).slice(0, 8);
    value = [prefix, hash].filter(Boolean).join("-");
  }

  value = value.replace(/-+/g, "-").replace(/^-+|[-]+$/g, "");

  if (!/^[a-z0-9]/.test(value)) {
    value = `bv-${value}`;
  }

  if (!/[a-z0-9]$/.test(value)) {
    value = `${value}0`;
  }

  if (value.length > 63) {
    value = value.slice(0, 63).replace(/-+$/g, "");
  }

  while (value.length < 3) {
    value += "0";
  }

  return value;
}

export function deriveShortSubdomain(npub) {
  const bucketSlug = sanitizeBucketName(npub);
  const hash = computeSlugHash(npub).slice(0, 6);

  const prefix = bucketSlug
    .replace(/^bv-/, "")
    .slice(0, 18)
    .replace(/-+$/g, "");

  let candidate = [prefix, hash].filter(Boolean).join("-");
  candidate = candidate
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|[-]+$/g, "");

  if (!candidate) {
    candidate = "user";
  }

  if (candidate.length > 32) {
    candidate = candidate.slice(0, 32).replace(/-+$/g, "");
  }

  if (!/^[a-z0-9]/.test(candidate)) {
    candidate = `u${candidate}`;
  }

  if (!/[a-z0-9]$/.test(candidate)) {
    candidate = `${candidate}0`;
  }

  while (candidate.length < 3) {
    candidate += "0";
  }

  return candidate;
}

function buildError(error, fallbackMessage) {
  if (error instanceof Error) {
    return error;
  }
  const err = new Error(fallbackMessage || "Cloudflare request failed");
  err.original = error;
  return err;
}

// --- Cloudflare API helpers (Bearer token) ---
async function cfFetch(path, { token, method = "GET", body, headers = {} }) {
  if (!token) {
    throw new Error("Cloudflare API token is required");
  }
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (parseErr) {
      if (!res.ok) {
        const err = new Error(text || `Cloudflare API error ${res.status}`);
        err.status = res.status;
        throw err;
      }
      throw parseErr;
    }
  }

  if (!res.ok || data?.success === false) {
    const errorMessage =
      data?.errors?.[0]?.message ||
      data?.message ||
      text ||
      `Cloudflare API error ${res.status}`;
    const err = new Error(errorMessage);
    err.status = res.status;
    err.response = data;
    throw err;
  }

  return data;
}

// 1) Create bucket (idempotent-ish: treat 409 as success)
export async function ensureBucket({ accountId, bucket, token }) {
  try {
    await cfFetch(`/accounts/${accountId}/r2/buckets`, {
      token,
      method: "POST",
      body: { name: bucket },
    });
  } catch (error) {
    const err = buildError(error);
    if (err.status === 409 || /already exists/i.test(err.message || "")) {
      return;
    }
    throw err;
  }
}

// 2) Set CORS so browser PUT/GETs work from your app origins
export async function putCors({ accountId, bucket, token, origins }) {
  const filteredOrigins = (origins || []).filter(Boolean);
  if (filteredOrigins.length === 0) {
    return;
  }
  const rules = [
    {
      id: "bitvid-default",
      allowed: {
        origins: filteredOrigins,
        methods: ["GET", "HEAD", "PUT", "POST", "DELETE", "OPTIONS"],
        headers: ["*"],
      },
      expose_headers: ["ETag", "Content-Length", "Content-Range", "Accept-Ranges"],
      max_age_seconds: 3600,
    },
  ];
  await cfFetch(`/accounts/${accountId}/r2/buckets/${bucket}/cors`, {
    token,
    method: "PUT",
    body: { rules },
  });
}

function extractStatus(payload) {
  return (
    payload?.result?.status ||
    payload?.result?.result?.status ||
    payload?.status ||
    payload?.result?.statusText ||
    null
  );
}

async function pollCustomDomain({
  accountId,
  bucket,
  token,
  domain,
  pollInterval = 2500,
  timeoutMs = 120000,
}) {
  const path = `/accounts/${accountId}/r2/buckets/${bucket}/domains/custom/${encodeURIComponent(
    domain
  )}`;
  const deadline = Date.now() + timeoutMs;
  let lastPayload = null;

  while (Date.now() < deadline) {
    lastPayload = await cfFetch(path, { token, method: "GET" }).catch((err) => {
      if (err?.status === 404) {
        return null;
      }
      throw err;
    });

    if (!lastPayload) {
      break;
    }

    const status = extractStatus(lastPayload);
    if (status === "active") {
      return { status, payload: lastPayload };
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  return {
    status: extractStatus(lastPayload) || "unknown",
    payload: lastPayload,
  };
}

// 3) Attach custom domain to bucket (auto-provisions on Cloudflare)
export async function attachCustomDomainAndWait({
  accountId,
  bucket,
  token,
  zoneId,
  domain,
  pollInterval,
  timeoutMs,
}) {
  let shouldPoll = true;
  try {
    await cfFetch(`/accounts/${accountId}/r2/buckets/${bucket}/domains/custom`, {
      token,
      method: "POST",
      body: { domain, zoneId, enabled: true },
    });
  } catch (error) {
    const err = buildError(error);
    if (err.status === 409 || /already exists/i.test(err.message || "")) {
      shouldPoll = true;
    } else {
      throw err;
    }
  }

  let status = "unknown";
  if (shouldPoll) {
    const pollResult = await pollCustomDomain({
      accountId,
      bucket,
      token,
      domain,
      pollInterval,
      timeoutMs,
    });
    status = pollResult.status;
  }

  const url = `https://${domain}`;
  return {
    url,
    status,
    active: status === "active",
  };
}

// 4) Toggle managed r2.dev domain for the bucket
export async function setManagedDomain({ accountId, bucket, token, enabled }) {
  const { result } = await cfFetch(
    `/accounts/${accountId}/r2/buckets/${bucket}/domains/managed`,
    { token, method: "PUT", body: { enabled: Boolean(enabled) } }
  );
  const domain = result?.domain || result?.result?.domain || "";
  return {
    enabled: Boolean(result?.enabled ?? enabled),
    url: domain ? `https://${domain}` : "",
  };
}
