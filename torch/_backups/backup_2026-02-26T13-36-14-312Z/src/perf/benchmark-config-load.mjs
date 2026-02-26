import { loadTorchConfig, _resetTorchConfigCache } from '../torch-config.mjs';
import fs from 'node:fs';
import path from 'node:path';

const configPath = path.resolve(process.cwd(), 'torch-config.json');
const originalConfig = fs.existsSync(configPath) ? fs.readFileSync(configPath) : null;

// Ensure a config file exists for benchmark
if (!fs.existsSync(configPath)) {
  fs.writeFileSync(configPath, JSON.stringify({
    nostrLock: {
      relays: ["wss://relay.damus.io"],
      namespace: "test-ns"
    }
  }, null, 2));
}

const ITERATIONS = 1000;
const start = process.hrtime.bigint();

async function run() {
    for (let i = 0; i < ITERATIONS; i++) {
      _resetTorchConfigCache();
      try {
        const res = await loadTorchConfig();
        // Use res to prevent dead code elimination if JIT is smart (though side effects exist)
        if (!res) throw new Error("Failed");
      } catch (_e) {
        // ignore
      }
    }

    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1e6; // ms

    console.log(`[ASYNC] Loaded config ${ITERATIONS} times in ${duration.toFixed(2)}ms`);
    console.log(`[ASYNC] Average: ${(duration / ITERATIONS).toFixed(4)}ms per load`);

    // Cleanup
    if (!originalConfig && fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
    }
}

run();
