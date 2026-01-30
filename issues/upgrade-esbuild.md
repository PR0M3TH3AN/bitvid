# Upgrade esbuild

## Status
- **Current:** `0.25.12`
- **Latest:** `0.27.2`

## Details
`esbuild` 0.x versions may have breaking changes between minor versions.
Used for build scripts (`scripts/build-dist.mjs`, `scripts/build-beacon.mjs`).

## Plan
1. Update `esbuild`.
2. Run build scripts: `npm run build`, `npm run build:beacon`.
3. Verify output bundles work correctly.

## Guardrails
- Build tool upgrade.
