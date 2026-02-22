# After Benchmark for Moderation Stage Batching

## Command
`node benchmarks/moderation_batch_bench.js`

## Environment
- Node.js v22.22.0
- 5000 items
- 500 authors
- 100 muters per author
- Forced prune check (lastPrunedAt = 0)

## Results
- Run 1: 184.34ms
- Run 2: 277.68ms
- Run 3: 188.89ms
- Run 4: 256.48ms
- **Average: ~227ms**

## Comparison
- Baseline: ~454ms
- After: ~227ms
- **Improvement: ~50% faster**
