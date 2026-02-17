
import { Worker } from "worker_threads";
import { performance } from "perf_hooks";

const WORKER_CODE = `
  const { parentPort } = require('worker_threads');
  parentPort.on('message', (data) => {
    parentPort.postMessage('pong');
  });
`;

// Implementation of toLightweightVideo to verify performance
function toLightweightVideo(video) {
  if (!video || typeof video !== "object") {
    return null;
  }

  const lightweight = {
    id: video.id,
    kind: video.kind,
    pubkey: video.pubkey,
    nip71: video.nip71,
    tags: [],
  };

  if (Array.isArray(video.tags)) {
    for (const t of video.tags) {
      if (Array.isArray(t) && t.length >= 2) {
        const type = t[0];
        if (type === "d" || type === "t") {
          lightweight.tags.push(t);
        }
      }
    }
  }

  return lightweight;
}

async function runBenchmark() {
  const worker = new Worker(WORKER_CODE, { eval: true });

  // Create a large list of full video objects
  const listSize = 10000;
  const fullVideos = [];
  for (let i = 0; i < listSize; i++) {
    fullVideos.push({
      id: `key-${i}`,
      content: "some content ".repeat(20), // ~200 chars
      tags: [["t", "tag1"], ["t", "tag2"], ["p", "pubkey"], ["d", "identifier"], ["zap", "zapdata"]],
      created_at: Date.now(),
      pubkey: "some-pubkey",
      sig: "some-sig",
      kind: 30078,
      nip71: { hashtags: ["tag3"], t: ["tag4"] },
      relays: ["wss://relay1", "wss://relay2"],
      otherBigField: "x".repeat(100),
    });
  }

  console.log(`List size: ${listSize}`);

  // Warmup
  await new Promise((resolve) => {
    worker.once('message', resolve);
    worker.postMessage({ type: 'ping', payload: [] });
  });

  // Measure Full Transfer
  let start = performance.now();
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => {
      worker.once('message', resolve);
      worker.postMessage({ type: 'ping', payload: fullVideos });
    });
  }
  let end = performance.now();
  const fullTime = (end - start);
  console.log(`Full Transfer (10 runs): ${fullTime.toFixed(2)}ms`);

  // Measure Lightweight Transfer (using helper)
  start = performance.now();
  for (let i = 0; i < 10; i++) {
    const lightweightVideos = fullVideos.map(toLightweightVideo);
    await new Promise((resolve) => {
      worker.once('message', resolve);
      worker.postMessage({ type: 'ping', payload: lightweightVideos });
    });
  }
  end = performance.now();
  const lightTime = (end - start);
  console.log(`Lightweight Transfer + Map Overhead (10 runs): ${lightTime.toFixed(2)}ms`);

  const improvement = ((fullTime - lightTime) / fullTime) * 100;
  console.log(`Improvement: ${improvement.toFixed(2)}%`);

  worker.terminate();
}

runBenchmark().catch(console.error);
