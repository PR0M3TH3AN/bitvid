import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

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
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFile(srcPath, destPath);
    }
  }
}

function main() {
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
  const generatedCss = path.join(DIST, 'css', 'tailwind.generated.css');
  if (!fs.existsSync(generatedCss) && !fs.existsSync(path.join('css', 'tailwind.generated.css'))) {
     // tailwind might output to dist/css OR css/ then we copy.
     // The command is: -o css/tailwind.generated.css
     // So it should be in source 'css/', then copied by copyDir('css'...)
     // Let's verify it exists in source 'css/'
     if (!fs.existsSync(path.join('css', 'tailwind.generated.css'))) {
         console.error('Error: css/tailwind.generated.css was not generated.');
         process.exit(1);
     }
  }

  console.log('Copying directories...');
  for (const dir of DIRS_TO_COPY) {
    copyDir(dir, path.join(DIST, dir));
  }

  console.log('Build complete.');
}

main();
