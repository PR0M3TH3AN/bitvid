// js/storage/r2-mgmt.js
export function sanitizeBucketName(npub) {
  const base = (npub || "user")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|[-]+$/g, "");
  const suffix = Date.now().toString(36);
  const name = `bv-${base || "u"}-${suffix}`.slice(0, 63);
  return name.length < 3 ? `bv-u-${suffix}` : name;
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
      AllowedOrigins: filteredOrigins,
      AllowedMethods: ["GET", "HEAD", "PUT", "POST"],
      AllowedHeaders: ["*"],
      ExposeHeaders: ["ETag", "Content-Length", "Content-Range"],
      MaxAgeSeconds: 3600,
    },
  ];
  await cfFetch(`/accounts/${accountId}/r2/buckets/${bucket}/cors`, {
    token,
    method: "PUT",
    body: { rules },
  });
}

// 3) Attach custom domain to bucket (auto-provisions on Cloudflare)
export async function attachCustomDomain({
  accountId,
  bucket,
  token,
  zoneId,
  domain,
}) {
  const { result } = await cfFetch(
    `/accounts/${accountId}/r2/buckets/${bucket}/domains/custom`,
    {
      token,
      method: "POST",
      body: { domain, zoneId, enabled: true, minTLS: "1.2" },
    }
  );
  return `https://${result?.domain || domain}`;
}

// 4) Or enable r2.dev managed domain as fallback
export async function enableManagedDomain({ accountId, bucket, token }) {
  const { result } = await cfFetch(
    `/accounts/${accountId}/r2/buckets/${bucket}/domains/managed`,
    { token, method: "PUT", body: { enabled: true } }
  );
  return `https://${result?.domain}`;
}
