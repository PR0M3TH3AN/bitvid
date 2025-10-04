// js/utils/fakeDecrypt.js

/**
 * Simple "decryption" placeholder for private videos.
 */
export function fakeDecrypt(str) {
  if (typeof str !== "string") {
    return "";
  }
  return str.split("").reverse().join("");
}

export default fakeDecrypt;
