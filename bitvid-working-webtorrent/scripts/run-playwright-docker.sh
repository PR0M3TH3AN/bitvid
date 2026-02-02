#!/bin/bash
set -e

# Build the Docker image
echo "Building Docker image bitvid-playwright..."
docker build -t bitvid-playwright .

# Check if arguments are provided, default to "npm run test:visual" if not
if [ $# -eq 0 ]; then
    CMD="npm run test:visual"
else
    CMD="$@"
fi

echo "Running: $CMD"

# Run the container
# - --rm: Remove container after exit
# - -it: Interactive terminal
# - --ipc=host: Recommended for Playwright to avoid memory issues
# - -v $(pwd):/app: Mount current directory to /app for live code updates and artifacts
# - -v /app/node_modules: Anonymous volume to preserve container's node_modules (prevents host node_modules from overriding)
# - -w /app: Set working directory
docker run --rm -it --ipc=host \
    -v "$(pwd):/app" \
    -v /app/node_modules \
    -w /app \
    bitvid-playwright \
    $CMD
