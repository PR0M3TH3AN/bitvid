import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { DEFAULT_RELAYS } from './constants.mjs';
import { ensureDir } from './utils.mjs';

// Re-export cmdRemove for CLI consumption
export { cmdRemove } from './cmd-remove.mjs';

/**
 * Torch Operations Module
 *
 * Handles the initialization (`torch-lock init`) and update (`torch-lock update`)
 * workflows for scaffolding the Torch agent environment.
 *
 * Flow (Init):
 * 1. Resolve configuration (interactive or mock).
 * 2. Ensure installation directories exist.
 * 3. Install application assets (src, bin, scripts, etc.).
 * 4. Install Torch-specific assets (roster, prompts).
 * 5. Configure `torch-config.json` and `.gitignore`.
 * 6. Generate dashboard link.
 * 7. Inject convenience scripts into host `package.json`.
 *
 * Flow (Update):
 * 1. Detect installation directory.
 * 2. Create a backup of the current installation.
 * 3. Update application directories/files (overwrite).
 * 4. Update static files (overwrite).
 * 5. Update prompts (add new, preserve existing).
 */

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Source directory for prompts within the package. */
const SRC_PROMPTS_DIR = path.join(PKG_ROOT, 'src', 'prompts');

/** Files to treat as "Static" (always overwrite on update, with transformations). */
const STATIC_FILES = [
  'META_PROMPTS.md',
  'scheduler-flow.md',
  'daily-scheduler.md',
  'weekly-scheduler.md',
];

/** Directories containing "Evolving" files (copy if missing, preserve if present). */
const EVOLVING_DIRS = ['daily', 'weekly'];

/** Directories to sync from package root to install directory. */
const APP_DIRS = ['src', 'bin', 'dashboard', 'landing', 'assets', 'scripts'];

/** Individual files to sync from package root to install directory. */
const APP_FILES = ['package.json', 'build.mjs', 'README.md', 'torch-config.example.json', 'TORCH.md', 'eslint.config.mjs'];
const MEMORY_PROMPT_FILES = ['AGENTS.md', 'CLAUDE.md'];
const MEMORY_INTEGRATION_HEADING = '## TORCH Memory Integration';
const MEMORY_INTEGRATION_BLOCK = `${MEMORY_INTEGRATION_HEADING}
You have access to the TORCH memory system.
1. READ: Check \`.scheduler-memory/latest/\${cadence}/memories.md\` for past learnings.
2. WRITE: Before exiting, save new insights to \`memory-update.md\` so future runs can learn from this session.`;

/**
 * Resolves the absolute paths for the installation.
 *
 * @param {string} root - The current working directory (project root).
 * @param {string} installDirName - The name of the installation directory (e.g., 'torch' or '.').
 * @returns {{root: string, torchDir: string, promptsDir: string, roster: string}} - Resolved paths.
 */
function getPaths(root, installDirName) {
    const torchDir = path.resolve(root, installDirName);
    return {
        root,
        torchDir,
        promptsDir: path.join(torchDir, 'prompts'),
        roster: path.join(torchDir, 'roster.json'),
    };
}

/**
 * Recursively copies a directory.
 *
 * @param {string} src - Source directory path.
 * @param {string} dest - Destination directory path.
 */
function copyDir(src, dest) {
    if (fs.existsSync(src)) {
        fs.cpSync(src, dest, { recursive: true });
    }
}

/**
 * Transforms content by replacing source paths with installed paths.
 *
 * @param {string} content - The original file content.
 * @param {string} installDirName - The name of the installation directory.
 * @returns {string} - The transformed content.
 */
function transformContent(content, installDirName) {
  // Replace source paths with user paths
  // We assume the user is running from root, so 'src/prompts/daily/' becomes 'torch/prompts/daily/'
  // If installDirName is different, we should use that.

  // If installDirName is '.', we want 'prompts/daily/'.
  // If installDirName is 'torch', we want 'torch/prompts/daily/'.

  const prefix = installDirName === '.' ? '' : `${installDirName}/`;

  return content
    .replace(/src\/prompts\/daily\//g, `${prefix}prompts/daily/`)
    .replace(/src\/prompts\/weekly\//g, `${prefix}prompts/weekly/`)
    .replace(/src\/prompts\/roster\.json/g, `${prefix}roster.json`)
    .replace(/src\/prompts\/scheduler-flow\.md/g, `${prefix}scheduler-flow.md`)
    .replace(/TORCH\.md/g, `${prefix}TORCH.md`);
}

/**
 * Copies a single file, optionally transforming content and overwriting.
 *
 * @param {string} src - Source file path.
 * @param {string} dest - Destination file path.
 * @param {boolean} [transform=false] - Whether to apply content transformations.
 * @param {boolean} [overwrite=true] - Whether to overwrite existing files.
 * @param {string} [installDirName='torch'] - The installation directory name (used for transform).
 * @returns {boolean} - True if copied/overwritten, false if skipped or source missing.
 */
function copyFile(src, dest, transform = false, overwrite = true, installDirName = 'torch') {
  if (fs.existsSync(dest) && !overwrite) {
    return false; // Skipped
  }
  if (!fs.existsSync(src)) return false;

  const content = fs.readFileSync(src, 'utf8');
  const finalContent = transform ? transformContent(content, installDirName) : content;
  fs.writeFileSync(dest, finalContent, 'utf8');
  return true; // Copied/Overwritten
}

/**
 * Syncs application directories from package to install location.
 *
 * @param {string} torchDir - The target installation directory.
 * @param {'Copied'|'Updated'} [verb='Copied'] - Verb for logging.
 */
function syncAppDirectories(torchDir, verb = 'Copied') {
  console.log(`${verb === 'Copied' ? 'Copying' : 'Updating'} application directories...`);
  for (const dir of APP_DIRS) {
    const src = path.join(PKG_ROOT, dir);
    const dest = path.join(torchDir, dir);
    if (fs.existsSync(src)) {
      copyDir(src, dest);
      console.log(`  ${verb} ${dir}/`);
    }
  }
}

/**
 * Syncs application files from package to install location.
 *
 * @param {string} torchDir - The target installation directory.
 * @param {string} installDir - The relative installation path name.
 * @param {'Copied'|'Updated'} [verb='Copied'] - Verb for logging.
 */
function syncAppFiles(torchDir, installDir, verb = 'Copied') {
  console.log(`${verb === 'Copied' ? 'Copying' : 'Updating'} application files...`);
  for (const file of APP_FILES) {
    const src = path.join(PKG_ROOT, file);
    const dest = path.join(torchDir, file);
    if (fs.existsSync(src)) {
      if (installDir === '.' && file === 'package.json') {
        if (verb === 'Copied' && fs.existsSync(dest)) {
          console.warn('  Skipping package.json to avoid overwriting host package.json (installing to root).');
          continue;
        }
        if (verb === 'Updated') {
          console.log('  Skipping package.json update (installed in root).');
          continue;
        }
      }

      fs.copyFileSync(src, dest);
      console.log(`  ${verb} ${file}`);
    }
  }
}

/**
 * Interactively queries the user for initialization parameters.
 *
 * @param {string} cwd - Current working directory.
 * @returns {Promise<{installDir: string, namespace: string, hashtag: string, relays: string[]}>} - User configuration.
 */
async function interactiveInit(cwd) {
  const currentDirName = path.basename(cwd);
  let defaultDir = 'torch';
  if (currentDirName === 'torch') {
    defaultDir = '.';
  }
  const randomSuffix = crypto.randomBytes(4).toString('hex');
  const defaultNamespace = `torch-${randomSuffix}`;
  const defaultHashtag = `${defaultNamespace}-agent-lock`;

  if (!input.isTTY) {
    return {
      installDir: defaultDir,
      namespace: defaultNamespace,
      hashtag: defaultHashtag,
      relays: DEFAULT_RELAYS,
    };
  }

  const rl = readline.createInterface({ input, output });
  const askWithDefault = async (prompt, fallback) => {
    try {
      const answer = await rl.question(prompt);
      return answer.trim() || fallback;
    } catch {
      // In non-interactive/piped sessions EOF can arrive mid-flow.
      // Treat it as "accept defaults" so init still completes deterministically.
      return fallback;
    }
  };

  console.log('\n🔥 TORCH Initialization 🔥\n');

  try {
    // 1. Install Directory
    const installDir = await askWithDefault(`Install directory (default: ${defaultDir}): `, defaultDir);

    // 2. Namespace
    const namespace = await askWithDefault(`Nostr Namespace (default: ${defaultNamespace}): `, defaultNamespace);

    // 3. Hashtag
    const defaultHashtag = `${namespace}-agent-lock`;
    const hashtag = await askWithDefault(`Nostr Hashtag (default: ${defaultHashtag}): `, defaultHashtag);

    // 4. Relays
    console.log(`\nDefault Relays:\n  ${DEFAULT_RELAYS.join('\n  ')}`);
    const relaysAnswer = await askWithDefault('Enter relays (comma-separated) or press Enter to use defaults: ', '');
    let relays = DEFAULT_RELAYS;
    if (relaysAnswer.trim()) {
      relays = relaysAnswer.split(',').map(r => r.trim()).filter(Boolean);
    }

    return { installDir, namespace, hashtag, relays };
  } finally {
    rl.close();
  }
}

/**
 * Validates the installation directory name for safety.
 *
 * @param {string} dir - The directory name to validate.
 * @throws {Error} If the directory name contains invalid characters.
 */
function validateInstallDir(dir) {
  if (dir === '.') return;

  // Strict validation to prevent command injection
  // Only allow alphanumeric, hyphens, underscores, slashes, and periods.
  if (!/^[a-zA-Z0-9_\-./]+$/.test(dir)) {
    throw new Error(`Invalid directory name: "${dir}". Only alphanumeric characters, hyphens, underscores, slashes, and periods are allowed.`);
  }
}

/**
 * Resolves the configuration either interactively or from mock answers.
 *
 * @param {string} cwd - Current working directory.
 * @param {Object} [mockAnswers] - Optional mock answers for testing.
 * @returns {Promise<Object>} - Resolved configuration object.
 */
async function resolveConfiguration(cwd, mockAnswers) {
  let config;
  if (mockAnswers) {
    config = mockAnswers;
  } else {
    config = await interactiveInit(cwd);
  }

  validateInstallDir(config.installDir);
  return config;
}

/**
 * Ensures the necessary directories exist for installation.
 *
 * @param {Object} paths - Path object from `getPaths`.
 * @param {boolean} force - Whether to force overwrite/creation.
 * @param {string} installDir - Installation directory name.
 * @throws {Error} If directory exists and is not empty (unless forced).
 */
function ensureInstallDirectory(paths, force, installDir) {
  if (fs.existsSync(paths.torchDir) && !force) {
     const entries = fs.readdirSync(paths.torchDir);
     if (entries.length > 0 && installDir !== '.') {
         throw new Error(`Directory ${paths.torchDir} already exists and is not empty. Use --force to overwrite.`);
     }
  }
  ensureDir(paths.torchDir);
  ensureDir(paths.promptsDir);

  // Ensure governance directories
  ensureDir(path.join(paths.root, 'src', 'proposals'));
  ensureDir(path.join(paths.root, '.torch', 'prompt-history'));
}

/**
 * Orchestrates the installation of application assets.
 *
 * @param {string} torchDir - Target directory.
 * @param {string} installDir - Install directory name.
 */
function installAppAssets(torchDir, installDir) {
  // 1. Copy App Directories
  syncAppDirectories(torchDir, 'Copied');

  // 2. Copy App Files
  syncAppFiles(torchDir, installDir, 'Copied');
}

/**
 * Orchestrates the installation of Torch-specific assets (prompts, roster).
 *
 * @param {Object} paths - Paths object.
 * @param {string} installDir - Install directory name.
 */
function installTorchAssets(paths, installDir) {
  // 3. Copy Roster
  const srcRoster = path.join(SRC_PROMPTS_DIR, 'roster.json');
  if (fs.existsSync(srcRoster)) {
    copyFile(srcRoster, paths.roster, false, true, installDir);
    console.log(`Created ${path.relative(paths.root, paths.roster)}`);
  }

  // 4. Copy Static Files
  for (const file of STATIC_FILES) {
    const src = path.join(SRC_PROMPTS_DIR, file);
    const dest = path.join(paths.torchDir, file);
    if (fs.existsSync(src)) {
      copyFile(src, dest, true, true, installDir);
      console.log(`Created ${path.relative(paths.root, dest)}`);
    }
  }

  // 5. Copy Prompts
  for (const dir of EVOLVING_DIRS) {
    const srcDir = path.join(SRC_PROMPTS_DIR, dir);
    const destDir = path.join(paths.promptsDir, dir);
    ensureDir(destDir);

    if (fs.existsSync(srcDir)) {
      const files = fs.readdirSync(srcDir);
      for (const file of files) {
        const srcFile = path.join(srcDir, file);
        const destFile = path.join(destDir, file);
        copyFile(srcFile, destFile, false, true, installDir);
      }
      console.log(`Created ${files.length} files in ${path.relative(paths.root, destDir)}/`);
    }
  }
}

/**
 * Creates or updates the `torch-config.json` file.
 *
 * @param {string} cwd - Current working directory.
 * @param {Object} paths - Paths object.
 * @param {string} installDir - Install directory name.
 * @param {string} namespace - Nostr namespace.
 * @param {string[]} relays - List of relays.
 * @param {string} hashtag - Dashboard hashtag.
 */
function configureTorch(cwd, paths, installDir, namespace, relays, hashtag) {
  // 6. Create/Update torch-config.json
  const configPath = path.join(paths.root, 'torch-config.json');

  let configData = {};

  // Try to load existing or example
  if (fs.existsSync(configPath)) {
      try {
          configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          console.log(`Updating existing ${path.relative(cwd, configPath)}...`);
      } catch (e) {
          console.warn(`Could not parse existing config: ${e.message}`);
      }
  } else {
      const exampleConfigPath = path.join(PKG_ROOT, 'torch-config.example.json');
      if (fs.existsSync(exampleConfigPath)) {
          configData = JSON.parse(fs.readFileSync(exampleConfigPath, 'utf8'));
      }
  }

  // Apply user choices
  if (!configData.nostrLock) configData.nostrLock = {};
  configData.nostrLock.namespace = namespace;
  configData.nostrLock.relays = relays;

  if (!configData.dashboard) configData.dashboard = {};
  configData.dashboard.hashtag = hashtag;

  // Configure memory policy with correct paths
  if (!configData.scheduler) configData.scheduler = {};
  if (!configData.scheduler.handoffCommandByCadence) {
    configData.scheduler.handoffCommandByCadence = {};
  }
  // Always ensure memory policy exists and points to the correct scripts
  // We use the installDir to construct the path
  const scriptPrefix = installDir === '.' ? '' : `${installDir}/`;
  const handoffPath = `node ${scriptPrefix}scripts/agent/run-selected-prompt.mjs`;
  configData.scheduler.handoffCommandByCadence.daily = handoffPath;
  configData.scheduler.handoffCommandByCadence.weekly = handoffPath;

  if (!configData.scheduler.memoryPolicyByCadence) {
    configData.scheduler.memoryPolicyByCadence = {};
  }

  // Populate or update daily/weekly memory policy
  // We force update the command paths to match the install directory,
  // while preserving other settings if they exist.
  ['daily', 'weekly'].forEach(cadence => {
    if (!configData.scheduler.memoryPolicyByCadence[cadence]) {
      configData.scheduler.memoryPolicyByCadence[cadence] = {
        mode: "required",
        retrieveSuccessMarkers: ["MEMORY_RETRIEVED"],
        storeSuccessMarkers: ["MEMORY_STORED"],
        retrieveArtifacts: [`.scheduler-memory/latest/${cadence}/retrieve.ok`],
        storeArtifacts: [`.scheduler-memory/latest/${cadence}/store.ok`]
      };
    }

    // Always ensure commands point to the correct script location
    const policy = configData.scheduler.memoryPolicyByCadence[cadence];
    policy.retrieveCommand = `node ${scriptPrefix}scripts/memory/retrieve.mjs`;
    policy.storeCommand = `node ${scriptPrefix}scripts/memory/store.mjs`;
  });

  fs.writeFileSync(configPath, JSON.stringify(configData, null, 2), 'utf8');
  console.log(`Saved configuration to ${path.relative(cwd, configPath)}`);
}

/**
 * Ensures `node_modules` is ignored in the target directory's `.gitignore`.
 *
 * @param {string} targetDir - The directory to check/update.
 */
function ensureGitIgnore(targetDir) {
  const gitIgnorePath = path.join(targetDir, '.gitignore');
  let content = '';
  const exists = fs.existsSync(gitIgnorePath);

  if (exists) {
    content = fs.readFileSync(gitIgnorePath, 'utf8');
  }

  const lines = content.split('\n').map((l) => l.trim());
  const hasNodeModules = lines.some((l) => l === 'node_modules' || l === '/node_modules' || l === 'node_modules/');

  if (!hasNodeModules) {
    const prefix = exists && content.length > 0 && !content.endsWith('\n') ? '\n' : '';
    fs.appendFileSync(gitIgnorePath, `${prefix}node_modules\n`, 'utf8');
    if (exists) {
      console.log(`Updated ${path.relative(process.cwd(), gitIgnorePath)}: added node_modules`);
    } else {
      console.log(`Created ${path.relative(process.cwd(), gitIgnorePath)} with node_modules`);
    }
  }
}

/**
 * Injects torch scripts into the host `package.json` if installed in a subdirectory.
 *
 * @param {Object} paths - Paths object.
 * @param {string} installDir - Install directory name.
 */
function injectHostScriptsIfNeeded(paths, installDir) {
  // 7. Inject Scripts into Host Package.json
  // If we are NOT installing to '.', the host package.json is in paths.root
  if (installDir !== '.') {
      injectScriptsIntoHost(paths.root, installDir);
  }
}

/**
 * Upserts the TORCH memory integration section inside a system prompt file.
 *
 * @param {string} content - Existing file content.
 * @returns {string} Updated file content.
 */
function upsertMemoryIntegrationBlock(content) {
  if (content.includes(MEMORY_INTEGRATION_BLOCK)) {
    return content;
  }

  const escapedHeading = MEMORY_INTEGRATION_HEADING.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sectionRegex = new RegExp(`(^|\\n)${escapedHeading}\\n[\\s\\S]*?(?=\\n##\\s|$)`, 'm');

  if (sectionRegex.test(content)) {
    return content.replace(sectionRegex, (_match, prefix) => `${prefix}${MEMORY_INTEGRATION_BLOCK}`);
  }

  const trimmed = content.trimEnd();
  if (!trimmed) {
    return `${MEMORY_INTEGRATION_BLOCK}\n`;
  }
  return `${trimmed}\n\n${MEMORY_INTEGRATION_BLOCK}\n`;
}

/**
 * Ensures AGENTS/CLAUDE system prompt files include TORCH memory integration.
 * If neither file exists, creates AGENTS.md with the integration block.
 *
 * @param {string} root - Host project root.
 */
function ensureMemoryPromptHook(root) {
  const existingTargets = MEMORY_PROMPT_FILES.filter((file) => fs.existsSync(path.join(root, file)));

  if (existingTargets.length === 0) {
    const defaultPath = path.join(root, 'AGENTS.md');
    fs.writeFileSync(defaultPath, `${MEMORY_INTEGRATION_BLOCK}\n`, 'utf8');
    console.log(`Created ${path.relative(root, defaultPath)} with TORCH memory integration.`);
    return;
  }

  for (const file of existingTargets) {
    const filePath = path.join(root, file);
    const current = fs.readFileSync(filePath, 'utf8');
    const next = upsertMemoryIntegrationBlock(current);

    if (next !== current) {
      fs.writeFileSync(filePath, next, 'utf8');
      console.log(`Updated ${path.relative(root, filePath)} with TORCH memory integration.`);
    } else {
      console.log(`TORCH memory integration already present in ${path.relative(root, filePath)}.`);
    }
  }
}

/**
 * Main entry point for `torch-lock init`.
 *
 * @param {boolean} [force=false] - Force overwrite.
 * @param {string} [cwd=process.cwd()] - Working directory.
 * @param {Object} [mockAnswers=null] - Mock answers for testing.
 * @returns {Promise<void>}
 */
export async function cmdInit(force = false, cwd = process.cwd(), mockAnswers = null) {
  const config = await resolveConfiguration(cwd, mockAnswers);
  const { installDir, namespace, relays } = config;

  // For backward compatibility with mocks that might not provide hashtag yet,
  // we derive a default if missing.
  const hashtag = config.hashtag || `${namespace}-agent-lock`;

  const paths = getPaths(cwd, installDir);
  console.log(`\nInitializing torch in ${paths.torchDir}...`);

  ensureInstallDirectory(paths, force, installDir);

  installAppAssets(paths.torchDir, installDir);
  installTorchAssets(paths, installDir);
  ensureGitIgnore(paths.torchDir);
  configureTorch(cwd, paths, installDir, namespace, relays, hashtag);
  const dashboardUrl = createDashboardLinkFile(paths, namespace, relays, hashtag);
  injectHostScriptsIfNeeded(paths, installDir);
  ensureMemoryPromptHook(paths.root);

  console.log('\nInitialization complete.');
  console.log('You can now customize the files in ' + path.relative(cwd, paths.torchDir) + '/');

  console.log(`\n● From torch-config.json:`);
  console.log(`\n  - Hashtag: ${hashtag}`);
  console.log(`  - Namespace: ${namespace}\n`);
  console.log(dashboardUrl);
}

/**
 * Generates the `TORCH_DASHBOARD.md` file with a direct link to the dashboard.
 *
 * @param {Object} paths - Paths object.
 * @param {string} namespace - Nostr namespace.
 * @param {string[]} relays - List of relays.
 * @param {string} hashtag - Dashboard hashtag.
 * @returns {string} - The generated URL.
 */
function createDashboardLinkFile(paths, namespace, relays, hashtag) {
  const dashboardUrl = `https://torch.thepr0m3th3an.net/dashboard/?hashtag=${hashtag}`;

  const content = `# TORCH Dashboard

You can view the live status of your agent locks here:

[Open Dashboard](${dashboardUrl})

---
**Configuration**
This link is generated based on your \`torch-config.json\`:
- **Namespace**: \`${namespace}\`
- **Hashtag**: \`#${hashtag}\`
- **Relays**: ${relays.join(', ')}

To change these settings, edit \`torch-config.json\` in your project root.
`;

  const filePath = path.join(paths.torchDir, 'TORCH_DASHBOARD.md');
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Created ${path.relative(paths.root, filePath)}`);
  return dashboardUrl;
}

/**
 * Modifies the host `package.json` to include `torch:*` convenience scripts.
 *
 * @param {string} hostRoot - Path to the host project root.
 * @param {string} installDirName - Installation directory name.
 */
function injectScriptsIntoHost(hostRoot, installDirName) {
    const hostPkgPath = path.join(hostRoot, 'package.json');
    if (!fs.existsSync(hostPkgPath)) {
        console.warn('No package.json found in host root. Skipping script injection.');
        return;
    }

    try {
        const pkg = JSON.parse(fs.readFileSync(hostPkgPath, 'utf8'));
        if (!pkg.scripts) pkg.scripts = {};

        const scriptsToAdd = {
            'torch:dashboard': `npm run --prefix ${installDirName} dashboard:serve`,
            'torch:check': `npm run --prefix ${installDirName} lock:check:daily`, // Default to daily check
            'torch:lock': `npm run --prefix ${installDirName} lock:lock`,
            'torch:health': `npm run --prefix ${installDirName} lock:health`,
            'torch:memory:list': `node ${installDirName === '.' ? '' : installDirName + '/'}bin/torch-lock.mjs list-memories`,
            'torch:memory:inspect': `node ${installDirName === '.' ? '' : installDirName + '/'}bin/torch-lock.mjs inspect-memory`,
        };

        let modified = false;
        for (const [key, cmd] of Object.entries(scriptsToAdd)) {
            if (!pkg.scripts[key]) {
                pkg.scripts[key] = cmd;
                console.log(`  Added script: "${key}"`);
                modified = true;
            } else {
                console.log(`  Script "${key}" already exists, skipping.`);
            }
        }

        if (modified) {
            fs.writeFileSync(hostPkgPath, JSON.stringify(pkg, null, 2), 'utf8');
            console.log('Updated package.json with convenience scripts.');
        }

    } catch (e) {
        console.error(`Failed to inject scripts: ${e.message}`);
    }
}

/**
 * Main entry point for `torch-lock update`.
 *
 * @param {boolean} [force=false] - Force overwrite.
 * @param {string} [cwd=process.cwd()] - Working directory.
 * @throws {Error} If torch installation is not found.
 */
export function cmdUpdate(force = false, cwd = process.cwd()) {
  // Update logic needs to know WHERE torch is installed.
  // We can look for torch directory? Or assume 'torch'?
  // For now, let's look for 'torch' directory first, then fallback to '.' if we detect torch files?
  // Or just default to 'torch' and let user move files if they changed it?
  // Realistically, 'update' should probably take an argument for the dir, or we just default to 'torch'.

  // If the user installed to 'custom-dir', cmdUpdate will fail unless we auto-detect.
  // Auto-detection strategy: check if 'torch' exists. If not, check if 'package.json' has 'torch-lock' name?

  let installDirName = 'torch';
  if (!fs.existsSync(path.join(cwd, 'torch')) && fs.existsSync(path.join(cwd, 'package.json'))) {
      // Check if current dir is the torch dir
      try {
          const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
          if (pkg.name === 'torch-lock') {
              installDirName = '.';
          }
      } catch (_e) {
          // Ignore error if package.json is missing or invalid
      }
  }

  const paths = getPaths(cwd, installDirName);
  console.log(`Updating torch configuration in ${paths.torchDir}...`);

  if (!fs.existsSync(paths.torchDir)) {
    throw new Error(`${paths.torchDir} not found. Run 'torch-lock init' first.`);
  }

  // 1. Backup
  const backupName = `backup_${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const backupRoot = path.join(paths.torchDir, '_backups');
  const thisBackupDir = path.join(backupRoot, backupName);

  ensureDir(thisBackupDir);
  console.log(`Creating backup at ${path.relative(paths.root, thisBackupDir)}...`);

  // We backup EVERYTHING in torchDir except _backups and node_modules
  const entries = fs.readdirSync(paths.torchDir);
  for (const entry of entries) {
      if (entry === '_backups' || entry === 'node_modules' || entry === '.git') continue;

      const srcPath = path.join(paths.torchDir, entry);
      const destPath = path.join(thisBackupDir, entry);
      fs.cpSync(srcPath, destPath, { recursive: true });
  }

  // 2. Update App Directories (Overwrite)
  syncAppDirectories(paths.torchDir, 'Updated');

  // 3. Update App Files (Overwrite)
  syncAppFiles(paths.torchDir, installDirName, 'Updated');

  // 4. Update Static Files (Always Overwrite)
  console.log('Updating static files...');
  for (const file of STATIC_FILES) {
    const src = path.join(SRC_PROMPTS_DIR, file);
    const dest = path.join(paths.torchDir, file);
    if (fs.existsSync(src)) {
      copyFile(src, dest, true, true, installDirName);
      console.log(`  Updated ${file}`);
    }
  }

  // 5. Update Roster (Preserve unless force)
  const srcRoster = path.join(SRC_PROMPTS_DIR, 'roster.json');
  if (fs.existsSync(srcRoster)) {
    if (force) {
      copyFile(srcRoster, paths.roster, false, true, installDirName);
      console.log('  Overwrote roster.json (forced)');
    } else {
      console.log('  Skipped roster.json (preserved)');
    }
  }

  // 6. Update Prompts (Copy missing, preserve existing unless force)
  console.log('Updating prompts...');
  for (const dir of EVOLVING_DIRS) {
    const srcDir = path.join(SRC_PROMPTS_DIR, dir);
    const destDir = path.join(paths.promptsDir, dir);
    ensureDir(destDir);

    if (fs.existsSync(srcDir)) {
      const files = fs.readdirSync(srcDir);
      let added = 0;
      let updated = 0;
      let skipped = 0;

      for (const file of files) {
        const srcFile = path.join(srcDir, file);
        const destFile = path.join(destDir, file);

        if (force) {
            copyFile(srcFile, destFile, false, true, installDirName);
            updated++;
        } else {
            if (!fs.existsSync(destFile)) {
                copyFile(srcFile, destFile, false, true, installDirName);
                added++;
            } else {
                skipped++;
            }
        }
      }
      console.log(`  ${dir}/: ${added} added, ${updated} updated, ${skipped} preserved`);
    }
  }

  ensureMemoryPromptHook(paths.root);
  console.log('\nUpdate complete.');
}
