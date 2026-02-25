# Context: Parser Fuzzing Session (Example)

## Goal
Improve robustness by fuzzing high-risk parsers and validators.

## Scope
- Target: core parsing/validation module(s)
- Task: generate malformed and edge-case inputs
- Deliverables:
  - fuzz harness script
  - reproducible failing cases (if found)
  - report artifact with summary metrics

## Constraints
- Do not run traffic against external production services.
- Keep dependencies minimal.
- Capture deterministic seeds for reproducibility.
