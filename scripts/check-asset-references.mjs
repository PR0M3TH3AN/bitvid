import fs from 'node:fs';
import path from 'node:path';

const DIST_DIR = 'dist';
const HTML_FILES = ['index.html', 'embed.html'];
const MANIFEST_PATH = path.join(DIST_DIR, 'asset-manifest.json');

const ALLOWLISTED_STATIC_PATHS = new Set([
  'vendor/marked.min.js',
  'vendor/highlight.min.js'
]);

const CSS_JS_ATTR_PATTERN = /<(script|link)\b[^>]*\b(src|href)=(["'])([^"']+)\3[^>]*>/gi;

function isLocalAssetReference(reference) {
  return !/^(?:[a-zA-Z][a-zA-Z\d+.-]*:|\/\/)/.test(reference);
}

function normalizeAssetPath(reference) {
  return reference.replace(/^\/+/, '').replace(/^\.\//, '');
}

function extractPathAndQuery(reference) {
  const [pathPart, queryPart = ''] = reference.split('?', 2);
  return {
    path: normalizeAssetPath(pathPart),
    query: queryPart
  };
}

function hasCssOrJsExtension(assetPath) {
  return assetPath.endsWith('.css') || assetPath.endsWith('.js');
}

function findLineNumber(content, index) {
  return content.slice(0, index).split('\n').length;
}

function loadManifestHashedPaths() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.warn(`[lint:assets] Missing ${MANIFEST_PATH}. Skipping asset reference check (run "npm run build" to enable).`);
    return null;
  }

  const rawManifest = fs.readFileSync(MANIFEST_PATH, 'utf8');
  const manifest = JSON.parse(rawManifest);
  return new Set(Object.values(manifest).map((entry) => normalizeAssetPath(String(entry))));
}

function collectAssetViolations(htmlFilePath, hashedAssetPaths) {
  const content = fs.readFileSync(htmlFilePath, 'utf8');
  const violations = [];

  for (const match of content.matchAll(CSS_JS_ATTR_PATTERN)) {
    const fullTag = match[0];
    const rawReference = match[4];
    const line = findLineNumber(content, match.index ?? 0);

    if (!isLocalAssetReference(rawReference)) {
      continue;
    }

    const { path: assetPath, query } = extractPathAndQuery(rawReference);
    if (!hasCssOrJsExtension(assetPath)) {
      continue;
    }

    if (/^v=/i.test(query) || /(?:^|&)v=/i.test(query)) {
      violations.push({
        type: 'legacy-cache-busting',
        htmlFilePath,
        line,
        tag: fullTag,
        reference: rawReference,
        detail: 'Legacy ?v= cache-busting query detected in built output.'
      });
      continue;
    }

    if (hashedAssetPaths.has(assetPath) || ALLOWLISTED_STATIC_PATHS.has(assetPath)) {
      continue;
    }

    violations.push({
      type: 'unapproved-asset-reference',
      htmlFilePath,
      line,
      tag: fullTag,
      reference: rawReference,
      detail:
        'Local CSS/JS asset reference is not hashed in asset-manifest.json and not allowlisted.'
    });
  }

  return violations;
}

function formatViolation(violation) {
  return [
    `- File: ${violation.htmlFilePath}:${violation.line}`,
    `  Reference: ${violation.reference}`,
    `  Issue: ${violation.detail}`,
    `  Tag: ${violation.tag}`
  ].join('\n');
}

function main() {
  const hashedAssetPaths = loadManifestHashedPaths();
  if (!hashedAssetPaths) {
    return;
  }

  const htmlPaths = HTML_FILES.map((file) => path.join(DIST_DIR, file));
  const missingHtml = htmlPaths.filter((filePath) => !fs.existsSync(filePath));

  if (missingHtml.length > 0) {
    console.warn(`[lint:assets] Missing built HTML files: ${missingHtml.join(', ')}. Skipping asset reference check.`);
    return;
  }

  const violations = htmlPaths.flatMap((htmlPath) =>
    collectAssetViolations(htmlPath, hashedAssetPaths)
  );

  if (violations.length > 0) {
    console.error(`\nAsset reference lint failed (${violations.length} issue${violations.length === 1 ? '' : 's'}):`);
    for (const violation of violations) {
      console.error(formatViolation(violation));
    }
    process.exitCode = 1;
    return;
  }

  console.log('Asset reference lint passed: all local CSS/JS references are hashed or allowlisted, and no ?v= query cache-busting remains.');
}

try {
  main();
} catch (error) {
  console.error(`Asset reference lint failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
