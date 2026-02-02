import "./setup-test-env.js";
import { Fuzzer } from "./fuzz-lib.mjs";
import { normalizeAndAugmentMagnet } from "../../js/magnetUtils.js";

const fuzzer = new Fuzzer("magnet-utils");

async function fuzzTest(fuzzer, state) {
  // Generate inputs
  const rawValue = fuzzer.randBool() ? fuzzer.randString(100) : "magnet:?xt=urn:btih:" + fuzzer.randString(40, "0123456789abcdef");

  // Inject garbage into magnet link
  let malformedValue = rawValue;
  if (fuzzer.randBool()) {
      // url encode some chars
      malformedValue = encodeURIComponent(rawValue);
  }

  const options = {
      webSeed: fuzzer.randBool() ? fuzzer.randString(50) : [fuzzer.randString(50)],
      torrentUrl: fuzzer.randString(50),
      xs: fuzzer.randString(50),
      extraTrackers: fuzzer.randArray(() => fuzzer.randString(30), 0, 3),
      appProtocol: fuzzer.randBool() ? "http:" : "https:"
  };

  state.input = {
      rawValue: malformedValue,
      options
  };

  try {
      normalizeAndAugmentMagnet(malformedValue, options);
  } catch (err) {
      throw err;
  }
}

fuzzer.runFuzzLoop(5000, fuzzTest).catch(console.error);
