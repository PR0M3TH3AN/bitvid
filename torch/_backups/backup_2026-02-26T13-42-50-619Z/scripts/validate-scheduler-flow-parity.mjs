import { readFile } from 'node:fs/promises';

const FILES = {
  meta: 'src/prompts/META_PROMPTS.md',
  flow: 'src/prompts/scheduler-flow.md',
  scheduler: 'scripts/agent/run-scheduler-cycle.mjs',
};

function collectMissing(text, requiredSnippets) {
  return requiredSnippets.filter((snippet) => !text.includes(snippet));
}

function ensureOrdered(text, snippets) {
  const positions = [];
  for (const snippet of snippets) {
    const idx = text.indexOf(snippet);
    if (idx === -1) {
      return { ok: false, missing: snippet };
    }
    positions.push(idx);
  }

  for (let i = 1; i < positions.length; i += 1) {
    if (positions[i] < positions[i - 1]) {
      return { ok: false, outOfOrder: [snippets[i - 1], snippets[i]] };
    }
  }

  return { ok: true };
}

const invariants = [
  {
    name: 'lock check + exclusion fallback',
    promptSnippets: {
      meta: [
        'Run preflight to get the exclusion set:',
        'Use `excluded` from the JSON output as the canonical exclusion set.',
        'fallback to the union of `locked`, `paused`, and `completed`',
      ],
      flow: [
        'canonical exclusion rule',
      ],
    },
    schedulerSnippets: [
      "runCommand('npm', ['run', `lock:check:${cadence}`",
      'checkPayload.excluded',
      'checkPayload.locked',
      'checkPayload.paused',
      'checkPayload.completed',
    ],
  },
  {
    name: 'roster selection source + all-excluded stop',
    promptSnippets: {
      meta: [
        'Read roster from src/prompts/roster.json',
        'scheduler.firstPromptByCadence.daily',
        'scheduler.firstPromptByCadence.weekly',
        'All roster tasks currently claimed by other agents',
      ],
      flow: [
        'Roster source: `src/prompts/roster.json`',
        'Read `scheduler.firstPromptByCadence.<cadence>` from repository-root `torch-config.json` if present.',
        'All roster tasks currently claimed by other agents',
      ],
    },
    schedulerSnippets: [
      "readJson(path.resolve(process.cwd(), 'src/prompts/roster.json')",
      'parseFrontmatterAgent(content) || parseAgentFromFilename(latestFile)',
      'scheduler.firstPromptByCadence?.[cadence]',
      'ALL_EXCLUDED_REASON',
      "reason: ALL_EXCLUDED_REASON",
    ],
  },
  {
    name: 'memory retrieve/store execution + required evidence enforcement',
    promptSnippets: {
      meta: [
        'Run required memory workflow for this cadence:',
        'Validate memory evidence:',
        'fail the run if either check is missing',
      ],
      flow: [
        'Confirm memory contract completion:',
        'Memory retrieval evidence must exist for this run',
        'Memory storage evidence must exist for this run',
        'mode = required`, missing evidence is a hard failure',
      ],
    },
    schedulerSnippets: [
      'schedulerConfig.memoryPolicy.retrieveCommand',
      'schedulerConfig.memoryPolicy.storeCommand',
      "name: 'retrieve'",
      "name: 'store'",
      "schedulerConfig.memoryPolicy.mode === 'required'",
      "reason: 'Required memory steps not verified'",
    ],
  },
  {
    name: 'artifact verification checkpoint',
    promptSnippets: {
      flow: [
        'Verify required run artifacts for the current run window.',
        'verify-run-artifacts.mjs --since <run-start-iso> --check-failure-notes',
        'If artifact verification exits non-zero: write `_failed.md` and stop.',
      ],
    },
    schedulerSnippets: [
      "runCommand('node', [",
      "'scripts/agent/verify-run-artifacts.mjs'",
      "'--check-failure-notes'",
      "reason: 'Missing required run artifacts'",
    ],
  },
  {
    name: 'failure stop conditions + completion ordering',
    promptSnippets: {
      meta: [
        'If any validation command exits non-zero, do not call `lock:complete`',
        'Publish completion before writing `_completed.md`',
        'Only after step 11 succeeds, write final task log (`_completed.md`',
      ],
      flow: [
        'step 12 MUST NOT be executed (`lock:complete` is forbidden until validation passes)',
        'Publish completion before writing final success log:',
        '`_completed.md` MUST be created only after completion publish succeeds.',
        'backend_category',
        'lock_command',
        'lock_stderr_excerpt',
      ],
    },
    schedulerSnippets: [
      "reason: 'Validation failed'",
      'const completeResult = await runCommand(',
      "['run', 'lock:complete'",
      "status: 'completed'",
      'Completion publish failed. Retry npm run lock:complete',
      "reason: 'Lock backend error'",
      'classifyLockBackendError',
      'backend_category',
      'lock_command',
      'lock_stderr_excerpt',
      'lock_stdout_excerpt',
    ],
    orderedSchedulerSnippets: [
      "reason: 'Validation failed'",
      'const completeResult = await runCommand(',
      "status: 'completed'",
    ],
  },
  {
    name: 'final summary print',
    promptSnippets: {
      meta: [
        'Print a final summary message to stdout',
        'Status: [Success/Failure]',
        'Learnings: [Content of the memory update file',
      ],
      flow: [
        'Print a final summary message to stdout',
        'The message MUST include:',
        '**Learnings**: [Content of the memory update file',
      ],
    },
    schedulerSnippets: [
      'async function printRunSummary',
      'async function exitWithSummary',
      'await printRunSummary(summaryData)',
      'Learnings / Discoveries:',
    ],
  },
];


const [meta, flow, scheduler] = await Promise.all([
  readFile(FILES.meta, 'utf8'),
  readFile(FILES.flow, 'utf8'),
  readFile(FILES.scheduler, 'utf8'),
]);

const errors = [];

for (const invariant of invariants) {
    if (invariant.promptSnippets?.meta) {
    const missingMeta = collectMissing(meta, invariant.promptSnippets.meta);
    for (const snippet of missingMeta) {
      errors.push(`[${invariant.name}] ${FILES.meta} missing snippet: ${snippet}`);
    }
  }

  if (invariant.promptSnippets?.flow) {
    const missingFlow = collectMissing(flow, invariant.promptSnippets.flow);
    for (const snippet of missingFlow) {
      errors.push(`[${invariant.name}] ${FILES.flow} missing snippet: ${snippet}`);
    }
  }

  const missingScheduler = collectMissing(scheduler, invariant.schedulerSnippets);
  for (const snippet of missingScheduler) {
    errors.push(`[${invariant.name}] ${FILES.scheduler} missing checkpoint snippet: ${snippet}`);
  }

  if (invariant.orderedSchedulerSnippets) {
    const order = ensureOrdered(scheduler, invariant.orderedSchedulerSnippets);
    if (!order.ok && order.missing) {
      errors.push(`[${invariant.name}] ${FILES.scheduler} missing ordered snippet: ${order.missing}`);
    } else if (!order.ok && order.outOfOrder) {
      errors.push(
        `[${invariant.name}] ${FILES.scheduler} ordering drift: "${order.outOfOrder[0]}" must appear before "${order.outOfOrder[1]}"`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error('Scheduler flow parity drift detected:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Scheduler flow parity validated for prompts and scheduler implementation.');
