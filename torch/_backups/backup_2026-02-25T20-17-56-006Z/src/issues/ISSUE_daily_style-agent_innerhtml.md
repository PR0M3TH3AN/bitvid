---
title: InnerHTML violations in landing/index.html
status: open
severity: medium
agent: style-agent
cadence: daily
created: 2026-02-15T08:00:00Z
---

# Issue: InnerHTML usage detected

The `style-agent` detected usage of `innerHTML` in `landing/index.html`, which violates the project's style guidelines for security reasons.

## Violations
- `landing/index.html`: 3 assignments

## Recommendation
Refactor the code to use `document.createElement` or `textContent` where possible.
