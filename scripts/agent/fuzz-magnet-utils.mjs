import { Fuzzer } from "./fuzz-lib.mjs";
import { normalizeAndAugmentMagnet } from "../../js/magnetUtils.js";

// Mock global dependencies if needed
if (typeof global.window === "undefined") {
    global.window = {
        location: { protocol: "https:" }
    };
}

const fuzzer = new Fuzzer("magnet-utils");

async function test(fuzzer, state) {
    const rawValue = fuzzer.randBool() ?
        `magnet:?xt=urn:btih:${fuzzer.randString(40, "0123456789abcdef")}&dn=${fuzzer.randString(10)}` :
        fuzzer.randUnicodeString(100);

    const options = {
        webSeed: fuzzer.randBool() ? fuzzer.randString(50) : fuzzer.randArray(() => fuzzer.randString(50), 0, 3),
        torrentUrl: fuzzer.randBool() ? fuzzer.randString(50) : undefined,
        xs: fuzzer.randBool() ? fuzzer.randString(50) : undefined,
        extraTrackers: fuzzer.randArray(() => fuzzer.randString(30), 0, 5),
        appProtocol: fuzzer.pick(["http:", "https:", "magnet:", "unknown:"]),
        logger: () => {} // No-op logger
    };

    // Sometimes pass garbage options
    if (fuzzer.randBool()) {
        options.webSeed = fuzzer.randJSON();
    }

    state.input = { rawValue, options };
    normalizeAndAugmentMagnet(rawValue, options);
}

fuzzer.runFuzzLoop(5000, test);
