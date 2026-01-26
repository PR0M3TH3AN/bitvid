
import { runFuzzer, rng } from "./fuzz-shared.mjs";

// Polyfills
global.window = {
  location: {
    protocol: "https:"
  }
};

// Import the target module
// Note: We are in scripts/agent/
import * as MagnetUtils from "../../js/magnetUtils.js";

async function fuzzTest(iteration) {
  // Randomize window protocol sometimes
  global.window.location.protocol = rng.bool() ? "https:" : "http:";

  const rawValue = rng.mixedString(100);

  const genOptions = () => {
    if (rng.bool()) return null;
    return {
        webSeed: rng.bool() ? rng.mixedString(50) : rng.array(() => rng.mixedString(50), 3),
        torrentUrl: rng.mixedString(50),
        xs: rng.mixedString(50),
        extraTrackers: rng.array(() => rng.mixedString(30), 5),
        logger: rng.bool() ? (() => {}) : null,
        appProtocol: rng.bool() ? rng.oneOf(["http:", "https:", rng.nastyString()]) : undefined
    };
  };

  const options = genOptions();

  MagnetUtils.normalizeAndAugmentMagnet(rawValue, options);

  return { rawValue, options };
}

runFuzzer("magnetUtils", 5000, fuzzTest).catch(err => {
    console.error("Fatal fuzzer error:", err);
    process.exit(1);
});
