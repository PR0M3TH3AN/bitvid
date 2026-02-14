#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { exec as execCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { SimplePool } from 'nostr-tools/pool';
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure';

const exec = promisify(execCallback);
const DEFAULT_TASK_LOG = 'data/tasks/task-log.json';
const DEFAULT_TASK_EVENT_KIND = 30311;
const DEFAULT_STATE_EVENT_KIND = 30312;

function parseArgs(argv) {
  const options = {
    taskLogPath: DEFAULT_TASK_LOG,
    actorId: process.env.AGENT_ACTOR_ID || process.env.USER || 'agent',
    source: 'file',
    nostrTaskKind: DEFAULT_TASK_EVENT_KIND,
    nostrStateKind: DEFAULT_STATE_EVENT_KIND,
    handlersPath: null,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const [key, maybeValue] = arg.split('=');
    const value = maybeValue ?? argv[i + 1];

    switch (key) {
      case '--task-log':
        options.taskLogPath = value;
        if (maybeValue == null) i += 1;
        break;
      case '--actor-id':
        options.actorId = value;
        if (maybeValue == null) i += 1;
        break;
      case '--source':
        options.source = value;
        if (maybeValue == null) i += 1;
        break;
      case '--nostr-relays':
        options.nostrRelays = value.split(',').map((relay) => relay.trim()).filter(Boolean);
        if (maybeValue == null) i += 1;
        break;
      case '--nostr-private-key':
        options.nostrPrivateKey = value;
        if (maybeValue == null) i += 1;
        break;
      case '--nostr-author':
        options.nostrAuthor = value;
        if (maybeValue == null) i += 1;
        break;
      case '--nostr-task-kind':
        options.nostrTaskKind = Number(value);
        if (maybeValue == null) i += 1;
        break;
      case '--nostr-state-kind':
        options.nostrStateKind = Number(value);
        if (maybeValue == null) i += 1;
        break;
      case '--handlers':
        options.handlersPath = value;
        if (maybeValue == null) i += 1;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      default:
        break;
    }
  }

  return options;
}

async function ensureTaskLog(taskLogPath) {
  const absolutePath = path.resolve(taskLogPath);
  try {
    await fs.access(absolutePath);
  } catch {
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, JSON.stringify({ tasks: [] }, null, 2));
  }
  return absolutePath;
}

async function readTaskLog(taskLogPath) {
  const content = await fs.readFile(taskLogPath, 'utf8');
  const trimmed = content.trim();
  const parsed = trimmed ? JSON.parse(trimmed) : { tasks: [] };
  if (!Array.isArray(parsed.tasks)) {
    throw new Error(`Task log at ${taskLogPath} must contain a tasks array.`);
  }
  return parsed;
}

async function writeTaskLog(taskLogPath, log) {
  await fs.writeFile(taskLogPath, `${JSON.stringify(log, null, 2)}\n`);
}

function isPending(task) {
  return (task.status ?? 'pending') === 'pending';
}

function normalizeTask(task) {
  return {
    ...task,
    status: task.status ?? 'pending',
    priority: Number.isFinite(task.priority) ? task.priority : 0,
    createdAt: task.createdAt ?? new Date(0).toISOString(),
    history: Array.isArray(task.history) ? task.history : [],
  };
}

function selectNextTask(tasks) {
  const sorted = tasks
    .map(normalizeTask)
    .filter(isPending)
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      const byTime = a.createdAt.localeCompare(b.createdAt);
      if (byTime !== 0) return byTime;
      return String(a.id).localeCompare(String(b.id));
    });

  return sorted[0] ?? null;
}

function transitionTask(task, nextStatus, actorId, extra = {}) {
  const transitionedAt = new Date().toISOString();
  const transition = {
    from: task.status ?? 'pending',
    to: nextStatus,
    actorId,
    transitionedAt,
    ...extra,
  };

  return {
    ...task,
    status: nextStatus,
    updatedAt: transitionedAt,
    history: [...(task.history ?? []), transition],
  };
}

function upsertTask(log, task) {
  const index = log.tasks.findIndex((candidate) => candidate.id === task.id);
  if (index === -1) {
    log.tasks.push(task);
    return;
  }
  log.tasks[index] = task;
}

async function loadNostrTasks(options) {
  if (!Array.isArray(options.nostrRelays) || options.nostrRelays.length === 0) {
    return [];
  }

  const pool = new SimplePool();
  try {
    const filters = [{ kinds: [options.nostrTaskKind], limit: 100 }];
    if (options.nostrAuthor) {
      filters[0].authors = [options.nostrAuthor];
    }
    const events = await pool.querySync(options.nostrRelays, filters[0]);
    return events
      .map((event) => {
        try {
          const parsed = JSON.parse(event.content);
          return {
            ...parsed,
            id: parsed.id ?? event.id,
            createdAt: parsed.createdAt ?? new Date(event.created_at * 1000).toISOString(),
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } finally {
    pool.close(options.nostrRelays);
  }
}

async function loadHandlers(handlersPath) {
  const builtIns = {
    noop: async () => ({ ok: true }),
    shell: async (task) => {
      if (!task.command) {
        throw new Error('shell handler requires task.command.');
      }
      const { stdout, stderr } = await exec(task.command, { cwd: process.cwd() });
      return { ok: true, stdout, stderr };
    },
  };

  if (!handlersPath) {
    return builtIns;
  }

  const resolved = path.resolve(handlersPath);
  const mod = await import(pathToFileURL(resolved).href);
  return {
    ...builtIns,
    ...(mod.handlers ?? {}),
  };
}

function hashTaskState(task) {
  const serialized = JSON.stringify(task);
  return createHash('sha256').update(serialized).digest('hex');
}

async function publishTaskState(task, options) {
  if (options.dryRun) {
    return { dryRun: true, eventId: `dry-run-${task.id}` };
  }

  if (!options.nostrPrivateKey || !options.nostrRelays?.length) {
    throw new Error('Nostr publishing requires --nostr-private-key and --nostr-relays.');
  }

  const privateKeyBytes = Uint8Array.from(Buffer.from(options.nostrPrivateKey, 'hex'));
  const pubkey = getPublicKey(privateKeyBytes);
  const pool = new SimplePool();

  const eventTemplate = {
    kind: options.nostrStateKind,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['t', 'task-state'],
      ['d', String(task.id)],
      ['status', task.status],
      ['hash', hashTaskState(task)],
      ['actor', options.actorId],
    ],
    content: JSON.stringify(task),
  };

  const signed = finalizeEvent(eventTemplate, privateKeyBytes);

  try {
    await Promise.all(pool.publish(options.nostrRelays, signed));
    return { eventId: signed.id, pubkey };
  } finally {
    pool.close(options.nostrRelays);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const taskLogPath = await ensureTaskLog(options.taskLogPath);
  const log = await readTaskLog(taskLogPath);

  let loadedTasks = [...log.tasks];
  if (options.source === 'nostr' || options.source === 'hybrid') {
    const nostrTasks = await loadNostrTasks(options);
    const existingTaskIds = new Set(loadedTasks.map((task) => task.id));
    for (const task of nostrTasks) {
      if (!existingTaskIds.has(task.id)) {
        loadedTasks.push(task);
      }
    }
  }

  const nextTask = selectNextTask(loadedTasks);
  if (!nextTask) {
    console.log('No pending task found.');
    return;
  }

  const handlers = await loadHandlers(options.handlersPath);
  const handler = handlers[nextTask.handler ?? 'noop'];
  if (!handler) {
    throw new Error(`No handler found for "${nextTask.handler}".`);
  }

  let workingTask = transitionTask(nextTask, 'in_progress', options.actorId);
  upsertTask(log, workingTask);
  await writeTaskLog(taskLogPath, log);

  let handlerResult;
  try {
    handlerResult = await handler(workingTask, { options });
  } catch (error) {
    const failedTask = transitionTask(workingTask, 'pending', options.actorId, {
      error: error instanceof Error ? error.message : String(error),
    });
    upsertTask(log, failedTask);
    await writeTaskLog(taskLogPath, log);
    throw error;
  }

  workingTask = transitionTask(workingTask, 'completed', options.actorId, {
    result: handlerResult ?? null,
  });
  upsertTask(log, workingTask);
  await writeTaskLog(taskLogPath, log);

  const publishResult = await publishTaskState(
    transitionTask(workingTask, 'permanent', options.actorId),
    options,
  );

  workingTask = transitionTask(workingTask, 'permanent', options.actorId, {
    nostrEventId: publishResult.eventId,
  });
  upsertTask(log, workingTask);
  await writeTaskLog(taskLogPath, log);

  console.log(
    JSON.stringify(
      {
        taskId: workingTask.id,
        status: workingTask.status,
        nostrEventId: publishResult.eventId,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
