import { profileCache } from "../js/state/profileCache.js";

// Polyfill localStorage
const store = new Map();
global.localStorage = {
  getItem: (key) => store.get(key) || null,
  setItem: (key, value) => store.set(key, value),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear(),
};

// Polyfill requestIdleCallback
global.requestIdleCallback = (cb) => setTimeout(() => {
    cb({
        timeRemaining: () => 50,
        didTimeout: false
    });
}, 0);

// Polyfill window (might be needed by logger or others)
if (typeof window === 'undefined') {
    global.window = global;
}

function generateLargeData() {
  const data = [];
  // Generate roughly 2MB of JSON data
  for (let i = 0; i < 20000; i++) {
    data.push({ id: i, content: "x".repeat(100) });
  }
  return data;
}

async function runBenchmark() {
  const pubkey = "0".repeat(64);
  const section = "watchHistory";
  const data = generateLargeData();

  // Set active profile to ensure logic runs
  profileCache.setActiveProfile(pubkey);

  console.log("Benchmarking setProfileData with large payload...");

  // Warmup
  profileCache.setProfileData(pubkey, section, [{id: 1}]);

  const start = performance.now();
  // We call it multiple times to amplify the effect, but a single call with 2MB is enough to show blocking
  profileCache.setProfileData(pubkey, section, data);
  const end = performance.now();

  console.log(`Execution time (Synchronous part): ${(end - start).toFixed(4)} ms`);

  // Wait for idle callback
  await new Promise(resolve => setTimeout(resolve, 50));

  // Verify data is "stored"
  const stored = localStorage.getItem(profileCache.getStorageKey(pubkey, section));
  if (stored) {
      console.log("Data successfully stored in localStorage (length: " + stored.length + ")");
  } else {
      console.log("Data NOT found in localStorage");
  }
}

runBenchmark();
