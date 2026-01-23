# Cancelling CI Runs

This document explains how to use the `scripts/cancel-all-ci-runs.sh` script to cancel pending or in-progress CI workflows. This is useful when you have a backlog of runs that are no longer needed.

## Prerequisites

- **GitHub CLI (`gh`)**: You must have the GitHub CLI installed and authenticated.
  - Install: [GitHub CLI Installation Guide](https://github.com/cli/cli#installation)
  - Authenticate: `gh auth login`

## Usage

### Basic Usage (Repo Root)

From the root of the repository, you can simply run:

```bash
./scripts/cancel-all-ci-runs.sh
```

The script will automatically detect the repository from your git configuration.

### Running from Anywhere

You can run the script from any directory by setting the `REPO` environment variable:

```bash
REPO=PR0M3TH3AN/bitvid ./scripts/cancel-all-ci-runs.sh
```

### Previewing Runs

Before cancelling, you might want to see which runs are currently active. You can use the following commands:

```bash
# List in-progress runs
gh run list --repo PR0M3TH3AN/bitvid --status in_progress --limit 1000 --json databaseId,headBranch,name,createdAt | jq .

# List queued runs
gh run list --repo PR0M3TH3AN/bitvid --status queued --limit 1000 --json databaseId,headBranch,name,createdAt | jq .
```

## How it Works

The script performs the following steps:
1.  Checks if `gh` is installed.
2.  Determines the repository (either from `REPO` env var or `gh repo view`).
3.  Fetches IDs of all runs with status `in_progress` and `queued`.
4.  Cancels them one by one using `gh run cancel`.

### Why use this script?

Trying to cancel runs in bulk using `xargs gh run cancel` directly can fail because some versions of `gh` only accept a single run ID per invocation. This script uses `xargs -n1` to ensure `gh run cancel` is called individually for each run ID, preventing "accepts at most 1 arg(s)" errors.
