// Shared helpers for turning opaque upload failures into actionable guidance.
// Used by both upload paths (Cloudflare R2 via r2Service, generic S3 via
// s3UploadService) so the behavior stays in sync.

/**
 * A browser CORS preflight/rejection surfaces as an opaque network error
 * ("Failed to fetch" / "NetworkError" / Safari's "Load failed") with no HTTP
 * status — indistinguishable from a real network drop. We treat these as
 * likely-CORS so the upload path can attach actionable guidance instead of a
 * bare "Failed to fetch".
 */
export function isLikelyCorsError(err) {
  const message = (
    (err && (err.message || (err.toString && err.toString()))) ||
    ""
  ).toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("load failed")
  );
}

/**
 * Provider-neutral CORS guidance for a generic S3 bucket. (Cloudflare R2 has a
 * more specific variant in r2Service that names the R2 S3 API endpoint.)
 */
export function buildGenericCorsGuidance({ endpoint } = {}) {
  const origin =
    typeof window !== "undefined" &&
    window.location &&
    window.location.origin &&
    window.location.origin !== "null"
      ? window.location.origin
      : "<your-app-origin>";
  const target = endpoint ? endpoint : "your bucket's S3 API endpoint";
  return [
    "This is likely a CORS issue.",
    `Configure CORS on ${target} to allow origin ${origin},`,
    "with AllowedMethods: GET, HEAD, PUT, POST, DELETE, OPTIONS and AllowedHeaders: *.",
  ].join(" ");
}
