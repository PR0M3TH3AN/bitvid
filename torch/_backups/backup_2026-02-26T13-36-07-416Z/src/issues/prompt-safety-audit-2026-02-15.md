# Prompt Safety Audit Findings

See full report at: /app/artifacts/prompt-safety-audit.md

The following prompts were found to be missing standard safety mechanisms:

- audit-agent: Missing explicit FAILURE MODES or EXIT CRITERIA section
- const-refactor-agent: Missing explicit FAILURE MODES or EXIT CRITERIA section, No clear conditional stop/exit logic found
- content-audit-agent: Does not clearly explicitly allow for no-op/stopping
- decompose-agent: Missing explicit FAILURE MODES or EXIT CRITERIA section
- deps-security-agent: Missing explicit FAILURE MODES or EXIT CRITERIA section, No clear conditional stop/exit logic found
- design-system-audit-agent: Missing explicit FAILURE MODES or EXIT CRITERIA section
- docs-code-investigator: Missing explicit FAILURE MODES or EXIT CRITERIA section
- innerhtml-migration-agent: Missing explicit FAILURE MODES or EXIT CRITERIA section
- log-fixer-agent: Missing explicit FAILURE MODES or EXIT CRITERIA section, No clear conditional stop/exit logic found, Does not clearly explicitly allow for no-op/stopping
- perf-agent: Missing explicit FAILURE MODES or EXIT CRITERIA section, No clear conditional stop/exit logic found
- protocol-research-agent: Missing explicit FAILURE MODES or EXIT CRITERIA section, No clear conditional stop/exit logic found, Does not clearly explicitly allow for no-op/stopping
- test-audit-agent: Missing explicit FAILURE MODES or EXIT CRITERIA section, No clear conditional stop/exit logic found, Does not clearly explicitly allow for no-op/stopping
- todo-triage-agent: Missing explicit FAILURE MODES or EXIT CRITERIA section, No clear conditional stop/exit logic found, Does not clearly explicitly allow for no-op/stopping
- torch-garbage-collection-agent: Missing explicit FAILURE MODES or EXIT CRITERIA section
- bug-reproducer-agent: Does not clearly explicitly allow for no-op/stopping
- feature-proposer-agent: Missing explicit FAILURE MODES or EXIT CRITERIA section, No clear conditional stop/exit logic found, Does not clearly explicitly allow for no-op/stopping
- perf-deepdive-agent: Missing explicit FAILURE MODES or EXIT CRITERIA section, No clear conditional stop/exit logic found, Does not clearly explicitly allow for no-op/stopping
- pr-review-agent: Does not clearly explicitly allow for no-op/stopping
- prompt-maintenance-agent: Missing explicit FAILURE MODES or EXIT CRITERIA section, No clear conditional stop/exit logic found, Does not clearly explicitly allow for no-op/stopping
- race-condition-agent: Missing explicit FAILURE MODES or EXIT CRITERIA section, No clear conditional stop/exit logic found
- repo-fit-agent: Missing explicit FAILURE MODES or EXIT CRITERIA section, No clear conditional stop/exit logic found, Does not clearly explicitly allow for no-op/stopping
- test-coverage-agent: Does not clearly explicitly allow for no-op/stopping
- ui-ux-agent: Missing explicit FAILURE MODES or EXIT CRITERIA section, No clear conditional stop/exit logic found
- weekly-synthesis-agent: Does not clearly explicitly allow for no-op/stopping