
## Run at 2026-02-14T04-55-08Z
Command: npm test
Output:
```

> torch-lock@0.1.0 test
> node --test test/*.test.mjs

TAP version 13
# Subtest: CLI Smoke Test
    # Subtest: should print usage when no args provided
    ok 1 - should print usage when no args provided
      ---
      duration_ms: 154.438982
      type: 'test'
      ...
    # Subtest: should fail when checking without cadence
    ok 2 - should fail when checking without cadence
      ---
      duration_ms: 167.381667
      type: 'test'
      ...
    1..2
ok 1 - CLI Smoke Test
  ---
  duration_ms: 323.47485
  type: 'suite'
  ...
1..1
# tests 2
# suites 1
# pass 2
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 419.728338
```
