
import { finalizeEvent as pureFinalize, generateSecretKey, getPublicKey, getEventHash } from "nostr-tools";
import { finalizeEvent as wasmFinalize, setNostrWasm } from "nostr-tools/wasm";
import { initNostrWasm } from "nostr-wasm";

async function main() {
  const secretKey = generateSecretKey();
  const pubkey = getPublicKey(secretKey);
  const ITERATIONS = 1000;

  const baseEvent = {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [["t", "nostr"], ["t", "benchmark"]],
    content: "Hello world, this is a benchmark event.",
    pubkey: pubkey,
  };

  console.log(`Running signing benchmark with ${ITERATIONS} iterations...`);

  // 1. Pure JS baseline (finalizeEvent)
  {
      console.log("Pure JS finalizeEvent...");
      const start = performance.now();
      for (let i = 0; i < ITERATIONS; i++) {
        const event = { ...baseEvent, created_at: baseEvent.created_at + i };
        pureFinalize(event, secretKey);
      }
      const end = performance.now();
      const time = end - start;
      console.log(`Pure JS time: ${time.toFixed(2)}ms (${(ITERATIONS/time*1000).toFixed(2)} ops/sec)`);
  }

  // 2. WASM
  console.log("Initializing WASM...");
  const wasm = await initNostrWasm();
  setNostrWasm(wasm);

  {
      console.log("WASM finalizeEvent...");
      const start = performance.now();
      for (let i = 0; i < ITERATIONS; i++) {
        const event = { ...baseEvent, created_at: baseEvent.created_at + i };
        wasmFinalize(event, secretKey);
      }
      const end = performance.now();
      const time = end - start;
      console.log(`WASM time: ${time.toFixed(2)}ms (${(ITERATIONS/time*1000).toFixed(2)} ops/sec)`);
  }
}

main().catch(console.error);
