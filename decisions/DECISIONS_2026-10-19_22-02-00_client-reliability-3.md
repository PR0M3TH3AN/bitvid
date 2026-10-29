# Final callback ownership corrections

- Caller review shows app.boundStreamHealthBadgeHandler is shared across feeds; preserve global callback dedup with registration reference counts. Disposing one owner must retain the handler for another owner; final disposal removes it. Wrapping each registration separately would duplicate callbacks.
- Synchronous checking notifications can dispose/rerender the feed before queue submission. Measured1 start after disposal, expected0; check live membership after notification before creating queued work.
- Late observer scenario also asserts no disposed-card notifications reach a remaining registration, not just final badge state. This rejects a removed observer guard even when the reentrant guard still prevents queue submission.
- Final source has11 lifecycle scenarios;14 independent mutants were rerun against this exact product tree, all exit1 with1 failed/0 cancelled, then restored. Source outside gridHealth.js remains untouched.
- Corrected build and Chromium/Firefox built-dist/native-observer smoke both pass; no external requests or page errors. Actual media playback fallback and CPU/RSS remain unverified.
