import { spawnSync, execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');
const REVIEW_SCRIPT_PATH = path.join(ROOT_DIR, 'scripts/automated-pr-review.mjs');

function runCommand(command, args = [], options = {}) {
    console.log(`> ${command} ${args.join(' ')}`);
    return spawnSync(command, args, { stdio: 'inherit', encoding: 'utf-8', ...options });
}

function getOpenPRs() {
    console.log('Fetching open PRs via GitHub API...');
    try {
        const res = spawnSync('curl', ['-s', 'https://api.github.com/repos/PR0M3TH3AN/bitvid/pulls?state=open&per_page=100'], { encoding: 'utf-8' });
        if (res.error) {
            console.error('Error fetching PRs (curl not available?):', res.error.message);
            return [];
        }
        if (res.status !== 0) {
            console.error('Error fetching PRs:', res.stderr);
            return [];
        }
        const apiPRs = JSON.parse(res.stdout);
        // Map GitHub API response to the shape we need
        return apiPRs.map(pr => ({
            number: pr.number,
            headRefName: pr.head.ref,
            baseRefName: pr.base.ref,
            url: pr.html_url
        }));
    } catch (e) {
        console.error('Exception fetching PRs:', e);
        return [];
    }
}

async function main() {
    const openPRs = getOpenPRs();
    if (openPRs.length === 0) {
        console.log('No open PRs found or unable to fetch.');
        return;
    }

    console.log(`Found ${openPRs.length} open PRs.`);

    // Capture current branch to restore later
    let originalBranch;
    try {
        originalBranch = execSync('git branch --show-current', { encoding: 'utf-8' }).trim();
    } catch (e) {
        console.error('Could not determine current branch.');
        process.exit(1);
    }

    for (const pr of openPRs) {
        console.log(`\n=== Processing PR #${pr.number}: ${pr.url} ===`);
        try {
            // Checkout PR via git fetch
            runCommand('git', ['fetch', 'origin', `pull/${pr.number}/head:pr-${pr.number}`]);
            runCommand('git', ['checkout', `pr-${pr.number}`]);

            // Set Environment Variables
            const env = {
                ...process.env,
                PR_NUMBER: pr.number.toString(),
                GITHUB_BASE_REF: pr.baseRefName,
                // Assuming origin is the base repo.
                // automated-pr-review.mjs handles missing GITHUB_BASE_REPO_URL by defaulting to upstream/origin.
            };

            // Run Review Script
            console.log(`Running review for PR #${pr.number}...`);
            const res = spawnSync('node', [REVIEW_SCRIPT_PATH, '--force-ci'], {
                env,
                stdio: 'inherit',
                encoding: 'utf-8'
            });

            if (res.status !== 0) {
                console.log(`Review script failed (exit code ${res.status}). See output above.`);
            } else {
                console.log(`Review script completed successfully for PR #${pr.number}.`);
            }

        } catch (e) {
            console.error(`Error processing PR #${pr.number}:`, e);
        } finally {
            // Clean up workspace before next PR
            try {
                execSync('git reset --hard HEAD', { stdio: 'ignore' });
                execSync('git clean -fd', { stdio: 'ignore' });
            } catch (e) {}
        }
    }

    console.log(`\nRestoring original branch: ${originalBranch}`);
    try {
        runCommand('git', ['checkout', originalBranch]);
    } catch (e) {
        console.error('Failed to restore original branch:', e);
    }
}

main();
