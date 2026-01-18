
import { randomBytes } from 'crypto';

export function randomString(length = 100) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?/`~';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

export function randomUnicodeString(length = 100) {
    let result = '';
    for (let i = 0; i < length; i++) {
        // Random printable unicode range (roughly)
        result += String.fromCharCode(Math.floor(Math.random() * 0xFFFF));
    }
    return result;
}

export function randomSurrogateString(length = 100) {
  let result = '';
  for (let i = 0; i < length; i++) {
    // Generate random surrogates
    const code = Math.random() > 0.5
      ? Math.floor(0xD800 + Math.random() * (0xDBFF - 0xD800 + 1))
      : Math.floor(0xDC00 + Math.random() * (0xDFFF - 0xDC00 + 1));
    result += String.fromCharCode(code);
  }
  return result;
}

export function randomInt(max = 10000) {
    return Math.floor(Math.random() * max);
}

export function randomBool() {
    return Math.random() > 0.5;
}

export function randomObject(depth = 2) {
    if (depth <= 0) return randomString(10);
    const obj = {};
    const keys = randomInt(5) + 1;
    for (let i = 0; i < keys; i++) {
        obj[randomString(5)] = Math.random() > 0.5 ? randomString(10) : randomObject(depth - 1);
    }
    return obj;
}

export function randomHex(length = 64) {
    return randomBytes(length / 2).toString('hex');
}

export function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

export function fuzzGenerators() {
    const generators = [
        () => null,
        () => undefined,
        () => "",
        () => "   ",
        () => 0,
        () => 1,
        () => -1,
        () => NaN,
        () => Infinity,
        () => -Infinity,
        () => [],
        () => [null],
        () => {},
        () => randomString(1000),
        () => randomUnicodeString(100),
        () => randomSurrogateString(20),
        () => randomObject(),
        () => randomHex(64),
        () => "magnet:?xt=urn:btih:" + randomHex(40),
        () => "https://" + randomString(20) + ".com",
        () => {
            const obj = {};
            obj.self = obj;
            return obj; // Circular
        }
    ];
    return generators;
}

export function getRandomFuzzInput() {
    const gens = fuzzGenerators();
    return pickRandom(gens)();
}
