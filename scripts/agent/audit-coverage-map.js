import fs from 'fs';
import path from 'path';

const criticalFiles = [
  'js/services/authService.js',
  'js/relayManager.js',
  'js/nostr/dmDecryptWorker.js',
  'js/nostr/dmDecryptWorkerClient.js',
  'js/nostr/watchHistory.js',
  'js/userBlocks.js',
  'js/ui/ambientBackground.js',
  'torrent/app.js'
];

try {
  const summary = JSON.parse(fs.readFileSync('test-audit/coverage/coverage-summary.json', 'utf8'));
  const report = {};

  for (const file of criticalFiles) {
    // Find the file in the coverage summary keys (might be absolute paths)
    const key = Object.keys(summary).find(k => k.endsWith(file));
    if (key) {
      report[file] = summary[key].lines.pct;
    } else {
      report[file] = 0; // Not covered
    }
  }

  console.log("Critical Coverage Report:");
  console.log(JSON.stringify(report, null, 2));

  fs.writeFileSync('test-audit/coverage-gaps.json', JSON.stringify(report, null, 2));
} catch (e) {
  console.error("Error processing coverage summary:", e);
}
