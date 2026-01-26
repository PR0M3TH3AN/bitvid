import fs from 'fs';
import path from 'path';

export function fuzzBoolean() {
  return Math.random() < 0.5;
}

export function fuzzInt(min = 0, max = 100) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function pickOne(options) {
  if (!Array.isArray(options) || options.length === 0) return undefined;
  return options[Math.floor(Math.random() * options.length)];
}

export function fuzzString(length = 10) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function fuzzHexString(length = 64) {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function fuzzSurrogatePairString(length = 10) {
  // Generate a string that might contain unpaired surrogates
  let result = '';
  for (let i = 0; i < length; i++) {
    if (Math.random() < 0.1) {
      // High surrogate
      result += String.fromCharCode(fuzzInt(0xD800, 0xDBFF));
    } else if (Math.random() < 0.1) {
      // Low surrogate
      result += String.fromCharCode(fuzzInt(0xDC00, 0xDFFF));
    } else {
      result += fuzzString(1);
    }
  }
  return result;
}

export function fuzzJSON(depth = 2) {
  if (depth <= 0) {
    const type = pickOne(['string', 'number', 'boolean', 'null']);
    switch (type) {
      case 'string': return fuzzString();
      case 'number': return fuzzInt();
      case 'boolean': return fuzzBoolean();
      case 'null': return null;
    }
  }

  const type = pickOne(['object', 'array']);
  if (type === 'object') {
    const obj = {};
    const keys = fuzzInt(1, 5);
    for (let i = 0; i < keys; i++) {
      obj[fuzzString(5)] = fuzzJSON(depth - 1);
    }
    return obj;
  } else {
    const arr = [];
    const len = fuzzInt(1, 5);
    for (let i = 0; i < len; i++) {
      arr.push(fuzzJSON(depth - 1));
    }
    return arr;
  }
}

export function saveFuzzReport(targetName, findings) {
  const reportDir = 'artifacts';
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  const reportPath = path.join(reportDir, `fuzz-report-${targetName}.json`);
  const report = {
    target: targetName,
    date: new Date().toISOString(),
    findings: findings
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Fuzz report saved to ${reportPath}`);
}

export function saveReproducer(targetName, id, input, error) {
  const reproDir = path.join('examples', 'reproducers', `fuzz-${targetName}-${id}`);
  if (!fs.existsSync(reproDir)) {
    fs.mkdirSync(reproDir, { recursive: true });
  }

  const readmeContent = `# Fuzz Reproducer: ${targetName} - ${id}

## Error
\`\`\`
${error.stack || error.message}
\`\`\`

## Input
See \`input.json\`
`;

  fs.writeFileSync(path.join(reproDir, 'README.md'), readmeContent);
  fs.writeFileSync(path.join(reproDir, 'input.json'), JSON.stringify(input, null, 2));

  // Create a minimal reproduction script
  const scriptContent = `
import fs from 'fs';
// You would need to adjust imports based on the target
// This is a placeholder template
const input = JSON.parse(fs.readFileSync('input.json', 'utf8'));
console.log('Running reproduction with input:', input);
`;
  fs.writeFileSync(path.join(reproDir, 'repro.mjs'), scriptContent);

  console.log(`Reproducer saved to ${reproDir}`);
}
