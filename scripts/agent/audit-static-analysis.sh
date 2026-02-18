#!/bin/bash

OUTPUT="test-audit/suspicious-tests.txt"
echo "Suspicious Tests Report" > "$OUTPUT"
echo "=======================" >> "$OUTPUT"

echo "" >> "$OUTPUT"
echo "## Tests with zero assertions (heuristic)" >> "$OUTPUT"
# Find test files
find tests -name "*.test.mjs" -o -name "*.test.js" | while read f; do
  if ! grep -qE "assert\.|expect\(|t\.is" "$f"; then
    echo "  - $f" >> "$OUTPUT"
  fi
done

echo "" >> "$OUTPUT"
echo "## Tests using .only or .skip" >> "$OUTPUT"
grep -rE "\.(only|skip)\(" tests >> "$OUTPUT"

echo "" >> "$OUTPUT"
echo "## Tests using setTimeout/sleep" >> "$OUTPUT"
grep -rE "setTimeout\(|sleep\(|await delay\(" tests >> "$OUTPUT"

echo "" >> "$OUTPUT"
echo "## Tests using console logs" >> "$OUTPUT"
grep -rE "console\.(log|warn|error)" tests >> "$OUTPUT"

echo "" >> "$OUTPUT"
echo "## Tests using real network (fetch/axios/WebSocket)" >> "$OUTPUT"
grep -rE "fetch\(|axios\.|new WebSocket" tests >> "$OUTPUT"
