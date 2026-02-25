# Telemetry Report - 2026-02-24

**Total Unique Issues:** 1
**Generated:** 2026-02-24T13:31:15.378Z

## Top 10 Priority Issues

| Priority | Count | Issue | Owner | Sources |
| :--- | :---: | :--- | :--- | :--- |
| **Medium** | 1 | Load Test Bottleneck: Cryptographic Bottleneck (Avg Sign ... | P2P Team | load-test:load-report-20260204.json |

## Detailed Breakdown

### [Medium] Load Test Bottleneck: Cryptographic Bottleneck (Avg Sign Time 5.87ms > 5ms)
- **Occurrences:** 1
- **Sources:** load-test:load-report-20260204.json
- **Suggested Owner:** P2P Team
- **Fingerprint:** `00257328`

**Stack Trace / Details:**
```
Bottleneck: Cryptographic Bottleneck (Avg Sign Time 5.87ms > 5ms)
Remediation: Client-side event signing is slow. Review cryptographic library (nostr-tools) usage or client hardware capabilities.
```


---
*Privacy Notice: PII (IPs, emails, keys) has been sanitized from this report.*
