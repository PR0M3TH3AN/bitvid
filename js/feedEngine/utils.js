// js/feedEngine/utils.js

export function isPlainObject(value) {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function toSet(values) {
  if (values instanceof Set) {
    return new Set(values);
  }
  if (Array.isArray(values)) {
    return new Set(values);
  }
  return new Set();
}

export function toArray(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return [...value];
  }
  return [value];
}
