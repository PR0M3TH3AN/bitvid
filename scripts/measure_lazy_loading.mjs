import fs from 'fs';
import path from 'path';

const filesToCheck = [
  'js/historyView.js',
  'js/ui/subscriptionHistoryController.js',
  'js/searchView.js',
  'js/ui/profileModal/ProfileDirectMessageRenderer.js',
  'js/ui/profileModalController.js'
];

let totalImages = 0;
let missingLazy = 0;
let missingAsync = 0;

filesToCheck.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('createElement("img")') || line.includes("createElement('img')")) {
        totalImages++;

        // simple heuristic: look ahead next 20 lines for attributes
        let chunk = lines.slice(i, i + 20).join('\n');

        // Check for variable name
        const match = line.match(/(?:const|let|var)\s+(\w+)\s*=/);
        const varName = match ? match[1] : null;

        if (varName) {
            if (!chunk.includes(`${varName}.loading = "lazy"`)) {
                missingLazy++;
                console.log(`[${file}] Missing loading="lazy" for ${varName} at line ${i+1}`);
            }
            if (!chunk.includes(`${varName}.decoding = "async"`)) {
                missingAsync++;
                console.log(`[${file}] Missing decoding="async" for ${varName} at line ${i+1}`);
            }
        }
    }
  }
});

console.log('--- Results ---');
console.log(`Total images found: ${totalImages}`);
console.log(`Missing loading="lazy": ${missingLazy}`);
console.log(`Missing decoding="async": ${missingAsync}`);
