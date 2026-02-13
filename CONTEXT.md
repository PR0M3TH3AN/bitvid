# Context

## Goal
Execute the **bitvid-dead-code-agent** weekly task.
Identify and safely remove verified dead code (orphaned files, unused exports) from the repository.

## Scope
- **In Scope**:
    - Identifying orphaned JS/CSS/asset files.
    - identifying unused exports (with strict proof).
    - Removing proven dead code.
    - Updating documentation if needed.
- **Out of Scope**:
    - Refactoring.
    - Changing logic.
    - Touching sensitive areas (crypto/auth) without 100% certainty.

## Plan
1.  Run baseline verification.
2.  Scan for orphaned files.
3.  Scan for unused exports.
4.  Verify candidates against codebase (grep, entrypoints).
5.  Remove verified dead code.
6.  Run post-removal verification.
7.  Report results.
