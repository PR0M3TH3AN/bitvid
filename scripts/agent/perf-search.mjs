import fs from 'node:fs';
import path from 'node:path';

const SEARCH_DIR = 'js';
const OUTPUT_DIR = 'perf';
const DATE = new Date().toISOString().split('T')[0];
const OUTPUT_FILE = path.join(OUTPUT_DIR, `hits-${DATE}.json`);

const PATTERNS = [
  { name: 'Timeouts/Intervals', regex: /setInterval|setTimeout|requestAnimationFrame|requestIdleCallback/g },
  { name: 'Promise Concurrency', regex: /Promise\.allSettled|Promise\.all|Promise\.any|Promise\.race/g },
  { name: 'Workers', regex: /new Worker|Worker\(|postMessage\(|getDmDecryptWorkerQueueSize|decryptDmInWorker/g },
  { name: 'WebTorrent', regex: /new WebTorrent|WebTorrent|torrent|magnet|torrentHash|magnetValidators/g },
  { name: 'Nostr/Relay/Auth', regex: /nostrClient\.pool|publishEventToRelays|pool\.list|queueSignEvent|relayManager|authService|hydrateFromStorage/g },
  { name: 'Visibility', regex: /document\.hidden|visibilitychange/g }
];

function getAllFiles(dirPath, arrayOfFiles) {
  const files = fs.readdirSync(dirPath);

  arrayOfFiles = arrayOfFiles || [];

  files.forEach(function(file) {
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
    } else {
      if (file.endsWith('.js') && !file.endsWith('.min.js')) {
        arrayOfFiles.push(path.join(dirPath, "/", file));
      }
    }
  });

  return arrayOfFiles;
}

function searchInFiles() {
  const files = getAllFiles(SEARCH_DIR);
  const hits = [];

  files.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      PATTERNS.forEach(pattern => {
        if (line.match(pattern.regex)) {
          hits.push({
            file: file,
            line: index + 1,
            content: line.trim(),
            pattern: pattern.name,
            match: line.match(pattern.regex)[0]
          });
        }
      });
    });
  });

  return hits;
}

if (!fs.existsSync(OUTPUT_DIR)){
    fs.mkdirSync(OUTPUT_DIR);
}

const results = searchInFiles();
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));

console.log(`Search complete. Found ${results.length} hits.`);
console.log(`Results saved to ${OUTPUT_FILE}`);
