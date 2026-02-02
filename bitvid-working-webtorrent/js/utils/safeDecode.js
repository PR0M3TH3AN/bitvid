export function safeDecodeURIComponent(value) {
  if (typeof value !== "string") {
    return "";
  }

  if (value === "") {
    return "";
  }

  try {
    return decodeURIComponent(value);
  } catch (err) {
    return value;
  }
}

export function safeDecodeURIComponentLoose(value, { trim = true } = {}) {
  if (typeof value !== "string") {
    return "";
  }

  const working = trim ? value.trim() : value;
  if (trim && !working) {
    return "";
  }

  try {
    return decodeURIComponent(working);
  } catch (err) {
    return working;
  }
}
