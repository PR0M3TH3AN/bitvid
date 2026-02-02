#!/bin/bash

# script to show artifacts
ARTIFACTS_DIR="artifacts/test-results"

if [ -d "$ARTIFACTS_DIR" ]; then
  echo "Artifacts located in $ARTIFACTS_DIR"
  echo "Listing contents:"
  ls -F "$ARTIFACTS_DIR"
else
  echo "No artifacts found in $ARTIFACTS_DIR"
fi
