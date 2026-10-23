# Bitvid scheduled-job policy

Owner direction, 2026-10-23: "I would like to not have extra processes like this running when the fleet is down or paused".

All seven installed Bitvid cron jobs enter through `tools/fleet/bin/bitvid-schedule-guard.mjs`, not directly through `sched.sh`.

- A missing/dead/stopped interactive fleet means no scheduled headless launch. At least one configured interactive area must have a running record and a live PID.
- `fleet/PAUSED` is represented by the existing state-directory `PAUSED` marker. It unconditionally blocks every job, including the weekly restart job; `ignorePause` does not bypass this outer guard.
- A running scheduled job is checked every second. On pause/down, the guard sends TERM only to the process group it created. Fleet's nested process runners forward termination to their own agent group. A bounded KILL fallback handles a group that does not exit.
- A cron tick while down or paused starts only the brief guard check, which exits without an AI session or persistent watcher. There is no always-on supervisor added.
- Unpausing and bringing the fleet up lets the next normal cron tick run; this policy does not automatically resume a paused fleet.
- Existing quiet hours, per-job non-overlap locks and time limits still apply inside `sched.sh`. The one-heavy-job convention still applies.
- This is a Bitvid-specific file, separate from the kit-managed scheduler. Kit upgrades should retain it. `fleet crontab` prints generic, unguarded commands: do not overwrite the installed guarded entries without preserving this policy.

Validation: `env -u NODE_TEST_CONTEXT node --test tools/fleet/test/bitvid-schedule-guard.test.mjs` passed 8 tests with natural exit; fixtures only, no real fleet shutdown/pause or headless model run. Test integrity: new behavioral coverage, no existing assertions/gates changed. Process stop tests use a disposable sleep child and verify the unrelated test parent remains alive. Nested production runner cleanup relies on the kit's existing TERM forwarding; this is not a real-model stop qualification.
