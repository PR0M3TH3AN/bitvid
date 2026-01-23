
import { WebSocket } from "ws";
import { generateSecretKey, getPublicKey, finalizeEvent } from "nostr-tools";
import { startRelay } from "./simple-relay.mjs";
import fs from "fs";
import path from "path";
import { performance } from "perf_hooks";

// Parse args
const args = process.argv.slice(2);
const getArg = (name, def) => {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : def;
};

const DURATION_MS = parseInt(getArg("--duration", "60000")); // 1 minute
const N_CLIENTS = parseInt(getArg("--clients", "100")); // Default 100 for safety
const RELAY_URL = getArg("--relay", null);
const RATE_PER_CLIENT = parseFloat(getArg("--rate", "0.1")); // events/sec

console.log(`Load Test Config:
  Duration: ${DURATION_MS}ms
  Clients: ${N_CLIENTS}
  Relay: ${RELAY_URL || "Internal (localhost:8888)"}
  Rate: ${RATE_PER_CLIENT} ev/s/client
`);

async function main() {
  let relayServer = null;
  let targetUrl = RELAY_URL;

  if (!targetUrl) {
    relayServer = startRelay(8888);
    targetUrl = "ws://localhost:8888";
  }

  // Setup metrics
  const latencies = [];
  let sentCount = 0;
  let okCount = 0;
  let errorCount = 0;
  const errors = {};

  // Hot functions profiling
  const buildTimes = [];
  const signTimes = [];

  const clients = [];

  // Start clients
  console.log("Connecting clients...");
  for (let i = 0; i < N_CLIENTS; i++) {
    clients.push(createClient(targetUrl, i));
  }

  await Promise.all(clients.map((c) => c.connect()));
  console.log("All clients connected.");

  // Start load
  console.log("Starting load...");
  const startTime = Date.now();
  const interval = setInterval(() => {
    reportMetrics();
  }, 5000);

  clients.forEach((c) => c.startLoad());

  // Wait for duration
  await new Promise((resolve) => setTimeout(resolve, DURATION_MS));

  // Stop load
  console.log("Stopping load...");
  clearInterval(interval);
  clients.forEach((c) => c.stopLoad());

  // Wait a bit for pending OKs
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Disconnect
  clients.forEach((c) => c.close());
  if (relayServer) {
    await relayServer.close();
  }

  // Generate Report
  const endTime = Date.now();
  const actualDuration = (endTime - startTime) / 1000;

  latencies.sort((a, b) => a - b);
  const avgLatency =
    latencies.reduce((a, b) => a + b, 0) / latencies.length || 0;
  const p95Latency = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const p99Latency = latencies[Math.floor(latencies.length * 0.99)] || 0;

  const avgBuildTime = buildTimes.reduce((a, b) => a + b, 0) / buildTimes.length || 0;
  const avgSignTime = signTimes.reduce((a, b) => a + b, 0) / signTimes.length || 0;

  const report = {
    timestamp: new Date().toISOString(),
    config: {
      durationMs: DURATION_MS,
      clients: N_CLIENTS,
      relay: targetUrl,
      rate: RATE_PER_CLIENT
    },
    metrics: {
      totalSent: sentCount,
      totalOk: okCount,
      totalErrors: errorCount,
      throughput: okCount / actualDuration,
      latency: {
        avg: avgLatency,
        p95: p95Latency,
        p99: p99Latency,
        min: latencies[0] || 0,
        max: latencies[latencies.length - 1] || 0
      },
      resources: {
        cpu: process.cpuUsage(),
        memory: process.memoryUsage()
      }
    },
    hot_functions: [
      { name: 'buildEvent', avg_ms: avgBuildTime },
      { name: 'signEvent', avg_ms: avgSignTime }
    ],
    errors: errors,
    recommendations: []
  };

  if (p95Latency > 200) {
    report.recommendations.push(
      "High latency detected (>200ms p95). Consider scaling relay or reducing batch size."
    );
  }
  if (errorCount > 0) {
    report.recommendations.push(
      "Errors detected. Check error logs and relay stability."
    );
  }
  if (report.metrics.throughput < N_CLIENTS * RATE_PER_CLIENT * 0.8) {
    report.recommendations.push(
      "Throughput is significantly lower than target rate. Possible bottleneck."
    );
  }
  if (avgSignTime > 5) { // 5ms per signature is quite high for main thread loop
      report.recommendations.push(
          "Cryptographic bottleneck detected: signEvent avg > 5ms. Consider offloading to workers."
      );
  }

  const artifactsDir = path.resolve("artifacts");
  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir);
  }

  const dateStr = new Date().toISOString().split("T")[0].replace(/-/g, "");
  const reportPath = path.join(artifactsDir, `load-report-${dateStr}.json`);

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Report written to ${reportPath}`);

  // Exit
  process.exit(0);

  function reportMetrics() {
    const mem = process.memoryUsage();
    console.log(
      `[Status] Sent: ${sentCount}, OK: ${okCount}, Errs: ${errorCount}, Heap: ${(mem.heapUsed / 1024 / 1024).toFixed(2)}MB`
    );
  }

  function createClient(url, index) {
    let ws;
    let timer;
    let connected = false;
    const sk = generateSecretKey();
    const pk = getPublicKey(sk);
    const pending = new Map(); // eventId -> timestamp

    return {
      connect: () =>
        new Promise((resolve) => {
          ws = new WebSocket(url);
          ws.on("open", () => {
            connected = true;
            resolve();
          });
          ws.on("message", (data) => {
            try {
              const msg = JSON.parse(data);
              if (msg[0] === "OK") {
                const eventId = msg[1];
                const ok = msg[2];
                const reason = msg[3];

                if (pending.has(eventId)) {
                  const start = pending.get(eventId);
                  const lat = Date.now() - start;
                  latencies.push(lat);
                  pending.delete(eventId);
                  if (ok) okCount++;
                  else {
                    errorCount++;
                    errors[reason] = (errors[reason] || 0) + 1;
                  }
                }
              } else if (msg[0] === "NOTICE") {
                errorCount++;
                errors["NOTICE: " + msg[1]] =
                  (errors["NOTICE: " + msg[1]] || 0) + 1;
              }
            } catch (e) {
              // ignore
            }
          });
          ws.on("error", (e) => {
            errorCount++;
            errors[e.message] = (errors[e.message] || 0) + 1;
            resolve(); // resolve anyway to not block
          });
          ws.on("close", () => {
            connected = false;
          });
        }),

      startLoad: () => {
        if (!connected) return;
        const intervalMs = 1000 / RATE_PER_CLIENT;
        timer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            const isLarge = Math.random() > 0.8; // 20% large events
            const event = isLarge
              ? createVideoPost(pk, sk)
              : createViewEvent(pk, sk);

            pending.set(event.id, Date.now());
            ws.send(JSON.stringify(["EVENT", event]));
            sentCount++;
          }
        }, intervalMs);
      },

      stopLoad: () => {
        if (timer) clearInterval(timer);
      },

      close: () => {
        if (ws) ws.close();
      }
    };
  }

  function createViewEvent(pk, sk) {
    const startBuild = performance.now();
    const event = {
      kind: 30079,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["d", "test-view"]],
      content: "",
      pubkey: pk
    };
    const endBuild = performance.now();
    buildTimes.push(endBuild - startBuild);

    const startSign = performance.now();
    const signed = finalizeEvent(event, sk);
    const endSign = performance.now();
    signTimes.push(endSign - startSign);

    return signed;
  }

  function createVideoPost(pk, sk) {
    const startBuild = performance.now();
    const event = {
      kind: 30078,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["d", "video-1"],
        ["title", "Test Video"],
        ["t", "video"]
      ],
      content: JSON.stringify({
        title: "Test Video",
        description: "A large description ".repeat(100),
        url: "https://example.com/video.mp4"
      }),
      pubkey: pk
    };
    const endBuild = performance.now();
    buildTimes.push(endBuild - startBuild);

    const startSign = performance.now();
    const signed = finalizeEvent(event, sk);
    const endSign = performance.now();
    signTimes.push(endSign - startSign);

    return signed;
  }
}

main().catch(console.error);
