import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIST_DIR = path.join(__dirname, 'dist');
const LANDING_SRC = path.join(__dirname, 'landing');
const DASHBOARD_SRC = path.join(__dirname, 'dashboard');
const DOCS_SRC = path.join(__dirname, 'docs');
const TORCH_MD_SRC = path.join(__dirname, 'TORCH.md');
const CONSTANTS_SRC = path.join(__dirname, 'src', 'constants.mjs');
const PROMPTS_DIR_SRC = path.join(__dirname, 'src', 'prompts');
const CONFIG_SRC = path.join(__dirname, 'torch-config.json');
const ASSETS_SRC = path.join(__dirname, 'assets');

// Read package.json to get version and name
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
const tarballName = `${packageJson.name}-${packageJson.version}.tgz`;

// Ensure clean slate
if (fs.existsSync(DIST_DIR)) {
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
}
fs.mkdirSync(DIST_DIR);

// 1. Copy landing/index.html -> dist/index.html
const landingHtml = fs.readFileSync(path.join(LANDING_SRC, 'index.html'), 'utf8');
let distHtml = landingHtml;

// Patch relative paths for root deployment
// Remove ../ prefix for these specific paths since they are now relative to root (dist/)
distHtml = distHtml.replace(/"\.\.\/dashboard\/styles\.css"/g, '"dashboard/styles.css"');
distHtml = distHtml.replace(/"\.\.\/dashboard\/"/g, '"dashboard/"'); // Link to dashboard
distHtml = distHtml.replace(/'\.\.\/src\/docs\/TORCH\.md'/g, "'src/docs/TORCH.md'");
distHtml = distHtml.replace(/"\.\.\/assets\//g, '"assets/');
distHtml = distHtml.replace(/\.\.\/src\/prompts\//g, 'src/prompts/');

// Inject Offline Bundle Filename
distHtml = distHtml.replace(/{{OFFLINE_BUNDLE_FILENAME}}/g, tarballName);

fs.writeFileSync(path.join(DIST_DIR, 'index.html'), distHtml);

// 2. Copy dashboard/ -> dist/dashboard/
const distDashboard = path.join(DIST_DIR, 'dashboard');
fs.mkdirSync(distDashboard, { recursive: true });
fs.cpSync(DASHBOARD_SRC, distDashboard, { recursive: true });

// Patch dashboard/index.html to point to correct landing page in production build
// In dev, ../landing/ works. In dist, ../ works (since landing becomes index.html at root).
const dashboardIndex = path.join(distDashboard, 'index.html');
let dashboardHtml = fs.readFileSync(dashboardIndex, 'utf8');
dashboardHtml = dashboardHtml.replace(/href="\.\.\/landing\/"/g, 'href="../"');
fs.writeFileSync(dashboardIndex, dashboardHtml);

// 3. Copy docs/ -> dist/src/docs/
const distDocs = path.join(DIST_DIR, 'src', 'docs');
fs.mkdirSync(distDocs, { recursive: true });
if (fs.existsSync(DOCS_SRC)) {
  fs.cpSync(DOCS_SRC, distDocs, { recursive: true });
}
if (fs.existsSync(TORCH_MD_SRC)) {
  fs.copyFileSync(TORCH_MD_SRC, path.join(distDocs, 'TORCH.md'));
}

// 3.5. Copy src/constants.mjs -> dist/src/constants.mjs
fs.copyFileSync(CONSTANTS_SRC, path.join(DIST_DIR, 'src', 'constants.mjs'));

// 4. Copy src/prompts/ -> dist/src/prompts/
const distPromptsDir = path.join(DIST_DIR, 'src', 'prompts');
fs.mkdirSync(distPromptsDir, { recursive: true });
if (fs.existsSync(PROMPTS_DIR_SRC)) {
  fs.cpSync(PROMPTS_DIR_SRC, distPromptsDir, { recursive: true });
}

// 5. Copy torch-config.json -> dist/torch-config.json (optional config)
if (fs.existsSync(CONFIG_SRC)) {
  fs.copyFileSync(CONFIG_SRC, path.join(DIST_DIR, 'torch-config.json'));
}

// 6. Copy assets/ -> dist/assets/
const distAssets = path.join(DIST_DIR, 'assets');
if (fs.existsSync(ASSETS_SRC)) {
  fs.mkdirSync(distAssets, { recursive: true });
  fs.cpSync(ASSETS_SRC, distAssets, { recursive: true });
}

// 7. Generate NPM Pack Tarball
console.log('Generating npm package tarball...');
try {
  execSync('npm pack', { stdio: 'inherit' });
  if (fs.existsSync(tarballName)) {
    fs.renameSync(tarballName, path.join(DIST_DIR, tarballName));
    console.log(`Moved ${tarballName} to dist/`);
  } else {
    console.error(`Error: ${tarballName} not found after npm pack.`);
  }
} catch (error) {
  console.error('Error packing npm module:', error);
}

console.log('Build complete! Output directory: dist/');
