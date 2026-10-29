# Architecture

Durable architectural decisions and constraints for bitvid.

## AGENTS.md is a thin constitution; long-form standards live in docs/

On 2026-08-12 AGENTS.md was split into a thin agent constitution plus
reference docs under `docs/testing/` and `docs/lessons/`, because the file had
outgrown the 32 KiB harness context budget. AGENTS.md keeps only the invariant
and a pointer per topic; new long-form material belongs in `docs/`, not in
AGENTS.md.

Authoritative source:
- docs/testing/test-integrity.md
- docs/testing/agent-playwright-harness.md
- docs/lessons/
- git commit 911afb1c ("Split AGENTS.md reference sections into docs/; keep thin agent constitution")
