# Decisions

- Used `npm` as the package manager because `package-lock.json` exists (per prompt detection rule), even though `pnpm-lock.yaml` is also present.
- Continued with read-only audit/outdated collection after `npm ci` failed, because `npm audit --json` and `npm outdated --json` still produced valid artifacts.
- Did **not** attempt dependency upgrades in this run due to Node engine incompatibility (`required >=22`, actual `20.19.6`), to avoid non-reproducible lockfile churn and invalid test evidence.
- Marked this daily run as completed with warnings rather than failed, since required artifacts and triage report were produced successfully.
