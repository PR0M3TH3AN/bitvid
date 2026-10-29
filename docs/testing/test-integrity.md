# Scenario-First Tests & Test Integrity (Dark Factory Standard)

> Extracted verbatim from `AGENTS.md` §16, which retains a short summary. This is the canonical test-integrity standard: read it in full before adding or modifying any test.

In this repo, **validation replaces code review**. That means our test/scenario system is the *only* thing standing between “working software” and “green-but-worthless software.”

Agents will naturally optimize for short-term goals (e.g., “get CI green”) unless we constrain them. If we ever allow “edit tests until they pass,” we destroy the signal, and over time the suite becomes meaningless.

### Core philosophy: scenarios > checklists

We treat tests as **behavioral specifications** expressed as **scenarios**:
- “User stories” / end-to-end behaviors (Given/When/Then or equivalent)
- Assertions focus on **externally observable outcomes** at boundaries (API responses, persisted state, emitted events, CLI output, UI state), not internal call sequences.
- We prefer *minimal coupling* to implementation details so refactors don’t require rewriting “truth.”

(StrongDM reached the same conclusion: repo-local tests are easy to reward-hack; scenarios and satisfaction-based validation reduce “teaching to the test.”)

### Non-negotiable constitution (anti-cheat)

**Hard rules (always on):**
1) **Never weaken, delete, or rewrite a test just to make CI pass.**
2) **Never change expected behavior to match buggy output** (“rubber-stamp the snapshot”, “update golden”, “adjust assertion”) unless it is a **spec correction** (see below).
3) Do not “fix” flaky tests with retries, sleeps, timeouts, or looser assertions. **Remove nondeterminism** instead (control time, randomness, IO, network).
4) Prefer black-box assertions at system boundaries; avoid tests that merely mirror internal logic.

### Definitions

- **Scenario**: a behavioral spec (often end-to-end) describing what must happen for a user/system in a real environment.
- **Invariant**: a property that must always hold across many inputs/states (great for property-based or metamorphic testing).
- **Holdout scenario**: an evaluation scenario kept outside the agent-editable area to reduce overfitting / reward-hacking.

### When tests may change (spec correction protocol)

Changing a test expectation is allowed **only** when the test was enforcing the wrong behavior.

If you believe a test should change:
1) Identify the **scenario/spec** that defines correct behavior.
2) Explain precisely why the old expectation was wrong.
3) Replace it with an **equally strict or stricter** behavior-based check.
4) Record a **Test Integrity Note** (below) and, if applicable, a short spec note (e.g., `docs/spec_changes/<date>-<slug>.md`).

If you cannot point to scenario/spec truth, **do not change the test**. Add a “Needs Spec Clarification” note instead.

### “Test Integrity Note” (required for any PR touching tests)

Every PR that adds/changes tests must include this machine-readable block in the PR description (or in a `TEST_INTEGRITY.md` entry referenced by the PR):

```yaml
test_integrity_note:
  change_type: ["new_tests" | "refactor_tests" | "spec_correction" | "flake_fix"]
  scenarios:
    - id: SCN-<slug>
      given: "<preconditions>"
      when: "<stimulus>"
      then: "<observable outcomes>"
  observable_outcomes:
    - "<what the user/system can observe at the boundary>"
  determinism_controls:
    - "<fake clock / fixed seed / hermetic env / service virtualization>"
  anti_cheat_rationale:
    prevents:
      - "hard-coded return value"
      - "over-mocking internal logic"
      - "snapshot rubber-stamping"
      - "retry/sleep-based flake masking"
  relaxation:
    did_relax_any_assertion: false
    if_true_explain_spec_basis: ""
```

### Test portfolio guidance (scenario-first, still layered)

We want a balanced suite:

- **Scenario/E2E**: user-story validation at boundaries (few, high value, high fidelity)
- **Integration/contract**: service boundaries, serialization, persistence, workflows
- **Unit/invariants**: properties that kill trivial cheats (“return true” shouldn’t survive)

For cheat resistance, strongly prefer:
- invariants/property-based tests for critical logic
- metamorphic relations where “exact expected output” is hard
- periodic mutation testing to “test the tests” (surviving mutants indicate missing assertions)

### External dependency realism (service virtualization / “digital twins”)

Where third-party services are involved, we prefer deterministic “behavioral clones” (mocks/stubs at the API boundary that reproduce edge cases and contracts) over live calls. This keeps scenarios realistic without being flaky or rate-limited, and it makes high-volume scenario validation affordable.

### Role: Test Integrity & Scenario Spec Agent (Enforcer)

This repo includes (or assumes) a dedicated agent role whose only job is to protect validation integrity.

This agent’s goal is NOT “make CI green.” Its goal is “make the suite reflect reality and reject fake passes.”

**Authority:**
- May add new scenarios, invariants, and tests.
- May refactor tests to be more behavioral and less procedural.
- May improve determinism (fixed seeds, fake clocks, hermetic env).
- May only change expectations via the Spec Correction Protocol above.

**Prohibitions:**
- Must never weaken tests to pass.
- Must never edit holdout scenarios (if configured).
- Must never solve flakiness via retries/sleeps/loosening.

**Deliverables each run:**
- Scenario list (Given/When/Then)
- Proposed test diffs
- Test Integrity Note
- “Cheat vectors blocked” summary (what trivial implementations it prevents)

