# Context

## Goal
Safely decompose a single large grandfathered file by extracting 2–3 cohesive blocks of logic into new modules.

## Scope
- Identify the largest grandfathered file not recently decomposed.
- Extract logic to new files.
- Ensure no behavioral changes.
- Update file size baseline.

## Constraints
- Target branch: `unstable`.
- One file per PR.
- Reduce original file by at least 200 lines.
