export function summarizeDmEventForLog(event) {
  if (!event || typeof event !== "object") {
    return {
      kind: null,
      createdAt: null,
      hasContent: false,
      contentLength: 0,
      tagCount: 0,
    };
  }

  const createdAt = Number.isFinite(event.created_at)
    ? Math.floor(event.created_at)
    : null;

  return {
    kind: Number.isFinite(event.kind) ? event.kind : null,
    createdAt,
    hasContent: typeof event.content === "string" && event.content.length > 0,
    contentLength: typeof event.content === "string" ? event.content.length : 0,
    tagCount: Array.isArray(event.tags) ? event.tags.length : 0,
  };
}

export function sanitizeDecryptError(error) {
  if (!error) {
    return null;
  }

  const message =
    typeof error.message === "string"
      ? error.message
      : typeof error === "string"
      ? error
      : "";

  return {
    name: typeof error.name === "string" ? error.name : "",
    code: typeof error.code === "string" ? error.code : "",
    message,
  };
}
