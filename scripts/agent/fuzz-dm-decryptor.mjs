import { Fuzzer } from "./fuzz-lib.mjs";
import { decryptDM } from "../../js/dmDecryptor.js";

// Mock global dependencies
if (typeof global.window === "undefined") {
    global.window = {
        location: { protocol: "https:" },
        crypto: {
             getRandomValues: (arr) => crypto.randomFillSync(arr),
             subtle: {
                 digest: async (algo, data) => {
                     const hash = crypto.createHash("sha256").update(data).digest();
                     return hash.buffer;
                 }
             }
        }
    };
}
if (typeof global.localStorage === "undefined") {
    global.localStorage = {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {}
    };
}

const fuzzer = new Fuzzer("dm-decryptor");

async function test(fuzzer, state) {
    // Generate random event
    const event = {
        kind: fuzzer.randBool() ? fuzzer.pick([4, 1059]) : fuzzer.randInt(0, 20000), // 4=DM, 1059=GiftWrap
        created_at: Math.floor(Date.now() / 1000),
        tags: fuzzer.randArray(() => {
             const tagType = fuzzer.pick(["p", "e", "encrypted"]);
             if (tagType === "p") return ["p", fuzzer.randString(64, "0123456789abcdef")];
             if (tagType === "encrypted") return ["encrypted", fuzzer.pick(["nip04", "nip44", "nip44_v2"])];
             return [fuzzer.randString(5), fuzzer.randString(10)];
        }, 0, 5),
        content: fuzzer.randUnicodeString(fuzzer.randInt(0, 200)),
        pubkey: fuzzer.randString(64, "0123456789abcdef"),
        id: fuzzer.randString(64, "0123456789abcdef")
    };

    if (fuzzer.randBool()) event.content = fuzzer.randJSON(); // Garbage content

    // Mock decryptors
    const decryptors = fuzzer.randArray(() => {
        return {
            decrypt: async (pubkey, ciphertext) => {
                if (fuzzer.randBool()) throw new Error("Decrypt failed");
                // Return random valid JSON or garbage
                if (fuzzer.randBool()) return JSON.stringify(fuzzer.randJSON());
                return fuzzer.randUnicodeString(50);
            },
            scheme: fuzzer.pick(["nip04", "nip44", "nip44_v2", "unknown"]),
            priority: fuzzer.randInt(0, 10),
            supportsGiftWrap: fuzzer.randBool()
        };
    }, 0, 3);

    const context = {
        actorPubkey: fuzzer.randString(64, "0123456789abcdef"),
        decryptors: decryptors
    };

    state.input = { event, context };

    await decryptDM(event, context);
}

fuzzer.runFuzzLoop(2000, test);
