import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

function getFiles(dir, files = []) {
  try {
    const fileList = readdirSync(dir);
    for (const file of fileList) {
      const name = join(dir, file);
      if (statSync(name).isDirectory()) {
        getFiles(name, files);
      } else if (name.endsWith('.mjs') || name.endsWith('.js')) {
        files.push(name);
      }
    }
  } catch (_e) {
    // ignore if dir doesn't exist
  }
  return files;
}

// Parse arguments
const args = process.argv.slice(2);
let outputDir = 'reports/test-audit';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--output-dir') {
    outputDir = args[i + 1];
    i++;
  }
}

// Only scan test/ directory now, as tests/ was consolidated
const testFiles = [...getFiles('test')];
const suspicious = [];

for (const file of testFiles) {
  const content = readFileSync(file, 'utf8');
  const issues = [];

  if (content.includes('.only(')) issues.push('Found .only()');
  if (content.includes('.skip(')) issues.push('Found .skip()');
  if (content.includes('setTimeout(')) issues.push('Found setTimeout()');
  if (content.includes('sleep(')) issues.push('Found sleep()');

  // Naive check for assertions: look for assert., expect(, t.
  // Many tests use 't' context from node:test
  if (!content.includes('assert.') && !content.includes('expect(') && !content.includes('t.plan') && !content.includes('strictEqual')) {
     // This is very naive, might false positive on 't.ok' etc.
     // Let's look for common assertion keywords.
     const assertionKeywords = ['assert', 'expect', 'strictEqual', 'deepStrictEqual', 'ok', 'equal'];
     const hasAssertion = assertionKeywords.some(k => content.includes(k));
     if (!hasAssertion) issues.push('No obvious assertions');
  }

  if (issues.length > 0) {
    suspicious.push({ file, issues });
  }
}

// Ensure output directory exists
mkdirSync(outputDir, { recursive: true });

const outputPath = join(outputDir, 'suspicious-tests.json');
writeFileSync(outputPath, JSON.stringify(suspicious, null, 2));
console.log(`Found ${suspicious.length} suspicious files.`);
console.log(`Report written to ${outputPath}.`);
