
import { normalizeAndAugmentMagnet } from "../../js/magnetUtils.js";
import { runFuzzer, randomString, randomInt, randomJSON, randomHex, randomBoolean, randomItem } from "./fuzz-shared.mjs";

async function fuzzMagnetUtils(iteration) {
  const baseMagnets = [
    "magnet:?xt=urn:btih:" + randomHex(40),
    "magnet:?xt=urn:btih:" + randomHex(40).toUpperCase(),
    "magnet:?xt=urn:btih:" + randomString(40), // Invalid hex
    "magnet:?xt=urn:btih:" + randomHex(40) + "&dn=" + randomString(10),
    "magnet:?xt=urn:btih:" + randomHex(40) + "&tr=" + encodeURIComponent("wss://" + randomString(10) + ".com"),
    randomString(100),
    ""
  ];

  const rawValue = Math.random() < 0.8 ? randomItem(baseMagnets) : randomString(100);

  const options = {
    webSeed: Math.random() < 0.5 ? randomString(20) : [randomString(20), randomString(20)],
    torrentUrl: Math.random() < 0.5 ? "https://" + randomString(10) + ".com/file.torrent" : randomString(20),
    xs: Math.random() < 0.5 ? "https://" + randomString(10) + ".com/file.torrent" : randomString(20),
    extraTrackers: Math.random() < 0.5 ? ["wss://" + randomString(10) + ".com"] : randomJSON(1, 2),
    appProtocol: randomItem(["http:", "https:", "magnet:", randomString(5)])
  };

  // Malformed options
  if (Math.random() < 0.1) {
    options.webSeed = 123;
  }
  if (Math.random() < 0.1) {
    options.extraTrackers = "string";
  }

  const input = {
    rawValue,
    options
  };

  // Mock logger to avoid spamming console
  options.logger = () => {};

  normalizeAndAugmentMagnet(rawValue, options);

  return input;
}

runFuzzer("magnetUtils", fuzzMagnetUtils, 10000); // Fast, so more iterations
