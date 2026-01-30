import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

function getExportedSymbols(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const symbols = [];

  // Regex to capture exported names
  const exportRegex = /export\s+(?:const|let|var|function|class)\s+([a-zA-Z0-9_$]+)/g;
  let match;
  while ((match = exportRegex.exec(content)) !== null) {
    symbols.push(match[1]);
  }

  // Handle export default
  if (/export\s+default/.test(content)) {
    // For default export, we can't easily get a name to grep for usage unless we look at imports.
    // We'll skip default exports for this simple heuristic script.
  }

  // Handle export { name }
  const exportListRegex = /export\s+\{([^}]+)\}/g;
  while ((match = exportListRegex.exec(content)) !== null) {
    const names = match[1].split(',').map(s => s.trim().split(' as ')[0].trim());
    symbols.push(...names);
  }

  return symbols;
}

function findUsages(symbol, filePath) {
  // Grep for the symbol in the whole js directory, excluding the defining file
  // We use word boundary \b to avoid partial matches
  try {
    const cmd = `grep -r "\\b${symbol}\\b" js --exclude="${path.basename(filePath)}" | wc -l`;
    const count = parseInt(execSync(cmd, { encoding: 'utf-8' }).trim());
    return count;
  } catch (e) {
    return 0;
  }
}

function scanDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      scanDir(fullPath);
    } else if (file.endsWith('.js') || file.endsWith('.mjs')) {
      const symbols = getExportedSymbols(fullPath);
      for (const symbol of symbols) {
        const usages = findUsages(symbol, fullPath);
        if (usages === 0) {
            // Check if it is used in tests
            try {
                const testCmd = `grep -r "\\b${symbol}\\b" tests | wc -l`;
                const testCount = parseInt(execSync(testCmd, { encoding: 'utf-8' }).trim());
                if (testCount === 0) {
                     console.log(`${fullPath}: ${symbol}`);
                }
            } catch(e) {
                 console.log(`${fullPath}: ${symbol}`);
            }
        }
      }
    }
  }
}

console.log("Scanning for unused exports...");
scanDir('js');
