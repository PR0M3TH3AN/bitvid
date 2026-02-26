# Decision: Implement Diagnostic Utility

## Context
New users or agents may struggle with setting up the environment correctly (Node version, missing config, etc.).

## Decision
Implemented `features/diagnostic.mjs` as a self-contained script to verify the environment.

## Rationale
- Low hanging fruit: high value for troubleshooting, low effort to implement.
- Fits "New Utility Scripts" scope.
- No external dependencies required beyond what's already in the project.
