#!/bin/bash

HOOK_FILE=".git/hooks/pre-commit"

if [ ! -d ".git" ]; then
  echo "Error: .git directory not found. This script must be run from the repository root."
  exit 1
fi

echo "Setting up pre-commit hook at $HOOK_FILE..."

cat > "$HOOK_FILE" << 'EOF'
#!/bin/sh
# pre-commit hook to run lint and build checks

echo "Running pre-commit checks..."

# Run lint
echo "Running lint..."
npm run lint
if [ $? -ne 0 ]; then
  echo "Lint failed. Please fix errors before committing."
  exit 1
fi

# Run CSS build to ensure consistency
echo "Running CSS build..."
npm run build:css
if [ $? -ne 0 ]; then
  echo "CSS build failed. Please fix errors before committing."
  exit 1
fi

echo "Pre-commit checks passed."
EOF

chmod +x "$HOOK_FILE"
echo "Pre-commit hook installed successfully."
