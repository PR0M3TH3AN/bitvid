# Dependency Report - 2026-02-20

## Vulnerabilities
### HIGH (3)
- **minimatch**: minimatch has a ReDoS via repeated wildcards with non-matching literal in pattern
  - Path: Direct dependency? No
  - Fix Available: true
- **serve**: ajv, serve-handler
  - Path: Direct dependency? Yes
  - Fix Available: {"name":"serve","version":"6.5.8","isSemVerMajor":true}
- **serve-handler**: minimatch
  - Path: Direct dependency? No
  - Fix Available: true
### MODERATE (1)
- **ajv**: ajv has ReDoS when using `$data` option

## Outdated Packages
### Major Updates (Risky)
- **pixelmatch** (undefined): 5.3.0 -> 7.1.0
- **postcss-import** (undefined): 15.1.0 -> 16.1.1
- **prettier-plugin-tailwindcss** (undefined): 0.6.14 -> 0.7.2
- **stylelint-config-standard** (undefined): 36.0.1 -> 40.0.0
- **tailwindcss** (undefined): 3.4.19 -> 4.2.0

### Minor Updates (Safe-ish)
- **nostr-tools** (undefined): 2.19.4 -> 2.23.1 (Latest: 2.23.1)
- **stylelint** (undefined): 16.12.0 -> 16.26.1 (Latest: 17.3.0)

### Patch Updates (Safe)

## Triage & Actions
- [ ] **HIGH**: Check for safe upgrades for minimatch, serve, serve-handler.
- [ ] **Safe Candidates**: nostr-tools, stylelint
