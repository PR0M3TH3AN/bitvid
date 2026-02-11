#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const DIST_DIR = 'dist';
const INDEX_PATH = path.join(DIST_DIR, 'index.html');
const MANIFEST_PATH = path.join(DIST_DIR, 'asset-manifest.json');
const VERSION_MARKUP_PATTERN = /seed\.\s*zap\.\s*subscribe\.\s*<\/h2>[\s\S]*?v:\s*[a-f0-9]{8}\s*•\s*\d{4}-\d{2}-\d{2}/i;

function readUtf8(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required file: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function main() {
  const indexHtml = readUtf8(INDEX_PATH);
  assert(
    VERSION_MARKUP_PATTERN.test(indexHtml),
    'dist/index.html is missing version markup under the slogan (expected: v: <8-char-hash> • <date>).'
  );

  const manifest = JSON.parse(readUtf8(MANIFEST_PATH));
  const cssHashedPath = manifest['css/tailwind.generated.css'];
  const jsHashedPath = manifest['js/index.js'];

  assert(cssHashedPath, 'dist/asset-manifest.json is missing css/tailwind.generated.css.');
  assert(jsHashedPath, 'dist/asset-manifest.json is missing js/index.js.');

  assert(
    indexHtml.includes(`href="${cssHashedPath}"`) || indexHtml.includes(`href='${cssHashedPath}'`),
    `dist/index.html does not reference manifest CSS asset: ${cssHashedPath}`
  );

  assert(
    indexHtml.includes(`src="${jsHashedPath}"`) || indexHtml.includes(`src='${jsHashedPath}'`),
    `dist/index.html does not reference manifest JS asset: ${jsHashedPath}`
  );

  console.log('Deployment artifact verification passed: version markup and hashed asset references are present in dist/index.html.');
}

main();
