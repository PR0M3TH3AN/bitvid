# Wind-down and restart

Used when the usage meter passes the wind-down mark (usage.windDownAtPct, default
95%), before a known reset, or when the owner says so.

## Wind-down (the session manager runs it; one message to every area)

1. Create `<stateDir>/PAUSED` containing the reason and time. Scheduled jobs (except
   restart) skip while it exists.
2. Tell every area: "Wind-down: finish or park your current step, commit, merge
   <main>, submit if green, update `.task` and your docs/TODO.md section, then stop
   taking turns. If you have a scarce machine, say you are done with it in .task."
3. Wait for each area's one-line report (SHA + state), then `node tools/fleet/bin/doctor.mjs`:
   no DIRTY, no ONE-DISK rows, queue drained (`landq.mjs status`).
4. Write docs/agents/RESUME-BRIEF.md (mid-flight table, held work, owner questions)
   and land it.
5. Stop sessions only if needed (`fleet down`); an idle session costs nothing.

## Restart (after the reset)

1. Remove `<stateDir>/PAUSED` (the restart job does it).
2. `fleet up` (resumes every area by session id; the session manager last).
3. Each area reads RESUME-BRIEF.md and its TODO section, reports one line if blocked.
4. The session manager checks `doctor`, `landq status`, and picks up the loop.

## Meter thresholds (if the usage governor is on)

| meter | action |
| --- | --- |
| >= windDownAtPct | wind down now, tell the owner |
| slowDownAtPct .. windDownAtPct | stop filling lulls: only close, relay and land |
| below | proceed |
