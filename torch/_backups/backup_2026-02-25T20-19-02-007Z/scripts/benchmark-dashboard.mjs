import { spawn } from 'node:child_process';
import http from 'node:http';
import { performance } from 'node:perf_hooks';

const PORT = 3456;
const REQUESTS = 2000;
const CONCURRENCY = 50;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:${PORT}/dashboard/`, (res) => {
          if (res.statusCode === 200) resolve();
          else reject(new Error(`Status ${res.statusCode}`));
        });
        req.on('error', reject);
        req.end();
      });
      return;
    } catch (_e) {
      await sleep(100);
    }
  }
  throw new Error('Server did not start');
}

function makeRequest() {
  return new Promise((resolve, reject) => {
    // Request a small file that exists
    const req = http.get(`http://localhost:${PORT}/torch-config.example.json`, (res) => {
      res.resume(); // consume body
      res.on('end', resolve);
    });
    req.on('error', reject);
  });
}

async function benchmark() {
  console.log('Starting server...');
  const serverProcess = spawn('node', ['bin/torch-lock.mjs', 'dashboard', '--port', String(PORT)], {
    stdio: 'ignore' // Suppress logs for cleaner output
  });

  try {
    await waitForServer();
    console.log('Server ready.');

    const start = performance.now();

    let sent = 0;
    const worker = async () => {
        while (true) {
            const current = sent++;
            if (current >= REQUESTS) break;
            try {
                await makeRequest();
            } catch (_e) {
                // console.error(_e);
            }
        }
    };

    const workers = [];
    for (let i = 0; i < CONCURRENCY; i++) {
        workers.push(worker());
    }

    await Promise.all(workers);

    const end = performance.now();
    const duration = end - start;
    const rps = (REQUESTS / duration) * 1000;

    console.log(`Requests: ${REQUESTS}`);
    console.log(`Duration: ${duration.toFixed(2)}ms`);
    console.log(`RPS: ${rps.toFixed(2)}`);

  } finally {
    serverProcess.kill();
  }
}

benchmark().catch(console.error);
