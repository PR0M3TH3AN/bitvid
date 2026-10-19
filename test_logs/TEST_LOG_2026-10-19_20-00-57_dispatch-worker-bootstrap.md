# Worker bootstrap evidence

- Startup product baseline d9059116; latest docs landing 3e451aac, verified by git log unstable.
- `env -u NODE_TEST_CONTEXT UNIT_TEST_TIMEOUT_MS=60000 node scripts/run-unit-tests.mjs profile-modal-controller.test.mjs`: exit 1; timed out after 60000ms. This third reproduction removes inherited test serializer context; no product-correctness claim.
- `tmux list-panes`: dispatch and preview in fleet-bitvid; preview preserved at dispatch worktree. No client-reliability pane yet.
- `fleet up --only client-reliability --dry-run` unexpectedly called ensureWorktree before checking dry-run: attempted setup, created area branch, then sandbox denied worktree directory. No worker launched. Use explicit authorized worktree setup after roster landing; do not rely on dry-run as read-only.
- Bootstrap administrative-only validator planned; no full-suite pass claimed. Persistent gates and all product/test files unchanged by staffing commit.
