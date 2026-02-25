import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const ITERATIONS = 5;
const COMMAND = 'node';
const ARGS = ['bin/torch-lock.mjs', 'list'];

async function runOnce(i) {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const child = spawn(COMMAND, ARGS, { stdio: 'ignore' });

    child.on('close', (code) => {
      const duration = performance.now() - start;
      if (code === 0) {
        console.log(`Run ${i + 1}: ${duration.toFixed(2)}ms`);
        resolve(duration);
      } else {
        reject(new Error(`Process exited with code ${code}`));
      }
    });

    child.on('error', (err) => reject(err));
  });
}

async function main() {
  console.log(`Benchmarking "${COMMAND} ${ARGS.join(' ')}" (${ITERATIONS} iterations)...`);
  const times = [];

  for (let i = 0; i < ITERATIONS; i++) {
    try {
      const duration = await runOnce(i);
      times.push(duration);
    } catch (err) {
      console.error(`Run ${i + 1} failed:`, err);
    }
  }

  if (times.length === 0) {
    console.error('No successful runs.');
    process.exit(1);
  }

  const sum = times.reduce((a, b) => a + b, 0);
  const avg = sum / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);

  console.log('\nResults:');
  console.log(`  Count:   ${times.length}`);
  console.log(`  Average: ${avg.toFixed(2)}ms`);
  console.log(`  Min:     ${min.toFixed(2)}ms`);
  console.log(`  Max:     ${max.toFixed(2)}ms`);
}

main().catch(console.error);
