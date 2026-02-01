// js/utils/pointer.js

export function pointerArrayToKey(pointer) {
  if (!Array.isArray(pointer) || pointer.length < 2) {
    return "";
  }

  const type = pointer[0] === "a" ? "a" : pointer[0] === "e" ? "e" : "";
  if (!type) {
    return "";
  }

  const value =
    typeof pointer[1] === "string" ? pointer[1].trim().toLowerCase() : "";
  if (!value) {
    return "";
  }

  const relay =
    pointer.length > 2 && typeof pointer[2] === "string"
      ? pointer[2].trim()
      : "";

  return relay ? `${type}:${value}:${relay}` : `${type}:${value}`;
}

export default pointerArrayToKey;
