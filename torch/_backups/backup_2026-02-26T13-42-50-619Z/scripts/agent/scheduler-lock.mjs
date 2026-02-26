import {
  runCommand,
  parseJsonFromOutput,
  parseJsonEventsFromOutput,
  excerptText,
  formatDurationMs,
  getRunDateKey,
  sleep,
} from './scheduler-utils.mjs';

const LOCK_INCIDENT_LINK = 'docs/agent-handoffs/learnings/2026-02-15-relay-health-preflight-job.md';

export function classifyLockBackendError(outputText) {
  const text = String(outputText || '').toLowerCase();
  if (!text.trim()) return 'unknown_backend_error';

  const errorCategoryMatch = text.match(/error_category=([a-z0-9_]+)/);
  if (errorCategoryMatch?.[1]) {
    return errorCategoryMatch[1];
  }

  if ((text.includes('relay') || text.includes('query')) && text.includes('timeout')) {
    return 'relay_query_timeout';
  }

  if (text.includes('publish failed to all relays') || text.includes('failed to publish to any relay')) {
    return 'relay_publish_quorum_failure';
  }

  if (
    text.includes('connection refused')
    || text.includes('econnrefused')
    || text.includes('getaddrinfo')
    || text.includes('enotfound')
    || text.includes('eai_again')
    || (text.includes('websocket') && text.includes('dns'))
  ) {
    return 'websocket_connection_refused_or_dns';
  }

  if (
    text.includes('invalid url')
    || text.includes('malformed')
    || text.includes('unsupported protocol')
    || text.includes('must start with ws')
    || text.includes('invalid relay')
  ) {
    return 'malformed_relay_url_config';
  }

  return 'unknown_backend_error';
}

export function buildLockBackendRemediation({ cadence, retryWindowMs, maxDeferrals, incidentSignalId = null }) {
  const steps = [
    'Likely backend/relay connectivity issue during lock acquisition.',
    `Retry window: ${formatDurationMs(retryWindowMs)} (max deferrals: ${maxDeferrals}).`,
    `Retry command: npm run scheduler:${cadence}`,
    `Run health check: npm run lock:health -- --cadence ${cadence}`,
    `Review incident runbook: ${LOCK_INCIDENT_LINK}`,
  ];
  if (incidentSignalId) {
    steps.push(`Incident signal: ${incidentSignalId}`);
  }
  return `Recommended auto-remediation: ${steps.join(' ')}`;
}

export async function runLockHealthPreflight({ cadence, platform }) {
  const preflight = await runCommand('npm', ['run', 'lock:health', '--', '--cadence', cadence], {
    env: { AGENT_PLATFORM: platform },
  });
  const payload = parseJsonFromOutput(`${preflight.stdout}\n${preflight.stderr}`) || {};
  const relayList = Array.isArray(payload.relays)
    ? payload.relays.filter((relay) => typeof relay === 'string' && relay.trim()).map((relay) => relay.trim())
    : [];
  const combinedOutput = `${preflight.stderr}\n${preflight.stdout}`;
  const failureCategory = payload.failureCategory || classifyLockBackendError(combinedOutput);

  return {
    code: preflight.code,
    payload,
    relayList,
    failureCategory,
    stderrExcerpt: excerptText(preflight.stderr),
    stdoutExcerpt: excerptText(preflight.stdout),
  };
}

export async function acquireLockWithRetry({ selectedAgent, cadence, platform, model, lockRetry, idempotencyKey }) {
  const lockCommandArgs = ['run', 'lock:lock', '--', '--agent', selectedAgent, '--cadence', cadence];
  if (model) {
    lockCommandArgs.push('--model', model);
  }
  const backoffScheduleMs = [];
  let attempts = 0;
  const correlationId = idempotencyKey || `${cadence}:${selectedAgent}:${getRunDateKey()}`;

  while (true) {
    attempts += 1;
    const result = await runCommand('npm', lockCommandArgs, {
      env: {
        AGENT_PLATFORM: platform,
        ...(model ? { AGENT_MODEL: model } : {}),
        ...(idempotencyKey ? { SCHEDULER_LOCK_IDEMPOTENCY_KEY: idempotencyKey } : {}),
        SCHEDULER_LOCK_CORRELATION_ID: correlationId,
        SCHEDULER_LOCK_ATTEMPT_ID: String(attempts),
      },
    });

    if (result.code !== 2) {
      return { result, attempts, backoffScheduleMs, correlationId };
    }

    if (attempts > lockRetry.maxRetries) {
      return {
        result,
        attempts,
        backoffScheduleMs,
        correlationId,
        finalBackendCategory: classifyLockBackendError(`${result.stderr}\n${result.stdout}`),
      };
    }

    const exponentialBase = lockRetry.backoffMs * (2 ** (attempts - 1));
    const jitter = lockRetry.jitterMs > 0
      ? Math.floor(Math.random() * (lockRetry.jitterMs + 1))
      : 0;
    const delayMs = exponentialBase + jitter;
    backoffScheduleMs.push(delayMs);

    console.log(JSON.stringify({
      event: 'scheduler.lock.retry',
      attempt: attempts,
      max_retries: lockRetry.maxRetries,
      delay_ms: delayMs,
      correlation_id: correlationId,
      selected_agent: selectedAgent,
      cadence,
    }));

    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }
}

export function summarizeLockFailureReasons(outputText) {
  const events = parseJsonEventsFromOutput(outputText);
  const quorumFailure = events.findLast((entry) => entry.event === 'lock_publish_quorum_failed');
  if (quorumFailure && quorumFailure.reasonDistribution && typeof quorumFailure.reasonDistribution === 'object') {
    return {
      reasonDistribution: quorumFailure.reasonDistribution,
      attemptId: quorumFailure.attemptId || null,
      correlationId: quorumFailure.correlationId || null,
      totalElapsedMs: quorumFailure.totalElapsedMs ?? null,
    };
  }

  const distribution = {};
  for (const entry of events) {
    if (entry.event !== 'lock_publish_failure') continue;
    const reason = typeof entry.reason === 'string' && entry.reason.trim()
      ? entry.reason.trim()
      : 'unknown';
    distribution[reason] = (distribution[reason] || 0) + 1;
  }
  return {
    reasonDistribution: distribution,
    attemptId: null,
    correlationId: null,
    totalElapsedMs: null,
  };
}
