# Dependency Security Daily Report

_Date:_ 2026-02-13  
_Agent:_ `deps-security-agent`

## Environment

- Package manager selected: **npm** (`package-lock.json` present)
- Node: `v20.19.6`
- npm: `11.4.2`
- Constraint: project engine requires Node `>=22`, so clean install and upgrade validation were blocked in this environment.

## Security Audit Summary (`artifacts/npm-audit.json`)

- Total vulnerabilities: **0**
- Critical: **0**
- High: **0**
- Moderate: **0**
- Low: **0**

### Immediate P0 Security Items

- **None identified** in this run.

## Outdated Dependencies (`artifacts/npm-outdated.json`)

Detected 12 outdated packages.

### Patch candidates (low risk, pending Node 22 runtime)

- `@playwright/test` `1.58.0 -> 1.58.2`
- `playwright` `1.58.0 -> 1.58.2`
- `autoprefixer` `10.4.23 -> 10.4.24`

### Minor candidates (review required)

- `esbuild` `0.25.12 -> 0.27.3`
- `nostr-tools` `2.20.0 -> 2.23.1` (**security-sensitive/protocol library — do not auto-upgrade**)

### Major candidates (issue-first path)

- `cross-env` `7.0.3 -> 10.1.0`
- `jsdom` `27.4.0 -> 28.0.0`

### Additional latest-only drift (outside wanted range)

- `pixelmatch` latest `7.1.0` (current/wanted `5.3.0`)
- `postcss-import` latest `16.1.1` (current/wanted `15.1.0`)
- `prettier-plugin-tailwindcss` latest `0.7.2` (current/wanted `0.6.14`)
- `stylelint` latest `17.2.0` (current/wanted `16.26.1`)
- `tailwindcss` latest `4.1.18` (current/wanted `3.4.19`)

## Triage Decisions

1. No vulnerability escalation needed (no CRITICAL/HIGH findings).
2. No auto-upgrade PRs attempted due to Node engine mismatch in runtime environment.
3. Next execution should run under Node 22+ and then:
   - Apply patch bumps first (`playwright`, `@playwright/test`, `autoprefixer`).
   - Re-run full validation matrix before any PR.
   - Track `nostr-tools` as human-reviewed only.

## Recommended Follow-ups

- Re-run this agent in a Node 22 environment to enable `npm ci` and upgrade testing.
- If Node 22 runtime is available, create small PR(s) for the three patch updates listed above.
- Open issue(s) for major upgrades (`cross-env`, `jsdom`) with staged migration plans.
