---
cadence: daily
agent: scheduler-update-agent
status: failed
reason: 'Missing required run artifacts'
detail: 'Missing required run artifacts:
- src/context/CONTEXT_<timestamp>.md
- src/todo/TODO_<timestamp>.md
- src/decisions/DECISIONS_<timestamp>.md
- src/test_logs/TEST_LOG_<timestamp>.md'
created_at: 2026-02-25T20:19:21.016Z
timestamp: 2026-02-25T20:19:21.016Z
platform: 'linux'
failure_category: 'prompt_schema_error'
failure_class: 'prompt_validation_error'
---
# Scheduler failed
- reason: Missing required run artifacts
- detail: Missing required run artifacts:
- src/context/CONTEXT_<timestamp>.md
- src/todo/TODO_<timestamp>.md
- src/decisions/DECISIONS_<timestamp>.md
- src/test_logs/TEST_LOG_<timestamp>.md
- platform: linux
- failure_category: prompt_schema_error
- failure_class: prompt_validation_error