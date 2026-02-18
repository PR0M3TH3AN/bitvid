#!/bin/bash
set -e

# Setup
mkdir -p test-audit/coverage

echo "Step 1: Running unit tests with coverage..."
# We use || true because tests might fail, but we still want coverage
# Using npx c8 to ensure coverage is captured
npx c8 --reporter=lcov --reporter=text --reporter=json-summary npm run test:unit > test-audit/coverage-run.log 2>&1 || true

# Copy artifacts
# Check if coverage directory exists before copying
if [ -d "coverage" ]; then
  cp -r coverage/* test-audit/coverage/
else
  echo "Warning: coverage directory not found. Coverage step might have failed completely."
fi

echo "Step 2: Detecting flakiness..."
# Save the first run log
cp test-audit/coverage-run.log test-audit/run-1.log

# Run 2
echo "Pass 2..."
npm run test:unit > test-audit/run-2.log 2>&1 || true

# Run 3
echo "Pass 3..."
npm run test:unit > test-audit/run-3.log 2>&1 || true

echo "Step 3: Analyzing flakiness..."
node scripts/analyze-flakiness.mjs

echo "Step 4: Static Analysis..."
node scripts/static-test-analysis.mjs

echo "Step 5: Coverage Gap Analysis..."
node scripts/coverage-gap-analysis.mjs

echo "Step 6: Generating Report..."
node scripts/generate-audit-report.mjs

echo "Done. Report generated."
