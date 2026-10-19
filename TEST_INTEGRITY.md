# client-reliability-1

```yaml
test_integrity_note:
  change_type: ["flake_fix", "new_tests"]
  scenarios:
    - id: SCN-profile-focus-style-contract
      given: "modal controls include visible, disabled, CSS-hidden, inherited-hidden, aria-hidden, and hidden-input cases"
      when: "the real controller collects focus targets using fixture and native JSDOM styles, and the user tabs from the last control"
      then: "both resolvers retain only visible enabled controls and Tab wraps to the first"
  observable_outcomes:
    - "focus target control IDs match the strict expected list"
    - "Tab is prevented and document.activeElement moves to the first control"
    - "all 26 existing modal scenarios preserve their assertions and complete naturally"
  determinism_controls:
    - "stylesheet-free full-markup fixture virtualizes only display and visibility"
    - "small contract scenario runs the same assertions against native JSDOM computed styles"
    - "explicit test stylesheet, local services, real DOM focus and event dispatch; no network"
  anti_cheat_rationale:
    prevents:
      - "hard-coded focus list: varied hidden and visible controls"
      - "over-mocking controller behavior: real updateFocusTrap and keyboard listener"
      - "style resolver rubber-stamping: native resolver must satisfy the same scenario"
      - "retry/sleep-based flake masking: no timeouts, retries, or sleeps added"
  relaxation:
    did_relax_any_assertion: false
    if_true_explain_spec_basis: ""
```

Mutation evidence: removing the product display/visibility exclusion causes this scenario to fail with the hidden control IDs in its focus list (exit 1, 1 failed/0 passed). Mutant reverted. This fixes expensive JSDOM style evaluation in the test harness, not a demonstrated browser defect. Application CSS/layout remains outside this unit fixture's scope.
