#!/bin/bash
set -euo pipefail

# Check if gh is installed
if ! command -v gh &> /dev/null
then
    echo "GitHub CLI (gh) could not be found. Please install it and authenticate (gh auth login) to use this script."
    exit 1
fi

# Allow override with REPO=owner/repo
REPO="${REPO:-}"
if [ -z "$REPO" ]; then
  # try to discover the repo from the current git folder
  REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)"
  if [ -z "$REPO" ]; then
    echo "Unable to determine repository. Either run this inside the repo or set REPO=owner/repo"
    exit 1
  fi
fi

echo "Repo: $REPO"
echo "Fetching active runs..."

# Function to cancel runs by status
cancel_runs() {
    local status=$1
    echo "Cancelling $status runs..."
    # Use --limit 1000 to capture up to 1000 runs (default is 30)
    ids=$(gh run list --repo "$REPO" --status "$status" --limit 1000 --json databaseId -q '.[].databaseId')

    if [ -z "$ids" ]; then
        echo "No $status runs found."
    else
        # Call gh run cancel once per id (some gh versions accept only one id per call)
        printf '%s\n' "$ids" | xargs -r -n1 -I{} gh run cancel --repo "$REPO" {}
    fi
}

cancel_runs "in_progress"
cancel_runs "queued"

echo "Done."
