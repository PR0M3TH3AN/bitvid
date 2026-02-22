# Baseline Benchmark for Moderation Stage Batching

## Command
`node benchmarks/moderation_batch_bench.js`

## Environment
- Node.js v22.22.0
- 5000 items
- 500 authors
- 100 muters per author
- Forced prune check (lastPrunedAt = 0)

## Results
- Run 1: 545.80ms
- Run 2: 370.08ms
- Run 3: 523.04ms
- Run 4: 379.80ms
- **Average: ~454ms**
