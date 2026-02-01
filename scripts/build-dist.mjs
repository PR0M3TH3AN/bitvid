import fs from 'node:fs/promises';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

const FILES_TO_COPY = [
  'index.html',
  'embed.html',
  'site.webmanifest',
  'sw.min.js',
  '_headers',
  '_redirects',
  'assets',
  'bitvid_logo',
  'components',
  'config',
  'content',
  'css',
  'docs',
  'js',
  'torrent',
  'vendor',
  'views'
];

async function build() {
  const distDir = 'dist';

  console.log(`[build] Cleaning ${distDir}...`);
  await fs.rm(distDir, { recursive: true, force: true });
  await fs.mkdir(distDir, { recursive: true });

  console.log('[build] Building CSS...');
  try {
    const { stdout, stderr } = await execAsync('npm run build:css');
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
  } catch (error) {
    console.error('[build] CSS build failed:', error);
    process.exit(1);
  }

  console.log('[build] Copying files...');
  for (const item of FILES_TO_COPY) {
    const source = item;
    const destination = path.join(distDir, item);

    try {
      // Check if source exists
      await fs.access(source);

      console.log(`  -> Copying ${source}`);
      await fs.cp(source, destination, { recursive: true });
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.warn(`  [warn] Source file/directory not found: ${source}`);
      } else {
        console.error(`  [error] Failed to copy ${source}:`, error);
        process.exit(1);
      }
    }
  }

  console.log('[build] Build complete!');
}

build();
