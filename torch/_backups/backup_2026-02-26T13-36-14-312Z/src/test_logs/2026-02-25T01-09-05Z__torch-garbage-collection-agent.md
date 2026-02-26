---
agent: torch-garbage-collection-agent
cadence: daily
run-start: 2026-02-25T01:14:22Z
---
Prompt: src/prompts/daily/torch-garbage-collection-agent.md

# Command
`npm test`

# Result
```

> torch-lock@0.1.0 test
> npm run validate:scheduler && npm run test:integration:e2e && node --test --test-timeout=30000 test/*.test.mjs test/*.test.js


> torch-lock@0.1.0 validate:scheduler
> node scripts/validate-scheduler-roster.mjs && node scripts/validate-prompt-contract.mjs && node scripts/validate-scheduler-flow-parity.mjs && npm run validate:scheduler-failure-schema

Scheduler tables, roster, and prompt filenames are in sync.
Prompt contract validated for all daily/weekly prompts.
Scheduler flow parity validated for prompts and scheduler implementation.

> torch-lock@0.1.0 validate:scheduler-failure-schema
> node --test test/scheduler-lock-failure-schema.contract.test.mjs

TAP version 13
# Subtest: scheduler lock backend failure artifact matches required frontmatter schema
ok 1 - scheduler lock backend failure artifact matches required frontmatter schema
  ---
  duration_ms: 216.176922
  type: 'test'
  ...
# Subtest: schema contract catches missing required lock-backend field
ok 2 - schema contract catches missing required lock-backend field
  ---
  duration_ms: 2.77579
  type: 'test'
  ...
# Subtest: schema contract catches misnamed lock-backend key
ok 3 - schema contract catches misnamed lock-backend key
  ---
  duration_ms: 0.868814
  type: 'test'
  ...
1..3
# tests 3
# suites 0
# pass 3
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 356.740947

> torch-lock@0.1.0 test:integration:e2e
> node --test test/scheduler-preflight-lock.e2e.test.mjs

TAP version 13
# Subtest: lock preflight e2e: successful lock writes completed status snapshot
ok 1 - lock preflight e2e: successful lock writes completed status snapshot
  ---
  duration_ms: 448.761654
  type: 'test'
  ...
# Subtest: lock preflight e2e: exit code 2 quorum failure persists failed backend status and prompt-not-started marker
ok 2 - lock preflight e2e: exit code 2 quorum failure persists failed backend status and prompt-not-started marker
  ---
  duration_ms: 96.415329
  type: 'test'
  ...
# Subtest: lock preflight e2e: non-lock failure exits failed without prompt parse/schema classification
ok 3 - lock preflight e2e: non-lock failure exits failed without prompt parse/schema classification
  ---
  duration_ms: 92.832767
  type: 'test'
  ...
1..3
# tests 3
# suites 0
# pass 3
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 718.403434
TAP version 13
# Subtest: Build artifacts verification
ok 1 - Build artifacts verification # SKIP dist/ not found — run npm run build first
  ---
  duration_ms: 0.9823
  type: 'test'
  ...
# Subtest: parseArgs should parse basic command
ok 2 - parseArgs should parse basic command
  ---
  duration_ms: 1.723479
  type: 'test'
  ...
# Subtest: parseArgs should parse agent and cadence
ok 3 - parseArgs should parse agent and cadence
  ---
  duration_ms: 0.286818
  type: 'test'
  ...
# Subtest: parseArgs should parse equals sign syntax
ok 4 - parseArgs should parse equals sign syntax
  ---
  duration_ms: 1.33667
  type: 'test'
  ...
# Subtest: parseArgs should parse dry-run flag
ok 5 - parseArgs should parse dry-run flag
  ---
  duration_ms: 0.377617
  type: 'test'
  ...
# Subtest: parseArgs should parse port with default
ok 6 - parseArgs should parse port with default
  ---
  duration_ms: 0.213059
  type: 'test'
  ...
# Subtest: parseArgs should parse custom port
ok 7 - parseArgs should parse custom port
  ---
  duration_ms: 0.341731
  type: 'test'
  ...
# Subtest: parseArgs should parse ignore-logs flag
ok 8 - parseArgs should parse ignore-logs flag
  ---
  duration_ms: 0.261704
  type: 'test'
  ...
# Subtest: parseArgs should parse memory flags
ok 9 - parseArgs should parse memory flags
  ---
  duration_ms: 1.112554
  type: 'test'
  ...
# Subtest: parseArgs should parse memory flags with equals
ok 10 - parseArgs should parse memory flags with equals
  ---
  duration_ms: 0.592762
  type: 'test'
  ...
# Subtest: cmdList
    # Subtest: should list active locks and identify unknown agents
    ok 1 - should list active locks and identify unknown agents
      ---
      duration_ms: 1.782121
      type: 'test'
      ...
    1..1
ok 11 - cmdList
  ---
  duration_ms: 3.061381
  type: 'suite'
  ...
# No TORCH installation detected in this directory.
# Looked for:
#   - A torch/ subdirectory containing roster.json or bin/
#   - A package.json with name "torch-lock" (root install)
# Initializing torch in /app/test-ops-remove-tzlKTj/project-force/torch...
# Copying application directories...
#   Copied src/
#   Copied bin/
#   Copied dashboard/
#   Copied landing/
#   Copied assets/
#   Copied scripts/
# Copying application files...
#   Copied package.json
#   Copied build.mjs
#   Copied README.md
#   Copied torch-config.example.json
#   Copied TORCH.md
# Created torch/roster.json
# Created torch/META_PROMPTS.md
# Created torch/scheduler-flow.md
# Created torch/daily-scheduler.md
# Created torch/weekly-scheduler.md
# Created 23 files in torch/prompts/daily/
# Created 24 files in torch/prompts/weekly/
# Created test-ops-remove-tzlKTj/project-force/torch/.gitignore with node_modules
# Saved configuration to torch-config.json
# Created torch/TORCH_DASHBOARD.md
# No package.json found in host root. Skipping script injection.
# Initialization complete.
# You can now customize the files in torch/
# ● From torch-config.json:
#   - Hashtag: test-namespace-agent-lock
#   - Namespace: test-namespace
# https://torch.thepr0m3th3an.net/dashboard/?hashtag=test-namespace-agent-lock&namespace=test-namespace&relays=wss%3A%2F%2Frelay.damus.io
# The following TORCH artifacts will be removed:
#   - torch/  (TORCH install directory)
#   - torch-config.json
#   - .torch/  (prompt history)
#   - src/proposals/  (governance proposals)
#   - torch-lock npm package (via npm uninstall)
# Removing TORCH...
#   Removed torch/  (TORCH install directory)
#   Removed torch-config.json
#   Removed .torch/  (prompt history)
#   Removed src/proposals/  (governance proposals)
#   Removed empty src/ directory
#   Running npm uninstall torch-lock...
#   Uninstalled torch-lock package.
# TORCH has been completely removed from this project.
# If you used TORCH environment variables (NOSTR_LOCK_*, TORCH_*),
# remember to remove them from your shell profile or CI configuration.
# Initializing torch in /app/test-ops-remove-tzlKTj/project-runtime/torch...
# Copying application directories...
#   Copied src/
#   Copied bin/
#   Copied dashboard/
#   Copied landing/
#   Copied assets/
#   Copied scripts/
# Copying application files...
#   Copied package.json
#   Copied build.mjs
#   Copied README.md
#   Copied torch-config.example.json
#   Copied TORCH.md
# Created torch/roster.json
# Created torch/META_PROMPTS.md
# Created torch/scheduler-flow.md
# Created torch/daily-scheduler.md
# Created torch/weekly-scheduler.md
# Created 23 files in torch/prompts/daily/
# Created 24 files in torch/prompts/weekly/
# Created test-ops-remove-tzlKTj/project-runtime/torch/.gitignore with node_modules
# Saved configuration to torch-config.json
# Created torch/TORCH_DASHBOARD.md
# Initialization complete.
# You can now customize the files in torch/
# ● From torch-config.json:
#   - Hashtag: test-namespace-agent-lock
#   - Namespace: test-namespace
# No package.json found in host root. Skipping script injection.
# https://torch.thepr0m3th3an.net/dashboard/?hashtag=test-namespace-agent-lock&namespace=test-namespace&relays=wss%3A%2F%2Frelay.damus.io
# The following TORCH artifacts will be removed:
#   - torch/  (TORCH install directory)
#   - torch-config.json
#   - .torch/  (prompt history)
#   - .scheduler-memory/  (memory store)
#   - task-logs/  (scheduler logs)
#   - src/proposals/  (governance proposals)
#   - torch-lock npm package (via npm uninstall)
# Removing TORCH...
#   Removed torch/  (TORCH install directory)
#   Removed torch-config.json
#   Removed .torch/  (prompt history)
#   Removed .scheduler-memory/  (memory store)
#   Removed task-logs/  (scheduler logs)
#   Removed src/proposals/  (governance proposals)
#   Removed empty src/ directory
#   Running npm uninstall torch-lock...
#   Uninstalled torch-lock package.
# TORCH has been completely removed from this project.
# If you used TORCH environment variables (NOSTR_LOCK_*, TORCH_*),
# remember to remove them from your shell profile or CI configuration.
# Initializing torch in /app/test-ops-remove-tzlKTj/project-proposals/torch...
# Copying application directories...
#   Copied src/
#   Copied bin/
#   Copied dashboard/
#   Copied landing/
#   Copied assets/
#   Copied scripts/
# Copying application files...
#   Copied package.json
#   Copied build.mjs
#   Copied README.md
#   Copied torch-config.example.json
#   Copied TORCH.md
# Created torch/roster.json
# Created torch/META_PROMPTS.md
# Created torch/scheduler-flow.md
# Created torch/daily-scheduler.md
# Created torch/weekly-scheduler.md
# Created 23 files in torch/prompts/daily/
# Created 24 files in torch/prompts/weekly/
# Created test-ops-remove-tzlKTj/project-proposals/torch/.gitignore with node_modules
# Saved configuration to torch-config.json
# Created torch/TORCH_DASHBOARD.md
# Initialization complete.
# You can now customize the files in torch/
# ● From torch-config.json:
#   - Hashtag: test-namespace-agent-lock
#   - Namespace: test-namespace
# https://torch.thepr0m3th3an.net/dashboard/?hashtag=test-namespace-agent-lock&namespace=test-namespace&relays=wss%3A%2F%2Frelay.damus.io
# No package.json found in host root. Skipping script injection.
# The following TORCH artifacts will be removed:
#   - torch/  (TORCH install directory)
#   - torch-config.json
#   - .torch/  (prompt history)
#   - src/proposals/  (governance proposals)
#   - torch-lock npm package (via npm uninstall)
# Removing TORCH...
#   Removed torch/  (TORCH install directory)
#   Removed torch-config.json
#   Removed .torch/  (prompt history)
#   Removed src/proposals/  (governance proposals)
#   Removed empty src/ directory
#   Running npm uninstall torch-lock...
#   Uninstalled torch-lock package.
# TORCH has been completely removed from this project.
# If you used TORCH environment variables (NOSTR_LOCK_*, TORCH_*),
# remember to remove them from your shell profile or CI configuration.
# Initializing torch in /app/test-ops-remove-tzlKTj/project-scripts/torch...
# Copying application directories...
#   Copied src/
#   Copied bin/
#   Copied dashboard/
#   Copied landing/
#   Copied assets/
#   Copied scripts/
# Copying application files...
#   Copied package.json
#   Copied build.mjs
#   Copied README.md
#   Copied torch-config.example.json
#   Copied TORCH.md
# Created torch/roster.json
# Created torch/META_PROMPTS.md
# Created torch/scheduler-flow.md
# Created torch/daily-scheduler.md
# Created torch/weekly-scheduler.md
# Created 23 files in torch/prompts/daily/
# Created 24 files in torch/prompts/weekly/
# Created test-ops-remove-tzlKTj/project-scripts/torch/.gitignore with node_modules
# Saved configuration to torch-config.json
# Created torch/TORCH_DASHBOARD.md
#   Added script: "torch:dashboard"
#   Added script: "torch:check"
#   Added script: "torch:lock"
#   Added script: "torch:health"
#   Added script: "torch:memory:list"
#   Added script: "torch:memory:inspect"
# Updated package.json with convenience scripts.
# Initialization complete.
# You can now customize the files in torch/
# ● From torch-config.json:
#   - Hashtag: test-namespace-agent-lock
#   - Namespace: test-namespace
# https://torch.thepr0m3th3an.net/dashboard/?hashtag=test-namespace-agent-lock&namespace=test-namespace&relays=wss%3A%2F%2Frelay.damus.io
# The following TORCH artifacts will be removed:
#   - torch/  (TORCH install directory)
#   - torch-config.json
#   - .torch/  (prompt history)
#   - src/proposals/  (governance proposals)
#   - torch:* scripts from package.json
#   - torch-lock npm package (via npm uninstall)
# Removing TORCH...
#   Removed torch/  (TORCH install directory)
#   Removed torch-config.json
#   Removed .torch/  (prompt history)
#   Removed src/proposals/  (governance proposals)
#   Removed empty src/ directory
#   Removed script: "torch:dashboard"
#   Removed script: "torch:check"
#   Removed script: "torch:lock"
#   Removed script: "torch:health"
#   Removed script: "torch:memory:list"
#   Removed script: "torch:memory:inspect"
#   Updated package.json.
#   Running npm uninstall torch-lock...
#   Uninstalled torch-lock package.
# TORCH has been completely removed from this project.
# If you used TORCH environment variables (NOSTR_LOCK_*, TORCH_*),
# remember to remove them from your shell profile or CI configuration.
# Initializing torch in /app/test-ops-remove-tzlKTj/project-cancel/torch...
# Copying application directories...
#   Copied src/
#   Copied bin/
#   Copied dashboard/
#   Copied landing/
#   Copied assets/
#   Copied scripts/
# Copying application files...
#   Copied package.json
#   Copied build.mjs
#   Copied README.md
#   Copied torch-config.example.json
#   Copied TORCH.md
# Created torch/roster.json
# Created torch/META_PROMPTS.md
# Created torch/scheduler-flow.md
# Created torch/daily-scheduler.md
# Created torch/weekly-scheduler.md
# Created 23 files in torch/prompts/daily/
# Created 24 files in torch/prompts/weekly/
# Created test-ops-remove-tzlKTj/project-cancel/torch/.gitignore with node_modules
# Saved configuration to torch-config.json
# Created torch/TORCH_DASHBOARD.md
# Initialization complete.
# You can now customize the files in torch/
# ● From torch-config.json:
#   - Hashtag: test-namespace-agent-lock
#   - Namespace: test-namespace
# https://torch.thepr0m3th3an.net/dashboard/?hashtag=test-namespace-agent-lock&namespace=test-namespace&relays=wss%3A%2F%2Frelay.damus.io
# No package.json found in host root. Skipping script injection.
# The following TORCH artifacts will be removed:
#   - torch/  (TORCH install directory)
#   - torch-config.json
#   - .torch/  (prompt history)
#   - src/proposals/  (governance proposals)
#   - torch-lock npm package (via npm uninstall)
# Removal cancelled.
# Initializing torch in /app/test-ops-remove-tzlKTj/project-confirm/torch...
# Copying application directories...
#   Copied src/
#   Copied bin/
#   Copied dashboard/
#   Copied landing/
#   Copied assets/
#   Copied scripts/
# Copying application files...
#   Copied package.json
#   Copied build.mjs
#   Copied README.md
#   Copied torch-config.example.json
#   Copied TORCH.md
# Created torch/roster.json
# Created torch/META_PROMPTS.md
# Created torch/scheduler-flow.md
# Created torch/daily-scheduler.md
# Created torch/weekly-scheduler.md
# Created 23 files in torch/prompts/daily/
# Created 24 files in torch/prompts/weekly/
# Created test-ops-remove-tzlKTj/project-confirm/torch/.gitignore with node_modules
# Saved configuration to torch-config.json
# Created torch/TORCH_DASHBOARD.md
# Initialization complete.
# You can now customize the files in torch/
# ● From torch-config.json:
#   - Hashtag: test-namespace-agent-lock
#   - Namespace: test-namespace
# https://torch.thepr0m3th3an.net/dashboard/?hashtag=test-namespace-agent-lock&namespace=test-namespace&relays=wss%3A%2F%2Frelay.damus.io
# No package.json found in host root. Skipping script injection.
# The following TORCH artifacts will be removed:
#   - torch/  (TORCH install directory)
#   - torch-config.json
#   - .torch/  (prompt history)
#   - src/proposals/  (governance proposals)
#   - torch-lock npm package (via npm uninstall)
# Removing TORCH...
#   Removed torch/  (TORCH install directory)
#   Removed torch-config.json
#   Removed .torch/  (prompt history)
#   Removed src/proposals/  (governance proposals)
#   Removed empty src/ directory
#   Running npm uninstall torch-lock...
#   Uninstalled torch-lock package.
# TORCH has been completely removed from this project.
# If you used TORCH environment variables (NOSTR_LOCK_*, TORCH_*),
# remember to remove them from your shell profile or CI configuration.
# Subtest: cmdRemove reports nothing when no TORCH installation exists
ok 12 - cmdRemove reports nothing when no TORCH installation exists
  ---
  duration_ms: 3.141779
  type: 'test'
  ...
# Subtest: cmdRemove with --force removes torch/ directory
ok 13 - cmdRemove with --force removes torch/ directory
  ---
  duration_ms: 1608.459886
  type: 'test'
  ...
# Subtest: cmdRemove removes runtime artifacts (task-logs, .scheduler-memory)
ok 14 - cmdRemove removes runtime artifacts (task-logs, .scheduler-memory)
  ---
  duration_ms: 1851.350697
  type: 'test'
  ...
# Subtest: cmdRemove removes src/proposals/ and cleans empty src/
ok 15 - cmdRemove removes src/proposals/ and cleans empty src/
  ---
  duration_ms: 946.896612
  type: 'test'
  ...
# Subtest: cmdRemove cleans torch:* scripts from host package.json
ok 16 - cmdRemove cleans torch:* scripts from host package.json
  ---
  duration_ms: 565.320838
  type: 'test'
  ...
# Subtest: cmdRemove cancels when user declines confirmation
ok 17 - cmdRemove cancels when user declines confirmation
  ---
  duration_ms: 56.931062
  type: 'test'
  ...
# Subtest: cmdRemove confirmed via mockAnswers removes artifacts
ok 18 - cmdRemove confirmed via mockAnswers removes artifacts
  ---
  duration_ms: 1398.978495
  type: 'test'
  ...
# Dashboard running at http://127.0.0.1:0/dashboard/
# Authentication: enabled (Basic Auth)
# Serving files from /app
# Using configuration from /app
# NODE_V8_COVERAGE: undefined
# Subtest: Dashboard Authentication
    # Subtest: returns 401 when auth is required but missing
    ok 1 - returns 401 when auth is required but missing
      ---
      duration_ms: 37.828327
      type: 'test'
      ...
# Dashboard running at http://127.0.0.1:0/dashboard/
# Authentication: enabled (Basic Auth)
# Serving files from /app
# Using configuration from /app
# NODE_V8_COVERAGE: undefined
    # Subtest: returns 401 when malformed auth header is provided
    ok 2 - returns 401 when malformed auth header is provided
      ---
      duration_ms: 12.128521
      type: 'test'
      ...
# Dashboard running at http://127.0.0.1:0/dashboard/
# Authentication: enabled (Basic Auth)
# Serving files from /app
# Using configuration from /app
# NODE_V8_COVERAGE: undefined
    # Subtest: returns 200 when valid credentials are provided
    ok 3 - returns 200 when valid credentials are provided
      ---
      duration_ms: 10.177554
      type: 'test'
      ...
# Dashboard running at http://127.0.0.1:0/dashboard/
# Authentication: enabled (Basic Auth)
# Serving files from /app
# Using configuration from /app
# NODE_V8_COVERAGE: undefined
    # Subtest: returns 401 when password has different byte length than stored credential
    ok 4 - returns 401 when password has different byte length than stored credential
      ---
      duration_ms: 14.169149
      type: 'test'
      ...
# Dashboard running at http://127.0.0.1:0/dashboard/
# Serving files from /app
# Using configuration from /app
# NODE_V8_COVERAGE: undefined
# Authentication: DISABLED (Dashboard is public)
    # Subtest: returns 200 when auth is disabled
    ok 5 - returns 200 when auth is disabled
      ---
      duration_ms: 6.328856
      type: 'test'
      ...
    1..5
ok 19 - Dashboard Authentication
  ---
  duration_ms: 84.736063
  type: 'test'
  ...
# Dashboard running at http://127.0.0.1:0/dashboard/
# Authentication: DISABLED (Dashboard is public)
# Serving files from /app
# Using configuration from /app
# NODE_V8_COVERAGE: undefined
# Subtest: Dashboard Configuration Exposure Security
ok 20 - Dashboard Configuration Exposure Security
  ---
  duration_ms: 39.973126
  type: 'test'
  ...
# Dashboard running at http://127.0.0.1:0/dashboard/
# Authentication: DISABLED (Dashboard is public)
# Serving files from /app
# Using configuration from /app
# NODE_V8_COVERAGE: undefined
# Subtest: Dashboard Configuration Security
    # Subtest: sanitizes config when auth is disabled
    ok 1 - sanitizes config when auth is disabled
      ---
      duration_ms: 33.687567
      type: 'test'
      ...
# Dashboard running at http://127.0.0.1:0/dashboard/
# Authentication: enabled (Basic Auth)
# Serving files from /app
# Using configuration from /app
# NODE_V8_COVERAGE: undefined
    # Subtest: sanitizes auth credentials even when authenticated
    ok 2 - sanitizes auth credentials even when authenticated
      ---
      duration_ms: 16.030823
      type: 'test'
      ...
    1..2
ok 21 - Dashboard Configuration Security
  ---
  duration_ms: 52.194272
  type: 'test'
  ...
# Dashboard running at http://127.0.0.1:0/dashboard/
# Authentication: DISABLED (Dashboard is public)
# Serving files from /app
# Using configuration from /app
# NODE_V8_COVERAGE: undefined
# Dashboard running at http://127.0.0.1:0/dashboard/
# Authentication: DISABLED (Dashboard is public)
# Serving files from /app
# Using configuration from /app
# NODE_V8_COVERAGE: undefined
# Subtest: Dashboard Path Traversal Security Fix
    # Subtest: allows access to valid dashboard index
    ok 1 - allows access to valid dashboard index
      ---
      duration_ms: 53.21702
      type: 'test'
      ...
# Dashboard running at http://127.0.0.1:0/dashboard/
# Authentication: DISABLED (Dashboard is public)
# Serving files from /app
# Using configuration from /app
# NODE_V8_COVERAGE: undefined
    # Subtest: blocks traversal attempt: /../../etc/passwd
    ok 2 - blocks traversal attempt: /../../etc/passwd
      ---
      duration_ms: 9.769779
      type: 'test'
      ...
# Dashboard running at http://127.0.0.1:0/dashboard/
# Authentication: DISABLED (Dashboard is public)
# Serving files from /app
# Using configuration from /app
# NODE_V8_COVERAGE: undefined
    # Subtest: blocks traversal attempt: /dashboard/../../etc/passwd
    ok 3 - blocks traversal attempt: /dashboard/../../etc/passwd
      ---
      duration_ms: 10.145221
      type: 'test'
      ...
# Dashboard running at http://127.0.0.1:0/dashboard/
# Authentication: DISABLED (Dashboard is public)
# Serving files from /app
# Using configuration from /app
# NODE_V8_COVERAGE: undefined
    # Subtest: blocks traversal attempt: /dashboard/../../../etc/passwd
    ok 4 - blocks traversal attempt: /dashboard/../../../etc/passwd
      ---
      duration_ms: 10.016108
      type: 'test'
      ...
# Dashboard running at http://127.0.0.1:0/dashboard/
# Serving files from /app
# Using configuration from /app
# Authentication: DISABLED (Dashboard is public)
# NODE_V8_COVERAGE: undefined
    # Subtest: blocks traversal attempt: /../package.json
    ok 5 - blocks traversal attempt: /../package.json
      ---
      duration_ms: 11.688775
      type: 'test'
      ...
# Dashboard running at http://127.0.0.1:0/dashboard/
# Serving files from /app
# Using configuration from /app
# NODE_V8_COVERAGE: undefined
# Authentication: DISABLED (Dashboard is public)
    # Subtest: blocks traversal attempt: /dashboard/../package.json
    ok 6 - blocks traversal attempt: /dashboard/../package.json
      ---
      duration_ms: 6.027403
      type: 'test'
      ...
# Authentication: DISABLED (Dashboard is public)
# Dashboard running at http://127.0.0.1:0/dashboard/
# Serving files from /app
# Using configuration from /app
# NODE_V8_COVERAGE: undefined
    # Subtest: blocks traversal attempt: /dashboard/%2e%2e/package.json
    ok 7 - blocks traversal attempt: /dashboard/%2e%2e/package.json
      ---
      duration_ms: 5.326895
      type: 'test'
      ...
# Dashboard running at http://127.0.0.1:0/dashboard/
# Serving files from /app
# Using configuration from /app
# NODE_V8_COVERAGE: undefined
# Authentication: DISABLED (Dashboard is public)
    # Subtest: blocks traversal attempt: /dashboard/%2e%2e%2fpackage.json
    ok 8 - blocks traversal attempt: /dashboard/%2e%2e%2fpackage.json
      ---
      duration_ms: 6.558447
      type: 'test'
      ...
# Authentication: DISABLED (Dashboard is public)
# Dashboard running at http://127.0.0.1:0/dashboard/
# Serving files from /app
# Using configuration from /app
# NODE_V8_COVERAGE: undefined
    # Subtest: blocks traversal attempt: /..%2fpackage.json
    ok 9 - blocks traversal attempt: /..%2fpackage.json
      ---
      duration_ms: 10.823708
      type: 'test'
      ...
# Dashboard running at http://127.0.0.1:0/dashboard/
# Serving files from /app
# Authentication: DISABLED (Dashboard is public)
# Using configuration from /app
# NODE_V8_COVERAGE: undefined
# (node:3283) MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11 SIGTERM listeners added to [process]. MaxListeners is 10. Use emitter.setMaxListeners() to increase limit
# (Use `node --trace-warnings ...` to show where the warning was created)
# (node:3283) MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11 SIGINT listeners added to [process]. MaxListeners is 10. Use emitter.setMaxListeners() to increase limit
    # Subtest: blocks traversal attempt: /%2e%2e%2fpackage.json
    ok 10 - blocks traversal attempt: /%2e%2e%2fpackage.json
      ---
      duration_ms: 6.31247
      type: 'test'
      ...
# Dashboard running at http://127.0.0.1:0/dashboard/
# Authentication: DISABLED (Dashboard is public)
# Serving files from /app
# Using configuration from /app
# NODE_V8_COVERAGE: undefined
    # Subtest: blocks traversal attempt: /dashboard/..%5cpackage.json
    ok 11 - blocks traversal attempt: /dashboard/..%5cpackage.json
      ---
      duration_ms: 7.752655
      type: 'test'
      ...
# Authentication: DISABLED (Dashboard is public)
# Dashboard running at http://127.0.0.1:0/dashboard/
# Serving files from /app
# Using configuration from /app
# NODE_V8_COVERAGE: undefined
    # Subtest: blocks traversal attempt: /dashboard/..%252fpackage.json
    ok 12 - blocks traversal attempt: /dashboard/..%252fpackage.json
      ---
      duration_ms: 8.170937
      type: 'test'
      ...
# Dashboard running at http://127.0.0.1:0/dashboard/
# Serving files from /app
# Using configuration from /app
# NODE_V8_COVERAGE: undefined
# Authentication: DISABLED (Dashboard is public)
    # Subtest: blocks traversal attempt: /dashboard/....//package.json
    ok 13 - blocks traversal attempt: /dashboard/....//package.json
      ---
      duration_ms: 4.798912
      type: 'test'
      ...
# Dashboard running at http://127.0.0.1:0/dashboard/
# Serving files from /app
# Using configuration from /app
# NODE_V8_COVERAGE: undefined
# Authentication: DISABLED (Dashboard is public)
    # Subtest: blocks traversal attempt: /dashboard/.../package.json
    ok 14 - blocks traversal attempt: /dashboard/.../package.json
      ---
      duration_ms: 4.216188
      type: 'test'
      ...
# Authentication: DISABLED (Dashboard is public)
# Dashboard running at http://127.0.0.1:0/dashboard/
# Serving files from /app
# Using configuration from /app
# NODE_V8_COVERAGE: undefined
    # Subtest: blocks traversal attempt: //etc/passwd
    ok 15 - blocks traversal attempt: //etc/passwd
      ---
      duration_ms: 4.003082
      type: 'test'
      ...
# Authentication: DISABLED (Dashboard is public)
# Dashboard running at http://127.0.0.1:0/dashboard/
# Serving files from /app
# Using configuration from /app
# NODE_V8_COVERAGE: undefined
    # Subtest: blocks traversal attempt: /dashboard//../../etc/passwd
    ok 16 - blocks traversal attempt: /dashboard//../../etc/passwd
      ---
      duration_ms: 5.032897
      type: 'test'
      ...
    # Subtest: allows traversal within allowed paths
    ok 17 - allows traversal within allowed paths
      ---
      duration_ms: 12.093905
      type: 'test'
      ...
    1..17
ok 22 - Dashboard Path Traversal Security Fix
  ---
  duration_ms: 183.562317
  type: 'test'
  ...
# Dashboard running at http://127.0.0.1:0/dashboard/
# Authentication: DISABLED (Dashboard is public)
# Serving files from /app
# Using configuration from /app
# NODE_V8_COVERAGE: undefined
# Dashboard running at http://127.0.0.1:0/dashboard/
# Authentication: DISABLED (Dashboard is public)
# Serving files from /app
# Using configuration from /app
# NODE_V8_COVERAGE: undefined
# Subtest: Dashboard File Access Security
    # Subtest: allows access to dashboard assets
    ok 1 - allows access to dashboard assets
      ---
      duration_ms: 30.202881
      type: 'test'
      ...
# Dashboard running at http://127.0.0.1:0/dashboard/
# Serving files from /app
# Using configuration from /app
# NODE_V8_COVERAGE: undefined
# Authentication: DISABLED (Dashboard is public)
    # Subtest: allows access to global assets
    ok 2 - allows access to global assets
      ---
      duration_ms: 12.491852
      type: 'test'
      ...
# Dashboard running at http://127.0.0.1:0/dashboard/
# Serving files from /app
# Using configuration from /app
# NODE_V8_COVERAGE: undefined
# Authentication: DISABLED (Dashboard is public)
    # Subtest: allows access to landing page
    ok 3 - allows access to landing page
      ---
      duration_ms: 6.88303
      type: 'test'
      ...
# Dashboard running at http://127.0.0.1:0/dashboard/
# Serving files from /app
# Using configuration from /app
# NODE_V8_COVERAGE: undefined
# Authentication: DISABLED (Dashboard is public)
    # Subtest: blocks access to package.json
    ok 4 - blocks access to package.json
      ---
      duration_ms: 7.435774
      type: 'test'
      ...
# Dashboard running at http://127.0.0.1:0/dashboard/
# Authentication: DISABLED (Dashboard is public)
# Serving files from /app
# Using configuration from /app
# NODE_V8_COVERAGE: undefined
    # Subtest: blocks access to src/dashboard.mjs
    ok 5 - blocks access to src/dashboard.mjs
      ---
      duration_ms: 6.588251
      type: 'test'
      ...
# Dashboard running at http://127.0.0.1:0/dashboard/
# Authentication: DISABLED (Dashboard is public)
# Serving files from /app
# Using configuration from /app
# NODE_V8_COVERAGE: undefined
    # Subtest: blocks access to random root files
    ok 6 - blocks access to random root files
      ---
      duration_ms: 4.200214
      type: 'test'
      ...
# Dashboard running at http://127.0.0.1:0/dashboard/
# Authentication: DISABLED (Dashboard is public)
# Serving files from /app
# Using configuration from /app
# NODE_V8_COVERAGE: undefined
    # Subtest: allows access to torch-config.json via special handler
    ok 7 - allows access to torch-config.json via special handler
      ---
      duration_ms: 5.104602
      type: 'test'
      ...
# Authentication: DISABLED (Dashboard is public)
# Dashboard running at http://127.0.0.1:0/dashboard/
# Serving files from /app
# Using configuration from /app
# NODE_V8_COVERAGE: undefined
    # Subtest: blocks directory traversal attempts
    ok 8 - blocks directory traversal attempts
      ---
      duration_ms: 3.690533
      type: 'test'
      ...
# Dashboard running at http://127.0.0.1:0/dashboard/
# Serving files from /app
# Authentication: DISABLED (Dashboard is public)
# Using configuration from /app
# NODE_V8_COVERAGE: undefined
    # Subtest: responses include security headers
    ok 9 - responses include security headers
      ---
      duration_ms: 7.367902
      type: 'test'
      ...
    # Subtest: error responses include security headers
    ok 10 - error responses include security headers
      ---
      duration_ms: 12.047376
      type: 'test'
      ...
    1..10
ok 23 - Dashboard File Access Security
  ---
  duration_ms: 100.84208
  type: 'test'
  ...
# Subtest: ExitError
    # Subtest: should capture the code and message correctly
    ok 1 - should capture the code and message correctly
      ---
      duration_ms: 1.596378
      type: 'test'
      ...
    # Subtest: should be an instance of Error and ExitError
    ok 2 - should be an instance of Error and ExitError
      ---
      duration_ms: 0.507335
      type: 'test'
      ...
    # Subtest: should have a stack trace
    ok 3 - should have a stack trace
      ---
      duration_ms: 0.68058
      type: 'test'
      ...
    # Subtest: should have the correct name
    ok 4 - should have the correct name
      ---
      duration_ms: 0.365796
      type: 'test'
      ...
    1..4
ok 24 - ExitError
  ---
  duration_ms: 5.599184
  type: 'suite'
  ...
# Subtest: createProposal should throw error for disallowed target
ok 25 - createProposal should throw error for disallowed target
  ---
  duration_ms: 11.015973
  type: 'test'
  ...
# Subtest: validateProposal should return invalid for disallowed target
ok 26 - validateProposal should return invalid for disallowed target
  ---
  duration_ms: 16.202688
  type: 'test'
  ...
# Subtest: validateProposal should return valid for allowed target
ok 27 - validateProposal should return valid for allowed target
  ---
  duration_ms: 7.063384
  type: 'test'
  ...
# Subtest: Governance Service Security: Command Injection Prevention
ok 28 - Governance Service Security: Command Injection Prevention
  ---
  duration_ms: 250.767066
  type: 'test'
  ...
# Subtest: SCN-proposal-create: createProposal writes meta.json, new.md, change.diff
ok 29 - SCN-proposal-create: createProposal writes meta.json, new.md, change.diff
  ---
  duration_ms: 32.231796
  type: 'test'
  ...
# Subtest: SCN-proposal-list: listProposals returns created proposal; status filter works
ok 30 - SCN-proposal-list: listProposals returns created proposal; status filter works
  ---
  duration_ms: 3.732415
  type: 'test'
  ...
# Subtest: SCN-proposal-reject: rejectProposal marks proposal with rejected status and reason
ok 31 - SCN-proposal-reject: rejectProposal marks proposal with rejected status and reason
  ---
  duration_ms: 23.611083
  type: 'test'
  ...
# Subtest: SCN-archive-naming: applyProposal archives with timestamp_hash filename and sidecar
ok 32 - SCN-archive-naming: applyProposal archives with timestamp_hash filename and sidecar
  ---
  duration_ms: 68.503324
  type: 'test'
  ...
# Subtest: SCN-version-list: listPromptVersions returns versions newest-first with metadata
ok 33 - SCN-version-list: listPromptVersions returns versions newest-first with metadata
  ---
  duration_ms: 23.649955
  type: 'test'
  ...
# Subtest: SCN-rollback-latest: rollbackPrompt restores the most recently archived content
ok 34 - SCN-rollback-latest: rollbackPrompt restores the most recently archived content
  ---
  duration_ms: 11.094115
  type: 'test'
  ...
# Subtest: SCN-rollback-hash: rollbackPrompt --strategy <fragment> restores matching archive
ok 35 - SCN-rollback-hash: rollbackPrompt --strategy <fragment> restores matching archive
  ---
  duration_ms: 8.287898
  type: 'test'
  ...
# Initializing torch in /app/test_validation_env/valid-dir_123...
# Copying application directories...
#   Copied src/
#   Copied bin/
#   Copied dashboard/
#   Copied landing/
#   Copied assets/
#   Copied scripts/
# Copying application files...
#   Copied package.json
#   Copied build.mjs
#   Copied README.md
#   Copied torch-config.example.json
#   Copied TORCH.md
# Created valid-dir_123/roster.json
# Created valid-dir_123/META_PROMPTS.md
# Created valid-dir_123/scheduler-flow.md
# Created valid-dir_123/daily-scheduler.md
# Created valid-dir_123/weekly-scheduler.md
# Created 23 files in valid-dir_123/prompts/daily/
# Created 24 files in valid-dir_123/prompts/weekly/
# Created test_validation_env/valid-dir_123/.gitignore with node_modules
# Saved configuration to torch-config.json
# Created valid-dir_123/TORCH_DASHBOARD.md
#   Added script: "torch:dashboard"
#   Added script: "torch:check"
#   Added script: "torch:lock"
#   Added script: "torch:health"
#   Added script: "torch:memory:list"
#   Added script: "torch:memory:inspect"
# Updated package.json with convenience scripts.
# Initialization complete.
# You can now customize the files in valid-dir_123/
# ● From torch-config.json:
#   - Hashtag: ns-agent-lock
#   - Namespace: ns
# https://torch.thepr0m3th3an.net/dashboard/?hashtag=ns-agent-lock&namespace=ns&relays=
# Initializing torch in /app/test_validation_env...
# Copying application directories...
#   Copied src/
#   Copied bin/
#   Copied dashboard/
#   Copied landing/
#   Copied assets/
#   Copied scripts/
# Copying application files...
#   Skipping package.json to avoid overwriting host package.json (installing to root).
#   Copied build.mjs
#   Copied README.md
#   Copied torch-config.example.json
#   Copied TORCH.md
# Created roster.json
# Created META_PROMPTS.md
# Created scheduler-flow.md
# Created daily-scheduler.md
# Created weekly-scheduler.md
# Created 23 files in prompts/daily/
# Created 24 files in prompts/weekly/
# Created test_validation_env/.gitignore with node_modules
# Updating existing torch-config.json...
# Saved configuration to torch-config.json
# Created TORCH_DASHBOARD.md
# Initialization complete.
# You can now customize the files in /
# ● From torch-config.json:
#   - Hashtag: ns-agent-lock
#   - Namespace: ns
# https://torch.thepr0m3th3an.net/dashboard/?hashtag=ns-agent-lock&namespace=ns&relays=
# Initializing torch in /app/test_validation_env/path/to/torch...
# Copying application directories...
#   Copied src/
#   Copied bin/
#   Copied dashboard/
#   Copied landing/
#   Copied assets/
#   Copied scripts/
# Copying application files...
#   Copied package.json
#   Copied build.mjs
#   Copied README.md
#   Copied torch-config.example.json
#   Copied TORCH.md
# Created path/to/torch/roster.json
# Created path/to/torch/META_PROMPTS.md
# Created path/to/torch/scheduler-flow.md
# Created path/to/torch/daily-scheduler.md
# Created path/to/torch/weekly-scheduler.md
# Created 23 files in path/to/torch/prompts/daily/
# Created 24 files in path/to/torch/prompts/weekly/
# Created test_validation_env/path/to/torch/.gitignore with node_modules
# Updating existing torch-config.json...
# Saved configuration to torch-config.json
# Created path/to/torch/TORCH_DASHBOARD.md
#   Script "torch:dashboard" already exists, skipping.
#   Script "torch:check" already exists, skipping.
#   Script "torch:lock" already exists, skipping.
#   Script "torch:health" already exists, skipping.
#   Script "torch:memory:list" already exists, skipping.
#   Script "torch:memory:inspect" already exists, skipping.
# Initialization complete.
# You can now customize the files in path/to/torch/
# ● From torch-config.json:
#   - Hashtag: ns-agent-lock
#   - Namespace: ns
# https://torch.thepr0m3th3an.net/dashboard/?hashtag=ns-agent-lock&namespace=ns&relays=
# Subtest: cmdInit should validate install directory name
    # Subtest: should reject directory with semicolon
    ok 1 - should reject directory with semicolon
      ---
      duration_ms: 2.593153
      type: 'test'
      ...
    # Subtest: should reject directory with spaces
    ok 2 - should reject directory with spaces
      ---
      duration_ms: 0.643525
      type: 'test'
      ...
    # Subtest: should reject directory with quotes
    ok 3 - should reject directory with quotes
      ---
      duration_ms: 0.664403
      type: 'test'
      ...
    # Subtest: should reject directory with backticks
    ok 4 - should reject directory with backticks
      ---
      duration_ms: 0.521068
      type: 'test'
      ...
    # Subtest: should reject directory with $
    ok 5 - should reject directory with $
      ---
      duration_ms: 0.798427
      type: 'test'
      ...
    # Subtest: should accept valid directory names
    ok 6 - should accept valid directory names
      ---
      duration_ms: 85.250639
      type: 'test'
      ...
    # Subtest: should accept "."
    ok 7 - should accept "."
      ---
      duration_ms: 73.123885
      type: 'test'
      ...
    # Subtest: should accept nested paths with slashes
    ok 8 - should accept nested paths with slashes
      ---
      duration_ms: 85.711133
      type: 'test'
      ...
    1..8
ok 36 - cmdInit should validate install directory name
  ---
  duration_ms: 363.717582
  type: 'test'
  ...
# Subtest: src/lib.mjs
    # Subtest: cmdCheck
        # Subtest: returns correct structure with empty locks
        ok 1 - returns correct structure with empty locks
          ---
          duration_ms: 5.655988
          type: 'test'
          ...
        # Subtest: identifies locked agents
        ok 2 - identifies locked agents
          ---
          duration_ms: 1.109669
          type: 'test'
          ...
        # Subtest: excludes paused agents
        ok 3 - excludes paused agents
          ---
          duration_ms: 2.02333
          type: 'test'
          ...
        # Subtest: identifies unknown locked agents
        ok 4 - identifies unknown locked agents
          ---
          duration_ms: 1.28614
          type: 'test'
          ...
        # Subtest: suppresses relay query loggers when quiet mode is enabled
        ok 5 - suppresses relay query loggers when quiet mode is enabled
          ---
          duration_ms: 1.677808
          type: 'test'
          ...
        1..5
    ok 1 - cmdCheck
      ---
      duration_ms: 14.039339
      type: 'suite'
      ...
    # Subtest: cmdLock
        # Subtest: successfully locks an available agent
        ok 1 - successfully locks an available agent
          ---
          duration_ms: 44.569029
          type: 'test'
          ...
        # Subtest: fails if agent is not in roster
        ok 2 - fails if agent is not in roster
          ---
          duration_ms: 14.07864
          type: 'test'
          ...
        # Subtest: fails if agent is already locked
        ok 3 - fails if agent is already locked
          ---
          duration_ms: 13.34696
          type: 'test'
          ...
        # Subtest: fails if agent is already completed
        ok 4 - fails if agent is already completed
          ---
          duration_ms: 12.065554
          type: 'test'
          ...
        # Subtest: fails if race check is lost
        ok 5 - fails if race check is lost
          ---
          duration_ms: 14.012332
          type: 'test'
          ...
        # Subtest: handles race condition with identical timestamps using eventId tie-breaker (we win)
        ok 6 - handles race condition with identical timestamps using eventId tie-breaker (we win)
          ---
          duration_ms: 34.662566
          type: 'test'
          ...
        # Subtest: handles race condition with identical timestamps using eventId tie-breaker (we lose)
        ok 7 - handles race condition with identical timestamps using eventId tie-breaker (we lose)
          ---
          duration_ms: 14.531343
          type: 'test'
          ...
        # Subtest: dry run does not publish
        ok 8 - dry run does not publish
          ---
          duration_ms: 11.350324
          type: 'test'
          ...
        1..8
    ok 2 - cmdLock
      ---
      duration_ms: 161.036399
      type: 'suite'
      ...
    # Subtest: cmdList
        # Subtest: lists active locks
        ok 1 - lists active locks
          ---
          duration_ms: 1.66182
          type: 'test'
          ...
        # Subtest: warns about unknown agents
        ok 2 - warns about unknown agents
          ---
          duration_ms: 0.715108
          type: 'test'
          ...
        # Subtest: handles no locks
        ok 3 - handles no locks
          ---
          duration_ms: 0.568862
          type: 'test'
          ...
        1..3
    ok 3 - cmdList
      ---
      duration_ms: 3.301729
      type: 'suite'
      ...
    # Subtest: cmdComplete
        # Subtest: successfully completes an active lock
        ok 1 - successfully completes an active lock
          ---
          duration_ms: 1.85533
          type: 'test'
          ...
        # Subtest: fails if no active lock found
        ok 2 - fails if no active lock found
          ---
          duration_ms: 0.905457
          type: 'test'
          ...
        # Subtest: detects already completed task
        ok 3 - detects already completed task
          ---
          duration_ms: 0.919785
          type: 'test'
          ...
        1..3
    ok 4 - cmdComplete
      ---
      duration_ms: 4.04904
      type: 'suite'
      ...
    1..4
ok 37 - src/lib.mjs
  ---
  duration_ms: 184.21814
  type: 'suite'
  ...
# [publish:primary] Publishing to 3 relays (wss://relay-a, wss://relay-b, wss://relay-c)...
# [publish:primary] Publishing to 3 relays (wss://relay-a, wss://relay-b, wss://relay-c)...
# [publish:primary] Publishing to 3 relays (wss://relay-a, wss://relay-b, wss://relay-c)...
# [publish:primary] Publishing to 3 relays (wss://relay-a, wss://relay-b, wss://relay-c)...
#   Published to 1/3 relays (required=1, timeout=25ms)
# [publish:primary] Publishing to 2 relays (wss://relay-a, wss://relay-b)...
# [publish:primary] Publishing to 2 relays (wss://relay-a, wss://relay-b)...
#   Published to 2/2 relays (required=2, timeout=25ms)
# [publish:primary] Publishing to 3 relays (wss://relay-a, wss://relay-b, wss://relay-c)...
# [publish:primary] Publishing to 3 relays (wss://relay-a, wss://relay-b, wss://relay-c)...
# [publish:primary] Publishing to 3 relays (wss://relay-a, wss://relay-b, wss://relay-c)...
# [publish:primary] Publishing to 3 relays (wss://relay-a, wss://relay-b, wss://relay-c)...
#   Published to 2/3 relays (required=2, timeout=25ms)
# (node:3462) ExperimentalWarning: The MockTimers API is an experimental feature and might change at any time
# (Use `node --trace-warnings ...` to show where the warning was created)
# Subtest: ci-resilience lock acquisition under unstable relays
    # Subtest: recovers after all relays are down for an initial outage window
    ok 1 - recovers after all relays are down for an initial outage window
      ---
      duration_ms: 38.965106
      type: 'test'
      ...
    # Subtest: survives intermittent timeout spikes and reaches quorum with bounded retries
    ok 2 - survives intermittent timeout spikes and reaches quorum with bounded retries
      ---
      duration_ms: 3.118097
      type: 'test'
      ...
    # Subtest: handles staggered relay recovery and never exceeds retry budget
    ok 3 - handles staggered relay recovery and never exceeds retry budget
      ---
      duration_ms: 6.569613
      type: 'test'
      ...
    1..3
ok 38 - ci-resilience lock acquisition under unstable relays
  ---
  duration_ms: 51.830322
  type: 'suite'
  ...
# [publish:primary] Publishing to 1 relays (wss://relay-a)...
#   Published to 1/1 relays (required=1, timeout=200ms)
# [publish:primary] Publishing to 1 relays (wss://relay-a)...
# [publish:primary] Publishing to 1 relays (wss://relay-a)...
#   Published to 1/1 relays (required=1, timeout=200ms)
# [publish:primary] Publishing to 1 relays (wss://relay-a)...
# [publish:primary] Publishing to 1 relays (wss://relay-a)...
# [publish:primary] Publishing to 1 relays (wss://relay-a)...
# [publish:primary] Publishing to 1 relays (wss://relay-a)...
# (node:3463) ExperimentalWarning: The MockTimers API is an experimental feature and might change at any time
# (Use `node --trace-warnings ...` to show where the warning was created)
# Subtest: publishLock retry behavior
    # Subtest: succeeds immediately on first attempt without retries
    ok 1 - succeeds immediately on first attempt without retries
      ---
      duration_ms: 13.042575
      type: 'test'
      ...
    # Subtest: retries a transient failure then succeeds within retry budget with bounded jitter
    ok 2 - retries a transient failure then succeeds within retry budget with bounded jitter
      ---
      duration_ms: 5.108885
      type: 'test'
      ...
    # Subtest: returns terminal relay_publish_quorum_failure after exhausting retry budget
    ok 3 - returns terminal relay_publish_quorum_failure after exhausting retry budget
      ---
      duration_ms: 6.263437
      type: 'test'
      ...
    # Subtest: short-circuits non-retryable failures without extra attempts
    ok 4 - short-circuits non-retryable failures without extra attempts
      ---
      duration_ms: 3.811783
      type: 'test'
      ...
    1..4
ok 39 - publishLock retry behavior
  ---
  duration_ms: 31.673272
  type: 'suite'
  ...
# Subtest: lock-ops
    # Subtest: parseLockEvent
        # Subtest: parses a valid lock event correctly
        ok 1 - parses a valid lock event correctly
          ---
          duration_ms: 2.819545
          type: 'test'
          ...
        # Subtest: returns nulls when content is invalid JSON
        ok 2 - returns nulls when content is invalid JSON
          ---
          duration_ms: 1.161902
          type: 'test'
          ...
        # Subtest: returns nulls when required content fields are missing
        ok 3 - returns nulls when required content fields are missing
          ---
          duration_ms: 0.583411
          type: 'test'
          ...
        # Subtest: returns nulls when content is an array (not object)
        ok 4 - returns nulls when content is an array (not object)
          ---
          duration_ms: 0.893359
          type: 'test'
          ...
        1..4
    ok 1 - parseLockEvent
      ---
      duration_ms: 7.531081
      type: 'suite'
      ...
# [publish:primary] Publishing to 2 relays (wss://primary-a, wss://primary-b)...
# [publish:primary] Publishing to 2 relays (wss://primary-a, wss://primary-b)...
#   Published to 2/2 relays (required=1, timeout=200ms)
# [publish:primary] Publishing to 1 relays (wss://primary-down)...
# [publish:primary] Publishing to 1 relays (wss://primary-down)...
# [publish:primary] Publishing to 1 relays (wss://primary-down)...
# [publish:primary] Publishing to 1 relays (wss://primary-bad)...
# [publish:primary] Publishing to 5 relays (relay-timeout, wss://dns, wss://tcp, wss://tls, wss://ws)...
# [publish:primary] Publishing to 2 relays (wss://relay-bad, wss://relay-ok)...
# {"event":"lock_publish_quorum_met","correlationId":"9c33289c-b5ab-4319-91a0-2a11f47b6655","attemptId":"a23c5459-a61e-4e4b-a4e6-11ff71d54afa","publishAttempt":1,"successCount":1,"relayAttemptedCount":2,"requiredSuccesses":1,"timeoutMs":200,"retryTimeline":[{"publishAttempt":1,"successCount":1,"relayAttemptedCount":2,"elapsedMs":1}],"totalElapsedMs":1}
#   Published to 1/2 relays (required=1, timeout=200ms)
# [publish:primary] Publishing to 1 relays (wss://primary-bad)...
# [publish:fallback] Publishing to 1 relays (wss://fallback-ok)...
# {"event":"lock_publish_quorum_met","correlationId":"29ae49ed-68ae-4aef-b9eb-880ce387dccd","attemptId":"d9e1500d-a6d9-4daf-9124-6c2e0a9563a7","publishAttempt":1,"successCount":1,"relayAttemptedCount":2,"requiredSuccesses":1,"timeoutMs":200,"retryTimeline":[{"publishAttempt":1,"successCount":1,"relayAttemptedCount":2,"elapsedMs":1}],"totalElapsedMs":1}
#   Published to 1/2 relays (required=1, timeout=200ms)
# [publish:primary] Publishing to 2 relays (wss://bad, wss://healthy)...
# {"event":"lock_publish_quorum_met","correlationId":"19d30296-3ce2-4e57-a21b-5183d29ad0bb","attemptId":"7d5d477d-3686-4f37-b96e-728fbe27e118","publishAttempt":1,"successCount":1,"relayAttemptedCount":2,"requiredSuccesses":1,"timeoutMs":200,"retryTimeline":[{"publishAttempt":1,"successCount":1,"relayAttemptedCount":2,"elapsedMs":0}],"totalElapsedMs":0}
#   Published to 1/2 relays (required=1, timeout=200ms)
# [publish:primary] Publishing to 2 relays (wss://healthy, wss://bad)...
# {"event":"lock_publish_quorum_met","correlationId":"f0937067-32d9-4b45-b8bd-57779154a5ee","attemptId":"bc3ff25b-83e6-467b-8179-73bc1c4398ac","publishAttempt":1,"successCount":1,"relayAttemptedCount":2,"requiredSuccesses":1,"timeoutMs":200,"retryTimeline":[{"publishAttempt":1,"successCount":1,"relayAttemptedCount":2,"elapsedMs":0}],"totalElapsedMs":0}
#   Published to 1/2 relays (required=1, timeout=200ms)
# [publish:primary] Publishing to 1 relays (wss://healthy)...
# {"event":"lock_publish_quorum_met","correlationId":"0cc2cafc-baf1-4bbb-969c-f64ddd531c65","attemptId":"1c317e24-dd8e-4637-ab07-0e3bae47ab43","publishAttempt":1,"successCount":1,"relayAttemptedCount":1,"requiredSuccesses":1,"timeoutMs":200,"retryTimeline":[{"publishAttempt":1,"successCount":1,"relayAttemptedCount":1,"elapsedMs":0}],"totalElapsedMs":0}
#   Published to 1/1 relays (required=1, timeout=200ms)
# [publish:primary] Publishing to 1 relays (wss://healthy)...
# {"event":"lock_publish_quorum_met","correlationId":"32ff90c9-6581-4845-81f6-57b331605198","attemptId":"7b98fda4-8f9e-40b6-8f0d-769413e19d10","publishAttempt":1,"successCount":1,"relayAttemptedCount":1,"requiredSuccesses":1,"timeoutMs":200,"retryTimeline":[{"publishAttempt":1,"successCount":1,"relayAttemptedCount":1,"elapsedMs":0}],"totalElapsedMs":0}
#   Published to 1/1 relays (required=1, timeout=200ms)
# [publish:primary] Publishing to 2 relays (wss://primary-a, wss://primary-b)...
# [publish:fallback] Publishing to 1 relays (wss://fallback-healthy)...
# {"event":"lock_publish_quorum_met","correlationId":"7abf8634-3874-48c8-84cb-cc253cd74ba3","attemptId":"5003aeef-efb2-4baa-867f-80e9680fe9ec","publishAttempt":1,"successCount":1,"relayAttemptedCount":3,"requiredSuccesses":1,"timeoutMs":200,"retryTimeline":[{"publishAttempt":1,"successCount":1,"relayAttemptedCount":3,"elapsedMs":1}],"totalElapsedMs":1}
#   Published to 1/3 relays (required=1, timeout=200ms)
    # Subtest: queryLocks
        # Subtest: falls back to fallback relays when primary query fails
        ok 1 - falls back to fallback relays when primary query fails
          ---
          duration_ms: 43.084461
          type: 'test'
          ...
        1..1
    ok 2 - queryLocks
      ---
      duration_ms: 43.947021
      type: 'suite'
      ...
    # Subtest: publishLock
        # Subtest: retries transient failures and succeeds on a later attempt
        ok 1 - retries transient failures and succeeds on a later attempt
          ---
          duration_ms: 7.843166
          type: 'test'
          ...
        # Subtest: fails after retry budget is exhausted for persistent transient failures
        ok 2 - fails after retry budget is exhausted for persistent transient failures
          ---
          duration_ms: 5.714739
          type: 'test'
          ...
        # Subtest: fails without retry for persistent validation failures
        ok 3 - fails without retry for persistent validation failures
          ---
          duration_ms: 2.026417
          type: 'test'
          ...
        # Subtest: includes per-relay reason categories and retry metadata in failure diagnostics
        ok 4 - includes per-relay reason categories and retry metadata in failure diagnostics
          ---
          duration_ms: 6.331801
          type: 'test'
          ...
        # Subtest: returns success when mixed relay outcomes still satisfy quorum
        ok 5 - returns success when mixed relay outcomes still satisfy quorum
          ---
          duration_ms: 2.322811
          type: 'test'
          ...
        # Subtest: uses fallback relays to satisfy min success quorum
        ok 6 - uses fallback relays to satisfy min success quorum
          ---
          duration_ms: 1.875888
          type: 'test'
          ...
        # Subtest: quarantines repeatedly failing relays and still reaches quorum with one healthy relay
        ok 7 - quarantines repeatedly failing relays and still reaches quorum with one healthy relay
          ---
          duration_ms: 4.172386
          type: 'test'
          ...
        # Subtest: uses fallback and min active pool to reintroduce quarantined relay when needed
        ok 8 - uses fallback and min active pool to reintroduce quarantined relay when needed
          ---
          duration_ms: 2.013862
          type: 'test'
          ...
        1..8
    ok 3 - publishLock
      ---
      duration_ms: 33.599935
      type: 'suite'
      ...
    1..3
ok 40 - lock-ops
  ---
  duration_ms: 86.904
  type: 'suite'
  ...
# Warning: Failed to read log dir logs/daily: Permission denied
# Subtest: getCompletedAgents
    # Subtest: returns empty set if directory read fails (non-ENOENT)
    ok 1 - returns empty set if directory read fails (non-ENOENT)
      ---
      duration_ms: 3.924586
      type: 'test'
      ...
    # Subtest: returns empty set if directory does not exist (ENOENT)
    ok 2 - returns empty set if directory does not exist (ENOENT)
      ---
      duration_ms: 0.720208
      type: 'test'
      ...
    # Subtest: identifies daily completed agents correctly
    ok 3 - identifies daily completed agents correctly
      ---
      duration_ms: 0.997435
      type: 'test'
      ...
    # Subtest: identifies weekly completed agents correctly
    ok 4 - identifies weekly completed agents correctly
      ---
      duration_ms: 0.903841
      type: 'test'
      ...
    1..4
ok 41 - getCompletedAgents
  ---
  duration_ms: 9.700722
  type: 'test'
  ...
# Subtest: main dispatch
    # Subtest: should exit with code 1 if no command provided
    ok 1 - should exit with code 1 if no command provided
      ---
      duration_ms: 3.568967
      type: 'test'
      ...
    # Subtest: should exit with code 1 if unknown command provided
    ok 2 - should exit with code 1 if unknown command provided
      ---
      duration_ms: 1.145609
      type: 'test'
      ...
    # Subtest: should exit with code 1 if check command misses cadence
    ok 3 - should exit with code 1 if check command misses cadence
      ---
      duration_ms: 1.514301
      type: 'test'
      ...
    # Subtest: should exit with code 1 if lock command misses agent
    ok 4 - should exit with code 1 if lock command misses agent
      ---
      duration_ms: 1.274366
      type: 'test'
      ...
    # Subtest: should exit with code 1 if complete command misses agent
    ok 5 - should exit with code 1 if complete command misses agent
      ---
      duration_ms: 1.728942
      type: 'test'
      ...
    # Subtest: should exit with code 1 if proposal command misses subcommand
    ok 6 - should exit with code 1 if proposal command misses subcommand
      ---
      duration_ms: 0.780826
      type: 'test'
      ...
    1..6
ok 42 - main dispatch
  ---
  duration_ms: 209.878261
  type: 'suite'
  ...
# Subtest: listMemories, inspectMemory, pinMemory, and unpinMemory support admin hooks
ok 43 - listMemories, inspectMemory, pinMemory, and unpinMemory support admin hooks
  ---
  duration_ms: 6.063236
  type: 'test'
  ...
# Subtest: triggerPruneDryRun returns candidate metadata without deleting records
ok 44 - triggerPruneDryRun returns candidate metadata without deleting records
  ---
  duration_ms: 0.876144
  type: 'test'
  ...
# Subtest: memoryStats reports counts/rates and retrieval telemetry remains redaction-safe
ok 45 - memoryStats reports counts/rates and retrieval telemetry remains redaction-safe
  ---
  duration_ms: 25.519201
  type: 'test'
  ...
# Subtest: runPruneCycle respects prune feature-flag modes
ok 46 - runPruneCycle respects prune feature-flag modes
  ---
  duration_ms: 1.209193
  type: 'test'
  ...
# Subtest: markMemoryMerged delegates to repository and clears cache
ok 47 - markMemoryMerged delegates to repository and clears cache
  ---
  duration_ms: 1.353474
  type: 'test'
  ...
# Subtest: stores runtime events in signer/session namespace and clears scope
ok 48 - stores runtime events in signer/session namespace and clears scope
  ---
  duration_ms: 5.122149
  type: 'test'
  ...
# Subtest: expires runtime events and records expiration metrics
ok 49 - expires runtime events and records expiration metrics
  ---
  duration_ms: 0.957615
  type: 'test'
  ...
# Subtest: enforces LRU bounds and tracks eviction metrics
ok 50 - enforces LRU bounds and tracks eviction metrics
  ---
  duration_ms: 1.104154
  type: 'test'
  ...
# Subtest: blocks decrypted/session-sensitive data from durable promotion without sanitizer pass
ok 51 - blocks decrypted/session-sensitive data from durable promotion without sanitizer pass
  ---
  duration_ms: 3.046603
  type: 'test'
  ...
# Subtest: createEmbedderAdapter selects in-memory backend and supports vector CRUD
ok 52 - createEmbedderAdapter selects in-memory backend and supports vector CRUD
  ---
  duration_ms: 2.549563
  type: 'test'
  ...
# Subtest: createEmbedderAdapter reads backend from environment
ok 53 - createEmbedderAdapter reads backend from environment
  ---
  duration_ms: 0.893942
  type: 'test'
  ...
# Subtest: memory feature flags parse defaults and canary allow-lists
ok 54 - memory feature flags parse defaults and canary allow-lists
  ---
  duration_ms: 2.285654
  type: 'test'
  ...
# Subtest: memory prune flag supports off, dry-run, and active modes
ok 55 - memory prune flag supports off, dry-run, and active modes
  ---
  duration_ms: 0.55758
  type: 'test'
  ...
# Subtest: estimateTokenCount returns heuristic count
ok 56 - estimateTokenCount returns heuristic count
  ---
  duration_ms: 3.519421
  type: 'test'
  ...
# Subtest: formatMemoryBlock converts memory record to display block
ok 57 - formatMemoryBlock converts memory record to display block
  ---
  duration_ms: 1.450549
  type: 'test'
  ...
# Subtest: formatMemoryBlock handles missing optional fields and default clamping
ok 58 - formatMemoryBlock handles missing optional fields and default clamping
  ---
  duration_ms: 0.529096
  type: 'test'
  ...
# Subtest: formatMemoryBlock respects custom clamping options
ok 59 - formatMemoryBlock respects custom clamping options
  ---
  duration_ms: 0.346984
  type: 'test'
  ...
# Subtest: formatMemoryBlock handles edge cases for clamping
ok 60 - formatMemoryBlock handles edge cases for clamping
  ---
  duration_ms: 0.504152
  type: 'test'
  ...
# Subtest: formatMemoriesForPrompt enforces token budget and k limit
ok 61 - formatMemoriesForPrompt enforces token budget and k limit
  ---
  duration_ms: 1.649185
  type: 'test'
  ...
# Subtest: formatMemoriesForPrompt handles aggressive budget fitting
ok 62 - formatMemoriesForPrompt handles aggressive budget fitting
  ---
  duration_ms: 0.976168
  type: 'test'
  ...
# Subtest: renderPromptWithMemoryContext injects context when enabled
ok 63 - renderPromptWithMemoryContext injects context when enabled
  ---
  duration_ms: 1.492431
  type: 'test'
  ...
# Subtest: renderPromptWithMemoryContext returns base prompt when disabled
ok 64 - renderPromptWithMemoryContext returns base prompt when disabled
  ---
  duration_ms: 0.94495
  type: 'test'
  ...
# Subtest: renderPromptWithMemoryContext handles missing query or service
ok 65 - renderPromptWithMemoryContext handles missing query or service
  ---
  duration_ms: 1.115294
  type: 'test'
  ...
# Subtest: renderPromptWithMemoryContext handles circular agentContext gracefully
ok 66 - renderPromptWithMemoryContext handles circular agentContext gracefully
  ---
  duration_ms: 0.932087
  type: 'test'
  ...
# Subtest: renderPromptWithMemoryContext handles agentContext as array of strings
ok 67 - renderPromptWithMemoryContext handles agentContext as array of strings
  ---
  duration_ms: 0.8063
  type: 'test'
  ...
# Subtest: renderPromptWithMemoryContext handles agentContext as plain object
ok 68 - renderPromptWithMemoryContext handles agentContext as plain object
  ---
  duration_ms: 0.558436
  type: 'test'
  ...
# Subtest: renderPromptWithMemoryContext handles agentContext as primitives
ok 69 - renderPromptWithMemoryContext handles agentContext as primitives
  ---
  duration_ms: 0.606096
  type: 'test'
  ...
# Subtest: renderPromptWithMemoryContext calls updateMemoryUsage for retrieved memories
ok 70 - renderPromptWithMemoryContext calls updateMemoryUsage for retrieved memories
  ---
  duration_ms: 5.065424
  type: 'test'
  ...
# Subtest: renderPromptWithMemoryContext handles empty memories gracefully
ok 71 - renderPromptWithMemoryContext handles empty memories gracefully
  ---
  duration_ms: 0.525587
  type: 'test'
  ...
# Subtest: renderPromptWithMemoryContext handles null/undefined memories gracefully
ok 72 - renderPromptWithMemoryContext handles null/undefined memories gracefully
  ---
  duration_ms: 0.426603
  type: 'test'
  ...
# Subtest: renderPromptWithMemoryContext respects TORCH_MEMORY_ENABLED=false
ok 73 - renderPromptWithMemoryContext respects TORCH_MEMORY_ENABLED=false
  ---
  duration_ms: 0.38512
  type: 'test'
  ...
# Subtest: renderPromptWithMemoryContext respects retrieval allowlist
ok 74 - renderPromptWithMemoryContext respects retrieval allowlist
  ---
  duration_ms: 0.992967
  type: 'test'
  ...
# Subtest: renderPromptWithMemoryContext passes k and tokenBudget
ok 75 - renderPromptWithMemoryContext passes k and tokenBudget
  ---
  duration_ms: 0.915693
  type: 'test'
  ...
# Subtest: getRelevantMemories uses cached results when available
ok 76 - getRelevantMemories uses cached results when available
  ---
  duration_ms: 3.705783
  type: 'test'
  ...
# Subtest: getRelevantMemories calls ranker and updates cache on miss
ok 77 - getRelevantMemories calls ranker and updates cache on miss
  ---
  duration_ms: 2.059898
  type: 'test'
  ...
# Subtest: getRelevantMemories passes correct parameters to ranker
ok 78 - getRelevantMemories passes correct parameters to ranker
  ---
  duration_ms: 1.624399
  type: 'test'
  ...
# Subtest: getRelevantMemories triggers updateMemoryUsage on repository
ok 79 - getRelevantMemories triggers updateMemoryUsage on repository
  ---
  duration_ms: 1.119459
  type: 'test'
  ...
# Subtest: ingestEvents
    # Subtest: happy path: successfully ingests events
    ok 1 - happy path: successfully ingests events
      ---
      duration_ms: 14.972816
      type: 'test'
      ...
    # Subtest: skips ingestion when feature flag is disabled
    ok 2 - skips ingestion when feature flag is disabled
      ---
      duration_ms: 0.819718
      type: 'test'
      ...
    # Subtest: clears cache after ingestion
    ok 3 - clears cache after ingestion
      ---
      duration_ms: 3.089714
      type: 'test'
      ...
    # Subtest: skips duplicate windows
    ok 4 - skips duplicate windows
      ---
      duration_ms: 2.047741
      type: 'test'
      ...
    # Subtest: propagates repository errors
    ok 5 - propagates repository errors
      ---
      duration_ms: 2.665731
      type: 'test'
      ...
    1..5
ok 80 - ingestEvents
  ---
  duration_ms: 26.352716
  type: 'suite'
  ...
# Subtest: ingestMemoryWindow gathers sources, redacts pii, chunks, embeds, links, and emits telemetry
ok 81 - ingestMemoryWindow gathers sources, redacts pii, chunks, embeds, links, and emits telemetry
  ---
  duration_ms: 11.542833
  type: 'test'
  ...
# Subtest: ingestMemoryWindow dedupes overlapping windows by hashed content + agent + timestamp bucket
ok 82 - ingestMemoryWindow dedupes overlapping windows by hashed content + agent + timestamp bucket
  ---
  duration_ms: 1.808018
  type: 'test'
  ...
# Subtest: pinMemory pins the memory and clears the cache
ok 83 - pinMemory pins the memory and clears the cache
  ---
  duration_ms: 5.918886
  type: 'test'
  ...
# Subtest: pinMemory returns null for non-existent ID but still clears cache
ok 84 - pinMemory returns null for non-existent ID but still clears cache
  ---
  duration_ms: 1.467884
  type: 'test'
  ...
# Subtest: unpinMemory unpins the memory and clears the cache
ok 85 - unpinMemory unpins the memory and clears the cache
  ---
  duration_ms: 1.079981
  type: 'test'
  ...
# Subtest: unpinMemory returns null for non-existent ID but still clears cache
ok 86 - unpinMemory returns null for non-existent ID but still clears cache
  ---
  duration_ms: 1.472222
  type: 'test'
  ...
# Subtest: createLifecyclePlan respects delete safety constraints and logs reasons
ok 87 - createLifecyclePlan respects delete safety constraints and logs reasons
  ---
  duration_ms: 8.099831
  type: 'test'
  ...
# Subtest: createLifecyclePlan condenses near-duplicates and archives merged source records
ok 88 - createLifecyclePlan condenses near-duplicates and archives merged source records
  ---
  duration_ms: 1.836418
  type: 'test'
  ...
# Subtest: applyLifecycleActions executes keep/archive/delete and merge markers
ok 89 - applyLifecycleActions executes keep/archive/delete and merge markers
  ---
  duration_ms: 21.63742
  type: 'test'
  ...
# Subtest: filterAndRankMemories applies metadata filters and composite score
ok 90 - filterAndRankMemories applies metadata filters and composite score
  ---
  duration_ms: 5.261991
  type: 'test'
  ...
# Subtest: formatMemoriesForPrompt returns prompt blocks and enforces token budget trimming
ok 91 - formatMemoriesForPrompt returns prompt blocks and enforces token budget trimming
  ---
  duration_ms: 2.546755
  type: 'test'
  ...
# Subtest: isMemoryRetrievalEnabled supports global toggle and agent canary list
ok 92 - isMemoryRetrievalEnabled supports global toggle and agent canary list
  ---
  duration_ms: 0.78116
  type: 'test'
  ...
# Subtest: renderPromptWithMemoryContext injects bounded memory block before base prompt
ok 93 - renderPromptWithMemoryContext injects bounded memory block before base prompt
  ---
  duration_ms: 1.826464
  type: 'test'
  ...
# Subtest: runPruneCycle respects off mode
ok 94 - runPruneCycle respects off mode
  ---
  duration_ms: 38.430075
  type: 'test'
  ...
# Subtest: runPruneCycle respects dry-run mode
ok 95 - runPruneCycle respects dry-run mode
  ---
  duration_ms: 1.230102
  type: 'test'
  ...
# Subtest: runPruneCycle removes stale unpinned memories in active mode
ok 96 - runPruneCycle removes stale unpinned memories in active mode
  ---
  duration_ms: 8.100254
  type: 'test'
  ...
# Subtest: runPruneCycle starts scheduler if requested
ok 97 - runPruneCycle starts scheduler if requested
  ---
  duration_ms: 1004.147417
  type: 'test'
  ...
# (node:3589) ExperimentalWarning: The MockTimers API is an experimental feature and might change at any time
# (Use `node --trace-warnings ...` to show where the warning was created)
# Subtest: createDbAdvisoryLockProvider acquires and releases postgres advisory locks
ok 98 - createDbAdvisoryLockProvider acquires and releases postgres advisory locks
  ---
  duration_ms: 3.968705
  type: 'test'
  ...
# Subtest: startMemoryMaintenanceScheduler runs all jobs and emits metrics including retries
ok 99 - startMemoryMaintenanceScheduler runs all jobs and emits metrics including retries
  ---
  duration_ms: 18.400157
  type: 'test'
  ...
# Subtest: startMemoryMaintenanceScheduler skips jobs when feature flags disable memory
ok 100 - startMemoryMaintenanceScheduler skips jobs when feature flags disable memory
  ---
  duration_ms: 3.095715
  type: 'test'
  ...
# Subtest: normalizeMemoryItem applies durable schema defaults and coercions
ok 101 - normalizeMemoryItem applies durable schema defaults and coercions
  ---
  duration_ms: 3.806237
  type: 'test'
  ...
# Subtest: validateMemoryItem reports field-level errors
ok 102 - validateMemoryItem reports field-level errors
  ---
  duration_ms: 0.913506
  type: 'test'
  ...
# Subtest: ingestEvents rejects invalid writes and logs structured validation details
ok 103 - ingestEvents rejects invalid writes and logs structured validation details
  ---
  duration_ms: 8.558995
  type: 'test'
  ...
# (node:3607) ExperimentalWarning: The MockTimers API is an experimental feature and might change at any time
# (Use `node --trace-warnings ...` to show where the warning was created)
# Subtest: memoryStats with empty repository returns zero counts and rates
ok 104 - memoryStats with empty repository returns zero counts and rates
  ---
  duration_ms: 7.073003
  type: 'test'
  ...
# Subtest: memoryStats with populated repository returns correct counts and totals
ok 105 - memoryStats with populated repository returns correct counts and totals
  ---
  duration_ms: 1.23927
  type: 'test'
  ...
# Subtest: memoryStats calculates ingest throughput based on window
ok 106 - memoryStats calculates ingest throughput based on window
  ---
  duration_ms: 13.146854
  type: 'test'
  ...
# Subtest: memoryStats reflects deleted count from prune cycle
ok 107 - memoryStats reflects deleted count from prune cycle
  ---
  duration_ms: 20.535278
  type: 'test'
  ...
# Subtest: memoryStats handles windowMs parameter correctly
ok 108 - memoryStats handles windowMs parameter correctly
  ---
  duration_ms: 0.804076
  type: 'test'
  ...
# Subtest: loadMemoryPromptTemplates loads all memory prompt templates from disk
ok 109 - loadMemoryPromptTemplates loads all memory prompt templates from disk
  ---
  duration_ms: 3.255737
  type: 'test'
  ...
# Subtest: summarizeEvents retries with repair prompt when first response is malformed JSON
ok 110 - summarizeEvents retries with repair prompt when first response is malformed JSON
  ---
  duration_ms: 4.574555
  type: 'test'
  ...
# Subtest: summarizeEvents falls back to deterministic minimal summary with conservative importance when parsing fails twice
ok 111 - summarizeEvents falls back to deterministic minimal summary with conservative importance when parsing fails twice
  ---
  duration_ms: 1.126548
  type: 'test'
  ...
# Subtest: telemetry should not log to stdout or stderr by default
ok 112 - telemetry should not log to stdout or stderr by default
  ---
  duration_ms: 118.685305
  type: 'test'
  ...
# Subtest: telemetry should log to stderr when NODE_DEBUG=torch-memory is set
ok 113 - telemetry should log to stderr when NODE_DEBUG=torch-memory is set
  ---
  duration_ms: 117.202389
  type: 'test'
  ...
# Subtest: schema validation covers required fields, coercion, and rejection paths
ok 114 - schema validation covers required fields, coercion, and rejection paths
  ---
  duration_ms: 6.090959
  type: 'test'
  ...
# Subtest: summarizer parser accepts valid json and recovers after malformed json response
ok 115 - summarizer parser accepts valid json and recovers after malformed json response
  ---
  duration_ms: 7.010857
  type: 'test'
  ...
# Subtest: ingest integration persists memory records and links embeddings from event batches
ok 116 - ingest integration persists memory records and links embeddings from event batches
  ---
  duration_ms: 4.832784
  type: 'test'
  ...
# Subtest: retrieval ranking blends semantic, importance, and recency signals
ok 117 - retrieval ranking blends semantic, importance, and recency signals
  ---
  duration_ms: 1.86814
  type: 'test'
  ...
# Subtest: pruner policy protects pins, merges duplicates, and picks archive/delete outcomes
ok 118 - pruner policy protects pins, merges duplicates, and picks archive/delete outcomes
  ---
  duration_ms: 3.121813
  type: 'test'
  ...
# Subtest: scheduler smoke test handles mocked clock and lock contention
ok 119 - scheduler smoke test handles mocked clock and lock contention
  ---
  duration_ms: 19.810981
  type: 'test'
  ...
# Subtest: CLI Smoke Test
    # Subtest: should print usage when no args provided
    ok 1 - should print usage when no args provided
      ---
      duration_ms: 305.296206
      type: 'test'
      ...
    # Subtest: should fail when checking without cadence
    ok 2 - should fail when checking without cadence
      ---
      duration_ms: 369.482016
      type: 'test'
      ...
    # Subtest: should include paused agents in check output
    ok 3 - should include paused agents in check output
      ---
      duration_ms: 430.388519
      type: 'test'
      ...
    1..3
ok 120 - CLI Smoke Test
  ---
  duration_ms: 1108.446382
  type: 'suite'
  ...
# Initializing torch in /app/test-gitignore-8KLnYf/torch...
# Copying application directories...
#   Copied src/
#   Copied bin/
#   Copied dashboard/
#   Copied landing/
#   Copied assets/
#   Copied scripts/
# Copying application files...
#   Copied package.json
#   Copied build.mjs
#   Copied README.md
#   Copied torch-config.example.json
#   Copied TORCH.md
# Created torch/roster.json
# Created torch/META_PROMPTS.md
# Created torch/scheduler-flow.md
# Created torch/daily-scheduler.md
# Created torch/weekly-scheduler.md
# Created 23 files in torch/prompts/daily/
# Created 24 files in torch/prompts/weekly/
# Created test-gitignore-8KLnYf/torch/.gitignore with node_modules
# Saved configuration to torch-config.json
# Created torch/TORCH_DASHBOARD.md
# No package.json found in host root. Skipping script injection.
# Initialization complete.
# You can now customize the files in torch/
# ● From torch-config.json:
#   - Hashtag: test-hash
#   - Namespace: test-ns
# https://torch.thepr0m3th3an.net/dashboard/?hashtag=test-hash&namespace=test-ns&relays=wss%3A%2F%2Frelay.damus.io
# Initializing torch in /app/test-gitignore-existing-VGMykL/torch...
# Copying application directories...
#   Copied src/
#   Copied bin/
#   Copied dashboard/
#   Copied landing/
#   Copied assets/
#   Copied scripts/
# Copying application files...
#   Copied package.json
#   Copied build.mjs
#   Copied README.md
#   Copied torch-config.example.json
#   Copied TORCH.md
# Created torch/roster.json
# Created torch/META_PROMPTS.md
# Created torch/scheduler-flow.md
# Created torch/daily-scheduler.md
# Created torch/weekly-scheduler.md
# Created 23 files in torch/prompts/daily/
# Created 24 files in torch/prompts/weekly/
# Updated test-gitignore-existing-VGMykL/torch/.gitignore: added node_modules
# Saved configuration to torch-config.json
# Created torch/TORCH_DASHBOARD.md
# No package.json found in host root. Skipping script injection.
# Initialization complete.
# You can now customize the files in torch/
# ● From torch-config.json:
#   - Hashtag: test-hash
#   - Namespace: test-ns
# https://torch.thepr0m3th3an.net/dashboard/?hashtag=test-hash&namespace=test-ns&relays=wss%3A%2F%2Frelay.damus.io
# Subtest: ops.mjs: cmdInit creates .gitignore with node_modules
ok 121 - ops.mjs: cmdInit creates .gitignore with node_modules
  ---
  duration_ms: 150.507681
  type: 'test'
  ...
# Subtest: ops.mjs: cmdInit appends to existing .gitignore
ok 122 - ops.mjs: cmdInit appends to existing .gitignore
  ---
  duration_ms: 119.146317
  type: 'test'
  ...
# Initializing torch in /app/test-ops-ipeamR/project1/torch...
# Copying application directories...
#   Copied src/
#   Copied bin/
#   Copied dashboard/
#   Copied landing/
#   Copied assets/
#   Copied scripts/
# Copying application files...
#   Copied package.json
#   Copied build.mjs
#   Copied README.md
#   Copied torch-config.example.json
#   Copied TORCH.md
# Created torch/roster.json
# Created torch/META_PROMPTS.md
# Created torch/scheduler-flow.md
# Created torch/daily-scheduler.md
# Created torch/weekly-scheduler.md
# Created 23 files in torch/prompts/daily/
# Created 24 files in torch/prompts/weekly/
# Created test-ops-ipeamR/project1/torch/.gitignore with node_modules
# Saved configuration to torch-config.json
# Created torch/TORCH_DASHBOARD.md
# No package.json found in host root. Skipping script injection.
# Initialization complete.
# You can now customize the files in torch/
# ● From torch-config.json:
#   - Hashtag: test-hashtag
#   - Namespace: test-namespace
# https://torch.thepr0m3th3an.net/dashboard/?hashtag=test-hashtag&namespace=test-namespace&relays=wss%3A%2F%2Frelay.damus.io
# Initializing torch in /app/test-ops-ipeamR/project2/torch...
# Initializing torch in /app/test-ops-ipeamR/project3/torch...
# Copying application directories...
#   Copied src/
#   Copied bin/
#   Copied dashboard/
#   Copied landing/
#   Copied assets/
#   Copied scripts/
# Copying application files...
#   Copied package.json
#   Copied build.mjs
#   Copied README.md
#   Copied torch-config.example.json
#   Copied TORCH.md
# Created torch/roster.json
# Created torch/META_PROMPTS.md
# Created torch/scheduler-flow.md
# Created torch/daily-scheduler.md
# Created torch/weekly-scheduler.md
# Created 23 files in torch/prompts/daily/
# Created 24 files in torch/prompts/weekly/
# Created test-ops-ipeamR/project3/torch/.gitignore with node_modules
# Saved configuration to torch-config.json
# Created torch/TORCH_DASHBOARD.md
# No package.json found in host root. Skipping script injection.
# Initialization complete.
# You can now customize the files in torch/
# ● From torch-config.json:
#   - Hashtag: test-hashtag
#   - Namespace: test-namespace
# https://torch.thepr0m3th3an.net/dashboard/?hashtag=test-hashtag&namespace=test-namespace&relays=wss%3A%2F%2Frelay.damus.io
# Updating torch configuration in /app/test-ops-ipeamR/project3/torch...
# Creating backup at torch/_backups/backup_2026-02-25T01-11-03-793Z...
# Updating application directories...
#   Updated src/
#   Updated bin/
#   Updated dashboard/
#   Updated landing/
#   Updated assets/
#   Updated scripts/
# Updating application files...
#   Updated package.json
#   Updated build.mjs
#   Updated README.md
#   Updated torch-config.example.json
#   Updated TORCH.md
# Updating static files...
#   Updated META_PROMPTS.md
#   Updated scheduler-flow.md
#   Updated daily-scheduler.md
#   Updated weekly-scheduler.md
#   Skipped roster.json (preserved)
# Updating prompts...
#   daily/: 0 added, 0 updated, 23 preserved
#   weekly/: 0 added, 0 updated, 24 preserved
# Update complete.
# Initializing torch in /app/test-ops-ipeamR/project4/torch...
# Copying application directories...
#   Copied src/
#   Copied bin/
#   Copied dashboard/
#   Copied landing/
#   Copied assets/
#   Copied scripts/
# Copying application files...
#   Copied package.json
#   Copied build.mjs
#   Copied README.md
#   Copied torch-config.example.json
#   Copied TORCH.md
# Created torch/roster.json
# Created torch/META_PROMPTS.md
# Created torch/scheduler-flow.md
# Created torch/daily-scheduler.md
# Created torch/weekly-scheduler.md
# Created 23 files in torch/prompts/daily/
# Created 24 files in torch/prompts/weekly/
# Created test-ops-ipeamR/project4/torch/.gitignore with node_modules
# Saved configuration to torch-config.json
# Created torch/TORCH_DASHBOARD.md
# No package.json found in host root. Skipping script injection.
# Initialization complete.
# You can now customize the files in torch/
# ● From torch-config.json:
#   - Hashtag: test-hashtag
#   - Namespace: test-namespace
# https://torch.thepr0m3th3an.net/dashboard/?hashtag=test-hashtag&namespace=test-namespace&relays=wss%3A%2F%2Frelay.damus.io
# Updating torch configuration in /app/test-ops-ipeamR/project4/torch...
# Creating backup at torch/_backups/backup_2026-02-25T01-11-04-053Z...
# Updating application directories...
#   Updated src/
#   Updated bin/
#   Updated dashboard/
#   Updated landing/
#   Updated assets/
#   Updated scripts/
# Updating application files...
#   Updated package.json
#   Updated build.mjs
#   Updated README.md
#   Updated torch-config.example.json
#   Updated TORCH.md
# Updating static files...
#   Updated META_PROMPTS.md
#   Updated scheduler-flow.md
#   Updated daily-scheduler.md
#   Updated weekly-scheduler.md
#   Overwrote roster.json (forced)
# Updating prompts...
#   daily/: 0 added, 23 updated, 0 preserved
#   weekly/: 0 added, 24 updated, 0 preserved
# Update complete.
# Initializing torch in /app/test-ops-ipeamR/project5/torch...
# Copying application directories...
#   Copied src/
#   Copied bin/
#   Copied dashboard/
#   Copied landing/
#   Copied assets/
#   Copied scripts/
# Copying application files...
#   Copied package.json
#   Copied build.mjs
#   Copied README.md
#   Copied torch-config.example.json
#   Copied TORCH.md
# Created torch/roster.json
# Created torch/META_PROMPTS.md
# Created torch/scheduler-flow.md
# Created torch/daily-scheduler.md
# Created torch/weekly-scheduler.md
# Created 23 files in torch/prompts/daily/
# Created 24 files in torch/prompts/weekly/
# Created test-ops-ipeamR/project5/torch/.gitignore with node_modules
# Saved configuration to torch-config.json
# Created torch/TORCH_DASHBOARD.md
# Initialization complete.
# You can now customize the files in torch/
# ● From torch-config.json:
#   - Hashtag: test-hashtag
# No package.json found in host root. Skipping script injection.
#   - Namespace: test-namespace
# https://torch.thepr0m3th3an.net/dashboard/?hashtag=test-hashtag&namespace=test-namespace&relays=wss%3A%2F%2Frelay.damus.io
# Updating torch configuration in /app/test-ops-ipeamR/project5/torch...
# Creating backup at torch/_backups/backup_2026-02-25T01-11-04-271Z...
# Updating application directories...
#   Updated src/
#   Updated bin/
#   Updated dashboard/
#   Updated landing/
#   Updated assets/
#   Updated scripts/
# Updating application files...
#   Updated package.json
#   Updated build.mjs
#   Updated README.md
#   Updated torch-config.example.json
#   Updated TORCH.md
# Updating static files...
#   Updated META_PROMPTS.md
#   Updated scheduler-flow.md
#   Updated daily-scheduler.md
#   Updated weekly-scheduler.md
#   Skipped roster.json (preserved)
# Updating prompts...
#   daily/: 0 added, 0 updated, 23 preserved
#   weekly/: 0 added, 0 updated, 24 preserved
# Update complete.
# Initializing torch in /app/test-ops-ipeamR/project_roster/torch...
# Copying application directories...
#   Copied src/
#   Copied bin/
#   Copied dashboard/
#   Copied landing/
#   Copied assets/
#   Copied scripts/
# Copying application files...
#   Copied package.json
#   Copied build.mjs
#   Copied README.md
#   Copied torch-config.example.json
#   Copied TORCH.md
# Created torch/roster.json
# Created torch/META_PROMPTS.md
# Created torch/scheduler-flow.md
# Created torch/daily-scheduler.md
# Created torch/weekly-scheduler.md
# Created 23 files in torch/prompts/daily/
# Created 24 files in torch/prompts/weekly/
# Created test-ops-ipeamR/project_roster/torch/.gitignore with node_modules
# Saved configuration to torch-config.json
# Created torch/TORCH_DASHBOARD.md
# Initialization complete.
# You can now customize the files in torch/
# ● From torch-config.json:
#   - Hashtag: test-hashtag
#   - Namespace: test-namespace
# https://torch.thepr0m3th3an.net/dashboard/?hashtag=test-hashtag&namespace=test-namespace&relays=ws%3A%2F%2F127.0.0.1%3A45047
# No package.json found in host root. Skipping script injection.
# Subtest: cmdInit creates directory structure and files
ok 123 - cmdInit creates directory structure and files
  ---
  duration_ms: 92.50273
  type: 'test'
  ...
# Subtest: cmdInit fails if directory exists without force
ok 124 - cmdInit fails if directory exists without force
  ---
  duration_ms: 1.915157
  type: 'test'
  ...
# Subtest: cmdUpdate preserves modified prompt
ok 125 - cmdUpdate preserves modified prompt
  ---
  duration_ms: 245.195488
  type: 'test'
  ...
# Subtest: cmdUpdate overwrites prompt with force
ok 126 - cmdUpdate overwrites prompt with force
  ---
  duration_ms: 255.479973
  type: 'test'
  ...
# Subtest: cmdUpdate creates backup
ok 127 - cmdUpdate creates backup
  ---
  duration_ms: 191.332775
  type: 'test'
  ...
# Initializing torch in /app/test-ops-ipeamR/project_config_init/torch...
# Copying application directories...
#   Copied src/
#   Copied bin/
#   Copied dashboard/
#   Copied landing/
#   Copied assets/
#   Copied scripts/
# Copying application files...
#   Copied package.json
#   Copied build.mjs
#   Copied README.md
#   Copied torch-config.example.json
#   Copied TORCH.md
# Created torch/roster.json
# Created torch/META_PROMPTS.md
# Created torch/scheduler-flow.md
# Created torch/daily-scheduler.md
# Created torch/weekly-scheduler.md
# Created 23 files in torch/prompts/daily/
# Created 24 files in torch/prompts/weekly/
# Created test-ops-ipeamR/project_config_init/torch/.gitignore with node_modules
# Saved configuration to torch-config.json
# Created torch/TORCH_DASHBOARD.md
# No package.json found in host root. Skipping script injection.
# Initialization complete.
# You can now customize the files in torch/
# ● From torch-config.json:
#   - Hashtag: test-hashtag
#   - Namespace: test-namespace
# https://torch.thepr0m3th3an.net/dashboard/?hashtag=test-hashtag&namespace=test-namespace&relays=wss%3A%2F%2Frelay.damus.io
# Subtest: torch-lock check respects local roster
ok 128 - torch-lock check respects local roster
  ---
  duration_ms: 546.049099
  type: 'test'
  ...
# Subtest: cmdInit creates torch-config.json with random namespace
ok 129 - cmdInit creates torch-config.json with random namespace
  ---
  duration_ms: 71.781854
  type: 'test'
  ...
# [publish:primary] Publishing to 3 relays (ws://127.0.0.1:37663, ws://127.0.0.1:41187, ws://127.0.0.1:45675)...
# Subtest: test/relay-fanout-quorum.integration.test.mjs
not ok 42 - test/relay-fanout-quorum.integration.test.mjs
  ---
  duration_ms: 30012.819093
  type: 'test'
  location: '/app/test/relay-fanout-quorum.integration.test.mjs:1:1'
  failureType: 'testTimeoutFailure'
  error: 'test timed out after 30000ms'
  code: 'ERR_TEST_FAILURE'
  ...
# Subtest: RelayHealthManager
    # Subtest: should isolate state between instances
    ok 1 - should isolate state between instances
      ---
      duration_ms: 2.10994
      type: 'test'
      ...
    # Subtest: should prioritize relays based on health
    ok 2 - should prioritize relays based on health
      ---
      duration_ms: 4.326419
      type: 'test'
      ...
    # Subtest: should reset state correctly
    ok 3 - should reset state correctly
      ---
      duration_ms: 0.547581
      type: 'test'
      ...
    # Subtest: should cache ranked results and invalidate on outcome
    ok 4 - should cache ranked results and invalidate on outcome
      ---
      duration_ms: 0.947876
      type: 'test'
      ...
    # Subtest: should invalidate cache when time passes quarantine expiry
    ok 5 - should invalidate cache when time passes quarantine expiry
      ---
      duration_ms: 1.497923
      type: 'test'
      ...
    1..5
ok 131 - RelayHealthManager
  ---
  duration_ms: 12.783485
  type: 'suite'
  ...
# Subtest: evaluateAlertThresholds
    # Subtest: Happy Path: No alerts when thresholds are not met
    ok 1 - Happy Path: No alerts when thresholds are not met
      ---
      duration_ms: 3.462426
      type: 'test'
      ...
    # Subtest: All Relays Down: Triggers alert when duration equals threshold
    ok 2 - All Relays Down: Triggers alert when duration equals threshold
      ---
      duration_ms: 0.76515
      type: 'test'
      ...
    # Subtest: All Relays Down: Does NOT trigger alert just below threshold
    ok 3 - All Relays Down: Does NOT trigger alert just below threshold
      ---
      duration_ms: 0.612796
      type: 'test'
      ...
    # Subtest: Success Rate: Triggers alert when rate is strictly below threshold
    ok 4 - Success Rate: Triggers alert when rate is strictly below threshold
      ---
      duration_ms: 0.701317
      type: 'test'
      ...
    # Subtest: Success Rate: Does NOT trigger alert when rate equals threshold
    ok 5 - Success Rate: Does NOT trigger alert when rate equals threshold
      ---
      duration_ms: 0.88532
      type: 'test'
      ...
    # Subtest: Success Rate: Does NOT trigger alert when rate is above threshold
    ok 6 - Success Rate: Does NOT trigger alert when rate is above threshold
      ---
      duration_ms: 0.676909
      type: 'test'
      ...
    # Subtest: Multiple Alerts: Both conditions met
    ok 7 - Multiple Alerts: Both conditions met
      ---
      duration_ms: 0.564449
      type: 'test'
      ...
    # Subtest: Edge Case: Empty history (should not crash)
    ok 8 - Edge Case: Empty history (should not crash)
      ---
      duration_ms: 0.93433
      type: 'test'
      ...
    # Subtest: Edge Case: Empty history but current result is unhealthy
    ok 9 - Edge Case: Empty history but current result is unhealthy
      ---
      duration_ms: 1.119569
      type: 'test'
      ...
    1..9
ok 132 - evaluateAlertThresholds
  ---
  duration_ms: 19.065954
  type: 'test'
  ...
# Subtest: summarizeHistory - basic statistics calculation
ok 133 - summarizeHistory - basic statistics calculation
  ---
  duration_ms: 5.205567
  type: 'test'
  ...
# Subtest: summarizeHistory - handles empty history
ok 134 - summarizeHistory - handles empty history
  ---
  duration_ms: 0.859695
  type: 'test'
  ...
# Subtest: summarizeHistory - respects time window for stats
ok 135 - summarizeHistory - respects time window for stats
  ---
  duration_ms: 1.030573
  type: 'test'
  ...
# Subtest: summarizeHistory - allDownDurationMinutes considers outside window entries
ok 136 - summarizeHistory - allDownDurationMinutes considers outside window entries
  ---
  duration_ms: 0.757676
  type: 'test'
  ...
# Subtest: summarizeHistory - allDownDurationMinutes is null if never healthy
ok 137 - summarizeHistory - allDownDurationMinutes is null if never healthy
  ---
  duration_ms: 0.938775
  type: 'test'
  ...
# Subtest: summarizeHistory - allDownDurationMinutes is 0 if currently healthy
ok 138 - summarizeHistory - allDownDurationMinutes is 0 if currently healthy
  ---
  duration_ms: 0.660612
  type: 'test'
  ...
# Subtest: summarizeHistory - handles malformed entries gracefully
ok 139 - summarizeHistory - handles malformed entries gracefully
  ---
  duration_ms: 1.705358
  type: 'test'
  ...
# Subtest: summarizeHistory - handles valid timestamp but missing summary
ok 140 - summarizeHistory - handles valid timestamp but missing summary
  ---
  duration_ms: 3.168921
  type: 'test'
  ...
# Subtest: summarizeHistory - healthy entry with invalid timestamp results in NaN duration
ok 141 - summarizeHistory - healthy entry with invalid timestamp results in NaN duration
  ---
  duration_ms: 1.448629
  type: 'test'
  ...
# Subtest: Roster (Unit Tests with Dependency Injection)
    # Subtest: returns fallback roster when no configuration or files exist
    ok 1 - returns fallback roster when no configuration or files exist
      ---
      duration_ms: 2.409381
      type: 'test'
      ...
    # Subtest: loads internal module roster if user/cwd rosters are missing
    ok 2 - loads internal module roster if user/cwd rosters are missing
      ---
      duration_ms: 1.498023
      type: 'test'
      ...
    # Subtest: loads roster from torch/roster.json (User Roster) if present
    ok 3 - loads roster from torch/roster.json (User Roster) if present
      ---
      duration_ms: 1.062607
      type: 'test'
      ...
    # Subtest: loads roster from roster.json (CWD Roster) if present and torch/roster.json is missing
    ok 4 - loads roster from roster.json (CWD Roster) if present and torch/roster.json is missing
      ---
      duration_ms: 0.932958
      type: 'test'
      ...
    # Subtest: falls back to default if roster file is malformed
    ok 5 - falls back to default if roster file is malformed
      ---
      duration_ms: 0.573623
      type: 'test'
      ...
    # Subtest: falls back to default if roster file is missing daily/weekly arrays
    ok 6 - falls back to default if roster file is missing daily/weekly arrays
      ---
      duration_ms: 0.545556
      type: 'test'
      ...
    # Subtest: prioritizes environment variables over file and config
    ok 7 - prioritizes environment variables over file and config
      ---
      duration_ms: 2.127738
      type: 'test'
      ...
    # Subtest: prioritizes config over file
    ok 8 - prioritizes config over file
      ---
      duration_ms: 0.449317
      type: 'test'
      ...
    # Subtest: handles multiple items in env var roster
    ok 9 - handles multiple items in env var roster
      ---
      duration_ms: 0.669775
      type: 'test'
      ...
    1..9
ok 142 - Roster (Unit Tests with Dependency Injection)
  ---
  duration_ms: 12.320945
  type: 'suite'
  ...
# Subtest: fails required memory policy when retrieval/storage evidence is missing
ok 143 - fails required memory policy when retrieval/storage evidence is missing
  ---
  duration_ms: 869.64749
  type: 'test'
  ...
# Subtest: accepts required memory policy when markers or artifacts are produced
ok 144 - accepts required memory policy when markers or artifacts are produced
  ---
  duration_ms: 822.634789
  type: 'test'
  ...
# Subtest: records backend failure metadata when lock command exits with code 2
ok 145 - records backend failure metadata when lock command exits with code 2
  ---
  duration_ms: 936.703416
  type: 'test'
  ...
# Subtest: defers backend failures in non-strict mode and reuses idempotency key on successful retry
ok 146 - defers backend failures in non-strict mode and reuses idempotency key on successful retry
  ---
  duration_ms: 576.455577
  type: 'test'
  ...
# Subtest: fails after exceeding non-strict deferral budget
ok 147 - fails after exceeding non-strict deferral budget
  ---
  duration_ms: 174.497196
  type: 'test'
  ...
# Subtest: strict lock mode fails immediately without deferral
ok 148 - strict lock mode fails immediately without deferral
  ---
  duration_ms: 91.933251
  type: 'test'
  ...
# Subtest: skips lock health preflight by default when not enabled
ok 149 - skips lock health preflight by default when not enabled
  ---
  duration_ms: 358.956384
  type: 'test'
  ...
# Subtest: fails scheduler with preflight metadata when lock health preflight is enabled
ok 150 - fails scheduler with preflight metadata when lock health preflight is enabled
  ---
  duration_ms: 129.969778
  type: 'test'
  ...
# Subtest: categorizes unreadable prompt files as prompt_parse_error
ok 151 - categorizes unreadable prompt files as prompt_parse_error
  ---
  duration_ms: 94.114388
  type: 'test'
  ...
# Subtest: categorizes invalid prompt schema as prompt_schema_error
ok 152 - categorizes invalid prompt schema as prompt_schema_error
  ---
  duration_ms: 96.29147
  type: 'test'
  ...
# Subtest: categorizes handoff runtime failures as execution_error
ok 153 - categorizes handoff runtime failures as execution_error
  ---
  duration_ms: 320.66936
  type: 'test'
  ...
# Subtest: retries lock acquisition for backend error and succeeds on a later attempt
ok 154 - retries lock acquisition for backend error and succeeds on a later attempt
  ---
  duration_ms: 377.591866
  type: 'test'
  ...
# Subtest: stops retrying after configured lock backend retries are exhausted
ok 155 - stops retrying after configured lock backend retries are exhausted
  ---
  duration_ms: 103.27884
  type: 'test'
  ...
# Subtest: does not use backend retry flow for exit code 3 lock conflicts
ok 156 - does not use backend retry flow for exit code 3 lock conflicts
  ---
  duration_ms: 383.696084
  type: 'test'
  ...
# Subtest: retries handoff command for retryable network failures and succeeds
ok 157 - retries handoff command for retryable network failures and succeeds
  ---
  duration_ms: 591.571343
  type: 'test'
  ...
# Subtest: uses fallback platform for handoff when primary platform fails
ok 158 - uses fallback platform for handoff when primary platform fails
  ---
  duration_ms: 599.674116
  type: 'test'
  ...
# Subtest: fails before lock acquisition when runner health preflight command fails
ok 159 - fails before lock acquisition when runner health preflight command fails
  ---
  duration_ms: 320.323955
  type: 'test'
  ...
# Subtest: uses exclusion payload from mixed JSON lock:check output
ok 160 - uses exclusion payload from mixed JSON lock:check output
  ---
  duration_ms: 380.112952
  type: 'test'
  ...
# Subtest: runs selected scheduler prompt through configured runner command
ok 161 - runs selected scheduler prompt through configured runner command
  ---
  duration_ms: 379.281936
  type: 'test'
  ...
# Subtest: propagates non-zero runner exit code
ok 162 - propagates non-zero runner exit code
  ---
  duration_ms: 329.70971
  type: 'test'
  ...
# Subtest: scheduler lock backend failure artifact matches required frontmatter schema
ok 163 - scheduler lock backend failure artifact matches required frontmatter schema
  ---
  duration_ms: 122.598508
  type: 'test'
  ...
# Subtest: schema contract catches missing required lock-backend field
ok 164 - schema contract catches missing required lock-backend field
  ---
  duration_ms: 2.200099
  type: 'test'
  ...
# Subtest: schema contract catches misnamed lock-backend key
ok 165 - schema contract catches misnamed lock-backend key
  ---
  duration_ms: 0.718084
  type: 'test'
  ...
# Subtest: lock preflight e2e: successful lock writes completed status snapshot
ok 166 - lock preflight e2e: successful lock writes completed status snapshot
  ---
  duration_ms: 372.511751
  type: 'test'
  ...
# Subtest: lock preflight e2e: exit code 2 quorum failure persists failed backend status and prompt-not-started marker
ok 167 - lock preflight e2e: exit code 2 quorum failure persists failed backend status and prompt-not-started marker
  ---
  duration_ms: 92.986611
  type: 'test'
  ...
# Subtest: lock preflight e2e: non-lock failure exits failed without prompt parse/schema classification
ok 168 - lock preflight e2e: non-lock failure exits failed without prompt parse/schema classification
  ---
  duration_ms: 90.582812
  type: 'test'
  ...
# Subtest: Scheduler Ratchet Logic (Log Checking)
    # Subtest: excludes agents completed today (daily)
    ok 1 - excludes agents completed today (daily)
      ---
      duration_ms: 4.165663
      type: 'test'
      ...
    # Subtest: excludes agents completed this week (weekly)
    ok 2 - excludes agents completed this week (weekly)
      ---
      duration_ms: 0.410584
      type: 'test'
      ...
    # Subtest: combines locked and completed agents in exclusion list
    ok 3 - combines locked and completed agents in exclusion list
      ---
      duration_ms: 0.633691
      type: 'test'
      ...
    # Subtest: ignores logs when --ignore-logs is set
    ok 4 - ignores logs when --ignore-logs is set
      ---
      duration_ms: 0.398895
      type: 'test'
      ...
    # Subtest: handles missing log directory gracefully
    ok 5 - handles missing log directory gracefully
      ---
      duration_ms: 0.504074
      type: 'test'
      ...
    1..5
ok 169 - Scheduler Ratchet Logic (Log Checking)
  ---
  duration_ms: 7.646846
  type: 'suite'
  ...
# Subtest: Scheduler cycle ordering guarantees
    # Subtest: keeps optional preflight before lock-acquire and preserves handoff/artifact/validation/complete ordering
    ok 1 - keeps optional preflight before lock-acquire and preserves handoff/artifact/validation/complete ordering
      ---
      duration_ms: 10.739742
      type: 'test'
      ...
    # Subtest: includes lock backend failure metadata and classifier checkpoints
    ok 2 - includes lock backend failure metadata and classifier checkpoints
      ---
      duration_ms: 2.342833
      type: 'test'
      ...
    1..2
ok 170 - Scheduler cycle ordering guarantees
  ---
  duration_ms: 13.738636
  type: 'suite'
  ...
# Subtest: parseDateValue
    # Subtest: parses a valid ISO string
    ok 1 - parses a valid ISO string
      ---
      duration_ms: 1.065679
      type: 'test'
      ...
    # Subtest: returns null for empty input
    ok 2 - returns null for empty input
      ---
      duration_ms: 0.206466
      type: 'test'
      ...
    # Subtest: returns null for invalid date strings
    ok 3 - returns null for invalid date strings
      ---
      duration_ms: 0.264509
      type: 'test'
      ...
    1..3
ok 171 - parseDateValue
  ---
  duration_ms: 3.052305
  type: 'suite'
  ...
# Subtest: isStrictSchedulerLogFilename
    # Subtest: accepts valid completed log
    ok 1 - accepts valid completed log
      ---
      duration_ms: 0.557352
      type: 'test'
      ...
    # Subtest: accepts valid failed log
    ok 2 - accepts valid failed log
      ---
      duration_ms: 0.254684
      type: 'test'
      ...
    # Subtest: rejects deferred logs
    ok 3 - rejects deferred logs
      ---
      duration_ms: 0.18596
      type: 'test'
      ...
    # Subtest: rejects filenames without timestamp
    ok 4 - rejects filenames without timestamp
      ---
      duration_ms: 0.343365
      type: 'test'
      ...
    # Subtest: rejects plain text files
    ok 5 - rejects plain text files
      ---
      duration_ms: 0.349678
      type: 'test'
      ...
    # Subtest: rejects .scheduler-run-state.json
    ok 6 - rejects .scheduler-run-state.json
      ---
      duration_ms: 0.37923
      type: 'test'
      ...
    1..6
ok 172 - isStrictSchedulerLogFilename
  ---
  duration_ms: 2.859705
  type: 'suite'
  ...
# Subtest: parseAgentFromFilename
    # Subtest: extracts agent name from completed log
    ok 1 - extracts agent name from completed log
      ---
      duration_ms: 1.860888
      type: 'test'
      ...
    # Subtest: extracts agent name from failed log
    ok 2 - extracts agent name from failed log
      ---
      duration_ms: 0.200667
      type: 'test'
      ...
    # Subtest: returns null for invalid filename
    ok 3 - returns null for invalid filename
      ---
      duration_ms: 0.119411
      type: 'test'
      ...
    1..3
ok 173 - parseAgentFromFilename
  ---
  duration_ms: 2.39492
  type: 'suite'
  ...
# Subtest: parseTimestampFromFilename
    # Subtest: parses timestamp from canonical filename
    ok 1 - parses timestamp from canonical filename
      ---
      duration_ms: 0.321057
      type: 'test'
      ...
    # Subtest: returns null for non-canonical filename
    ok 2 - returns null for non-canonical filename
      ---
      duration_ms: 0.10733
      type: 'test'
      ...
    1..2
ok 174 - parseTimestampFromFilename
  ---
  duration_ms: 0.540681
  type: 'suite'
  ...
# Subtest: parseFrontmatterCreatedAt / parseFrontmatterAgent
    # Subtest: reads created_at from frontmatter
    ok 1 - reads created_at from frontmatter
      ---
      duration_ms: 0.497776
      type: 'test'
      ...
    # Subtest: reads agent from frontmatter
    ok 2 - reads agent from frontmatter
      ---
      duration_ms: 0.239166
      type: 'test'
      ...
    # Subtest: returns null when no frontmatter
    ok 3 - returns null when no frontmatter
      ---
      duration_ms: 0.111966
      type: 'test'
      ...
    1..3
ok 175 - parseFrontmatterCreatedAt / parseFrontmatterAgent
  ---
  duration_ms: 1.075144
  type: 'suite'
  ...
# Subtest: buildRecentlyRunExclusionSet — scenarios
    # Subtest: SCN-TWG-01: excludes agents with completed logs within 24-hour daily window
    ok 1 - SCN-TWG-01: excludes agents with completed logs within 24-hour daily window
      ---
      duration_ms: 7.193942
      type: 'test'
      ...
    # Subtest: SCN-TWG-02: does NOT exclude agents whose last run is outside the 24-hour window
    ok 2 - SCN-TWG-02: does NOT exclude agents whose last run is outside the 24-hour window
      ---
      duration_ms: 2.923382
      type: 'test'
      ...
    # Subtest: SCN-TWG-03: excludes agents with failed logs within the window
    ok 3 - SCN-TWG-03: excludes agents with failed logs within the window
      ---
      duration_ms: 2.185071
      type: 'test'
      ...
    # Subtest: SCN-TWG-04: cross-midnight scenario — agent ran 10 min before midnight, checked 10 min after
    ok 4 - SCN-TWG-04: cross-midnight scenario — agent ran 10 min before midnight, checked 10 min after
      ---
      duration_ms: 4.128957
      type: 'test'
      ...
    # Subtest: SCN-TWG-05: uses frontmatter created_at over filename timestamp when both present
    ok 5 - SCN-TWG-05: uses frontmatter created_at over filename timestamp when both present
      ---
      duration_ms: 2.086369
      type: 'test'
      ...
    # Subtest: SCN-TWG-06: weekly window uses 7-day threshold
    ok 6 - SCN-TWG-06: weekly window uses 7-day threshold
      ---
      duration_ms: 2.986649
      type: 'test'
      ...
    # Subtest: SCN-TWG-07: empty log directory returns empty set
    ok 7 - SCN-TWG-07: empty log directory returns empty set
      ---
      duration_ms: 1.068252
      type: 'test'
      ...
    # Subtest: SCN-TWG-08: non-existent directory returns empty set without throwing
    ok 8 - SCN-TWG-08: non-existent directory returns empty set without throwing
      ---
      duration_ms: 0.978452
      type: 'test'
      ...
    # Subtest: SCN-TWG-09: only the most recent log matters — agent excluded if any log is within window
    ok 9 - SCN-TWG-09: only the most recent log matters — agent excluded if any log is within window
      ---
      duration_ms: 3.312083
      type: 'test'
      ...
    # Subtest: SCN-TWG-10: mixed roster — correctly partitions in-window vs out-of-window agents
    ok 10 - SCN-TWG-10: mixed roster — correctly partitions in-window vs out-of-window agents
      ---
      duration_ms: 3.51728
      type: 'test'
      ...
    # Subtest: SCN-TWG-11: non-log files in directory are ignored
    ok 11 - SCN-TWG-11: non-log files in directory are ignored
      ---
      duration_ms: 2.155883
      type: 'test'
      ...
    1..11
ok 176 - buildRecentlyRunExclusionSet — scenarios
  ---
  duration_ms: 57.837066
  type: 'suite'
  ...
# Subtest: CADENCE_WINDOW_MS constants
    # Subtest: daily window is exactly 24 hours
    ok 1 - daily window is exactly 24 hours
      ---
      duration_ms: 0.209266
      type: 'test'
      ...
    # Subtest: weekly window is exactly 7 days
    ok 2 - weekly window is exactly 7 days
      ---
      duration_ms: 0.110417
      type: 'test'
      ...
    1..2
ok 177 - CADENCE_WINDOW_MS constants
  ---
  duration_ms: 0.458673
  type: 'suite'
  ...
# Subtest: secureRandom
    # Subtest: returns values in [0, 1)
    ok 1 - returns values in [0, 1)
      ---
      duration_ms: 3.794669
      type: 'test'
      ...
    # Subtest: returns varied values
    ok 2 - returns varied values
      ---
      duration_ms: 0.450834
      type: 'test'
      ...
    1..2
ok 178 - secureRandom
  ---
  duration_ms: 5.636377
  type: 'suite'
  ...
# Subtest: summarizes recent lock reliability by platform/cadence/backend/relay
ok 179 - summarizes recent lock reliability by platform/cadence/backend/relay
  ---
  duration_ms: 79.425649
  type: 'test'
  ...
# Subtest: run-flaky-check reports pass/fail counts from TAP output files
ok 180 - run-flaky-check reports pass/fail counts from TAP output files
  ---
  duration_ms: 778.966832
  type: 'test'
  ...
# Subtest: loadTorchConfig (Unit Tests with Mocked FS)
    # Subtest: loads valid config correctly
    ok 1 - loads valid config correctly
      ---
      duration_ms: 7.655516
      type: 'test'
      ...
    # Subtest: returns default config when file is missing
    ok 2 - returns default config when file is missing
      ---
      duration_ms: 0.689968
      type: 'test'
      ...
    # Subtest: throws error on malformed JSON
    ok 3 - throws error on malformed JSON
      ---
      duration_ms: 1.073321
      type: 'test'
      ...
    # Subtest: caches the config and ignores subsequent fs calls
    ok 4 - caches the config and ignores subsequent fs calls
      ---
      duration_ms: 0.771293
      type: 'test'
      ...
    # Subtest: returns null for empty string lists (new consistent behavior)
    ok 5 - returns null for empty string lists (new consistent behavior)
      ---
      duration_ms: 0.826661
      type: 'test'
      ...
    1..5
ok 181 - loadTorchConfig (Unit Tests with Mocked FS)
  ---
  duration_ms: 12.632777
  type: 'suite'
  ...
# Subtest: torch-config
    # Subtest: getTorchConfigPath
        # Subtest: returns default path when env var is not set
        ok 1 - returns default path when env var is not set
          ---
          duration_ms: 1.164132
          type: 'test'
          ...
        # Subtest: returns custom path when env var is set
        ok 2 - returns custom path when env var is set
          ---
          duration_ms: 0.250614
          type: 'test'
          ...
        1..2
    ok 1 - getTorchConfigPath
      ---
      duration_ms: 2.803287
      type: 'suite'
      ...
    # Subtest: parseTorchConfig
        # Subtest: parses new lock backend knobs
        ok 1 - parses new lock backend knobs
          ---
          duration_ms: 1.279904
          type: 'test'
          ...
        1..1
    ok 2 - parseTorchConfig
      ---
      duration_ms: 1.539447
      type: 'suite'
      ...
    # Subtest: loadTorchConfig
        # Subtest: throws fatal error for invalid relay URL
        ok 1 - throws fatal error for invalid relay URL
          ---
          duration_ms: 13.570984
          type: 'test'
          ...
        # Subtest: throws fatal error for invalid timeout range
        ok 2 - throws fatal error for invalid timeout range
          ---
          duration_ms: 1.96759
          type: 'test'
          ...
        # Subtest: throws error for malformed JSON
        ok 3 - throws error for malformed JSON
          ---
          duration_ms: 1.641381
          type: 'test'
          ...
        1..3
    ok 3 - loadTorchConfig
      ---
      duration_ms: 18.007172
      type: 'suite'
      ...
    # Subtest: backend getters
        # Subtest: returns default relays
        ok 1 - returns default relays
          ---
          duration_ms: 3.157714
          type: 'test'
          ...
        # Subtest: validates env knob values
        ok 2 - validates env knob values
          ---
          duration_ms: 2.035273
          type: 'test'
          ...
        1..2
    ok 4 - backend getters
      ---
      duration_ms: 5.674434
      type: 'suite'
      ...
    1..4
ok 182 - torch-config
  ---
  duration_ms: 29.03921
  type: 'suite'
  ...
# Subtest: Async Utilities
    # Subtest: withTimeout
        # Subtest: resolves when promise completes before timeout
        ok 1 - resolves when promise completes before timeout
          ---
          duration_ms: 11.382416
          type: 'test'
          ...
        # Subtest: rejects when promise times out
        ok 2 - rejects when promise times out
          ---
          duration_ms: 10.609774
          type: 'test'
          ...
        # Subtest: clears timeout on success
        ok 3 - clears timeout on success
          ---
          duration_ms: 0.352068
          type: 'test'
          ...
        # Subtest: propagates original promise rejection
        ok 4 - propagates original promise rejection
          ---
          duration_ms: 0.501771
          type: 'test'
          ...
        1..4
    ok 1 - withTimeout
      ---
      duration_ms: 23.984008
      type: 'suite'
      ...
    1..1
ok 183 - Async Utilities
  ---
  duration_ms: 24.655016
  type: 'suite'
  ...
# (node:5597) ExperimentalWarning: The MockTimers API is an experimental feature and might change at any time
# (Use `node --trace-warnings ...` to show where the warning was created)
# Subtest: Date Utilities
    # Subtest: todayDateStr
        # Subtest: returns current date in YYYY-MM-DD format
        ok 1 - returns current date in YYYY-MM-DD format
          ---
          duration_ms: 4.801728
          type: 'test'
          ...
        1..1
    ok 1 - todayDateStr
      ---
      duration_ms: 5.790574
      type: 'suite'
      ...
    # Subtest: nowUnix
        # Subtest: returns current unix timestamp
        ok 1 - returns current unix timestamp
          ---
          duration_ms: 0.347331
          type: 'test'
          ...
        1..1
    ok 2 - nowUnix
      ---
      duration_ms: 0.592315
      type: 'suite'
      ...
    # Subtest: getIsoWeekStr
        # Subtest: returns correct ISO week for simple cases
        ok 1 - returns correct ISO week for simple cases
          ---
          duration_ms: 0.409202
          type: 'test'
          ...
        # Subtest: handles year boundaries correctly
        ok 2 - handles year boundaries correctly
          ---
          duration_ms: 0.217719
          type: 'test'
          ...
        # Subtest: handles leap years
        ok 3 - handles leap years
          ---
          duration_ms: 0.340486
          type: 'test'
          ...
        # Subtest: handles empty input (defaults to today)
        ok 4 - handles empty input (defaults to today)
          ---
          duration_ms: 0.355789
          type: 'test'
          ...
        # Subtest: handles invalid input gracefully
        ok 5 - handles invalid input gracefully
          ---
          duration_ms: 0.46777
          type: 'test'
          ...
        1..5
    ok 3 - getIsoWeekStr
      ---
      duration_ms: 2.367178
      type: 'suite'
      ...
    1..3
ok 184 - Date Utilities
  ---
  duration_ms: 9.670311
  type: 'suite'
  ...
# Subtest: Relay Utilities
    # Subtest: mergeRelayList
        # Subtest: merges two lists of relays without duplicates
        ok 1 - merges two lists of relays without duplicates
          ---
          duration_ms: 1.178839
          type: 'test'
          ...
        # Subtest: handles empty lists
        ok 2 - handles empty lists
          ---
          duration_ms: 0.306714
          type: 'test'
          ...
        1..2
    ok 1 - mergeRelayList
      ---
      duration_ms: 1.943044
      type: 'suite'
      ...
    1..1
ok 185 - Relay Utilities
  ---
  duration_ms: 2.147772
  type: 'suite'
  ...
# Subtest: Platform Utilities
    # Subtest: detectPlatform
        # Subtest: detects jules
        ok 1 - detects jules
          ---
          duration_ms: 0.5118
          type: 'test'
          ...
        # Subtest: detects codex
        ok 2 - detects codex
          ---
          duration_ms: 0.159975
          type: 'test'
          ...
        # Subtest: detects goose
        ok 3 - detects goose
          ---
          duration_ms: 0.18698
          type: 'test'
          ...
        # Subtest: detects claude via CLAUDE_API_KEY
        ok 4 - detects claude via CLAUDE_API_KEY
          ---
          duration_ms: 0.133219
          type: 'test'
          ...
        # Subtest: detects claude via ANTHROPIC_API_KEY
        ok 5 - detects claude via ANTHROPIC_API_KEY
          ---
          duration_ms: 0.127844
          type: 'test'
          ...
        # Subtest: detects gemini via GEMINI_API_KEY
        ok 6 - detects gemini via GEMINI_API_KEY
          ---
          duration_ms: 0.210869
          type: 'test'
          ...
        # Subtest: detects gemini via GOOGLE_API_KEY
        ok 7 - detects gemini via GOOGLE_API_KEY
          ---
          duration_ms: 0.151319
          type: 'test'
          ...
        # Subtest: detects antigravity via ANTIGRAVITY_API_KEY
        ok 8 - detects antigravity via ANTIGRAVITY_API_KEY
          ---
          duration_ms: 0.125334
          type: 'test'
          ...
        # Subtest: detects antigravity via ANTIGRAVITY_SESSION_ID
        ok 9 - detects antigravity via ANTIGRAVITY_SESSION_ID
          ---
          duration_ms: 0.136131
          type: 'test'
          ...
        # Subtest: detects qwen via QWEN_API_KEY
        ok 10 - detects qwen via QWEN_API_KEY
          ---
          duration_ms: 0.127065
          type: 'test'
          ...
        # Subtest: returns null if no platform detected
        ok 11 - returns null if no platform detected
          ---
          duration_ms: 0.116745
          type: 'test'
          ...
        1..11
    ok 1 - detectPlatform
      ---
      duration_ms: 2.718077
      type: 'suite'
      ...
    1..1
ok 186 - Platform Utilities
  ---
  duration_ms: 2.856271
  type: 'suite'
  ...
# Subtest: File Utilities
    # Subtest: ensureDir
        # Subtest: creates directory if it does not exist
        ok 1 - creates directory if it does not exist
          ---
          duration_ms: 0.470604
          type: 'test'
          ...
        # Subtest: does nothing if directory already exists
        ok 2 - does nothing if directory already exists
          ---
          duration_ms: 0.271022
          type: 'test'
          ...
        # Subtest: creates nested directories recursively
        ok 3 - creates nested directories recursively
          ---
          duration_ms: 0.286504
          type: 'test'
          ...
        1..3
    ok 1 - ensureDir
      ---
      duration_ms: 3.75757
      type: 'suite'
      ...
    1..1
ok 187 - File Utilities
  ---
  duration_ms: 3.985742
  type: 'suite'
  ...
# Subtest: String Utilities
    # Subtest: relayListLabel
        # Subtest: joins relay URLs with comma and space
        ok 1 - joins relay URLs with comma and space
          ---
          duration_ms: 0.181609
          type: 'test'
          ...
        # Subtest: handles single relay
        ok 2 - handles single relay
          ---
          duration_ms: 0.098948
          type: 'test'
          ...
        # Subtest: handles empty array
        ok 3 - handles empty array
          ---
          duration_ms: 0.17857
          type: 'test'
          ...
        1..3
    ok 1 - relayListLabel
      ---
      duration_ms: 0.608565
      type: 'suite'
      ...
    1..1
ok 188 - String Utilities
  ---
  duration_ms: 0.728059
  type: 'suite'
  ...
# Subtest: passes when artifacts include metadata and failure IDs map to unresolved known issue entries
ok 189 - passes when artifacts include metadata and failure IDs map to unresolved known issue entries
  ---
  duration_ms: 74.331158
  type: 'test'
  ...
# Subtest: fails when required metadata is missing from artifacts
ok 190 - fails when required metadata is missing from artifacts
  ---
  duration_ms: 62.977056
  type: 'test'
  ...
# Subtest: fails when failure identifiers are not cross-linked to known issues or incidents
ok 191 - fails when failure identifiers are not cross-linked to known issues or incidents
  ---
  duration_ms: 65.600454
  type: 'test'
  ...
1..191
# tests 371
# suites 48
# pass 369
# fail 0
# cancelled 1
# skipped 1
# todo 0
# duration_ms 40450.330001
```

# Retry: test/relay-fanout-quorum.integration.test.mjs
The original run had a timeout failure in `test/relay-fanout-quorum.integration.test.mjs`. Retrying individually passed:

```
TAP version 13
# [publish:primary] Publishing to 3 relays (ws://127.0.0.1:41011, ws://127.0.0.1:41489, ws://127.0.0.1:46705)...
#   Published to 1/3 relays (required=1, timeout=80ms)
# Subtest: relay fanout quorum integration
    # Subtest: passes with required=1 when one relay succeeds and two fail
# [publish:primary] Publishing to 3 relays (ws://127.0.0.1:35095, ws://127.0.0.1:41057, ws://127.0.0.1:45177)...
    ok 1 - passes with required=1 when one relay succeeds and two fail
      ---
      duration_ms: 131.854597
      type: 'test'
      ...
    # Subtest: fails with quorum error for required=1 when all relays fail
    ok 2 - fails with quorum error for required=1 when all relays fail
      ---
      duration_ms: 91.472093
      type: 'test'
      ...
# [publish:primary] Publishing to 3 relays (ws://127.0.0.1:34823, ws://127.0.0.1:34829, ws://127.0.0.1:39023)...
    # Subtest: fails with required=2 when only one relay succeeds
    ok 3 - fails with required=2 when only one relay succeeds
      ---
      duration_ms: 89.940114
      type: 'test'
      ...
# [publish:primary] Publishing to 3 relays (ws://127.0.0.1:32899, ws://127.0.0.1:36825, ws://127.0.0.1:40829)...
#   Published to 2/3 relays (required=2, timeout=80ms)
    # Subtest: passes when delayed successes reach quorum before timeout
    ok 4 - passes when delayed successes reach quorum before timeout
      ---
      duration_ms: 88.244154
      type: 'test'
      ...
    1..4
ok 1 - relay fanout quorum integration
  ---
  duration_ms: 403.322808
  type: 'suite'
  ...
1..1
# tests 4
# suites 1
# pass 4
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 4887.025498
```
