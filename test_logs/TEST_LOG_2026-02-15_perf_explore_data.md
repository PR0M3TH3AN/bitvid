# Test Log: Explore Data Service Performance Optimization

## Initial State
- No tests for `exploreDataService.js`.
- Creating `tests/unit/services/exploreDataService.test.mjs`.

## Test Execution

**Command**: `node --test tests/unit/services/exploreDataService.test.mjs`

**Output**:
```
TAP version 13
# Subtest: ExploreDataService
    # Subtest: intervals trigger refresh when visible
    ok 1 - intervals trigger refresh when visible
    # Subtest: intervals skip refresh when hidden
    ok 2 - intervals skip refresh when hidden
    # Subtest: visibility change triggers refresh
    ok 3 - visibility change triggers refresh
    # Subtest: visibility change DOES NOT trigger refresh if hidden
    ok 4 - visibility change DOES NOT trigger refresh if hidden
    1..4
ok 1 - ExploreDataService
# tests 4
# suites 1
# pass 4
# fail 0
```

**Result**: All tests passed. The fix effectively gates intervals with `document.hidden` and triggers refresh on visibility change.
