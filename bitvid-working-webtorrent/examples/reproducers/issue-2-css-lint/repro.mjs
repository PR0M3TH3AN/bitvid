import { spawn } from 'node:child_process';

console.log("Running lint:tokens to reproduce the issue...");
const child = spawn('npm', ['run', 'lint:tokens'], { stdio: 'inherit', shell: true });

child.on('exit', (code) => {
  if (code !== 0) {
    console.log("\nReproduced: Lint check failed as expected.");
    process.exit(code);
  } else {
    console.log("\nFailed to reproduce: Lint check passed.");
    process.exit(0);
  }
});
