import {
  getRelays as _getRelays,
  getNamespace as _getNamespace,
  getHashtag as _getHashtag,
} from './torch-config.mjs';
import {
  KIND_APP_DATA,
  MS_PER_SECOND,
} from './constants.mjs';
import { todayDateStr, nowUnix, detectPlatform } from './utils.mjs';
import { queryLocks as _queryLocks, publishLock as _publishLock } from './lock-ops.mjs';
import { ExitError } from './errors.mjs';
import { generateSecretKey as _generateSecretKey, getPublicKey as _getPublicKey, finalizeEvent as _finalizeEvent } from 'nostr-tools/pure';

/**
 * Marks a task as permanently completed by publishing a new lock event with
 * `status: 'completed'` and no expiration.
 *
 * This function:
 * 1. Verifies that the agent currently holds a valid lock.
 * 2. Publishes a replacement event that preserves the original `startedAt` time.
 *
 * @param {string} agent - Agent name
 * @param {string} cadence - 'daily' or 'weekly'
 * @param {boolean} [dryRun=false] - If true, skips publishing
 * @param {Object} [deps] - Dependency injection
 * @returns {Promise<{status: string, eventId: string}>}
 * @throws {ExitError} If no active lock exists for the agent
 */
export async function cmdComplete(agent, cadence, optionsOrDryRun = false, deps = {}) {
  const options = typeof optionsOrDryRun === 'object' ? optionsOrDryRun : { dryRun: !!optionsOrDryRun };
  const { dryRun = false, platform = null, model = null } = options;

  const {
    getRelays = _getRelays,
    getNamespace = _getNamespace,
    getHashtag = _getHashtag,
    queryLocks = _queryLocks,
    publishLock = _publishLock,
    generateSecretKey = _generateSecretKey,
    getPublicKey = _getPublicKey,
    finalizeEvent = _finalizeEvent,
    getDateStr = todayDateStr,
    log = console.log,
    error = console.error
  } = deps;

  const relays = await getRelays();
  const namespace = await getNamespace();
  const hashtag = await getHashtag();
  const dateStr = getDateStr();
  const now = nowUnix();

  error(`Completing task: namespace=${namespace}, agent=${agent}, cadence=${cadence}, date=${dateStr}`);
  error(`Relays: ${relays.join(', ')}`);

  // 1. Find existing lock
  const locks = await queryLocks(relays, cadence, dateStr, namespace);
  const myLock = locks.find((l) => l.agent === agent);

  if (!myLock) {
    error(`ERROR: No active lock found for agent "${agent}" on ${dateStr}.`);
    error(`Cannot complete a task that is not locked or has already expired.`);
    throw new ExitError(1, 'No active lock found');
  }

  if (myLock.status === 'completed') {
    error(`Task is already marked as completed (event ${myLock.eventId}).`);
    log('LOCK_STATUS=completed');
    return { status: 'completed', eventId: myLock.eventId };
  }

  // 2. Build completion event
  const startedAtIso = myLock.createdAtIso;

  error('Step 1: Generating completion event...');
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);

  const event = finalizeEvent(
    {
      kind: KIND_APP_DATA,
      created_at: now,
      tags: [
        ['d', `${namespace}-lock/${cadence}/${agent}/${dateStr}`],
        ['t', hashtag],
        ['t', `${namespace}-lock-${cadence}`],
        ['t', `${namespace}-lock-${cadence}-${dateStr}`],
        // No expiration tag -> permanent
      ],
      content: JSON.stringify({
        agent,
        cadence,
        status: 'completed',
        namespace,
        date: dateStr,
        platform: platform || process.env.AGENT_PLATFORM || detectPlatform() || 'unknown',
        model: model || process.env.AGENT_MODEL || 'unknown',
        startedAt: startedAtIso,
        completedAt: new Date(now * MS_PER_SECOND).toISOString(),
      }),
    },
    sk,
  );

  error(`  Event ID: ${event.id}`);

  if (dryRun) {
    error('Step 2: [DRY RUN] Skipping publish — event built but not sent');
  } else {
    error('Step 2: Publishing completion event...');
    await publishLock(relays, event);
    error('  Published successfully.');
  }

  log('LOCK_STATUS=completed');
  log(`LOCK_EVENT_ID=${event.id}`);
  log(`LOCK_PUBKEY=${pk}`);
  log(`LOCK_AGENT=${agent}`);
  log(`LOCK_CADENCE=${cadence}`);
  log(`LOCK_DATE=${dateStr}`);

  return { status: 'completed', eventId: event.id };
}
