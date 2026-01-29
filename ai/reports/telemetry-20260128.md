# Telemetry Report - 2026-01-28

**Total Unique Issues:** 6
**Generated:** 2026-01-28T06:17:38.223Z

## Top 10 Priority Issues

| Priority | Count | Issue | Owner | Sources |
| :--- | :---: | :--- | :--- | :--- |
| **High** | 6 | handleModerationBlock requests a block, clears overrides,... | QA Team | unit-test:test_unit_debug_2.log, unit-test:test_unit_debug_3.log, unit-test:test_unit_pre_commit.log, unit-test:test_unit_retry.log, unit-test:test_unit_retry_3.log, unit-test:test_unit_retry_4.log |
| **High** | 2 | handleModerationOverride resumes deferred playback | QA Team | unit-test:test_unit_retry_2.log, unit-test:test_unit_retry_3.log |
| **High** | 1 | handleModerationBlock requests a block, clears overrides,... | QA Team | unit-test:test_unit_debug_4.log |
| **High** | 1 | handleModerationBlock requests a block, clears overrides,... | QA Team | unit-test:test_unit_final.log |
| **High** | 1 | handleModerationOverride decorates stored and current vid... | QA Team | unit-test:test_unit_retry_2.log |
| **High** | 1 | handleModerationBlock requests a block, clears overrides,... | QA Team | unit-test:test_unit_retry_2.log |

## Detailed Breakdown

### [High] handleModerationBlock requests a block, clears overrides, and refreshes hidden state
- **Occurrences:** 6
- **Sources:** unit-test:test_unit_debug_2.log, unit-test:test_unit_debug_3.log, unit-test:test_unit_pre_commit.log, unit-test:test_unit_retry.log, unit-test:test_unit_retry_3.log, unit-test:test_unit_retry_4.log
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

### [High] handleModerationOverride resumes deferred playback
- **Occurrences:** 2
- **Sources:** unit-test:test_unit_retry_2.log, unit-test:test_unit_retry_3.log
- **Suggested Owner:** QA Team
- **Fingerprint:** `bcbb97f7`

**Stack Trace / Details:**
```
TestContext.<anonymous> (file://$REPO/tests$REPO/moderation-overrides.test.mjs:104:10)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: handleModerationBlock requests a block, clears overrides, and refreshes hidden state
```

### [High] handleModerationBlock requests a block, clears overrides, and refreshes hidden state
- **Occurrences:** 1
- **Sources:** unit-test:test_unit_debug_4.log
- **Suggested Owner:** QA Team
- **Fingerprint:** `80a22b69`

**Stack Trace / Details:**
```
TestContext.<anonymous> (file://$REPO/tests$REPO/moderation-overrides.test.mjs:229:10)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: handleModerationBlock returns false when viewer is logged out
```

### [High] handleModerationBlock requests a block, clears overrides, and refreshes hidden state
- **Occurrences:** 1
- **Sources:** unit-test:test_unit_final.log
- **Suggested Owner:** QA Team
- **Fingerprint:** `5e159618`

**Stack Trace / Details:**
```
TestContext.<anonymous> (file://$REPO/tests$REPO/moderation-overrides.test.mjs:232:10)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: handleModerationBlock returns false when viewer is logged out
```

### [High] handleModerationOverride decorates stored and current videos then refreshes UI
- **Occurrences:** 1
- **Sources:** unit-test:test_unit_retry_2.log
- **Suggested Owner:** QA Team
- **Fingerprint:** `4a2440b4`

**Stack Trace / Details:**
```
TestContext.<anonymous> (file://$REPO/tests$REPO/moderation-overrides.test.mjs:67:10)
    async Test.run (node:internal/test_runner/test:1054:7)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:296:3)
  ...
# Subtest: handleModerationOverride resumes deferred playback
```

### [High] handleModerationBlock requests a block, clears overrides, and refreshes hidden state
- **Occurrences:** 1
- **Sources:** unit-test:test_unit_retry_2.log
- **Suggested Owner:** QA Team
- **Fingerprint:** `a879eb91`

**Stack Trace / Details:**
```
TestContext.<anonymous> (file://$REPO/tests$REPO/moderation-overrides.test.mjs:202:10)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: handleModerationBlock returns false when viewer is logged out
```


---
*Privacy Notice: PII (IPs, emails, keys) has been sanitized from this report.*
