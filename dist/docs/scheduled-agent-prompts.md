# Scheduled Agent Prompts

Copy-paste these prompts to schedule recurring maintenance tasks for AI agents.
Each prompt is self-contained and targets one specific problem. Run them against
the `unstable` branch.

---

## 1. File Decomposition (run weekly or biweekly)

**Best agent:** Claude Code (needs full codebase context for safe refactoring)

```
Target the `unstable` branch. Run `node scripts/check-file-size.mjs --report`
to see all grandfathered oversized files and their line counts.

Pick the SINGLE largest grandfathered file that has not been decomposed recently.
Do NOT try to decompose multiple files in one PR.

For the chosen file:
1. Read the entire file and identify 2-3 cohesive blocks of logic that can be
   extracted into separate modules (look for: groups of related helper functions,
   self-contained class methods that could become a separate service, rendering
   logic that could become its own controller).
2. Extract each block into a new file in the same directory.
3. Export the extracted code and import it from the original file.
4. Run `npm run lint` and `npm run test:unit` to verify nothing broke.
5. Update the grandfathered line count in `scripts/check-file-size.mjs` to
   reflect the new (smaller) size of the original file.
6. Commit with message prefix `[decompose]` and create a PR targeting `unstable`.

Goal: reduce the file by at least 200 lines per session. Do not change any
behavior — this is a pure extraction refactor.
```

---

## 2. innerHTML Migration (run weekly or biweekly)

**Best agent:** Claude Code or Codex (scoped to individual files)

```
Target the `unstable` branch. Run `node scripts/check-innerhtml.mjs --report`
to see all files with innerHTML usage and their counts.

Pick ONE file from the list (prefer files with the highest count or files
tagged RISKY in the audit). Do NOT try to migrate multiple files at once.

For the chosen file:
1. Read the file and find all innerHTML assignments.
2. For each assignment, determine if it can be replaced with safe DOM APIs:
   - Static text: use `element.textContent = "..."`.
   - Creating elements: use `document.createElement()` + `appendChild()`.
   - Template HTML with user data: ensure ALL interpolated values pass through
     `escapeHtml()` from `js/utils/domUtils.js`.
3. Replace as many innerHTML assignments as possible with safe alternatives.
4. Run `npm run lint` and `npm run test:unit` to verify nothing broke.
5. Update the baseline: run `node scripts/check-innerhtml.mjs --update` and
   copy the new BASELINE object into `scripts/check-innerhtml.mjs`.
6. Commit with message prefix `[security]` and create a PR targeting `unstable`.

Priority order for migration:
- RISKY files first (user data without escaping)
- High-count files next (profileModalController, searchView, channelProfile)
- Low-count static files last (these are low risk)
```

---

## 3. Constant Deduplication Audit (run monthly)

**Best agent:** Any agent (simple search task)

```
Target the `unstable` branch.

Search for numeric constants in `js/` that appear in multiple files with
the same value and similar purpose. Focus on:
- Timeout values (5000, 10000, 30000, 60000, etc.)
- Retry counts
- Cache TTLs
- Threshold values

For each duplicate found:
1. Determine the canonical location (check `js/constants.js`,
   `js/nostr/relayConstants.js`, `js/nostr/cachePolicies.js`).
2. If a canonical location exists, replace the duplicate with an import.
3. If no canonical location exists, create one in the most appropriate
   shared module.
4. Run `npm run lint` and `npm run test:unit`.
5. Commit with message prefix `[constants]` and create a PR targeting `unstable`.
```

---

## 4. Code Health Dashboard (run weekly)

**Best agent:** Any agent (read-only audit)

```
Target the `unstable` branch. Run all three audit scripts in report mode:

1. `node scripts/check-file-size.mjs --report`
2. `node scripts/check-innerhtml.mjs --report`
3. `npm run lint`

Report the following metrics:
- Total grandfathered oversized files and sum of excess lines
- Total innerHTML assignments across all files
- Any lint failures

Compare against the previous week's report (if available in issues/PRs).
Post the results as a GitHub issue comment or a summary in the PR description
so the maintainer can track progress.
```
