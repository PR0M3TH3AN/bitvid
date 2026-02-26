export const DEFAULT_DASHBOARD_PORT = 4173;
export const RACE_CHECK_DELAY_MS = 1500;
export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
];
export const DEFAULT_TTL = 7200;
export const DEFAULT_NAMESPACE = 'torch';
export const DEFAULT_QUERY_TIMEOUT_MS = 30_000;
export const DEFAULT_PUBLISH_TIMEOUT_MS = 15_000;
export const DEFAULT_MIN_SUCCESSFUL_PUBLISHES = 1;
export const DEFAULT_MIN_ACTIVE_RELAY_POOL = 1;
export const DEFAULT_RETRY_ATTEMPTS = 4;
export const DEFAULT_RETRY_BASE_DELAY_MS = 500;
export const DEFAULT_RETRY_CAP_DELAY_MS = 8000;
export const DEFAULT_ROLLING_WINDOW_SIZE = 25;
export const DEFAULT_FAILURE_THRESHOLD = 3;
export const DEFAULT_QUARANTINE_COOLDOWN_MS = 30_000;
export const DEFAULT_MAX_QUARANTINE_COOLDOWN_MS = 300_000;
export const DEFAULT_SNAPSHOT_INTERVAL_MS = 60_000;
export const VALID_CADENCES = new Set(['daily', 'weekly']);
export const KIND_APP_DATA = 30078;
export const MS_PER_SECOND = 1000;

/**
 * Script keys injected into the host package.json during `torch-lock init`.
 * Used by both init (to add) and remove (to clean up).
 */
export const TORCH_HOST_SCRIPTS = [
  'torch:dashboard',
  'torch:check',
  'torch:lock',
  'torch:health',
  'torch:memory:list',
  'torch:memory:inspect',
];

export const USAGE_TEXT = `Usage: torch-lock <command> [options]

Commands:
  check     --cadence <daily|weekly>               Check locked agents (JSON)
  lock      --agent <name> --cadence <daily|weekly> Claim a lock
  complete  --agent <name> --cadence <daily|weekly> Mark task as completed (permanent)
  list      [--cadence <daily|weekly>]             Print active lock table
  health    --cadence <daily|weekly>               Probe relay websocket + publish/read health
  dashboard [--port <port>] [--host <host>]        Serve the dashboard (default: ${DEFAULT_DASHBOARD_PORT})
  doctor    [--json]                               Validate local TORCH setup and print fixes
  init      [--force]                              Initialize torch/ directory in current project
  update    [--force]                              Update torch/ configuration (backups, merges)
  remove    [--force]                              Remove all TORCH files and configuration from project

  list-memories           [--agent <id>] [--type <type>] [--tags <a,b>] [--pinned <true|false>] [--full]
  inspect-memory          --id <memoryId>
  pin-memory              --id <memoryId>
  unpin-memory            --id <memoryId>
  trigger-prune-dry-run   [--retention-ms <ms>]
  memory-stats            [--window-ms <ms>]

Options:
  --dry-run       Build and sign the event but do not publish
  --force         Overwrite existing files (for init) or all files (for update)
  --log-dir       Path to task logs directory (default: task-logs)
  --ignore-logs   Skip checking local logs for completed tasks
  --json          Emit compact single-line JSON
  --json-file     Write JSON output to a file path
  --quiet         Suppress stderr progress logs (pairs well with --json)

Environment:
  NOSTR_LOCK_NAMESPACE      Namespace prefix for lock tags (default: torch)
  NOSTR_LOCK_RELAYS         Comma-separated relay WSS URLs
  NOSTR_LOCK_TTL            Lock TTL in seconds (default: 7200)
  NOSTR_LOCK_QUERY_TIMEOUT_MS   Relay query timeout in milliseconds (default: 30000)
  NOSTR_LOCK_DAILY_ROSTER   Comma-separated daily roster (optional)
  NOSTR_LOCK_WEEKLY_ROSTER  Comma-separated weekly roster (optional)
  TORCH_CONFIG_PATH         Optional path to torch-config.json (default: ./torch-config.json)
  AGENT_PLATFORM            Platform identifier (e.g., codex)

Exit codes:
  0  Success
  1  Usage error
  2  Relay/network error
  3  Lock denied (already locked or race lost)`;
