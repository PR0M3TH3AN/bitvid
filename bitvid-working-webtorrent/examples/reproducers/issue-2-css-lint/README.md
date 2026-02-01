# CSS Lint Tokens Bug Reproducer

This directory contains a reproducer for the CSS linting issue where raw measurements are detected in `css/tailwind.source.css`.

## Issue

The `lint:tokens` check fails due to raw values (e.g., `40rem`) being used instead of design tokens.

## Running the Reproducer

Run the script from the repository root:

```bash
node examples/reproducers/issue-2-css-lint/repro.mjs
```

Expected result: The script should output a lint failure message and exit with a non-zero status.
