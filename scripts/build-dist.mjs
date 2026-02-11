import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import { buildHashState } from './hash-dist.mjs';

const DIST = 'dist';
const FILES_TO_COPY = [
  'index.html',
  'embed.html',
  '_redirects',
  '_headers',
  'site.webmanifest',
  'sw.min.js'
];
const DIRS_TO_COPY = [
  'assets',
  'bitvid_logo',
  'components',
  'config',
  'content',
  'css',
  'docs',
  'examples',
  'js',
  'releases',
  'torrent',
  'vendor',
  'views'
];
const HASHED_ENTRY_HTML_FILES = ['index.html', 'embed.html'];
const HASHED_ASSET_PATHS = [
  'css/docs.css',
  'css/tailwind.generated.css',
  'js/embed.js',
  'js/index.js',
  'js/nostrToolsBootstrap.js'
];
const ASSET_MANIFEST_PATH = 'asset-manifest.json';

function cleanDist() {
  if (fs.existsSync(DIST)) {
    fs.rmSync(DIST, { recursive: true, force: true });
  }
  fs.mkdirSync(DIST);
}

function copyFile(src, dest) {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
  } else {
    const message = `Error: Source file ${src} does not exist.`;
    console.error(message);
    // Debug: list source directory to check what IS there
    try {
      console.log(`Source directory listing for context:`);
      const dir = path.dirname(src);
      console.log(fs.readdirSync(dir || '.'));
    } catch (e) {
      console.error('Failed to list source directory:', e);
    }

    if (['_headers', '_redirects', 'index.html'].includes(path.basename(src))) {
      throw new Error(message);
    }
  }
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    // Exclude reproducers from distribution
    if (src.endsWith('examples') && entry.name === 'reproducers') {
      continue;
    }
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFile(srcPath, destPath);
    }
  }
}

function hashContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function createHashedFilePath(assetPath, hash) {
  const ext = path.extname(assetPath);
  const baseName = path.basename(assetPath, ext);
  const dirName = path.dirname(assetPath);
  const shortHash = hash.slice(0, 16);
  const hashedName = `${baseName}.${shortHash}${ext}`;
  return dirName === '.' ? hashedName : path.posix.join(dirName, hashedName);
}

function escapeForRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function generateHashedAssetManifest() {
  const sortedAssetPaths = [...HASHED_ASSET_PATHS].sort();
  const manifest = {};

  for (const logicalAssetPath of sortedAssetPaths) {
    const sourcePath = path.join(DIST, logicalAssetPath);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Missing required asset for hashing: ${logicalAssetPath}`);
    }

    const content = fs.readFileSync(sourcePath);
    const hash = hashContent(content);
    const hashedRelativePath = createHashedFilePath(logicalAssetPath, hash);
    const hashedDistPath = path.join(DIST, hashedRelativePath);

    fs.mkdirSync(path.dirname(hashedDistPath), { recursive: true });
    fs.writeFileSync(hashedDistPath, content);
    manifest[logicalAssetPath] = hashedRelativePath;
  }

  const sortedManifest = Object.fromEntries(
    Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b))
  );
  fs.writeFileSync(
    path.join(DIST, ASSET_MANIFEST_PATH),
    `${JSON.stringify(sortedManifest, null, 2)}\n`
  );

  return sortedManifest;
}

function rewriteEntryHtmlAssetPaths(manifest) {
  for (const htmlFile of HASHED_ENTRY_HTML_FILES) {
    const htmlPath = path.join(DIST, htmlFile);
    if (!fs.existsSync(htmlPath)) {
      continue;
    }

    let htmlContent = fs.readFileSync(htmlPath, 'utf8');

    for (const [logicalPath, hashedPath] of Object.entries(manifest)) {
      const escapedLogicalPath = escapeForRegExp(logicalPath);
      const attributePattern = new RegExp(
        `((?:src|href)=["'])${escapedLogicalPath}(?:\\?[^"']*)?(["'])`,
        'g'
      );
      htmlContent = htmlContent.replace(attributePattern, `$1${hashedPath}$2`);
    }

    fs.writeFileSync(htmlPath, htmlContent);
  }
}

function injectVersionInfo() {
  console.log('Injecting version hash and date...');
  try {
    const hashState = buildHashState(DIST);
    const hash = hashState.combined;
    const date = new Date().toISOString().split('T')[0];

    const indexHtmlPath = path.join(DIST, 'index.html');
    if (fs.existsSync(indexHtmlPath)) {
      let content = fs.readFileSync(indexHtmlPath, 'utf8');

      const versionHtml = `
      <div class="mt-4 text-xs text-muted opacity-50 font-mono">
        v: ${hash.slice(0, 8)} • ${date}
      </div>`;

      // Robust replacement using explicit comment placeholder
      const placeholder = '<!-- VERSION_INFO -->';
      if (content.includes(placeholder)) {
        content = content.replace(placeholder, versionHtml);
        fs.writeFileSync(indexHtmlPath, content);
        console.log(`Injected version: ${hash.slice(0, 8)} • ${date}`);
      } else {
        // Fallback search if placeholder is missing (legacy behavior)
        const taglineRegex = /(seed\. zap\. subscribe\.\s*<\/h2>)/;
        if (taglineRegex.test(content)) {
          content = content.replace(taglineRegex, '$1' + versionHtml);
          fs.writeFileSync(indexHtmlPath, content);
          console.log(`Injected version (via fallback regex): ${hash.slice(0, 8)} • ${date}`);
        } else {
          console.warn('Could not find placeholder or tagline to inject version info.');
        }
      }
    }
  } catch (error) {
    console.error('Failed to inject version info:', error);
    process.exit(1);
  }
}

function main() {
  console.log('Validating service worker compatibility guard...');
  try {
    execSync('npm run lint:sw-compat', { stdio: 'inherit' });
  } catch (error) {
    console.error('Failed service worker compatibility guard.');
    process.exit(1);
  }

  console.log('Cleaning dist...');
  cleanDist();

  console.log('Running build:css...');
  try {
    execSync('npm run build:css', { stdio: 'inherit' });
  } catch (error) {
    console.error('Failed to run build:css');
    process.exit(1);
  }

  console.log('Copying files...');
  for (const file of FILES_TO_COPY) {
    copyFile(file, path.join(DIST, file));
  }

  // Verify critical CSS generation
  const generatedCssSource = path.join('css', 'tailwind.generated.css');
  const generatedCssDist = path.join(DIST, 'css', 'tailwind.generated.css');

  if (!fs.existsSync(generatedCssSource) && !fs.existsSync(generatedCssDist)) {
     console.error('Error: css/tailwind.generated.css was not generated.');
     try {
       console.log('Listing css/ directory:');
       if (fs.existsSync('css')) {
         console.log(fs.readdirSync('css'));
       } else {
         console.log('css/ directory does not exist.');
       }
     } catch (e) {
       console.error('Failed to list css directory:', e);
     }
     process.exit(1);
  }

  console.log('Copying directories...');
  for (const dir of DIRS_TO_COPY) {
    copyDir(dir, path.join(DIST, dir));
  }

  console.log('Generating hashed asset manifest...');
  const manifest = generateHashedAssetManifest();

  console.log('Rewriting HTML entry points with hashed assets...');
  rewriteEntryHtmlAssetPaths(manifest);

  injectVersionInfo();

  console.log('Build complete.');
}

main();
