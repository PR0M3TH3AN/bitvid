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
