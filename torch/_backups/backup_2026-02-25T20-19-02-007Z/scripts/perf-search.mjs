import fs from 'node:fs/promises';
import path from 'node:path';

const patterns = [
  /setInterval|setTimeout|requestAnimationFrame|requestIdleCallback/i,
  /Promise\.allSettled|Promise\.all|Promise\.any|Promise\.race/i,
  /new Worker|Worker\(|postMessage\(|getDmDecryptWorkerQueueSize|decryptDmInWorker/i,
  /new WebTorrent|WebTorrent|torrent|magnet|torrentHash|magnetValidators/i,
  /integrationClient\.pool|publishEventToRelays|pool\.list|queueSignEvent|relayManager|authService|hydrateFromStorage/i,
  /document\.hidden|visibilitychange/i
];

async function scanDir(dir) {
  const hits = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        hits.push(...await scanDir(fullPath));
      } else if (entry.isFile() && /\.(mjs|js|jsx|ts|tsx)$/.test(entry.name)) {
        const content = await fs.readFile(fullPath, 'utf8');
        const lines = content.split('\n');

        lines.forEach((line, index) => {
          for (const pattern of patterns) {
            if (pattern.test(line)) {
              hits.push({
                file: fullPath,
                line: index + 1,
                content: line.trim(),
                pattern: pattern.toString()
              });
              break; // One hit per line is enough
            }
          }
        });
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') console.error(`Error scanning ${dir}:`, err);
  }
  return hits;
}

const hits = await scanDir('src');
const outputFile = process.argv[2] || 'reports/performance/hits.json';
await fs.writeFile(outputFile, JSON.stringify(hits, null, 2));
console.log(`Wrote ${hits.length} hits to ${outputFile}`);
