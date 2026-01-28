
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

  const genMagnet = () => {
    if (rng.bool()) return rng.mixedString(100); // Random garbage

    // Construct semi-valid magnet
    let magnet = "magnet:?";
    const params = [];

    // xt (Exact Topic)
    if (rng.bool()) {
        const hash = rng.bool() ? rng.mixedString(40) : "urn:btih:" + rng.mixedString(40);
        params.push(`xt=${hash}`);
    }

    // dn (Display Name)
    if (rng.bool()) {
        const val = rng.mixedString(20);
        try {
            params.push(`dn=${encodeURIComponent(val)}`);
        } catch {
            params.push(`dn=${val}`);
        }
    }

    // tr (Trackers)
    if (rng.bool()) {
        const trackers = rng.array(() => {
            const proto = rng.oneOf(["udp", "http", "https", "wss", "ws"]);
            const val = `${proto}://${rng.mixedString(20)}`;
            try {
                return encodeURIComponent(val);
            } catch {
                return val;
            }
        }, 5);
        trackers.forEach(t => params.push(`tr=${t}`));
    }

    // ws (Web Seeds)
    if (rng.bool()) {
         const val = "https://" + rng.mixedString(20);
         try {
             params.push(`ws=${encodeURIComponent(val)}`);
         } catch {
             params.push(`ws=${val}`);
         }
    }

    // Random params
    if (rng.bool()) {
        params.push(`${rng.string(5)}=${rng.mixedString(10)}`);
    }

    magnet += params.join("&");

    // Corrupt it
    if (Math.random() < 0.2) {
        // Inject garbage
        const pos = rng.int(0, magnet.length);
        magnet = magnet.slice(0, pos) + rng.nastyString() + magnet.slice(pos);
    }

    return magnet;
  };

  const rawValue = genMagnet();

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
