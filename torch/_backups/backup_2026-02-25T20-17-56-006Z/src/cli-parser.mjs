import { DEFAULT_DASHBOARD_PORT } from './constants.mjs';

/**
 * Parses command-line arguments into a structured object.
 *
 * @param {string[]} argv - Arguments from process.argv.slice(2)
 * @returns {Object} - Parsed arguments (command, flags, values)
 */
export function parseArgs(argv) {
  const args = {
    command: null,
    agent: null,
    cadence: null,
    json: false,
    jsonFile: null,
    quiet: false,
    dryRun: false,
    force: false,
    port: DEFAULT_DASHBOARD_PORT,
    host: undefined,
    logDir: 'task-logs',
    ignoreLogs: false,
    id: null,
    type: null,
    tags: [],
    pinned: null,
    limit: null,
    offset: null,
    retentionMs: null,
    windowMs: null,
    timeoutMs: null,
    allRelaysDownMinutes: null,
    minSuccessRate: null,
    windowMinutes: null,
    platform: null,
    model: null,
    subcommand: null,
    target: null,
    content: null,
    reason: null,
    strategy: null,
    status: null,
    list: false,
    output: null,
  };
  let i = 0;

  if (argv.length > 0 && !argv[0].startsWith('-')) {
    args.command = argv[0];
    i = 1;
    // Support subcommands for 'proposal'
    if (args.command === 'proposal' && argv.length > 1 && !argv[1].startsWith('-')) {
      args.subcommand = argv[1];
      i = 2;
    }
  }

  for (; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--agent' || arg === '-a') {
      args.agent = argv[++i];
    } else if (arg === '--cadence' || arg === '-c') {
      args.cadence = argv[++i];
    } else if (arg === '--json') {
      args.json = true;
    } else if (arg === '--json-file') {
      args.jsonFile = argv[++i];
    } else if (arg.startsWith('--json-file=')) {
      args.jsonFile = arg.split('=')[1];
    } else if (arg === '--quiet') {
      args.quiet = true;
    } else if (arg.startsWith('--agent=')) {
      args.agent = arg.split('=')[1];
    } else if (arg.startsWith('--cadence=')) {
      args.cadence = arg.split('=')[1];
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--force') {
      args.force = true;
    } else if (arg === '--port') {
      args.port = parseInt(argv[++i], 10) || DEFAULT_DASHBOARD_PORT;
    } else if (arg === '--host') {
      args.host = argv[++i];
    } else if (arg === '--log-dir') {
      args.logDir = argv[++i];
    } else if (arg === '--ignore-logs') {
      args.ignoreLogs = true;
    } else if (arg === '--id') {
      args.id = argv[++i];
    } else if (arg.startsWith('--id=')) {
      args.id = arg.split('=')[1];
    } else if (arg === '--type') {
      args.type = argv[++i];
    } else if (arg.startsWith('--type=')) {
      args.type = arg.split('=')[1];
    } else if (arg === '--tags') {
      args.tags = String(argv[++i]).split(',').map((tag) => tag.trim()).filter(Boolean);
    } else if (arg.startsWith('--tags=')) {
      args.tags = String(arg.split('=')[1]).split(',').map((tag) => tag.trim()).filter(Boolean);
    } else if (arg === '--pinned') {
      const value = String(argv[++i]).toLowerCase();
      args.pinned = value === 'true' ? true : value === 'false' ? false : null;
    } else if (arg.startsWith('--pinned=')) {
      const value = String(arg.split('=')[1]).toLowerCase();
      args.pinned = value === 'true' ? true : value === 'false' ? false : null;
    } else if (arg === '--limit') {
      args.limit = parseInt(argv[++i], 10);
    } else if (arg.startsWith('--limit=')) {
      args.limit = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--offset') {
      args.offset = parseInt(argv[++i], 10);
    } else if (arg.startsWith('--offset=')) {
      args.offset = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--retention-ms') {
      args.retentionMs = parseInt(argv[++i], 10);
    } else if (arg.startsWith('--retention-ms=')) {
      args.retentionMs = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--window-ms') {
      args.windowMs = parseInt(argv[++i], 10);
    } else if (arg.startsWith('--window-ms=')) {
      args.windowMs = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--timeout-ms') {
      args.timeoutMs = parseInt(argv[++i], 10);
    } else if (arg.startsWith('--timeout-ms=')) {
      args.timeoutMs = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--all-relays-down-minutes') {
      args.allRelaysDownMinutes = parseInt(argv[++i], 10);
    } else if (arg.startsWith('--all-relays-down-minutes=')) {
      args.allRelaysDownMinutes = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--min-success-rate') {
      args.minSuccessRate = parseFloat(argv[++i]);
    } else if (arg.startsWith('--min-success-rate=')) {
      args.minSuccessRate = parseFloat(arg.split('=')[1]);
    } else if (arg === '--window-minutes') {
      args.windowMinutes = parseInt(argv[++i], 10);
    } else if (arg.startsWith('--window-minutes=')) {
      args.windowMinutes = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--platform') {
      args.platform = argv[++i];
    } else if (arg.startsWith('--platform=')) {
      args.platform = arg.split('=')[1];
    } else if (arg === '--model') {
      args.model = argv[++i];
    } else if (arg.startsWith('--model=')) {
      args.model = arg.split('=')[1];
    } else if (arg === '--target') {
      args.target = argv[++i];
    } else if (arg.startsWith('--target=')) {
      args.target = arg.split('=')[1];
    } else if (arg === '--content') {
      args.content = argv[++i];
    } else if (arg.startsWith('--content=')) {
      args.content = arg.split('=')[1];
    } else if (arg === '--reason') {
      args.reason = argv[++i];
    } else if (arg.startsWith('--reason=')) {
      args.reason = arg.split('=')[1];
    } else if (arg === '--strategy') {
      args.strategy = argv[++i];
    } else if (arg.startsWith('--strategy=')) {
      args.strategy = arg.split('=')[1];
    } else if (arg === '--status') {
      args.status = argv[++i];
    } else if (arg.startsWith('--status=')) {
      args.status = arg.split('=')[1];
    } else if (arg === '--list') {
      args.list = true;
    } else if (arg === '--output') {
      args.output = argv[++i];
    } else if (arg.startsWith('--output=')) {
      args.output = arg.split('=')[1];
    }
  }

  return args;
}
