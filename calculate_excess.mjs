import { readFileSync } from 'node:fs';
const content = readFileSync('file_size.log', 'utf8');
const lines = content.split('\n');
let totalExcess = 0;
let count = 0;
lines.forEach(line => {
  const match = line.match(/\((\d+) lines\)/);
  if (match) {
    const lines = parseInt(match[1], 10);
    if (lines > 1000) {
      totalExcess += (lines - 1000);
      count++;
    }
  }
});
console.log('Count:', count);
console.log('Total Excess:', totalExcess);
