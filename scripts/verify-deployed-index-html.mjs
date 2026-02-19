#!/usr/bin/env node

const VERSION_MARKUP_PATTERN = /seed\.\s*zap\.\s*subscribe\.\s*<\/h2>\s*<div[^>]*>\s*v:\s*[a-f0-9]{8}\s*•\s*\d{4}-\d{2}-\d{2}\s*<\/div>/i;

function parseArgs(argv) {
  const args = {
    url: process.env.DEPLOY_INDEX_URL ?? ''
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--url') {
      args.url = argv[i + 1] ?? args.url;
      i += 1;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/verify-deployed-index-html.mjs --url <https://example.com/index.html>');
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.url) {
    throw new Error('Missing deployed index URL. Pass --url or set DEPLOY_INDEX_URL.');
  }

  return args;
}

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 5000;

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(args.url, {
        headers: {
          Accept: 'text/html'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();
      if (VERSION_MARKUP_PATTERN.test(html)) {
        console.log(`Deployed index verification passed: ${args.url} includes slogan version markup.`);
        return;
      }

      throw new Error('Missing version markup');
    } catch (error) {
      if (attempt === MAX_RETRIES) {
        throw new Error(
          `Failed to verify deployed index.html at ${args.url} after ${MAX_RETRIES} attempts. Last error: ${error.message}`
        );
      }
      console.log(`Attempt ${attempt} failed: ${error.message}. Retrying in ${RETRY_DELAY_MS / 1000}s...`);
      await sleep(RETRY_DELAY_MS);
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
