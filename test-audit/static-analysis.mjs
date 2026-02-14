import fs from 'fs';
import path from 'path';

async function getFiles(dir) {
  const dirents = await fs.promises.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(dirents.map(async (dirent) => {
    const res = path.resolve(dir, dirent.name);
    if (dirent.isDirectory()) {
      if (dirent.name === 'node_modules' || dirent.name === 'visual') return [];
      return getFiles(res);
    } else {
      if (res.endsWith('.test.mjs') || res.endsWith('.test.js')) return [res];
      return [];
    }
  }));
  return Array.prototype.concat(...files);
}

async function analyze() {
  const root = path.resolve('tests');
  const filePaths = await getFiles(root);
  const results = {
    skipped: [],
    focused: [],
    sleeps: [],
    console: [],
  };

  for (const file of filePaths) {
    const content = await fs.promises.readFile(file, 'utf8');
    const relativePath = path.relative(process.cwd(), file);

    if (content.includes('.skip(')) results.skipped.push(relativePath);
    if (content.includes('.only(')) results.focused.push(relativePath);
    if (content.match(/setTimeout\s*\(|sleep\s*\(/)) results.sleeps.push(relativePath);
    if (content.match(/console\.(log|warn|error)/)) results.console.push(relativePath);
  }

  console.log(JSON.stringify(results, null, 2));
}

analyze();
