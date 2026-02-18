# deps-security-agent Report

## Summary
Performed daily dependency audit. Generated artifacts in `artifacts/`.

## Upgrades
- **jsdom**: Upgraded from `28.0.0` to `28.1.0` (Safe patch/minor upgrade).
- Verified with `npm run test:unit:shard[1-3]`.

## Artifacts
- `artifacts/npm-audit.json`
- `artifacts/npm-outdated.json`
- `artifacts/deps-report.md`

## Next Steps
- Review `artifacts/deps-report.md` for other potential upgrades.
