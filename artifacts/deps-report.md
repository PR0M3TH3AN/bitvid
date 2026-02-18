# Dependency Security Report: 2026-02-14

## Summary
- **Vulnerabilities**: 0
- **Outdated Packages**: 7
- **Critical/High Issues**: 0

## Vulnerabilities
No known vulnerabilities found.

## Outdated Packages

| Package | Current | Wanted | Latest | Type | Status |
|---------|---------|--------|--------|------|--------|
| `nostr-tools` | 2.19.4 | 2.23.1 | 2.23.1 | dep | **REQUIRES REVIEW** (Crypto) |
| `stylelint` | 16.12.0 | 16.26.1 | 17.3.0 | devDep | Safe Candidate |
| `pixelmatch` | 5.3.0 | 5.3.0 | 7.1.0 | devDep | Major |
| `postcss-import` | 15.1.0 | 15.1.0 | 16.1.1 | devDep | Major |
| `prettier-plugin-tailwindcss` | 0.6.14 | 0.6.14 | 0.7.2 | devDep | Major/Minor |
| `stylelint-config-standard` | 36.0.1 | 36.0.1 | 40.0.0 | devDep | Major |
| `tailwindcss` | 3.4.19 | 3.4.19 | 4.1.18 | devDep | Major |

## Recommendations
1.  **nostr-tools**: Open an issue to review the changes in 2.23.1 and verify NIP compatibility.
2.  **stylelint**: Safe to upgrade to 16.26.1.
3.  **tailwindcss**: Plan migration to v4.
