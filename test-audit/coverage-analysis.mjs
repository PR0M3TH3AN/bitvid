import fs from 'fs';
import path from 'path';

const CRITICAL_FILES = [
  'js/services/authService.js',
  'js/relayManager.js',
  'js/nostr/dmDecryptWorker.js',
  'js/nostr/watchHistory.js',
  'js/userBlocks.js'
];

async function analyze() {
  const lcovPath = path.resolve('test-audit/coverage/lcov.info');
  if (!fs.existsSync(lcovPath)) {
    console.log('No coverage file found.');
    return;
  }

  const content = await fs.promises.readFile(lcovPath, 'utf8');
  const records = content.split('end_of_record');
  const gaps = {};

  for (const record of records) {
    if (!record.trim()) continue;

    const lines = record.split('\n');
    let file = '';
    let lf = 0;
    let lh = 0;

    for (const line of lines) {
      if (line.startsWith('SF:')) {
        let f = line.substring(3).trim();
        // Normalize
        if (path.isAbsolute(f)) {
          f = path.relative(process.cwd(), f);
        }
        file = f;
      } else if (line.startsWith('LF:')) {
        lf = parseInt(line.substring(3), 10);
      } else if (line.startsWith('LH:')) {
        lh = parseInt(line.substring(3), 10);
      }
    }

    if (file && CRITICAL_FILES.some(cf => file.endsWith(cf))) { // lax match
      const percentage = lf === 0 ? 0 : (lh / lf) * 100;
      gaps[file] = {
        coverage: percentage.toFixed(2),
        lf,
        lh
      };
    }
  }

  console.log(JSON.stringify(gaps, null, 2));
}

analyze();
