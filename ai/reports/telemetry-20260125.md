# Telemetry Report - 2026-01-25

**Total Unique Issues:** 1
**Generated:** 2026-01-25T06:32:46.314Z

## Top 10 Priority Issues

| Priority | Count | Issue | Owner | Sources |
| :--- | :---: | :--- | :--- | :--- |
| **High** | 1 | handleModerationBlock requests a block, clears overrides,... | QA Team | unit-test:test_unit_debug.log |

## Detailed Breakdown

### [High] handleModerationBlock requests a block, clears overrides, and refreshes hidden state
- **Occurrences:** 1
- **Sources:** unit-test:test_unit_debug.log
- **Suggested Owner:** QA Team
- **Fingerprint:** `56489eaa`

**Stack Trace / Details:**
```
TestContext.<anonymous> (file://$REPO/tests$REPO/moderation-overrides.test.mjs:228:10)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: handleModerationBlock returns false when viewer is logged out
```


---
*Privacy Notice: PII (IPs, emails, keys) has been sanitized from this report.*
