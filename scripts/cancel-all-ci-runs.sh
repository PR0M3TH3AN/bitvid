#!/bin/bash

# Check if gh is installed
if ! command -v gh &> /dev/null
then
    echo "GitHub CLI (gh) could not be found. Please install it and authenticate (gh auth login) to use this script."
    exit 1
fi

echo "Fetching active runs..."

# Function to cancel runs by status
cancel_runs() {
    local status=$1
    echo "Cancelling $status runs..."
    # Use --limit 1000 to capture up to 1000 runs (default is 30)
    ids=$(gh run list --status "$status" --limit 1000 --json databaseId -q '.[].databaseId')

    if [ -z "$ids" ]; then
        echo "No $status runs found."
    else
        # Pass IDs to xargs to batch cancel commands
        # gh run cancel accepts multiple arguments
        echo "$ids" | xargs gh run cancel
    fi
}

cancel_runs "in_progress"
cancel_runs "queued"

echo "Done."
