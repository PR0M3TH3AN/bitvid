export const EXTENSION_MIME_MAP = Object.freeze(
  Object.fromEntries(
    Object.entries({
      mp4: "video/mp4",
      m4v: "video/x-m4v",
      webm: "video/webm",
      mkv: "video/x-matroska",
      mov: "video/quicktime",
      avi: "video/x-msvideo",
      ogv: "video/ogg",
      ogg: "video/ogg",
      m3u8: "application/x-mpegurl",
      mpd: "application/dash+xml",
      ts: "video/mp2t",
      mpg: "video/mpeg",
      mpeg: "video/mpeg",
      flv: "video/x-flv",
      "3gp": "video/3gpp",
    }).map(([extension, mimeType]) => [
      extension,
      typeof mimeType === "string" ? mimeType.toLowerCase() : "",
    ]),
  ),
);

export function inferMimeTypeFromUrl(url) {
  if (!url || typeof url !== "string") {
    return "";
  }

  let pathname = "";
  try {
    const parsed = new URL(url);
    pathname = parsed.pathname || "";
  } catch (err) {
    const sanitized = url.split("?")[0].split("#")[0];
    pathname = sanitized || "";
  }

  const lastSegment = pathname.split("/").pop() || "";
  const match = lastSegment.match(/\.([a-z0-9]+)$/i);
  if (!match) {
    return "";
  }

  const extension = match[1].toLowerCase();
  const mimeType = EXTENSION_MIME_MAP[extension];
  return typeof mimeType === "string" ? mimeType : "";
}

// Image types, kept in a SEPARATE map from EXTENSION_MIME_MAP on purpose: that
// map gates video upload/publish paths (js/nostr/publishHelpers.js,
// js/nostr/videoPayloadBuilder.js), so folding image types into it would let an
// image pass a video check. Used for NIP-92 `imeta` hints on thumbnails.
export const IMAGE_EXTENSION_MIME_MAP = Object.freeze(
  Object.fromEntries(
    Object.entries({
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      jfif: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      avif: "image/avif",
      bmp: "image/bmp",
      svg: "image/svg+xml",
      ico: "image/x-icon",
      heic: "image/heic",
      heif: "image/heif",
    }).map(([extension, mimeType]) => [extension, mimeType.toLowerCase()]),
  ),
);

/**
 * Best-effort image MIME type from a URL's extension. Returns "" when the URL
 * carries no recognizable image extension — callers must treat that as "unknown"
 * and omit the hint rather than guessing, since a wrong `m` value is worse than
 * a missing one (clients use it to decide whether to render inline at all).
 */
export function inferImageMimeTypeFromUrl(url) {
  if (!url || typeof url !== "string") {
    return "";
  }

  let pathname = "";
  try {
    const parsed = new URL(url);
    pathname = parsed.pathname || "";
  } catch (err) {
    const sanitized = url.split("?")[0].split("#")[0];
    pathname = sanitized || "";
  }

  const lastSegment = pathname.split("/").pop() || "";
  const match = lastSegment.match(/\.([a-z0-9]+)$/i);
  if (!match) {
    return "";
  }

  const mimeType = IMAGE_EXTENSION_MIME_MAP[match[1].toLowerCase()];
  return typeof mimeType === "string" ? mimeType : "";
}
