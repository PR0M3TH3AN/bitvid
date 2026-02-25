#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const REQUIRED_ENV = ['SCHEDULER_PROMPT_PATH', 'SCHEDULER_AGENT', 'SCHEDULER_CADENCE'];

function fail(message, code = 1) {
  console.error(`[scheduler] ${message}`);
  process.exit(code);
}

function resolveRunner(promptMarkdown) {
  const customRunner = process.env.SCHEDULER_AGENT_RUNNER_COMMAND?.trim();
  if (customRunner) {
    return { command: 'bash', args: ['-lc', customRunner] };
  }

  const platform = (process.env.AGENT_PLATFORM || 'codex').trim().toLowerCase();
  if (platform === 'codex') {
    return { command: 'codex', args: ['exec', promptMarkdown] };
  }

  if (platform === 'claude') {
    return { command: 'claude', args: ['-p', promptMarkdown] };
  }

  if (platform === 'linux') {
    return { command: 'echo', args: [`[scheduler] Platform 'linux' detected. simulated execution for prompt.`] };
  }

  fail(`Unsupported AGENT_PLATFORM="${platform}". Set SCHEDULER_AGENT_RUNNER_COMMAND to override.`);
}

async function main() {
  for (const key of REQUIRED_ENV) {
    if (!process.env[key] || !String(process.env[key]).trim()) {
      fail(`Missing required environment variable ${key}.`);
    }
  }

  const promptPath = path.resolve(process.cwd(), process.env.SCHEDULER_PROMPT_PATH);
  let promptMarkdown;

  try {
    promptMarkdown = await fs.readFile(promptPath, 'utf8');
  } catch {
    fail(`Unable to read scheduler prompt at ${promptPath}.`);
  }

  if (!promptMarkdown.trim()) {
    fail(`Scheduler prompt at ${promptPath} is empty.`);
  }

  const cadence = process.env.SCHEDULER_CADENCE;
  const memoriesPath = path.resolve(process.cwd(), `.scheduler-memory/latest/${cadence}/memories.md`);
  try {
    const memories = await fs.readFile(memoriesPath, 'utf8');
    if (memories && memories.trim()) {
      promptMarkdown += `\n\n# Retrieved Memories\n\n${memories.trim()}\n`;
      console.error(`[scheduler] Injected memories from ${memoriesPath}`);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(`[scheduler] Warning: Failed to read memories from ${memoriesPath}: ${error.message}`);
    }
  }

  const runner = resolveRunner(promptMarkdown);

  // Compute a stable, per-run memory output file path so agents know where to write learnings.
  // store.mjs reads this env var; if absent it falls back to the root memory-update.md placeholder.
  const agentName = process.env.SCHEDULER_AGENT || 'unknown-agent';
  const runTs = new Date().toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, 'Z');
  const memoryFile = `memory-updates/${runTs}__${agentName}.md`;

  const child = spawn(runner.command, runner.args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      SCHEDULER_PROMPT_PATH: promptPath,
      SCHEDULER_PROMPT_MARKDOWN: promptMarkdown,
      SCHEDULER_MEMORY_FILE: memoryFile,
    },
    stdio: 'inherit',
  });

  child.on('error', (error) => {
    if (error.code === 'ENOENT') {
      fail(`Runner command not found: ${runner.command}`, 127);
    }
    fail(`Runner execution failed: ${error.message}`);
  });

  child.on('close', (code) => {
    process.exit(code ?? 1);
  });
}

main();
