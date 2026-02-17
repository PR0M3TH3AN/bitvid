import { spawn } from 'node:child_process';

const MAX_RUNS = 20;

async function runTest(iteration) {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', 'test:unit', '--', 'tests/hashtag-preferences.test.mjs'], {
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, FORCE_COLOR: '1' }
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Test failed on iteration ${iteration} with exit code ${code}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

async function main() {
  console.log(`Starting reproduction loop (${MAX_RUNS} runs)...`);

  for (let i = 1; i <= MAX_RUNS; i++) {
    console.log(`\n--- Iteration ${i}/${MAX_RUNS} ---`);
    try {
      await runTest(i);
    } catch (error) {
      console.error(`\n❌ REPRODUCTION SUCCESSFUL: ${error.message}`);
      process.exit(1);
    }
  }

  console.log(`\n✅ Passed ${MAX_RUNS} iterations without failure.`);
  // If we reach here, we failed to reproduce the issue (or it's not flaky enough).
  // We exit with 0 to indicate the script ran successfully, even if reproduction failed.
  // But strictly speaking, if the goal is to reproduce, maybe we should warn.
  process.exit(0);
}

main();
