# Dependency Security Report (2026-02-19)

## Vulnerabilities
- **High**: 3 (minimatch, serve, serve-handler)
- **Moderate**: 1 (ajv)
- Note: 'serve' vulnerabilities relate to a known issue where the fix suggests a major downgrade. Ignoring as per policy.

## Outdated Packages
- **nostr-tools**: 2.19.4 -> 2.23.1 (Security Sensitive - Skipped)
- **jsdom**: 28.1.0 (Verified / Up-to-date)
- **stylelint**: 16.12.0 -> 16.26.1
- **tailwindcss**: 3.4.19 -> 4.1.18 (Major - Skipped)
- **pixelmatch**: 5.3.0 -> 7.1.0 (Major - Skipped)
- **postcss-import**: 15.1.0 -> 16.1.1 (Major - Skipped)

## Actions
- Verified `jsdom` is at 28.1.0 and tests pass.
