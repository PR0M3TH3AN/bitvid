# client-reliability-2 pre-commit checks

- Baseline race unchanged from filedAt f303ab0e72 through merged3968a979; prior full run failed60s/file after226/425 passed and isolated scenario passed60.91ms but process timed out10s/124. Dispatch independently confirmed62ms/124.
- Fixed direct isolated race run: exit0 naturally, 1 passed, 0 failed/cancelled/skipped; scenario9.43ms, total15.69ms (before failure-path teardown await refinement).
- Test-local historical early-return init mutant: exit1 naturally, 1 failed/0 passed; pending second caller assertion catches early settlement.
- Test-local failure connection mutant: exit1 naturally, 1 failed/0 passed; no-retry assertion catches the reconnect timer. Both mutations restored. Product files untouched.
- Final isolated/profile/lint and merged full gates recorded next. No full pass or landing claimed yet.
- Final direct isolated race file: exit0 naturally, 1 passed/0 failed/cancelled/skipped, scenario10.32ms / total14.86ms.
- Preserved profile-modal file: exit0 naturally, 27 passed/0 failed/cancelled/skipped, total2635.71ms.
- `npm run lint` unrestricted: exit0, all11 stages passed. `git diff --check`: exit0.
