import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const SEARCH_PATTERNS = [
  'setInterval', 'setTimeout', 'requestAnimationFrame', 'requestIdleCallback',
  'Promise\\.allSettled', 'Promise\\.all', 'Promise\\.any', 'Promise\\.race',
  'new Worker', 'Worker\\(', 'postMessage\\(', 'getDmDecryptWorkerQueueSize', 'decryptDmInWorker',
  'new WebTorrent', 'WebTorrent', 'torrent', 'magnet', 'torrentHash', 'magnetValidators',
  'nostrClient\\.pool', 'publishEventToRelays', 'pool\\.list', 'queueSignEvent', 'relayManager', 'authService', 'hydrateFromStorage',
  'document\\.hidden', 'visibilitychange'
];

const IGNORE_DIRS = ['node_modules', '.git', 'dist', 'artifacts', 'perf'];
const SEARCH_DIR = 'js';

function search() {
  const pattern = SEARCH_PATTERNS.join('|');
  const command = `grep -rnE "${pattern}" ${SEARCH_DIR}`;

  try {
    const output = execSync(command, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
    const lines = output.split('\n').filter(Boolean);
    const hits = lines.map(line => {
      const parts = line.split(':');
      if (parts.length < 3) return null;
      const file = parts[0];
      const lineNum = parseInt(parts[1], 10);
      const content = parts.slice(2).join(':').trim();
      return { file, line: lineNum, snippet: content };
    }).filter(Boolean);

    const date = new Date().toISOString().split('T')[0];
    const outputFile = `perf/hits-${date}.json`;
    fs.writeFileSync(outputFile, JSON.stringify(hits, null, 2));
    console.log(`Saved ${hits.length} hits to ${outputFile}`);
  } catch (error) {
    console.error('Error running grep:', error);
  }
}

search();
