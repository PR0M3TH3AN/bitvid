import {
  randomInt,
  randomBoolean,
  randomString,
  randomHex,
  randomArray,
  randomValue,
  randomObject,
  runFuzzer,
} from "./fuzz-utils.mjs";
import {
  normalizeAndAugmentMagnet,
  safeDecodeMagnet,
  extractBtihFromMagnet,
  normalizeInfoHash,
} from "../../js/magnetUtils.js";

function genMagnetString() {
  if (Math.random() < 0.2) return randomString(100); // Garbage
  if (Math.random() < 0.2) return ""; // Empty

  let magnet = "magnet:?";
  const params = [];
  const count = randomInt(0, 5);
  for (let i = 0; i < count; i++) {
    const key = Math.random() < 0.5 ? (Math.random() < 0.5 ? "xt" : "tr") : randomString(2);
    const value = randomString(20, true);
    params.push(`${key}=${encodeURIComponent(value)}`);
  }
  return magnet + params.join("&");
}

function genOptions() {
  return {
    webSeed: Math.random() < 0.5 ? randomString(20) : [randomString(20), randomString(20)],
    torrentUrl: Math.random() < 0.5 ? randomString(30) : undefined,
    xs: Math.random() < 0.5 ? randomString(30) : undefined,
    extraTrackers: Math.random() < 0.5 ? [randomString(30)] : undefined,
    appProtocol: Math.random() < 0.5 ? "http:" : "https:",
  };
}

async function main() {
  await runFuzzer("safeDecodeMagnet", safeDecodeMagnet, () => [genMagnetString()]);
  await runFuzzer("extractBtihFromMagnet", extractBtihFromMagnet, () => [genMagnetString()]);
  await runFuzzer("normalizeInfoHash", normalizeInfoHash, () => [randomString(40)]);
  await runFuzzer("normalizeAndAugmentMagnet", normalizeAndAugmentMagnet, () => [genMagnetString(), genOptions()]);
}

main().catch(console.error);
