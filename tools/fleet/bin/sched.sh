#!/usr/bin/env bash
# sched.sh <job> — the machine-level scheduler entry, called from the system crontab
# (or a systemd timer). Runs docs/agents/schedules/<job>.md as ONE short headless run
# in the dispatcher's worktree via `fleet run-job`, and:
#   - skips during quiet hours unless the job has `quietHours: "allowed"` in fleet.config.json
#   - skips while <stateDir>/PAUSED exists (wind-down, or the owner), except jobs with
#     `ignorePause: true` (restart)
#   - flock -n: if the previous run of this job is still going, skip instead of piling up
#   - timeout: the job's timeoutMin (default 40). `fleet run-job` applies the same
#     limit and kills the child process group; this `timeout` is the backstop
#   - logs to <stateDir>/logs/<job>-<date>.log
# Needs FLEET_CONFIG in the environment (the crontab lines from `fleet crontab` set it).
set -u
job="${1:?usage: sched.sh <job>}"
HERE="$(cd "$(dirname "$0")" && pwd)"
vars="$(node "$HERE/fleet.mjs" sched-env "$job")" || exit 2
eval "$vars"
mkdir -p "$STATE/logs"
LOG="$STATE/logs/$job-$(date +%F).log"
[ -f "$PROMPT" ] || { echo "$(date -Is) no prompt $PROMPT" >> "$LOG"; exit 2; }
h=$((10#$(date +%H)))
if [ "$QUIET_OK" != 1 ]; then
  if { [ "$QUIET_START" -gt "$QUIET_END" ] && { [ "$h" -ge "$QUIET_START" ] || [ "$h" -lt "$QUIET_END" ]; }; } ||
     { [ "$QUIET_START" -lt "$QUIET_END" ] && [ "$h" -ge "$QUIET_START" ] && [ "$h" -lt "$QUIET_END" ]; }; then
    echo "$(date -Is) quiet hours, skipped" >> "$LOG"; exit 0
  fi
fi
if [ -f "$STATE/PAUSED" ] && [ "$ALWAYS" != 1 ]; then
  echo "$(date -Is) fleet paused ($(head -c 200 "$STATE/PAUSED")), skipped" >> "$LOG"; exit 0
fi
{
  echo "=== $(date -Is) $job start"
  flock -n "$STATE/sched-$job.lock" timeout "${TIMEOUT_MIN}m" node "$HERE/fleet.mjs" run-job "$job" < /dev/null
  echo "=== $(date -Is) $job exit $?"
} >> "$LOG" 2>&1
